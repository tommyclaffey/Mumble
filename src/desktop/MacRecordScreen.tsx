import { useEffect, useMemo, useRef, useState } from 'react';
import { BRAND } from '../brand';
import { Avatar } from '../components/Avatar/Avatar';
import { Button } from '../components/Button/Button';
import { Icon } from '../components/Icon/Icon';
import { Page, PanelCard } from '../components/Page/Page';
import { Segmented } from '../components/Segmented/Segmented';
import { formatDuration, formatTimer, suggestTasks, type TranscriptLine } from '../data/model';
import { useStore } from '../data/store';
import { useRecordingStatus } from '../record/recordingStatus';
import { desktop } from './desktop';
import { useImporting, useLive, useMacState, type LiveLine } from './macState';
import '../screens/screens.css';
import '../screens/RecordScreen.css';

/**
 * New recording, inside the Mac app — the same screen as the website's
 * (screens/RecordScreen.tsx), with the Mac doing the recording:
 *
 *   · Note = just your mic. Meeting = your mic AND your Mac's sound (the
 *     other people on a call), as two tracks.
 *   · The live transcript is Apple's on-device speech, as you talk
 *     (LiveTranscriber.swift). The saved transcript is made again from the
 *     files after Stop, so it's the better of the two.
 *   · Tasks are spotted by phrasing while you talk, as on the website.
 */
type Kind = 'note' | 'meeting';

