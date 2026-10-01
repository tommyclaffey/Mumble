import { useEffect, useState } from 'react';
import { Button } from '../components/Button/Button';
import { Segmented } from '../components/Segmented/Segmented';
import { Surface } from '../components/Surface/Surface';
import { Track } from '../components/Track/Track';
import { GOOD_VOICE, type VoiceOption } from '../readAloud/engine';
import { useEngines } from '../readAloud/EngineContext';
import { NATURAL_VOICES, type NaturalVoiceId } from '../readAloud/natural/protocol';
import { mb, useNaturalStatus } from '../readAloud/natural/useNaturalStatus';
import { READ_RATES, useStore } from '../data/store';
import { SpeechUnavailable } from './SpeechUnavailable';
import './screens.css';
import './SettingsScreen.css';

/**
 * Settings — the ones that exist.
 *
 * The Figma Settings screen has Account, Integrations, Notifications, Plan.
 * None of them have anything behind them in a demo with no accounts, so they
 * are not here. A settings page of switches that change nothing is the
 * "control that does not do what it says" defect, fifteen times over.
 */
export function SettingsScreen() {
  const { prefs, dispatch } = useStore();
  const { speech, device, natural } = useEngines();
  const status = useNaturalStatus(natural);
  const [voices, setVoices] = useState<VoiceOption[]>(() => device.voices());
  const [plan, setPlan] = useState<{ sizeMB: number; realtime: boolean } | null>(null);

  /* The download size depends on the device (WebGPU or not), so it's
     measured before the user opts in, not quoted from a guess. */
  useEffect(() => {
    let live = true;
    natural?.plan().then((p) => { if (live) setPlan(p); });
    return () => { live = false; };
  }, [natural]);

  /* Chrome loads voices after the page, so the list can arrive late. */
  useEffect(() => device.onVoicesChanged(() => setVoices(device.voices())), [device]);

  const best = voices[0];
  const basicOnly = voices.length > 0 && (best?.score ?? 0) < GOOD_VOICE;
  const usingNatural = prefs.engine === 'natural';

  function chooseEngine(engine: 'device' | 'natural') {
    dispatch({ type: 'setPrefs', prefs: { engine } });
    /* Choosing Natural is the consent to download — the size is stated right
       above the control, before the click. */
    if (engine === 'natural') natural?.load();
  }

  function test() {
    speech.cancel();
    speech.speak('This is how Mumble will read your notes back to you.', prefs, () => {});
  }

  return (
    <div className="mb-page mb-settings">
      <div className="mb-page-head"><h1 className="mb-display-page mb-page-title">Settings</h1></div>

      <Surface as="section" className="mb-settings-card" aria-labelledby="ra-h">
        <h2 id="ra-h" className="mb-heading-section" style={{ margin: 0 }}>Read aloud</h2>

        <div className="mb-field">
          <span className="mb-label-strong">Voice</span>
          <Segmented
            label="Voice source" value={prefs.engine} onChange={chooseEngine}
            options={[
              { value: 'natural', label: 'Natural', disabled: !natural },
              { value: 'device', label: 'This device' },
            ]}
          />
          <p className="mb-body-reading mb-muted" style={{ margin: 0 }}>
            {!natural
              ? 'Natural needs a browser that can run it (Chrome, Edge, Safari or Firefox, recent versions).'
              : <>
                  Natural is an AI voice that runs on this device, so it sounds human and your notes never leave it.
                  {plan && <> It’s a one-time download of about <strong>{plan.sizeMB} MB</strong> on this browser.</>}
                  {plan && !plan.realtime && <> This browser can’t use the graphics chip for it, so expect short pauses between lines. Chrome or Edge will be smoother.</>}
                </>}
          </p>
        </div>

        {usingNatural && natural && (
          <div className="mb-field mb-natural">
            {status.phase === 'downloading' && (
              <div className="mb-natural-progress" aria-live="polite">
                <Track
                  percent={status.totalBytes ? (status.loadedBytes / status.totalBytes) * 100 : 0}
                  label="Natural voice download"
                  valueText={status.totalBytes ? `${mb(status.loadedBytes)} of ${mb(status.totalBytes)}` : 'Starting'}
                />
                <span className="mb-meta mb-muted mb-tabular">
                  {status.totalBytes ? `Downloading · ${mb(status.loadedBytes)} of ${mb(status.totalBytes)}` : 'Starting download…'}
                </span>
              </div>
            )}
            {status.phase === 'preparing' && <p className="mb-meta mb-muted" aria-live="polite" style={{ margin: 0 }}>Downloaded. Getting the voice ready…</p>}
            {status.phase === 'error' && (
              <div className="mb-notice" role="alert">
                <p className="mb-body-reading">{status.error} Read-aloud uses this device’s voice until it works.</p>
                <Button size="sm" onClick={() => natural.load()}>Try again</Button>
              </div>
            )}

            <label className="mb-label-strong" htmlFor="natural-voice">Natural voice</label>
            <select
              id="natural-voice" className="mb-input" value={prefs.naturalVoice}
              onChange={(e) => dispatch({ type: 'setPrefs', prefs: { naturalVoice: e.target.value as NaturalVoiceId } })}
            >
              {NATURAL_VOICES.map((v) => <option key={v.id} value={v.id}>{v.label} ({v.accent})</option>)}
            </select>
          </div>
        )}

        {!usingNatural && (
          <div className="mb-field">
            {!device.available && <SpeechUnavailable />}
            <label className="mb-label-strong" htmlFor="voice">Device voice</label>
            <select
              id="voice" className="mb-input" value={prefs.voiceURI ?? ''} disabled={!device.available}
              onChange={(e) => dispatch({ type: 'setPrefs', prefs: { voiceURI: e.target.value || undefined } })}
            >
              <option value="">{best ? `Best available (${best.name})` : 'Best available'}</option>
              {voices.map((v) => (
                <option key={v.uri} value={v.uri}>
                  {v.name} ({v.lang}){v.score >= GOOD_VOICE ? ' · recommended' : ''}
                </option>
              ))}
            </select>
            {basicOnly && (
              <p className="mb-body-reading mb-muted" style={{ margin: 0 }}>
                This device only has basic voices, which is why they sound robotic. Use <strong>Natural</strong> above,
                or add better ones: on a Mac, System Settings → Accessibility → Spoken Content → System voice →
                Manage Voices, then download one marked <strong>Premium</strong>.
              </p>
            )}
          </div>
        )}

        <div className="mb-field">
          <span className="mb-label-strong">Speed</span>
          <Segmented
            label="Reading speed" value={prefs.rate}
            onChange={(rate) => dispatch({ type: 'setPrefs', prefs: { rate } })}
            options={READ_RATES.map((r) => ({ value: r, label: `${r}×` }))}
          />
          <p className="mb-meta mb-muted" style={{ margin: 0 }}>Also changeable while listening, from any transcript.</p>
        </div>

        <div>
          <Button icon="speaker" onClick={test} disabled={!speech.available || (usingNatural && status.phase === 'error')}>
            Test voice
          </Button>
        </div>
      </Surface>

      <Surface as="section" className="mb-settings-card" aria-labelledby="demo-h">
        <h2 id="demo-h" className="mb-heading-section" style={{ margin: 0 }}>Demo data</h2>
        <p className="mb-body-reading mb-muted" style={{ margin: 0 }}>
          Everything you change is saved in this browser only. Reset puts the five demo captures back and removes anything you recorded.
        </p>
        <div>
          <Button onClick={() => { if (window.confirm('Reset to the demo captures? Recordings you made will be removed.')) dispatch({ type: 'resetDemo' }); }}>
            Reset demo
          </Button>
        </div>
      </Surface>
    </div>
  );
}
