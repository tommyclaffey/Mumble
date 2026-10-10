import { desktop } from '../desktop/desktop';
import { showWelcome } from '../components/Welcome/welcomeState';
import { BRAND } from '../brand';
import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '../components/Button/Button';
import { ChipMeta } from '../components/Chip/Chip';
import { Icon } from '../components/Icon/Icon';
import { Page, PanelCard } from '../components/Page/Page';
import { Segmented } from '../components/Segmented/Segmented';
import { Toggle } from '../components/Toggle/Toggle';
import { SPEEDS, speedLabel, useStore } from '../data/store';
import { useServices } from '../services';
import { Avatar } from '../components/Avatar/Avatar';
import { href } from '../data/route';
import { isTeam, workspace, workspaceHref } from '../data/workspace';
import './screens.css';
import './SettingsScreen.css';

/**
 * Settings (Figma page 07, frame 08) — only settings this demo can honour.
 * Every switch here changes something; nothing is shown that isn't built
 * (plans and integrations aren't, so they aren't here). The only "account"
 * is the team demo's made-up one, and it says it's a demo.
 */
export function SettingsScreen() {
  /* Inside the Mac app the same screen describes the Mac, not a browser. */
  const inMac = !!desktop();
  const { prefs, dispatch, captures } = useStore();
  const { audioStore } = useServices();
  const [used, setUsed] = useState<string | null>(null);

  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => {
      if (e.usage !== undefined) setUsed(e.usage < 100_000 ? 'under 0.1 MB' : `${(e.usage / 1_000_000).toFixed(1)} MB`);
    }).catch(() => {});
  }, [captures]);

  function reset() {
    if (!window.confirm('Reset to the demo recordings? Recordings you made will be removed.')) return;
    dispatch({ type: 'resetDemo' });
    void audioStore.clear();
  }
  function deleteRecordings() {
    const mine = captures.filter((c) => c.audio === 'stored');
    if (!mine.length) return;
    if (!window.confirm(`Delete the audio of ${mine.length} recording${mine.length === 1 ? '' : 's'}? The transcripts stay.`)) return;
    void audioStore.clear();
    for (const c of mine) dispatch({ type: 'replaceCapture', capture: { ...c, audio: undefined, peaks: undefined } });
  }
  const stored = captures.filter((c) => c.audio === 'stored').length;
  const setPref = (p: Partial<typeof prefs>) => dispatch({ type: 'setPrefs', prefs: p });
  const ws = workspace();
  const demoCount = ws.captures().length;

  const panel = (
    <>
      <PanelCard id="storage-h" title="Storage" icon="database" meta="This browser">
        <dl className="mb-pkv">
          <dt>Recordings</dt><dd className="mb-tabular">{captures.length}</dd>
          <dt>Made by you</dt><dd className="mb-tabular">{stored}</dd>
          {used && <><dt>Space used</dt><dd className="mb-tabular">{used}</dd></>}
          <dt>Demo voices</dt><dd>Synthetic, labelled</dd>
        </dl>
      </PanelCard>
      <PanelCard id="keys-h" title="Shortcuts" icon="keyboard" desktopOnly>
        <dl className="mb-keys">
          <dt><kbd className="mb-kbd">Space</kbd></dt><dd>Play or pause</dd>
          <dt><kbd className="mb-kbd">← →</kbd></dt><dd>Previous or next line</dd>
          <dt><kbd className="mb-kbd">⌘K</kbd></dt><dd>Search</dd>
        </dl>
      </PanelCard>
      <PanelCard id="about-h" title="About" icon="info">
        <p className="mb-t-body-sm mb-muted">{BRAND.name} is a voice-first notes demo. Capture by speaking; review by listening. Demo recordings use synthetic voices, one per person.</p>
      </PanelCard>
    </>
  );

  return (
    <Page title="Settings" subtitle={inMac ? 'Everything here is saved on this Mac.' : 'Everything here is saved in this browser.'} panel={panel} panelLabel="Storage and shortcuts">
      <Section title="Workspace">
        {isTeam() && ws.me ? (
          <>
            <div className="mb-set-row mb-set-me">
              <Avatar name="You" size="xl" />
              <div className="mb-set-text">
                <p className="mb-t-label mb-set-label">{ws.me.name}</p>
                <p className="mb-t-body-sm mb-muted">{ws.me.role} · {ws.name}. A demo account — everyone on this team is made up.</p>
              </div>
              <div className="mb-set-control"><a className="mb-button is-secondary is-sm" href={href({ name: 'team' })}>See the team</a></div>
            </div>
            <Row label="Personal demo" hint="Just you, no team. Saved separately, so nothing here changes it.">
              <a className="mb-button is-secondary is-sm" href={workspaceHref('personal')}>Switch</a>
            </Row>
          </>
        ) : (
          <Row label="Team demo" hint={`${BRAND.name} with a made-up team: six people with faces and roles, recordings they shared, tasks with owners. Its own link and its own saved data.`}>
            <a className="mb-button is-secondary is-sm" href={workspaceHref('team')}>Open team demo</a>
          </Row>
        )}
        <Row label="Welcome tour" hint="What this demo is, and four things to try.">
          <Button size="sm" onClick={showWelcome}>Show the welcome tour</Button>
        </Row>
      </Section>

      <Section title="Playback">
        <Row label="Default speed" hint="Recordings start at this speed. Voices keep their natural pitch.">
          <Segmented
            label="Playback speed" value={prefs.speed} size="sm"
            onChange={(speed) => setPref({ speed })}
            options={SPEEDS.map((r) => ({ value: r, label: speedLabel(r) }))}
          />
        </Row>
        <Row label="Keyboard shortcuts" hint="Space plays or pauses a recording; arrow keys move by line.">
          <Toggle label="Keyboard shortcuts" on={prefs.shortcuts} onChange={(shortcuts) => setPref({ shortcuts })} />
        </Row>
      </Section>

      <Section title="Recording">
        <Row label="Find tasks while I talk" hint="Lines like “We need to…” are suggested as tasks. It’s phrasing, not a model, and it says so.">
          <Toggle label="Find tasks while I talk" on={prefs.taskHints} onChange={(taskHints) => setPref({ taskHints })} />
        </Row>
        {inMac ? (
          <Row label="Transcription" hint="Apple’s on-device speech recognition writes the transcript as you talk, and again from the recording when you stop. Nothing is uploaded.">
            <span className="mb-t-label-sm mb-muted">On this Mac</span>
          </Row>
        ) : (
          <Row label="Transcription" hint="Your browser’s speech service writes the transcript as you talk. Chrome and Edge send the audio to their vendor to do that; Safari keeps it on-device where it can.">
            <span className="mb-t-label-sm mb-muted">Browser speech service</span>
          </Row>
        )}
        <Row label="Meeting mode" hint={`After you stop, two small models tell the voices apart and put a speaker on every line, ${inMac ? 'on this Mac' : 'in this browser'}. The first meeting downloads them (about 33 MB); after that they’re saved. Unsure lines are flagged so you can say who it was.`}>
          <ChipMeta>{inMac ? 'On this Mac' : 'In this browser'}</ChipMeta>
        </Row>
      </Section>

      <Section title="Privacy & data">
        <Row label="Where recordings live" hint={`Audio, transcripts and edits never leave this ${inMac ? 'Mac' : 'browser'}.${used ? ` Using ${used} here.` : ''}`}>
          <span className="mb-t-label-sm"><Icon name="lock" size={14} /> {inMac ? 'This Mac only' : 'This browser only'}</span>
        </Row>
        <Row label="Delete my audio" hint={`${stored ? `${stored} recording${stored === 1 ? '' : 's'} saved with audio.` : 'None yet.'} Removes the audio; the transcripts stay.`}>
          <Button size="sm" onClick={deleteRecordings} disabled={!stored}>Delete audio</Button>
        </Row>
        <Row label="Reset demo" hint={`Brings back the ${demoCount} demo recordings and removes anything you recorded.`}>
          <Button size="sm" onClick={reset}>Reset demo</Button>
        </Row>
      </Section>
    </Page>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = `set-${title.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <section className="mb-set" aria-labelledby={id}>
      <h2 id={id} className="mb-t-over mb-set-h">{title}</h2>
      <div className="mb-set-card">{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return (
    <div className="mb-set-row">
      <div className="mb-set-text"><p className="mb-t-label mb-set-label">{label}</p><p className="mb-t-body-sm mb-muted">{hint}</p></div>
      <div className="mb-set-control">{children}</div>
    </div>
  );
}
