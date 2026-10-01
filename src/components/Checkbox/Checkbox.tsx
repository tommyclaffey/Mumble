import { Icon } from '../Icon/Icon';
import './Checkbox.css';

/**
 * Checkbox — 20px visual, 44×44 hit area (Figma decision #2).
 *
 * The density of a task row needs the small box; a thumb needs the big
 * target. The hit area is the label's padding, so the whole 44px square is
 * clickable without the box looking any larger.
 *
 * A real <input type="checkbox">, visually replaced — so keyboard, screen
 * readers and form semantics all come from the browser, not from us.
 */
export function Checkbox(
  { checked, onChange, label, id }: { checked: boolean; onChange: (next: boolean) => void; label: string; id?: string },
) {
  return (
    <label className="mb-checkbox">
      <input
        type="checkbox" checked={checked} aria-label={label} id={id}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="mb-checkbox-box" aria-hidden="true">{checked && <Icon name="check" size={16} />}</span>
    </label>
  );
}
