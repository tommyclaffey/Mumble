import { BRAND } from '../brand';
import { useEffect, useRef, useState } from 'react';
import { Avatar } from '../components/Avatar/Avatar';
import { Button } from '../components/Button/Button';
import { Icon } from '../components/Icon/Icon';
import { Page, PanelCard } from '../components/Page/Page';
import { Segmented } from '../components/Segmented/Segmented';
import { formatDuration, formatTimer, suggestTasks, titleFrom, type Meeting, type Note, type Speaker, type TranscriptLine } from '../data/model';
import { href } from '../data/route';
import { go } from '../data/route';
import { useStore } from '../data/store';
import type { MicRecorder } from '../record/micRecorder';
import type { Recognizer } from '../record/recognizer';
import type { DiarizeProgress, Diarizer } from '../record/diarizer';
import { setRecordingStatus } from '../record/recordingStatus';
import { peaksFromBlob } from '../record/waveform';
import { useServices } from '../services';
import './screens.css';
import './RecordScreen.css';

/**
 * Record — speak, watch it become text, stop, review.
 *
 * Two things run at once: the microphone is RECORDED (that's the capture —
 * what you play back later), and the browser's speech recognition DICTATES it
 * into the transcript. They pause together, so each line's start time lands
 * where it is in the recording.
 *
 * Meeting mode (Oct 7): the same recording, then — after Stop — two small
 * models in this browser tell the voices apart and put a speaker on every
 * line (record/diarizer.ts). Nobody's name is known yet, so they're
 * "Speaker 1, Speaker 2…"; "Who is this?" names a voice and every line in it.
 * Asking how many people were there first is worth it: the Oct 7 test got
 * the right person on 94% of lines when told, 89% when guessing.
 *
 * What it can't do is said on the screen, not buried in a README:
 *   · Meeting mode needs the audio. If the mic can't be recorded, or the
 *     browser can't run the models, Meeting is disabled WITH the reason.
 *   · Where the audio goes is stated before you press record — including
 *     the one-time model download.
 */

/* "Not sure" is 0: the models work out how many people they heard. */
const PEOPLE = [2, 3, 4, 5, 6, 0] as const;
type Mode = 'note' | 'meeting';

type Status = 'idle' | 'recording' | 'paused';

