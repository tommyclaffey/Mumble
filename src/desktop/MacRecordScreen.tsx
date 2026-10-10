import { Button } from '../components/Button/Button';
import { Icon } from '../components/Icon/Icon';
import { Page, PanelCard } from '../components/Page/Page';
import { formatDuration, formatTimer } from '../data/model';
import { useRecordingStatus } from '../record/recordingStatus';
import { desktop } from './desktop';
import { useMacState } from './macState';

/**
 * New recording, inside the Mac app. The Mac records it, not the page: two
 * tracks (your mic, and the Mac's sound — everyone else on a call), then
 * transcribes both on this Mac. The same as clicking the floating icon.
 */
export function MacRecordScreen() {
  const mac = useMacState();
  const rec = useRecordingStatus();
  const app = desktop();
  const recording = mac.phase === 'recording';
  const paused = mac.phase === 'paused';
  const active = recording || paused;
  const saving = mac.phase === 'saving';
  const elapsed = active ? rec.elapsed : 0;

  const panel = (
    <>
      <PanelCard id="tracks-h" title="What gets recorded" icon="mic">
        <ul className="mb-t-body-sm mb-mac-list">
          <li><strong>Your mic</strong>: every line on it is labelled You.</li>
          <li><strong>Your Mac’s sound</strong>: everyone else on the call, told apart as Speaker 1, 2…</li>
          <li>Headphones keep the two apart best. With speakers, their voices leak into your mic; Mumble drops the repeats.</li>
        </ul>
      </PanelCard>
      <PanelCard id="where-h" title="Where your audio goes" icon="lock">
        <p className="mb-t-body-sm">Saved in Documents › Mumble on this Mac and transcribed here by Apple’s on-device speech recognition. Nothing is uploaded.</p>
      </PanelCard>
    </>
  );

  return (
    <Page
      title="New recording"
      subtitle={recording ? `Recording${mac.app ? ` your ${mac.app} call` : ''} · on this Mac` : paused ? 'Paused · nothing is being recorded' : saving ? 'Saving' : 'Ready when you are'}
      headingId="record-h" panel={panel} panelLabel="While you record" panelOnPhone="hide"
    >
      <section className="mb-recorder" aria-labelledby="record-h">
        <div className="mb-recorder-live">
          <button
            type="button"
            className={`mb-rec${recording ? ' is-live' : ''}`}
            onClick={() => app?.send(recording ? 'pause' : paused ? 'resume' : 'record')}
            disabled={saving}
            aria-label={recording ? 'Pause recording' : paused ? 'Resume recording' : 'Start recording'}
          >
            <span className="mb-rec-disc"><Icon name={recording ? 'pause' : saving ? 'loader' : 'mic'} size={28} /></span>
          </button>
          <div className="mb-recorder-clock">
            <p className="mb-t-page mb-tabular mb-record-timer" aria-label={`Elapsed ${formatTimer(elapsed)}`}>{formatDuration(elapsed)}</p>
            <p className="mb-t-label-sm mb-record-status" aria-live="polite">
              <span className={`mb-dot${recording ? ' is-live' : ''}`} aria-hidden="true" />
              {recording ? 'Recording your mic and your Mac’s sound'
                : paused ? 'Paused'
                : saving ? 'Saving and transcribing on this Mac'
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
            </>
          ) : <Button variant="primary" disabled={saving} onClick={() => app?.send('record')}>{saving ? 'Saving…' : 'Start'}</Button>}
          <span className="mb-t-meta mb-muted">{saving ? 'It opens here when it’s ready.' : 'Your side and the call’s side are recorded as separate tracks.'}</span>
        </div>
      </section>
    </Page>
  );
}
