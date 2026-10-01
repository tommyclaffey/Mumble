import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '../Button/Button';
import './EditableTitle.css';

/**
 * A capture's title, renameable in place.
 *
 * A recording is titled from its first words ("Okay so I was thinking…"),
 * which is a fine default and a bad name. Rename is one click, Enter saves,
 * Escape cancels, and focus goes back to the Rename button either way.
 */
export function EditableTitle({ title, onRename }: { title: string; onRename: (t: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);

  useEffect(() => {
    if (editing) input.current?.select();
    else if (returnFocus.current) { returnFocus.current = false; trigger.current?.focus(); }
  }, [editing]);

  function close() { returnFocus.current = true; setEditing(false); }

  function submit(e: FormEvent) {
    e.preventDefault();
    const t = value.trim();
    if (!t) return;
    if (t !== title) onRename(t);
    close();
  }

  if (editing) {
    return (
      <form className="mb-title-form" onSubmit={submit} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }}>
        <label htmlFor="title-input" className="mb-sr-only">Title</label>
        <input
          id="title-input" ref={input} className="mb-display-page mb-title-input"
          value={value} onChange={(e) => setValue(e.target.value)} maxLength={120}
        />
        <Button type="submit" variant="primary" size="sm" disabled={!value.trim()}>Save</Button>
        <Button size="sm" onClick={close}>Cancel</Button>
      </form>
    );
  }

  return (
    <div className="mb-title-row">
      <h1 className="mb-display-page mb-page-title">{title}</h1>
      <Button
        ref={trigger} variant="ghost" size="sm" icon="pencil" aria-label="Rename"
        onClick={() => { setValue(title); setEditing(true); }}
      />
    </div>
  );
}