export function MacRecordScreen() {
  const mac = useMacState();
  const live = useLive();
  const importing = useImporting();
  const rec = useRecordingStatus();
  const { prefs } = useStore();
  const app = desktop();
  const [kind, setKind] = useState<Kind>('meeting');

  const recording = mac.phase === 'recording';
  const paused = mac.phase === 'paused';
  const active = recording || paused;
  const saving = mac.phase === 'saving' || importing;
  const shownKind: Kind = active || saving ? (mac.kind ?? kind) : kind;
  const elapsed = active ? rec.elapsed : 0;

  /* Settled lines become transcript lines, so the same phrasing rules find tasks. */
  const finals = useMemo<TranscriptLine[]>(
    () => live.filter((l) => l.final).map((l, i) => ({ id: `m${i}`, text: l.text, startsAt: l.start, confidence: 1 })),
    [live],
  );
  const spotted = prefs.taskHints ? suggestTasks(finals) : [];
  const taskTexts = new Set(spotted.map((t) => finals.find((l) => l.id === t.sourceLineId)?.text));

  const start = () => app?.send('record', { kind });
  const discard = () => { if (window.confirm('Discard this recording? Nothing will be saved.')) app?.send('discard'); };

  /* Space starts, pauses and resumes — as on the website. */
  const toggle = useRef<() => void>(() => {});
  useEffect(() => {
    toggle.current = () => { if (saving) return; app?.send(recording ? 'pause' : paused ? 'resume' : 'record', recording || paused ? undefined : { kind }); };
  });
  useEffect(() => {
    if (!prefs.shortcuts) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== ' ' || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement | null)?.closest('input, textarea, select, button, a, [role="radio"]')) return;
      e.preventDefault(); toggle.current();
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
          <p className="mb-t-label-sm">Recording</p><p className="mb-t-body-sm mb-muted">Saved in Documents › {BRAND.name} on this Mac.</p>
          <p className="mb-t-label-sm">Transcript</p><p className="mb-t-body-sm mb-muted">Written on this Mac by Apple’s on-device speech recognition, live as you talk and again from the recording when you stop. Nothing is uploaded.</p>
          {shownKind === 'meeting' && <><p className="mb-t-label-sm">Who said what</p><p className="mb-t-body-sm mb-muted">Your mic is always You. The call’s sound is split into Speaker 1, 2… after you stop. Headphones keep the two apart best.</p></>}
        </div>
      </PanelCard>
    </>
  );

  const steps: [string, boolean, boolean][] = [
    ['Recording saved', mac.phase === 'saving' && mac.step === 'tracks', mac.step === 'transcribe' || importing],
    ['Transcribed on this Mac', mac.phase === 'saving' && mac.step === 'transcribe', importing],
    ...(shownKind === 'meeting' ? [['Voices told apart', importing, false] as [string, boolean, boolean]] : []),
  ];

  return (
    <Page
      title="New recording"
      subtitle={recording ? `Recording${mac.app ? ` your ${mac.app} call` : ''} · on this Mac` : paused ? 'Paused · nothing is being recorded' : saving ? 'Saving' : 'Ready when you are'}
      headingId="record-h" panel={panel} panelLabel="While you record" panelOnPhone="hide"
    >
      {saving ? (
        <section className="mb-saving" aria-labelledby="saving-h" aria-live="polite">
          <h2 id="saving-h" className="mb-t-title">Saving your {shownKind === 'meeting' ? 'meeting' : BRAND.noun}</h2>
          <p className="mb-t-body-sm mb-muted">All on this Mac. It opens here when it’s ready.</p>
          <ol className="mb-saving-steps">
            {steps.map(([label, now, done]) => (
              <li key={label} className={`is-${done ? 'done' : now ? 'active' : 'todo'}`}>
                <span className="mb-saving-mark" aria-hidden="true">{done ? <Icon name="check" size={12} /> : now ? <Icon name="loader" size={14} /> : null}</span>
                <span className="mb-t-label">{label}</span>
              </li>
            ))}
            <li className="is-done">
              <span className="mb-saving-mark" aria-hidden="true"><Icon name="check" size={12} /></span>
              <span className="mb-t-label">Tasks found by phrasing</span>
              <span className="mb-t-meta mb-muted">{spotted.length}</span>
            </li>
          </ol>
        </section>
      ) : (
        <section className="mb-recorder" aria-labelledby="record-h">
          <div className="mb-recorder-mode">
            {/* Chosen before you start: a recording can't become a meeting halfway through. */}
            <Segmented
              label="Capture type" value={shownKind} onChange={setKind} size="sm"
              options={[
                { value: 'note', label: 'Note', disabled: active && shownKind !== 'note' },
                { value: 'meeting', label: 'Meeting', disabled: active && shownKind !== 'meeting' },
              ]}
            />
            <p className="mb-t-meta mb-muted mb-recorder-why">
              <Icon name="info" size={14} /> {shownKind === 'meeting' ? 'Your mic and your Mac’s sound, the other people on a call, as two tracks.' : 'Just your mic.'}
            </p>
          </div>
          <div className="mb-recorder-live">
            <button
              type="button" className={`mb-rec${recording ? ' is-live' : ''}`}
              onClick={() => (recording ? app?.send('pause') : paused ? app?.send('resume') : start())}
              aria-label={recording ? 'Pause recording' : paused ? 'Resume recording' : 'Start recording'}
            >
              <span className="mb-rec-disc"><Icon name={recording ? 'pause' : 'mic'} size={28} /></span>
            </button>
            <div className="mb-recorder-clock">
              <p className="mb-t-page mb-tabular mb-record-timer" aria-label={`Elapsed ${formatTimer(elapsed)}`}>{formatDuration(elapsed)}</p>
              <p className="mb-t-label-sm mb-record-status" aria-live="polite">
                <span className={`mb-dot${recording ? ' is-live' : ''}`} aria-hidden="true" />
                {recording ? 'Listening' : paused ? 'Paused'
                  : mac.phase === 'problem' ? mac.message
                  : mac.phase === 'meeting' ? `${mac.app ?? 'A'} meeting is on`
                  : 'Ready'}
              </p>
            </div>
          </div>
          <div className="mb-recorder-actions">
            {active ? (
              <>
                <Button onClick={() => app?.send(recording ? 'pause' : 'resume')} icon={recording ? 'pause' : 'mic'}>{recording ? 'Pause' : 'Resume'}</Button>
                <Button variant="primary" icon="stop" onClick={() => app?.send('stop')}>Stop &amp; save</Button>
                <Button variant="ghost" onClick={discard}>Discard</Button>
              </>
            ) : <Button variant="primary" onClick={start}>Start</Button>}
            {prefs.shortcuts && <span className="mb-t-meta mb-muted mb-recorder-key"><kbd className="mb-kbd">Space</kbd> to {recording ? 'pause' : paused ? 'resume' : 'start'}</span>}
          </div>
        </section>
      )}

      <section className="mb-record-live" aria-labelledby="live-h">
        <h2 id="live-h" className="mb-t-over mb-record-live-h">Live transcript <span className="mb-t-meta mb-muted">· updating as you talk</span></h2>
        <div className="mb-record-lines" aria-live="polite" aria-relevant="additions">
          {live.length === 0 && (
            <p className="mb-t-body mb-muted">
              {active ? 'Listening…' : 'Start talking. Say something like “We need to send the proposal by Friday” and watch it get picked up as a task.'}
            </p>
          )}
          {turns(live).map((turn) => (
            <div key={`${turn.who}-${turn.lines[0].start}`} className="mb-mac-turn">
              <div className="mb-record-speaker">
                {turn.who === 'you'
                  ? <><Avatar name="You" colorIndex={0} size="md" /><span className="mb-t-label">You</span></>
                  : <><span className="mb-mac-call" aria-hidden="true"><Icon name="users" size={14} /></span><span className="mb-t-label">On the call</span></>}
                <span className="mb-t-meta mb-muted mb-tabular">{formatDuration(turn.lines[0].start)}</span>
              </div>
              {turn.lines.map((l) => l.final ? (
                <div key={`${l.start}-${l.text}`} className={`mb-line${taskTexts.has(l.text) ? ' is-task' : ''}`}>
                  <p className="mb-t-reading mb-line-text">{l.text}</p>
                  {taskTexts.has(l.text) && <span className="mb-chip is-tag mb-line-task"><Icon name="check" size={12} /> Task</span>}
                </div>
              ) : (
                <p key="guess" className="mb-t-reading mb-record-interim">{l.text}<span className="mb-caret" aria-hidden="true" /></p>
              ))}
            </div>
          ))}
          {shownKind === 'meeting' && live.some((l) => l.who === 'them') && (
            <p className="mb-t-meta mb-muted">The people on the call are told apart (Speaker 1, 2…) when you stop.</p>
          )}
        </div>
      </section>
    </Page>
  );
}

/** Consecutive lines from the same track, under one name. */
function turns(lines: LiveLine[]): { who: LiveLine['who']; lines: LiveLine[] }[] {
  const out: { who: LiveLine['who']; lines: LiveLine[] }[] = [];
  for (const l of lines) {
    const last = out[out.length - 1];
    if (last && last.who === l.who) last.lines.push(l); else out.push({ who: l.who, lines: [l] });
  }
  return out;
}
