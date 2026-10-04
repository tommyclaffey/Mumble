import { useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { Avatar, colorFor } from '../components/Avatar/Avatar';
import { Button } from '../components/Button/Button';
import { ChipFilter } from '../components/Chip/Chip';
import { Page, PanelCard } from '../components/Page/Page';
import { Icon } from '../components/Icon/Icon';
import { TaskCard } from '../components/TaskCard/TaskCard';
import { Track } from '../components/Track/Track';
import { formatDuration, isMeeting, type Capture, type Task, type TaskStatus } from '../data/model';
import { tagColor } from '../data/tagColor';
import { href } from '../data/route';
import { useStore } from '../data/store';
import './screens.css';
import './TasksScreen.css';

/**
 * Every task from every recording (Figma page 07, frame 05): a table grouped
 * To do · In progress · Done, and the side panel — progress, who owns what,
 * filter by tag.
 *
 * Each card says where it came from ("From: Product Sync") and opens AT the
 * line it came from — a task pulled out of speech is only trustworthy if you
 * can hear the sentence it came from.
 */

type Filter = 'all' | TaskStatus | 'mine';
const GROUPS: { status: TaskStatus; label: string }[] = [
  { status: 'todo', label: 'To do' },
  { status: 'in-progress', label: 'In progress' },
  { status: 'done', label: 'Done' },
];
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'todo', label: 'To do' }, { id: 'in-progress', label: 'In progress' },
  { id: 'done', label: 'Done' }, { id: 'mine', label: 'Mine' },
];
const peopleOf = (c: Capture) => (isMeeting(c) ? c.attendees : ['You']);

