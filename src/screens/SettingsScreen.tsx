import { useEffect, useState } from 'react';
import { Button } from '../components/Button/Button';
import { Segmented } from '../components/Segmented/Segmented';
import { SPEEDS, speedLabel, useStore } from '../data/store';
import { useServices } from '../services';
import './screens.css';
import './SettingsScreen.css';

/**
 * Settings — the frame's two-column layout (a section list, a 1px rule, the
 * section), filled with sections that DO something in this demo.
 *
 * The frame's Account / Integrations / Notifications / Plan have nothing
 * behind them without accounts, so they aren't here: a settings page of
 * switches that change nothing is the "control that doesn't do what it
 * says" defect, many times over. (Read-aloud voices lived here until Sept 30
 * — parked in parked/read-aloud.)
 */
type Section = 'playback' | 'recording' | 'privacy';
const SECTIONS: { id: Section; label: string }[] = [
  { id: 'playback', label: 'Playback' },
  { id: 'recording', label: 'Recording' },
  { id: 'privacy', label: 'Privacy & data' },
];

export function SettingsScreen() {
  const { prefs, dispatch, captures } = useStore();
  const { audioStore } = useServices();
  const [section, setSection] = useState<Section>('playback');
  const [used, setUsed] = useState<string | null>(null);

  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => {
      if (e.usage !== undefined) setUsed(`${(e.usage / 1_000_000).toFixed(1)} MB`);
    }).catch(() => {});
  }, [captures]);

  function reset() {
    if (!window.confirm('Reset to the demo captures? Recordings you made will be removed.')) return;
    dispatch({ type: 'resetDemo' });
    void audioStore.clear();
  }
  function deleteRecordings() {
    const mine = captures.filter((c) => c.audio === 'stored');
    if (!mine.length) return;
    if (!window.confirm(`Delete the audio of ${mine.length} recording${mine.length === 1 ? '' : 's'}? The transcripts stay.`)) return;
    void audioStore.clear();
    for (const c of mine) dispatch({ type: 'replaceCapture', capture: { ...c, audio: undefined } });
  }
  const stored = captures.filter((c) => c.audio === 'stored').length;

  return (
    <div className="mb-settings-split">
      <nav className="mb-settings-nav" aria-labelledby="settings-h">
        <h1 id="settings-h" className="mb-display-page mb-page-title">Settings</h1>
        <ul>
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <button type="button" className="mb-settings-tab" aria-current={section === s.id ? 'true' : undefined} onClick={() => setSection(s.id)}>
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mb-split-rule" aria-hidden="true" />

      <section className="mb-settings-body" aria-labelledby="section-h">
        <h2 id="section-h" className="mb-heading-section mb-settings-h">{SECTIONS.find((s) => s.id === section)!.label}</h2>

        {section === 'playback' && (
          <div className="mb-field">
            <span className="mb-meta-strong">Speed</span>
            <Segmented
              label="Playback speed" value={prefs.speed}
              onChange={(speed) => dispatch({ type: 'setPrefs', prefs: { speed } })}
              options={SPEEDS.map((r) => ({ value: r, label: speedLabel(r) }))}
            />
            <p className="mb-meta mb-muted">Also changeable while listening, from any capture. Pitch stays natural at every speed.</p>
          </div>
        )}

        {section === 'recording' && (
          <>
            <div className="mb-setting-row">
              <div><p className="mb-label-strong">Transcription</p><p className="mb-meta mb-muted">Your browser’s speech service writes the transcript as you talk. Chrome and Edge send the audio to their vendor to do that; Safari keeps it on-device where it can.</p></div>
            </div>
            <div className="mb-setting-row">
              <div><p className="mb-label-strong">Meeting mode</p><p className="mb-meta mb-muted">Off in the demo. Telling voices apart needs a model the browser doesn’t have.</p></div>
            </div>
            <div className="mb-setting-row">
              <div><p className="mb-label-strong">Task suggestions</p><p className="mb-meta mb-muted">New recordings suggest tasks from phrasing (“we need to…”, “let’s…”). No model runs in the browser demo, and the suggestions say so.</p></div>
            </div>
          </>
        )}

        {section === 'privacy' && (
          <>
            <div className="mb-setting-row">
              <div><p className="mb-label-strong">Where your data lives</p><p className="mb-meta mb-muted">In this browser only — captures, edits and recordings. Nothing is sent to Mumble.{used ? ` Using ${used} here.` : ''}</p></div>
            </div>
            <div className="mb-setting-row">
              <div><p className="mb-label-strong">Recordings you made</p><p className="mb-meta mb-muted">{stored ? `${stored} saved with audio.` : 'None yet.'} Deleting removes the audio and keeps the transcripts.</p></div>
              <Button size="sm" onClick={deleteRecordings} disabled={!stored}>Delete audio</Button>
            </div>
            <div className="mb-setting-row">
              <div><p className="mb-label-strong">Demo data</p><p className="mb-meta mb-muted">Puts the five demo captures back and removes anything you recorded. The demo recordings use synthetic voices, one per person.</p></div>
              <Button size="sm" variant="primary" onClick={reset}>Reset demo</Button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
