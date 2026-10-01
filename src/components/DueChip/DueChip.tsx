import { useEffect, useRef, useState } from 'react';
import '../Chip/Chip.css';
import './DueChip.css';

/**
 * The design's "Due date" chip, made real.
 *
 * Empty, it's the dashed "Due date" chip. Press it and the browser's own date
 * picker opens (an <input type="date"> — keyboard, screen readers and every
 * locale's date format for free). Set, it reads "Due Oct 3"; overdue dates
 * say so. Clearing the date returns it to the dashed empty chip.
 */
export function DueChip({ value, onChange, label }: { value?: string; onChange: (v: string | undefined) => void; label: string }) {
  const [editing, setEditing] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!editing || !input.current) return;
    input.current.focus();
    try { input.current.showPicker?.(); } catch { /* not allowed outside a gesture in some browsers — focus is enough */ }
  }, [editing]);

  if (editing) {
    return (
      <input
        ref={input} type="date" className="mb-chip is-action mb-due-input" aria-label={label}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || undefined)}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => { if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); setEditing(false); } }}
      />
    );
  }
  const overdue = !!value && value < new Date().toISOString().slice(0, 10);
  const text = value
    ? `Due ${new Date(`${value}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    : 'Due date';
  return (
    <button
      type="button" className={`mb-chip is-action${value ? '' : ' is-empty'}${overdue ? ' is-overdue' : ''}`}
      aria-label={value ? `${label}: ${text}${overdue ? ', overdue' : ''}. Change` : `${label}: none. Set a due date`}
      onClick={() => setEditing(true)}
    >
      {text}
    </button>
  );
}
