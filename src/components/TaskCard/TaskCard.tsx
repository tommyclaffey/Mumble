import { Avatar, colorFor } from '../Avatar/Avatar';
import { Checkbox } from '../Checkbox/Checkbox';
import { DueChip } from '../DueChip/DueChip';
import { Icon } from '../Icon/Icon';
import type { Task, TaskStatus } from '../../data/model';
import './TaskCard.css';

/**
 * A task. Three layouts of the same object (Figma page 07):
 *
 *   row     a side-panel row: round checkbox, the task, then owner · status ·
 *           due · where in the recording it was said.
 *   table   a Tasks-screen row: task · owner · status · where it came from · when.
 *
 * Every field is real: owner is a <select>, due opens the date picker, status
 * moves it between groups. The task itself goes to the line it came from — a
 * task pulled out of speech is only trustworthy if you can hear the sentence.
 */
export function TaskCard(
  { task, people, onToggle, onAssign, onStatus, onDue, onJump, id, href, from, at, variant = 'row' }:
  {
    task: Task; people: string[];
    onToggle: (done: boolean) => void;
    onAssign: (who: string | undefined) => void;
    onStatus: (s: TaskStatus) => void;
    onDue: (due: string | undefined) => void;
    /** Where the task came from — the title links there (another screen). */
    href?: string;
    /** The recording it came from (Tasks and Tags screens). */
    from?: string;
    /** When in the recording it was said, e.g. "0:48". */
    at?: string;
    onJump?: () => void;
    variant?: 'row' | 'table';
    /** @deprecated kept for callers. */
    jumpLabel?: string; showStatus?: boolean;
    id?: string;
  },
) {
  const done = task.status === 'done';
  const title = href ? <a className="mb-taskcard-link" href={href}>{task.text}</a>
    : onJump ? <button type="button" className="mb-taskcard-link mb-taskcard-jump" onClick={onJump}>{task.text}</button>
    : task.text;

  const owner = (
    <span className="mb-taskcard-owner">
      {task.assignee ? <Avatar name={task.assignee} colorIndex={colorFor(task.assignee)} size="sm" />
        : <span className="mb-taskcard-noowner" aria-hidden="true"><Icon name="plus" size={12} /></span>}
      <label className="mb-sr-only" htmlFor={`as-${task.id}`}>Assignee for {task.text}</label>
      <select
        id={`as-${task.id}`} className={`mb-quiet-select${task.assignee ? '' : ' is-empty'}`}
        value={task.assignee ?? ''} onChange={(e) => onAssign(e.target.value || undefined)}
      >
        <option value="">{variant === 'table' ? 'Unassigned' : 'Assign'}</option>
        {people.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
    </span>
  );
  const status = (
    <>
      <label className="mb-sr-only" htmlFor={`st-${task.id}`}>Status of {task.text}</label>
      <select
        id={`st-${task.id}`} className={`mb-status-select is-${task.status}`}
        value={task.status} onChange={(e) => onStatus(e.target.value as TaskStatus)}
      >
        <option value="todo">To do</option>
        <option value="in-progress">In progress</option>
        <option value="done">Done</option>
      </select>
    </>
  );

  if (variant === 'table') {
    return (
      <div className="mb-taskcard is-table">
        <Checkbox id={id} label={`Done: ${task.text}`} checked={done} onChange={onToggle} />
        <p className={`mb-t-body-sm mb-taskcard-text${done ? ' is-done' : ''}`}>{title}</p>
        <span className="mb-taskcard-col is-owner">{owner}</span>
        <span className="mb-taskcard-col is-status">{status}</span>
        <span className="mb-taskcard-col is-from mb-t-body-sm">{from && <><span className="mb-sr-only">From: </span>{from}</>}</span>
        <span className="mb-taskcard-col is-at mb-t-meta mb-tabular">{at}</span>
      </div>
    );
  }

  return (
    <div className="mb-taskcard is-row">
      <Checkbox id={id} label={`Done: ${task.text}`} checked={done} onChange={onToggle} />
      <div className="mb-taskcard-body">
        <p className={`mb-t-body-sm mb-taskcard-text${done ? ' is-done' : ''}`}>{title}</p>
        <div className="mb-taskcard-fields">
          {owner}
          {task.status === 'in-progress' && (
            <button type="button" className="mb-chip is-meta is-accent mb-chip-progress" onClick={() => onStatus('todo')} aria-label={`${task.text} is in progress. Mark as to do`}>
              In progress
            </button>
          )}
          <DueChip value={task.due} onChange={onDue} label={`Due date for ${task.text}`} />
          {at && <span className="mb-t-meta mb-tabular mb-taskcard-at">{at}</span>}
        </div>
        {from && <p className="mb-t-meta mb-muted mb-taskcard-from">From: {from}</p>}
      </div>
    </div>
  );
}
