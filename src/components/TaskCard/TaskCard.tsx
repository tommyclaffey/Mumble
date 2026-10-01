import { Checkbox } from '../Checkbox/Checkbox';
import { DueChip } from '../DueChip/DueChip';
import { Surface } from '../Surface/Surface';
import type { Task, TaskStatus } from '../../data/model';
import './TaskCard.css';

/**
 * A task, as the design's task card draws it (688 × 68): checkbox, the task
 * (Label 12/500), then its fields as chips — Assignee and Due date — with
 * where it came from in the corner on screens that collect tasks from many
 * captures.
 *
 * Every chip is real: Assignee is a <select>, Due date opens the date
 * picker. Moving a task through To do / In progress / Done happens on the
 * Tasks screen, where those groups are — the card only shows "In progress"
 * when it is (and pressing it moves it back). The whole card goes to the
 * line the task came from.
 */
export function TaskCard(
  { task, people, onToggle, onAssign, onStatus, onDue, onJump, id, href, from, showStatus }:
  {
    task: Task; people: string[];
    onToggle: (done: boolean) => void;
    onAssign: (who: string | undefined) => void;
    onStatus: (s: TaskStatus) => void;
    onDue: (due: string | undefined) => void;
    /** Where the task came from — the title links there (another screen). */
    href?: string;
    /** "From: Product Sync" in the corner (Tasks and Tags screens). */
    from?: string;
    onJump?: () => void;
    /** The Tasks screen moves tasks between its groups — a status choice there. */
    showStatus?: boolean;
    /** @deprecated kept for callers; the card itself is the jump. */
    jumpLabel?: string;
    id?: string;
  },
) {
  const done = task.status === 'done';
  return (
    <Surface className={`mb-taskcard${href || onJump ? ' mb-stretch' : ''}`}>
      <span className="mb-raise mb-taskcard-check"><Checkbox id={id} label={`Done: ${task.text}`} checked={done} onChange={onToggle} /></span>
      <div className="mb-taskcard-body">
        <p className={`mb-label mb-taskcard-text${done ? ' is-done' : ''}`}>
          {href ? <a className="mb-taskcard-link mb-stretch-link" href={href}>{task.text}</a>
            : onJump ? <button type="button" className="mb-taskcard-link mb-stretch-link mb-taskcard-jump" onClick={onJump}>{task.text}</button>
            : task.text}
        </p>
        <div className="mb-taskcard-fields mb-raise">
          <label className="mb-sr-only" htmlFor={`as-${task.id}`}>Assignee for {task.text}</label>
          <select
            id={`as-${task.id}`}
            className={`mb-chip is-action mb-select${task.assignee ? '' : ' is-empty'}`}
            value={task.assignee ?? ''}
            onChange={(e) => onAssign(e.target.value || undefined)}
          >
            <option value="">Assignee</option>
            {people.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <DueChip value={task.due} onChange={onDue} label={`Due date for ${task.text}`} />
          {showStatus ? (
            <>
              <label className="mb-sr-only" htmlFor={`st-${task.id}`}>Status of {task.text}</label>
              <select
                id={`st-${task.id}`}
                className={`mb-chip is-action mb-select${task.status === 'in-progress' ? ' is-progress' : task.status === 'todo' ? ' is-empty' : ''}`}
                value={task.status}
                onChange={(e) => onStatus(e.target.value as TaskStatus)}
              >
                <option value="todo">To do</option>
                <option value="in-progress">In progress</option>
                <option value="done">Done</option>
              </select>
            </>
          ) : task.status === 'in-progress' && (
            <button type="button" className="mb-chip is-action mb-chip-progress" onClick={() => onStatus('todo')} aria-label={`${task.text} is in progress. Mark as to do`}>
              In progress
            </button>
          )}
        </div>
      </div>
      {from && <span className="mb-taskcard-from">From: {from}</span>}
    </Surface>
  );
}
