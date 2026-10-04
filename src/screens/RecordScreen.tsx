import { BRAND } from '../brand';
import { useEffect, useRef, useState } from 'react';
import { Avatar } from '../components/Avatar/Avatar';
import { Button } from '../components/Button/Button';
import { Icon } from '../components/Icon/Icon';
import { Page, PanelCard } from '../components/Page/Page';
import { Segmented } from '../components/Segmented/Segmented';
import { formatDuration, formatTimer, suggestTasks, titleFrom, type Note, type TranscriptLine } from '../data/model';
import { go } from '../data/route';
import { useStore } from '../data/store';
import type { MicRecorder } from '../record/micRecorder';
import type { Recognizer } from '../record/recognizer';
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
 * What it can't do is said on the screen, not buried in a README:
 *   · Meeting mode is shown but disabled, WITH the reason. Telling voices
 *     apart needs a server model, and a meeting transcript with every line
 *     credited to one speaker would fake the product's central feature.
 *   · Where the audio goes is stated before you press record.
 */

type Status = 'idle' | 'recording' | 'paused';

export function RecordScreen() {
  const { dispatch, prefs } = useStore();
  const services = useServices();
  const rec = useRef<Recognizer | null>(null);
  if (!rec.current) rec.current = services.recognizer();
  const mic = useRef<MicRecorder | null>(null);
  if (!mic.current) mic.current = services.mic();
  const available = rec.current.available;
  const [micOk, setMicOk] = useState(mic.current.available);
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
    go({ name: 'capture', id: note.id });
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
          <h2 id="saving-h" className="mb-t-title">Saving your {BRAND.noun}</h2>
          <p className="mb-t-body-sm mb-muted">A few seconds. Everything stays in this browser.</p>
          <ol className="mb-saving-steps">
            {[
              ['Recording saved', micOk ? 'audio + transcript' : 'transcript only'],
              ['Waveform measured', ''],
              ['Tasks found by phrasing', `${prefs.taskHints ? suggestTasks(lines).length : 0}`],
            ].map(([label, meta], i) => (
              <li key={label} className={`is-${stepsDone(i + 1)}`}>
                <span className="mb-saving-mark" aria-hidden="true">{step > i + 1 ? <Icon name="check" size={12} /> : step === i + 1 ? <Icon name="loader" size={14} /> : null}</span>
                <span className="mb-t-label">{label}</span>
                {meta && <span className="mb-t-meta mb-muted">{meta}</span>}
              </li>
            ))}
          </ol>
        </section>
      ) : (
      <section className="mb-recorder" aria-labelledby="record-h">
        <div className="mb-recorder-mode">
          <Segmented
            label="Capture type" value="note" onChange={() => {}} size="sm"
            options={[{ value: 'note', label: 'Note' }, { value: 'meeting', label: 'Meeting', disabled: true }]}
          />
          <p className="mb-t-meta mb-muted mb-recorder-why"><Icon name="info" size={14} /> Meeting needs a model that can tell voices apart. Not in the browser yet.</p>
        </div>

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

        <p className="mb-phone-only mb-t-meta mb-muted mb-record-where"><Icon name="lock" size={14} /> Audio saved in this browser only</p>
        {error && <p className="mb-record-error" role="alert">{error}</p>}
        {!micOk && available && (
          <p className="mb-record-error" role="status">
            The audio can’t be recorded in this browser (or the microphone recording was refused), so this will be saved as a transcript only.
          </p>
        )}
        {!available && (
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
          {(lines.length > 0 || interim) && (
            <div className="mb-record-speaker">
              <Avatar name="You" colorIndex={0} size="md" />
              <span className="mb-t-label">You</span>
              <span className="mb-t-meta mb-muted mb-tabular">{formatDuration(lines[0]?.startsAt ?? 0)}</span>
            </div>
          )}
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
