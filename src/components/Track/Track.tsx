import './Track.css';

/**
 * Progress track. `percent` is 0–100 (Figma decision #4 — the engineer gets
 * the real API rather than "resize the Fill child").
 *
 * `valueText` is what a screen reader announces. For read-aloud that is
 * "Line 4 of 18", not "25 percent" — the same text-first position the sighted
 * reader gets.
 */
export function Track({ percent, label, valueText }: { percent: number; label: string; valueText?: string }) {
  const p = Math.min(100, Math.max(0, percent));
  return (
    <div
      className="mb-track" role="progressbar" aria-label={label}
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p)} aria-valuetext={valueText}
    >
      <div className="mb-track-fill" style={{ width: `${p}%` }} />
    </div>
  );
}
