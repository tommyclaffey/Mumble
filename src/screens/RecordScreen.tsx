import { useEffect, useRef, useState } from 'react';
import { Avatar } from '../components/Avatar/Avatar';
import { Button } from '../components/Button/Button';
import { Icon } from '../components/Icon/Icon';
import { Segmented } from '../components/Segmented/Segmented';
import { formatDuration, formatTimer, suggestTasks, titleFrom, type Note, type TranscriptLine } from '../data/model';
import { go } from '../data/route';
import { useStore } from '../data/store';
import type { MicRecorder } from '../record/micRecorder';
import type { Recognizer } from '../record/recognizer';
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
  const { dispatch } = useStore();
  const services = useServices();
  const rec = useRef<Recognizer | null>(null);
  if (!rec.current) rec.current = services.recognizer();
  const mic = useRef<MicRecorder | null>(null);
  if (!mic.current) mic.current = services.mic();
  const available = rec.current.available;
  const [micOk, setMicOk] = useState(mic.current.available);
  const [saving, setSaving] = useState(false);

  const [status, setStatus] = useState<Status>('idle');
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const clock = useRef({ base: 0, since: 0 });
  const elapsedNow = () => clock.current.base + (clock.current.since ? (performance.now() - clock.current.since) / 1000 : 0);

  useEffect(() => {
    if (status !== 'recording') return;
    const t = setInterval(() => setElapsed(elapsedNow()), 250);
    return () => clearInterval(t);
  }, [status]);

  /* Leaving mid-recording must release the microphone. */
  useEffect(() => () => { rec.current?.stop(); void mic.current?.stop(); }, []);

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
    const note: Note = {
      kind: 'note',
      id,
      source: 'browser',
      audio: stored ? 'stored' : undefined,
      title: titleFrom(all, 'New Mumble'),
      createdAt: now.toISOString(),
      durationSeconds: Math.round(total),
      lines: all,
      tasks: suggestTasks(all),
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

  const taskIds = new Set(suggestTasks(lines).map((t) => t.sourceLineId));
  const active = status === 'recording';

  return (
    <div className="mb-record">
      {/* Left half: the controls, centred — as in the "Recording in Progress" frame. */}
      <section className="mb-record-controls" aria-labelledby="record-h">
        <h1 id="record-h" className="mb-sr-only">New Mumble</h1>
        <Segmented
          label="Capture type" value="note" onChange={() => {}}
          options={[{ value: 'note', label: 'Mumble' }, { value: 'meeting', label: 'Meeting', disabled: true }]}
        />
        <p className="mb-body-small mb-muted mb-record-status" aria-live="polite">
          {status === 'idle' ? 'Ready when you are' : active ? 'Recording in progress' : 'Paused'}
        </p>

        <button
          type="button"
          className={`mb-rec${active ? ' is-live' : ''}`}
          onClick={status === 'idle' ? start : active ? pause : start}
          disabled={!available}
          aria-label={status === 'idle' ? 'Start recording' : active ? 'Pause recording' : 'Resume recording'}
        >
          <span className="mb-rec-disc">{status === 'idle' ? <Icon name="mic" size={32} /> : 'REC'}</span>
        </button>

        <p className="mb-display-timer mb-tabular mb-record-timer" aria-label={`Elapsed ${formatTimer(elapsed)}`}>{formatTimer(elapsed)}</p>

        <div className="mb-record-actions">
          {status === 'idle' ? (
            <Button variant="primary" size="lg" block onClick={start} disabled={!available}>Start</Button>
          ) : (
            <>
              <Button size="lg" onClick={active ? pause : start} disabled={saving}>{active ? 'Pause' : 'Resume'}</Button>
              <Button variant="primary" size="lg" onClick={() => void stopAndSave()} disabled={saving}>
                {saving ? 'Saving…' : <>Stop &amp; save</>}
              </Button>
            </>
          )}
        </div>
        <p className="mb-meta mb-muted">{active ? 'Mumble is listening…' : ' '}</p>

        {error && <p className="mb-record-error" role="alert">{error}</p>}
        {!micOk && available && (
          <p className="mb-record-error" role="status">
            The audio can’t be recorded in this browser (or the microphone recording was refused), so this will be saved as a transcript only.
          </p>
        )}
        <p className="mb-meta mb-muted mb-record-fine">
          {available
            ? 'Meeting mode needs a model that can tell voices apart, so it’s off in the demo. The recording is saved only in this browser; the transcript is written by your browser’s speech service (Chrome and Edge send the audio to their vendor; Safari keeps it on-device where it can).'
            : 'This browser has no speech recognition (Firefox doesn’t support it). Open the demo in Chrome, Edge or Safari to record.'}
        </p>
      </section>

      <div className="mb-split-rule" aria-hidden="true" />

      {/* Right half: the live transcript, with the close button top right. */}
      <section className="mb-record-live" aria-labelledby="live-h">
        <button type="button" className="mb-review-close" aria-label="Close without saving" onClick={discard}>
          <Icon name="x" size={16} />
        </button>
        <h2 id="live-h" className="mb-heading-card mb-record-live-h">
          Live Transcript <span className="mb-meta mb-muted">· Updating in real time</span>
        </h2>
        <div className="mb-record-lines" aria-live="polite" aria-relevant="additions">
          {lines.length === 0 && !interim && (
            <p className="mb-body mb-muted">
              Start talking. Say something like “We need to send the proposal by Friday” and watch it get picked up as a task.
            </p>
          )}
          {(lines.length > 0 || interim) && (
            /* One voice in a Mumble — the frame's turn header, said once. */
            <div className="mb-record-speaker">
              <Avatar name="You" colorIndex={0} size="md" />
              <span className="mb-label-strong">You</span>
              <span className="mb-meta mb-muted mb-tabular">{formatDuration(lines[0]?.startsAt ?? 0)}</span>
            </div>
          )}
          {lines.map((l) => (
            <div key={l.id} className={`mb-line${taskIds.has(l.id) ? ' is-task' : ''}`}>
              <p className="mb-line-text">{l.text}</p>
              {taskIds.has(l.id) && <span className="mb-line-task">Task</span>}
            </div>
          ))}
          {interim && <p className="mb-body mb-record-interim">{interim}</p>}
        </div>
      </section>
    </div>
  );
}
