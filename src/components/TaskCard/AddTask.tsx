import { useEffect, useRef, useState, type FormEvent } from 'react';
import { DictateButton, Heard } from '../Dictate/Dictate';
import { Icon } from '../Icon/Icon';
import './TaskCard.css';

/**
 * "+ Add a task" — type or say a task the recording didn't catch.
 *
 * Collapsed to one quiet row until it's wanted. Enter adds and keeps the
 * field open for the next one; Escape (or Cancel) closes it and puts focus
 * back on "+ Add a task". The task is marked manual, so it reads
 * "Added by you", never "Found by the model".
 */
export function AddTask({ onAdd }: { onAdd: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [heard, setHeard] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (open) input.current?.focus(); }, [open]);

  function close() { setOpen(false); setText(''); requestAnimationFrame(() => opener.current?.focus()); }
  function submit(e: FormEvent) {
    e.preventDefault();
    const t = text.trim().replace(/[.]+$/, '');
    if (!t) return;
    onAdd(t);
    setText('');
    input.current?.focus();
  }

  if (!open) {
    return (
      <button ref={opener} type="button" className="mb-addtask-open" onClick={() => setOpen(true)}>
        <Icon name="plus" size={16} /> Add a task
      </button>
    );
  }
  return (
    <form className="mb-addtask" onSubmit={submit} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }}>
      <div className="mb-addtask-field">
        <label htmlFor="addtask-in" className="mb-sr-only">New task</label>
        <input id="addtask-in" ref={input} value={text} onChange={(e) => setText(e.target.value)} placeholder="What needs doing?" maxLength={160} autoComplete="off" />
        <DictateButton label="Say the task" plain size="sm" onInterim={setHeard} onText={(t) => { setText((x) => (x.trim() ? `${x.trim()} ${t}` : t)); input.current?.focus(); }} />
      </div>
      <Heard text={heard} />
      <div className="mb-addtask-actions">
        <button type="submit" className="mb-button is-primary is-sm" disabled={!text.trim()}>Add</button>
        <button type="button" className="mb-button is-ghost is-sm" onClick={close}>Cancel</button>
      </div>
    </form>
  );
}
