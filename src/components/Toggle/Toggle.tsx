import './Toggle.css';

/** An on/off switch — a real <button role="switch">, so it says "on" or "off". */
export function Toggle({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className="mb-toggle" onClick={() => onChange(!on)}>
      <span className="mb-toggle-knob" aria-hidden="true" />
    </button>
  );
}