export function RecordScreen() {
  const { dispatch, prefs } = useStore();
  const services = useServices();
  const rec = useRef<Recognizer | null>(null);
  if (!rec.current) rec.current = services.recognizer();
  const mic = useRef<MicRecorder | null>(null);
  if (!mic.current) mic.current = services.mic();
  /* Browsers only allow the microphone on a secure (https) page. On a plain
     http link — e.g. the dev server opened on a phone over Wi-Fi — the
     buttons would look fine and then silently fail. Say why instead. */
  const secure = typeof window === 'undefined' || window.isSecureContext !== false;
  const available = rec.current.available && secure;
  const [micOk, setMicOk] = useState(mic.current.available);
  const diarizer = useRef<Diarizer | null>(null);
  if (!diarizer.current) diarizer.current = services.diarizer();
  const [mode, setMode] = useState<Mode>('note');
  const [people, setPeople] = useState<number>(2);
  /* Meeting mode sorts voices from the RECORDING, so it needs one. */
  const meetingOk = diarizer.current.available && micOk;
  const meetingWhy = !diarizer.current.available
    ? 'Telling voices apart needs a newer browser (Chrome, Edge or Safari).'
    : !micOk ? 'Meeting needs the audio, and this browser can’t record it.' : null;
  const [voices, setVoices] = useState<string>('');
  /* If the voices can't be told apart, the recording is still saved — as a
     note — and the screen says what happened instead of moving on. */
  const [failed, setFailed] = useState<{ message: string; id: string } | null>(null);
  const [saving, setSaving] = useState(false);
  /* Saving is quick but real — each step is said as it happens. */
  const [step, setStep] = useState(0);

  const [status, setStatus] = useState<Status>('idle');
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const clock = useRef({ base: 0, since: 0 });
  const elapsedNow = () => clock.current.base + (clock.current.since ? (performance.now() - clock.current.since) / 1000 : 0);

  /* The live meter: the mic's real level, sampled with the clock. */
  const [levels, setLevels] = useState<number[]>(() => Array(48).fill(0));
  useEffect(() => {
    if (status !== 'recording') return;
    const t = setInterval(() => {
      setElapsed(elapsedNow());
      const l = mic.current?.level?.() ?? 0;
      setLevels((ls) => [...ls.slice(1), l]);
    }, 120);
    return () => clearInterval(t);
  }, [status]);

  /* Leaving mid-recording must release the microphone — and the header
     stops saying "Recording". */
  useEffect(() => () => { rec.current?.stop(); void mic.current?.stop(); setRecordingStatus({ state: 'idle', elapsed: 0 }); }, []);

  /* The header's live indicator. */
  useEffect(() => { setRecordingStatus({ state: status, elapsed }); }, [status, elapsed]);

  function start() {
    setError(null);
    clock.current.since = performance.now();
    if (status === 'idle') {
      /* If the audio can't be recorded, the words still can: the capture is
         saved as a transcript and says it has no recording. */
      mic.current!.start().catch(() => setMicOk(false));
    } else {
      mic.current!.resume();
    }
    setStatus('recording');
    rec.current!.start({
      onFinal: ({ text, confidence }) => setLines((ls) => [
        ...ls,
        /* The final result arrives as the phrase ENDS; its start is that
           moment minus how long it took to say (~2.6 words a second). */
        { id: `l${ls.length + 1}`, text, confidence, startsAt: Math.max(0, Math.round((elapsedNow() - text.split(/\s+/).length / 2.6) * 10) / 10) },
      ]),
      onInterim: setInterim,
      onError: (message) => { setError(message); pause(); },
    });
  }

  function pause() {
    rec.current!.stop();
    mic.current!.pause();
    clock.current.base = elapsedNow();
    clock.current.since = 0;
    setElapsed(clock.current.base);
    /* Interim text is KEPT: the recogniser's final result for it arrives
       after stop(), and Stop & save pressed in between would lose it. */
    setStatus('paused');
  }

  async function stopAndSave() {
    rec.current!.stop();
    const total = elapsedNow();
    setSaving(true);
    setStep(1);
    const audio = await mic.current!.stop();
    /* An interim phrase still on screen when Stop is pressed was heard; keep it. */
    const all = interim.trim()
      ? [...lines, { id: `l${lines.length + 1}`, text: interim.trim(), confidence: 0, startsAt: Math.round(total) }]
      : lines;
    if (all.length === 0) {
      setError('Nothing was heard, so there is nothing to save. Check the microphone and try again.');
      clock.current = { base: 0, since: 0 };
      setElapsed(0);
      setSaving(false);
      setStatus('idle');
      mic.current = services.mic(); // a fresh recorder for the next try
      return;
    }
    const now = new Date();
    const id = `b${now.getTime()}`;
    /* Save the recording BEFORE opening the capture, so it's there to play. */
    let stored = false;
    if (audio) {
      try { await services.audioStore.put(id, audio); stored = true; } catch { /* storage full or blocked: keep the transcript */ }
    }
    setStep(2);
    /* The waveform is measured from the recording itself. */
    const peaks = stored && audio ? await peaksFromBlob(audio) : undefined;
    setStep(3);
    if (mode === 'meeting') {
      const meeting = audio
        ? await sortVoices(audio, all, { id, now, total, stored, peaks })
        : (setFailed({ id, message: 'the audio wasn’t recorded' }), null);
      if (meeting) {
        setStep(4);
        dispatch({ type: 'addCapture', capture: meeting });
        go({ name: 'capture', id: meeting.id });
        return;
      }
    }
    const note: Note = {
      kind: 'note',
      id,
      source: 'browser',
      audio: stored ? 'stored' : undefined,
      peaks,
      title: titleFrom(all, BRAND.newTitle),
      createdAt: now.toISOString(),
      durationSeconds: Math.round(total),
      lines: all,
      tasks: prefs.taskHints ? suggestTasks(all) : [],
      tags: [],
    };
    dispatch({ type: 'addCapture', capture: note });
    if (mode === 'meeting') { setStep(5); return; } // the failure stays on screen, with a link
    go({ name: 'capture', id: note.id });
  }

  /** The meeting, with a speaker on every line — or null, with the reason shown. */
  async function sortVoices(
    audio: Blob, all: TranscriptLine[],
    base: { id: string; now: Date; total: number; stored: boolean; peaks: number[] | undefined },
  ): Promise<Meeting | null> {
    const say = (p: DiarizeProgress) => setVoices(p.stage === 'download'
      ? `downloading voice models · ${p.percent}%`
      : `listening · ${p.done} of ${p.total}`);
    try {
      const r = await diarizer.current!.run(audio, all.map((l) => l.startsAt), people || null, say);
      const speakers: Speaker[] = Array.from({ length: r.count }, (_, i) => ({
        id: `s${i + 1}`, name: `Speaker ${i + 1}`, voiceprintId: `v${i + 1}`, colorIndex: (i % 5) as Speaker['colorIndex'],
      }));
      setVoices(`${r.count} ${r.count === 1 ? 'voice' : 'voices'}`);
      const lines = all.map((l, i) => ({ ...l, speakerId: `s${r.speaker[i] + 1}`, confidence: r.confidence[i] }));
      return {
        kind: 'meeting',
        id: base.id,
        source: 'browser',
        audio: base.stored ? 'stored' : undefined,
        peaks: base.peaks,
        title: titleFrom(all, BRAND.newTitle),
        createdAt: base.now.toISOString(),
        durationSeconds: Math.round(base.total),
        lines,
        speakers,
        attendees: speakers.map((sp) => sp.name),
        tasks: prefs.taskHints ? suggestTasks(lines) : [],
        tags: [],
      };
    } catch (err) {
      setFailed({ id: base.id, message: err instanceof Error ? err.message : String(err) });
      return null;
    }
  }

  function discard() {
    if ((lines.length > 0 || status !== 'idle') && !window.confirm('Discard this recording?')) return;
    rec.current!.stop();
    void mic.current!.stop();
    go({ name: 'recent', filter: 'all' });
  }

  const spotted = prefs.taskHints ? suggestTasks(lines) : [];
  const taskIds = new Set(spotted.map((t) => t.sourceLineId));
  const active = status === 'recording';

  /* Space pauses and resumes — what the hint under the controls promises. */
  const toggleRef = useRef<() => void>(() => {});
  toggleRef.current = () => { if (saving || !available) return; if (status === 'recording') pause(); else start(); };
  useEffect(() => {
    if (!prefs.shortcuts) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== ' ' || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement | null)?.closest('input, textarea, select, button, a, [role="radio"]')) return;
      e.preventDefault(); toggleRef.current();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prefs.shortcuts]);

  const panel = (
    <>
      <PanelCard id="spotted-h" title="Tasks spotted" icon="check" meta={prefs.taskHints ? `${spotted.length} so far` : 'Off'}>
        <p className="mb-t-meta mb-muted">{prefs.taskHints ? 'Found by phrasing, not by a model. You can edit them after saving.' : 'Task suggestions are off in Settings.'}</p>
        {spotted.length > 0 && (
          <ul className="mb-prows">
            {spotted.map((t) => (
              <li key={t.id}><div className="mb-prow mb-spotted"><Icon name="check" size={14} /><span className="mb-t-body-sm">{t.text}</span></div></li>
            ))}
          </ul>
        )}
      </PanelCard>
      <PanelCard id="try-h" title="Try saying" icon="quote">
        <dl className="mb-try">
          <dt>“We need to…”</dt><dd>becomes a task</dd>
          <dt>“Let’s…”</dt><dd>becomes a task</dd>
          <dt>“Follow up with…”</dt><dd>becomes a task</dd>
        </dl>
      </PanelCard>
      <PanelCard id="where-h" title="Where your audio goes" icon="lock">
        <div className="mb-where">
          <p className="mb-t-label-sm">Recording</p><p className="mb-t-body-sm mb-muted">Saved in this browser only.</p>
          <p className="mb-t-label-sm">Transcript</p><p className="mb-t-body-sm mb-muted">Written by your browser’s speech service. Chrome and Edge send the audio to their vendor; Safari keeps it on-device where it can.</p>
          <p className="mb-t-label-sm">Who said what (meetings)</p><p className="mb-t-body-sm mb-muted">Worked out in this browser after you stop. The first time, it downloads two voice models (about 33 MB, from Hugging Face) and the engine that runs them (from this site). Your audio isn’t sent anywhere for it.</p>
        </div>
      </PanelCard>
    </>
  );

  const stepsDone = (n: number) => (step > n ? 'done' : step === n ? 'active' : 'todo');

  return (
    <Page
      title="New recording"
      subtitle={status === 'idle' ? 'Ready when you are' : `${active ? 'Recording' : 'Paused'} · saving to this browser as you talk`}
      headingId="record-h" panel={panel} panelLabel="While you record" panelOnPhone="hide"
    >
      {saving ? (
        <section className="mb-saving" aria-labelledby="saving-h" aria-live="polite">
          <h2 id="saving-h" className="mb-t-title">Saving your {mode === 'meeting' ? 'meeting' : BRAND.noun}</h2>
          <p className="mb-t-body-sm mb-muted">{mode === 'meeting' ? 'Telling the voices apart takes a little longer. It all happens in this browser.' : 'A few seconds. Everything stays in this browser.'}</p>
          <ol className="mb-saving-steps">
            {[
              ['Recording saved', micOk ? 'audio + transcript' : 'transcript only'],
              ['Waveform measured', ''],
              ...(mode === 'meeting' ? [['Voices told apart', failed ? 'couldn’t' : voices]] : []),
              ['Tasks found by phrasing', `${prefs.taskHints ? suggestTasks(lines).length : 0}`],
            ].map(([label, meta], i) => {
              const broke = !!failed && label === 'Voices told apart';
              return (
              <li key={label} className={broke ? 'is-failed' : `is-${stepsDone(i + 1)}`}>
                <span className="mb-saving-mark" aria-hidden="true">{broke ? <Icon name="x" size={12} /> : step > i + 1 ? <Icon name="check" size={12} /> : step === i + 1 ? <Icon name="loader" size={14} /> : null}</span>
                <span className="mb-t-label">{label}</span>
                {meta && <span className="mb-t-meta mb-muted">{meta}</span>}
              </li>
              );
            })}
          </ol>
          {failed && (
            <div className="mb-record-error" role="alert">
              <p>Couldn’t tell the voices apart, so this was saved as a note. ({failed.message})</p>
              <p><a className="mb-button is-secondary is-sm" href={href({ name: 'capture', id: failed.id })}>Open it</a></p>
            </div>
          )}
        </section>
      ) : (
      <section className="mb-recorder" aria-labelledby="record-h">
        <div className="mb-recorder-mode">
          {/* The type is chosen before you start: a recording can't become a
              meeting halfway through. */}
          <Segmented
            label="Capture type" value={mode} onChange={setMode} size="sm"
            options={[
              { value: 'note', label: 'Note', disabled: status !== 'idle' && mode !== 'note' },
              { value: 'meeting', label: 'Meeting', disabled: !meetingOk || (status !== 'idle' && mode !== 'meeting') },
            ]}
          />
          {meetingWhy && <p className="mb-t-meta mb-muted mb-recorder-why"><Icon name="info" size={14} /> {meetingWhy}</p>}
        </div>
        {mode === 'meeting' && (
          <div className="mb-recorder-people">
            <p className="mb-t-label mb-recorder-people-h" id="people-h">How many people?</p>
            <Segmented
              label="How many people" value={people} size="sm"
              onChange={(n) => { if (status === 'idle') setPeople(n); }}
              options={PEOPLE.map((n) => ({ value: n, label: n ? String(n) : 'Not sure', disabled: status !== 'idle' && n !== people }))}
            />
            <p className="mb-t-meta mb-muted">Knowing the number puts the right name on more lines. Voices are sorted after you stop, in this browser.</p>
          </div>
        )}

        <div className="mb-recorder-live">
          <button
            type="button"
            className={`mb-rec${active ? ' is-live' : ''}`}
            onClick={status === 'idle' ? start : active ? pause : start}
            disabled={!available}
            aria-label={status === 'idle' ? 'Start recording' : active ? 'Pause recording' : 'Resume recording'}
          >
            <span className="mb-rec-disc"><Icon name={active ? 'pause' : 'mic'} size={28} /></span>
          </button>
          <div className="mb-recorder-clock">
            <p className="mb-t-page mb-tabular mb-record-timer" aria-label={`Elapsed ${formatTimer(elapsed)}`}>{formatDuration(elapsed)}</p>
            <p className="mb-t-label-sm mb-record-status" aria-live="polite">
              <span className={`mb-dot${active ? ' is-live' : ''}`} aria-hidden="true" />
              {status === 'idle' ? 'Ready' : active ? 'Listening' : 'Paused'}
            </p>
          </div>
          <div className={`mb-recorder-meter${active ? ' is-live' : ''}`} aria-hidden="true">
            {levels.map((l, i) => <span key={i} style={{ height: `${Math.round(8 + l * 92)}%` }} />)}
          </div>
        </div>

        <div className="mb-recorder-actions">
          {status === 'idle' ? (
            <Button variant="primary" onClick={start} disabled={!available}>Start</Button>
          ) : (
            <>
              <Button onClick={active ? pause : start} icon={active ? 'pause' : 'mic'}>{active ? 'Pause' : 'Resume'}</Button>
              <Button variant="primary" icon="stop" onClick={() => void stopAndSave()}>Stop &amp; save</Button>
            </>
          )}
          <Button variant="ghost" onClick={discard}>Discard</Button>
          {prefs.shortcuts && available && <span className="mb-t-meta mb-muted mb-recorder-key"><kbd className="mb-kbd">Space</kbd> to {status === 'recording' ? 'pause' : status === 'idle' ? 'start' : 'resume'}</span>}
        </div>

        <p className="mb-phone-only mb-t-meta mb-muted mb-record-where"><Icon name="lock" size={14} /> Audio saved in this browser only{mode === 'meeting' && ' · your first meeting downloads the voice models (about 33 MB)'}</p>
        {error && <p className="mb-record-error" role="alert">{error}</p>}
        {!micOk && available && (
          <p className="mb-record-error" role="status">
            The audio can’t be recorded in this browser (or the microphone recording was refused), so this will be saved as a transcript only.
          </p>
        )}
        {!secure && (
          <p className="mb-record-error" role="status">
            Recording needs a secure link. This page is <strong>http://</strong>, so the browser won’t open the microphone.
            Open the live demo (https) — or, on your own network, run <code>npm run dev:phone</code> and use the https link it prints.
          </p>
        )}
        {secure && !rec.current.available && (
          <p className="mb-record-error">This browser has no speech recognition (Firefox doesn’t support it). Open the demo in Chrome, Edge or Safari to record.</p>
        )}
      </section>
      )}

      <section className="mb-record-live" aria-labelledby="live-h">
        <h2 id="live-h" className="mb-t-over mb-record-live-h">Live transcript <span className="mb-t-meta mb-muted">· updating as you talk</span>
          {spotted.length > 0 && <span className="mb-t-meta mb-phone-only mb-record-spotted">{spotted.length} {spotted.length === 1 ? 'task' : 'tasks'} so far</span>}
        </h2>
        <div className="mb-record-lines" aria-live="polite" aria-relevant="additions">
          {lines.length === 0 && !interim && (
            <p className="mb-t-body mb-muted">
              Start talking. Say something like “We need to send the proposal by Friday” and watch it get picked up as a task.
            </p>
          )}
          {(lines.length > 0 || interim) && (mode === 'meeting' ? (
            <p className="mb-t-meta mb-muted mb-record-speaker">Everyone · who said what is worked out when you stop</p>
          ) : (
            <div className="mb-record-speaker">
              <Avatar name="You" colorIndex={0} size="md" />
              <span className="mb-t-label">You</span>
              <span className="mb-t-meta mb-muted mb-tabular">{formatDuration(lines[0]?.startsAt ?? 0)}</span>
            </div>
          ))}
          {lines.map((l) => (
            <div key={l.id} className={`mb-line${taskIds.has(l.id) ? ' is-task' : ''}`}>
              <p className="mb-t-reading mb-line-text">{l.text}</p>
              {taskIds.has(l.id) && <span className="mb-chip is-tag mb-line-task"><Icon name="check" size={12} /> Task</span>}
            </div>
          ))}
          {interim && <p className="mb-t-reading mb-record-interim">{interim}<span className="mb-caret" aria-hidden="true" /></p>}
        </div>
      </section>
    </Page>
  );
}
