import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Avatar } from '../Avatar/Avatar';
import { Button } from '../Button/Button';
import '../Chip/Chip.css';
import type { Speaker } from '../../data/model';
import './SpeakerFix.css';

/**
 * The speaker header — and the correction that propagates by voice
 * (Figma decision #10).
 *
 * The name is a button. Pressing it asks "Who is this?" and says, BEFORE you
 * commit, how many lines the answer will change: "Applies to all 4 lines in
 * this voice." A bulk edit the user can't predict is one they won't trust.
 *
 * Suggestions come from the attendee list — the calendar already knows who
 * was in the room, so the likely answers are one click away.
 */
export function SpeakerFix(
  { speaker, lineCount, lowConfidence, startsAt, suggestions, onCorrect, onPlay }:
  {
    speaker: Speaker; lineCount: number; lowConfidence: boolean; startsAt: string;
    suggestions: string[]; onCorrect: (name: string) => void;
    /** Play the recording from this turn — the timestamp becomes a button. */
    onPlay?: () => void;
  },
) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const hintId = useId();

  useEffect(() => { if (open) input.current?.focus(); }, [open]);

  function close() {
    setOpen(false);
    setName('');
    /* Focus goes back where it came from — never lost to <body>. */
    requestAnimationFrame(() => trigger.current?.focus());
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onCorrect(name.trim());
    setOpen(false);
    setName('');
  }

  const others = suggestions.filter((s) => s.toLowerCase() !== speaker.name.toLowerCase());

  return (
    <div className="mb-speaker">
      <div className="mb-speaker-row">
        <Avatar name={speaker.name} colorIndex={speaker.colorIndex} unconfirmed={!speaker.confirmed && lowConfidence} size="md" />
        <button
          ref={trigger} type="button" className="mb-speaker-name mb-label-strong"
          data-speaker-trigger={speaker.id}
          aria-expanded={open}
          aria-label={`${speaker.name}. Correct who this speaker is`}
          onClick={() => (open ? close() : setOpen(true))}
        >
          {speaker.name}
        </button>
        {onPlay ? (
          <button type="button" className="mb-speaker-time mb-meta mb-tabular" onClick={onPlay} aria-label={`Play from ${startsAt}`}>{startsAt}</button>
        ) : (
          <span className="mb-meta mb-tabular mb-speaker-time-static">{startsAt}</span>
        )}
        {/* The model's doubt, said as the question it raises — and pressing
            it opens the fix. How far the answer reaches is said up front. */}
        {lowConfidence && (
          <>
            <button type="button" className="mb-chip is-meta is-low-confidence mb-speaker-who" onClick={() => setOpen(true)} aria-expanded={open}
              aria-label={`Who is this? The model wasn’t sure who ${speaker.name} is`}>
              Who is this?
            </button>
            <span className="mb-t-meta mb-muted">{lineCount} {lineCount === 1 ? 'line' : 'lines'}, same voice</span>
          </>
        )}
      </div>

      {open && (
        <form className="mb-speaker-form" onSubmit={submit} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }}>
          <label className="mb-label-strong" htmlFor={`${listId}-in`}>Who is this?</label>
          <div className="mb-speaker-form-row">
            <input
              id={`${listId}-in`} ref={input} list={listId} value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={speaker.name} aria-describedby={hintId} autoComplete="off"
            />
            <datalist id={listId}>{others.map((s) => <option key={s} value={s} />)}</datalist>
            <Button type="submit" variant="primary" size="sm" disabled={!name.trim()}>Apply</Button>
            <Button size="sm" onClick={close}>Cancel</Button>
          </div>
          {others.length > 0 && (
            <div className="mb-speaker-suggest" role="group" aria-label="Attendees">
              {others.map((s) => (
                <button key={s} type="button" className="mb-chip is-action" onClick={() => setName(s)}>{s}</button>
              ))}
            </div>
          )}
          <p id={hintId} className="mb-meta mb-muted" style={{ margin: 0 }}>
            Applies to all {lineCount} {lineCount === 1 ? 'line' : 'lines'} in this voice, not just this one.
          </p>
        </form>
      )}
    </div>
  );
}
