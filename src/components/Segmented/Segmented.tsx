import { useRef, type KeyboardEvent } from 'react';
import './Segmented.css';

/**
 * Segmented control — ONE track, not adjacent buttons.
 *
 * Two buttons with a gap between them do not say the options are exclusive;
 * a shared track does. So it is a radiogroup: one tab stop, arrow keys move
 * the choice, and a screen reader announces "2 of 4".
 *
 * An option can be disabled WITH a reason — the reason is rendered, not
 * hidden in a tooltip, because a greyed-out option with no explanation is a
 * control that silently refuses.
 */
export interface SegOption<T extends string | number> { value: T; label: string; disabled?: boolean }

export function Segmented<T extends string | number>(
  { options, value, onChange, label, size = 'md' }:
  { options: SegOption<T>[]; value: T; onChange: (v: T) => void; label: string; size?: 'sm' | 'md' },
) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0);

  function onKey(e: KeyboardEvent, i: number) {
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const pos = enabled.indexOf(i);
    const next = enabled[(pos + dir + enabled.length) % enabled.length];
    onChange(options[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div role="radiogroup" aria-label={label} className={`mb-seg is-${size}`}>
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            ref={(el) => { refs.current[i] = el; }}
            type="button" role="radio" aria-checked={on}
            tabIndex={on ? 0 : -1}
            disabled={o.disabled}
            className="mb-seg-option"
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
