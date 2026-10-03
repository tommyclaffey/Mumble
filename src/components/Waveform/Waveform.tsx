import { useEffect, useRef, useState } from 'react';
import { Track } from '../Track/Track';
import { resample } from './resample';
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
  const ref = useRef<HTMLDivElement>(null);
  const n = useFitBars(ref, bars);
  if (!peaks?.length) return decorative ? null : <Track percent={p} label={label} valueText={valueText} />;
  const heights = resample(peaks, n);
  const played = Math.round((p / 100) * n);
  const a11y = decorative
    ? { 'aria-hidden': true as const }
    : { role: 'progressbar', 'aria-label': label, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(p), 'aria-valuetext': valueText };
  return (
    <div ref={ref} className="mb-wave" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }} {...a11y}>
      {heights.map((h, i) => (
        <span key={i} className={`mb-wave-bar${i < played ? ' is-played' : ''}`} style={{ height: `${Math.round(18 + h * 82)}%` }} />
      ))}
    </div>
  );
}

/**
 * As many bars as fit — a bar and its gap need ~5px. On a phone the same
 * recording draws fewer, wider-spaced bars instead of collapsing to nothing.
 * Without ResizeObserver (tests, old browsers) it keeps `max`.
 */
function useFitBars(ref: React.RefObject<HTMLDivElement | null>, max: number): number {
  const [n, setN] = useState(max);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setN(Math.max(12, Math.min(max, Math.floor(e.contentRect.width / 5)))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, max]);
  return n;
}