export function TasksScreen() {
  const { captures, dispatch } = useStore();
  const [filter, setFilter] = useState<Filter>('all');
  const [tags, setTags] = useState<string[]>([]);
  /* Click a person in Task Summary to see only their tasks. */
  const [owner, setOwner] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const everything: { task: Task; from: Capture }[] = captures.flatMap((c) => c.tasks.map((task) => ({ task, from: c })));
  const all = everything.filter(({ task, from }) =>
    (filter !== 'mine' || task.assignee === 'You') && (tags.length === 0 || from.tags.some((t) => tags.includes(t)))
    && (owner === null || (task.assignee ?? 'Unassigned') === owner));
  const groups = GROUPS.filter((g) => filter === 'all' || filter === 'mine' || g.status === filter);
  const tagNames = [...new Set(captures.flatMap((c) => c.tags))].sort((a, b) => a.localeCompare(b));

  const owners = new Map<string, number>();
  for (const { task } of everything) {
    if (task.status === 'done') continue;
    const k = task.assignee ?? 'Unassigned';
    owners.set(k, (owners.get(k) ?? 0) + 1);
  }
  const done = everything.filter(({ task }) => task.status === 'done').length;

  /* Ticking or re-grouping a task MOVES it, so React unmounts the card and
     focus used to fall to <body>. Follow the task; if it's no longer shown,
     land on the heading. */
  const follow = useRef<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    if (!follow.current) return;
    const el = document.getElementById(`task-cb-${follow.current}`);
    follow.current = null;
    (el ?? heading.current)?.focus();
  });

  function setStatus(captureId: string, taskId: string, status: TaskStatus) {
    follow.current = taskId;
    dispatch({ type: 'setTaskStatus', captureId, taskId, status });
  }
  function patch(from: Capture, taskId: string, p: Partial<Task>) {
    dispatch({ type: 'replaceCapture', capture: { ...from, tasks: from.tasks.map((x) => (x.id === taskId ? { ...x, ...p } : x)) } });
  }

  function exportAll() {
    const lines = ['# All tasks', ''];
    for (const g of GROUPS) {
      const rows = everything.filter(({ task }) => task.status === g.status);
      if (!rows.length) continue;
      lines.push(`## ${g.label}`, '');
      for (const { task, from } of rows) {
        lines.push(`- [${task.status === 'done' ? 'x' : ' '}] ${task.text}${task.assignee ? ` — ${task.assignee}` : ''}${task.due ? ` (due ${task.due})` : ''} (from: ${from.title})`);
      }
      lines.push('');
    }
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/markdown' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'mumble-tasks.md'; a.click();
    URL.revokeObjectURL(url);
  }

  const recordings = new Set(everything.map(({ from }) => from.id)).size;
  const count = (f: Filter) => everything.filter(({ task }) => (f === 'all' ? true : f === 'mine' ? task.assignee === 'You' : task.status === f)).length;

  const panel = (
    <>
      <PanelCard id="progress-h" title="Progress" icon="chart" meta={`${done} of ${everything.length} done`} desktopOnly>
        <Track percent={everything.length ? (done / everything.length) * 100 : 0} label="Tasks complete" valueText={`${done} of ${everything.length} tasks complete`} />
        <div className="mb-pstats">
          {GROUPS.map((g) => (
            <div key={g.status}><strong className="mb-tabular">{everything.filter(({ task }) => task.status === g.status).length}</strong><span>{g.label.toLowerCase()}</span></div>
          ))}
        </div>
        <Button variant="primary" block icon="download" onClick={exportAll} disabled={everything.length === 0}>Export all tasks</Button>
      </PanelCard>

      <PanelCard id="owners-h" title="Who owns what" icon="user"
        meta={owner ? <button type="button" className="mb-link-button" onClick={() => setOwner(null)}>Show everyone</button> : undefined}>
        <ul className="mb-prows">
          {[...owners.entries()].sort((a, b) => b[1] - a[1]).map(([who, n]) => (
            <li key={who}>
              <button
                type="button" className={`mb-prow mb-owner${owner === who ? ' is-on' : ''}`} aria-pressed={owner === who}
                onClick={() => setOwner((o) => (o === who ? null : who))}
              >
                {who === 'Unassigned'
                  ? <span className="mb-avatar is-md is-unconfirmed" aria-hidden="true">?</span>
                  : <Avatar name={who} colorIndex={colorFor(who)} size="md" />}
                <span className="mb-t-body-sm mb-owner-name">{who}</span>
                <span className="mb-t-meta mb-muted">{n} {n === 1 ? 'task' : 'tasks'}</span>
              </button>
            </li>
          ))}
        </ul>
      </PanelCard>

      <PanelCard id="tagfilter-h" title="Filter by tag" icon="hash">
        <div className="mb-tag-toggles" role="group" aria-label="Filter by tag">
          {tagNames.map((t) => (
            <button key={t} type="button" className="mb-chip is-tag mb-tag-toggle" aria-pressed={tags.includes(t)}
              onClick={() => setTags((x) => (x.includes(t) ? x.filter((y) => y !== t) : [...x, t]))}>
              <span className={`mb-tag-dot is-${tagColor(t)}`} aria-hidden="true" />{t}
            </button>
          ))}
        </div>
      </PanelCard>
    </>
  );

  /* "New task" opens its form right where it was pressed — the end of the table. */
  const newTask = adding ? (
    <NewTask captures={captures} onCancel={() => setAdding(false)} onAdd={(captureId, task) => { dispatch({ type: 'addTask', captureId, task }); setAdding(false); follow.current = task.id; }} />
  ) : (
    <button type="button" className="mb-task-new" onClick={() => setAdding(true)} aria-expanded={false}>
      <Icon name="plus" size={16} /> New task
    </button>
  );

  return (
    <Page title="Tasks" subtitle={`${everything.length} tasks found in ${recordings} recordings`} headingRef={heading} headingId="tasks-page-h" panel={panel} panelLabel="Task overview">
      {/* Phone: progress as a small card on top (Figma M05). */}
      <div className="mb-phone-only mb-phone-card mb-task-progress-phone">
        <div className="mb-phone-card-head">
          <p className="mb-t-label" style={{ margin: 0, flex: 1, color: 'var(--text-strong)' }}>{done} of {everything.length} done</p>
          <Button size="sm" icon="download" onClick={exportAll} disabled={everything.length === 0}>Export</Button>
        </div>
        <Track percent={everything.length ? (done / everything.length) * 100 : 0} label="Tasks complete" valueText={`${done} of ${everything.length} tasks complete`} />
      </div>

      <div className="mb-viewbar">
        <div className="mb-filterbar" role="group" aria-label="Filter tasks">
          {FILTERS.map((f) => (
            <ChipFilter key={f.id} pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label} <span className="mb-chip-count">{count(f.id)}</span>
            </ChipFilter>
          ))}
        </div>
      </div>

      {all.length === 0 && <div className="mb-empty"><p>{everything.length ? 'No tasks match these filters.' : 'No tasks yet. They appear here as recordings mention them.'}</p></div>}

      {all.length > 0 && (
        <div className="mb-task-table">
          <div className="mb-task-th" aria-hidden="true">
            <span className="is-task">Task</span><span className="is-owner">Owner</span><span className="is-status">Status</span><span className="is-from">From</span><span className="is-at">At</span>
          </div>
          {groups.map((g) => {
            const rows = all.filter(({ task }) => task.status === g.status);
            return (
              <section key={g.status} aria-labelledby={`g-${g.status}`} className="mb-task-section">
                <h2 id={`g-${g.status}`} className={`mb-task-group is-${g.status}`}>
                  <span className="mb-task-group-pill">{g.label}</span> <span className="mb-t-meta mb-muted mb-tabular">{rows.length}</span>
                </h2>
                {rows.length === 0 ? (
                  <p className="mb-t-body-sm mb-muted mb-task-none">Nothing here.</p>
                ) : (
                  <ul className="mb-task-rows">
                    {rows.map(({ task, from }) => {
                      const idx = from.lines.findIndex((l) => l.id === task.sourceLineId);
                      return (
                        <li key={task.id}>
                          <TaskCard
                            variant="table" id={`task-cb-${task.id}`} task={task} people={peopleOf(from)}
                            from={from.title} at={idx >= 0 ? formatDuration(from.lines[idx].startsAt) : undefined}
                            href={href({ name: 'capture', id: from.id, line: idx + 1 || undefined })}
                            onToggle={(d) => setStatus(from.id, task.id, d ? 'done' : 'todo')}
                            onStatus={(st) => setStatus(from.id, task.id, st)}
                            onAssign={(who) => patch(from, task.id, { assignee: who })}
                            onDue={(due) => patch(from, task.id, { due })}
                          />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
          {newTask}
        </div>
      )}
      {all.length === 0 && <div className="mb-task-table mb-task-table-solo">{newTask}</div>}
    </Page>
  );
}

/** "+ New Task": what needs doing, and which capture it belongs to. */
function NewTask({ captures, onAdd, onCancel }: { captures: Capture[]; onAdd: (captureId: string, t: Task) => void; onCancel: () => void }) {
  const [text, setText] = useState('');
  const [captureId, setCaptureId] = useState(captures[0]?.id ?? '');
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() || !captureId) return;
    onAdd(captureId, { id: `t-new-${Date.now()}`, text: text.trim(), sourceLineId: '', status: 'todo' });
  }
  return (
    <form className="mb-new-task-form" onSubmit={submit} onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}>
      <label className="mb-sr-only" htmlFor="new-task-text">New task</label>
      <input id="new-task-text" className="mb-input" autoFocus placeholder="What needs doing?" value={text} onChange={(e) => setText(e.target.value)} />
      <label className="mb-sr-only" htmlFor="new-task-from">From capture</label>
      <select id="new-task-from" className="mb-input mb-new-task-from" value={captureId} onChange={(e) => setCaptureId(e.target.value)}>
        {captures.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
      </select>
      <Button type="submit" variant="primary" size="sm" disabled={!text.trim()}><Icon name="plus" size={16} /> Add</Button>
      <Button size="sm" onClick={onCancel}>Cancel</Button>
    </form>
  );
}
