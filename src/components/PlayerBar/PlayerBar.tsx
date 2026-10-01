import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Button } from '../Button/Button';
import { PlayButton } from '../PlayButton/PlayButton';
import { Waveform } from '../Waveform/Waveform';
import { formatDuration, positionLabel } from '../../data/model';
import { SPEEDS, speedLabel, type Speed } from '../../data/store';
import type { Player } from '../../playback/usePlayer';
import './PlayerBar.css';

/**
 * The recording player — one row, as in the design's "Audio Playback" box:
 * play · position · scrubber · length · speed.
 *
 * ⭐ The position is said in words first ("Line 4 of 18"), then the time.
 * Someone following the transcript needs their place in the text.
 *
 * Speed is ONE button that steps through 0.75× → 2× (the design's "1.0×").
 * Five side-by-side buttons was the clutter the layout review called out.
 *
 * Keyboard: Space plays/pauses and ← → move by line anywhere on the screen
 * (aria-keyshortcuts advertises it; the visible hint row is gone).
 */
export function PlayerBar(
  { player, speed, onSpeed, title, compact, peaks }:
  {
    player: Player; speed: Speed; onSpeed: (s: Speed) => void; title: string;
    /** The recording's real waveform, drawn under the scrubber. */
    peaks?: number[];
    /** The design's calm Audio Playback box: play · time · track · length ·
        speed. No line label or line-skip buttons (those belong with the
        transcript, where the lines are on screen). */
    compact?: boolean;
  },
) {
  const p = player;
  const label = positionLabel({ lineIndex: p.line, totalLines: p.total });
  const announcement = useAnnouncement(p, label);
  const off = !p.hasAudio;
  const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
  const state = stateText(p);

  return (
    <section className={`mb-player${compact ? ' is-compact' : ''}${peaks?.length ? ' has-wave' : ''}`} aria-label="Recording">
      <PlayButton size="md" playing={p.playing} onClick={p.toggle} label={`recording of ${title}`} disabled={off} keyshortcuts="Space" />
      {/* Where you are, in words first ("Line 4 of 13"), then the time. */}
      <div className="mb-player-pos">
        <span className="mb-t-label-sm mb-player-line">{off ? 'No recording' : label}</span>
        <span className="mb-t-meta mb-tabular mb-player-time">{off ? 'Transcript only' : `${formatDuration(p.time)} / ${formatDuration(p.duration)}`}</span>
      </div>
      <div className="mb-player-wave">
        <Waveform decorative peaks={peaks} percent={p.duration ? (p.time / p.duration) * 100 : 0} bars={140} />
        <input
          type="range" className="mb-player-seek"
          min={0} max={Math.max(p.duration, 0.1)} step={0.1} value={Math.min(p.time, p.duration || 0)}
          onChange={(e) => p.seek(Number(e.target.value))}
          disabled={off}
          aria-label="Position in recording"
          aria-valuetext={`${label}, ${formatDuration(p.time)} of ${formatDuration(p.duration)}`}
          style={{ '--mb-seek': `${p.duration ? (p.time / p.duration) * 100 : 0}%` } as CSSProperties}
        />
      </div>
      <div className="mb-player-controls">
        {!compact && <>
          <Button variant="ghost" size="sm" icon="prev" aria-label="Previous line" aria-keyshortcuts="ArrowLeft" onClick={p.prev} disabled={off} />
          <Button variant="ghost" size="sm" icon="next" aria-label="Next line" aria-keyshortcuts="ArrowRight" onClick={p.next} disabled={off || p.line >= p.total - 1} />
        </>}
        <button
          type="button" className="mb-player-speed mb-tabular"
          onClick={() => onSpeed(next)} disabled={off}
          aria-label={`Playback speed ${speed}×. Change to ${next}×`}
        >
          {speedLabel(speed)}
        </button>
      </div>
      {state && <p className={`mb-meta mb-player-state${p.error ? ' is-error' : ''}`}>{state}</p>}
      {/* What a screen reader hears — deliberately LESS than what's shown:
          not every line change (that would talk over the recording), only a
          move made while paused, and a failure. */}
      <span className="mb-sr-only" role="status" aria-live="polite">{announcement}</span>
    </section>
  );
}

function stateText(p: Player): string {
  if (!p.hasAudio) return '';
  if (p.error) return p.error;
  if (p.loading) return 'Loading…';
  return '';
}

function useAnnouncement(p: Player, label: string): string {
  const [text, setText] = useState('');
  const lastLine = useRef(p.line);
  useEffect(() => {
    if (lastLine.current === p.line) return;
    lastLine.current = p.line;
    if (!p.playing) setText(label);
  }, [p.line, p.playing, label]);
  useEffect(() => { if (p.error) setText(p.error); }, [p.error]);
  return text;
}
