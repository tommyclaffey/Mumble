import { Track } from '../Track/Track';
import './Waveform.css';

/**
 * The recording's waveform — its REAL loudness, not decoration (see
 * scripts/make-demo-peaks.mjs and record/waveform.ts). The part already
 * played is accent; the rest is neutral.
 *
 * Same contract as Track: a progressbar whose valueText is said in words
 * ("Listened to 0:18 of 1:08"). A capture without peaks falls back to the
 * plain Track, so nothing pretends to know a shape it doesn't.
 *
 * `decorative` draws only the picture (aria-hidden) — for the player, where
 * the slider on top of it is the control and carries the name.
 */
export function Waveform(
  { peaks, percent, label = '', valueText, bars = 96, decorative }:
  { peaks?: number[]; percent: number; label?: string; valueText?: string; bars?: number; decorative?: boolean },
) {
  const p = Math.min(100, Math.max(0, percent));
  if (!peaks?.length) return decorative ? null : <Track percent={p} label={label} valueText={valueText} />;
  const heights = resample(peaks, bars);
  const played = Math.round((p / 100) * bars);
  const a11y = decorative
    ? { 'aria-hidden': true as const }
    : { role: 'progressbar', 'aria-label': label, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(p), 'aria-valuetext': valueText };
  return (
    <div className="mb-wave" style={{ gridTemplateColumns: `repeat(${bars}, minmax(0, 1fr))` }} {...a11y}>
      {heights.map((h, i) => (
        <span key={i} className={`mb-wave-bar${i < played ? ' is-played' : ''}`} style={{ height: `${Math.round(18 + h * 82)}%` }} />
      ))}
    </div>
  );
}

/** Average the peaks down (or stretch them up) to exactly `n` bars. */
export function resample(peaks: number[], n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const from = (i / n) * peaks.length, to = ((i + 1) / n) * peaks.length;
    let sum = 0, count = 0;
    for (let j = Math.floor(from); j < Math.max(Math.ceil(to), Math.floor(from) + 1) && j < peaks.length; j++) { sum += peaks[j]; count++; }
    out.push(count ? sum / count : 0);
  }
  return out;
}
