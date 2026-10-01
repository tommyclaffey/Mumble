import { useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { Avatar, colorFor } from '../components/Avatar/Avatar';
import { Button } from '../components/Button/Button';
import { ChipFilter, ChipMeta } from '../components/Chip/Chip';
import { Icon } from '../components/Icon/Icon';
import { TaskCard } from '../components/TaskCard/TaskCard';
import { Track } from '../components/Track/Track';
import { isMeeting, type Capture, type Task, type TaskStatus } from '../data/model';
import { href } from '../data/route';
import { useStore } from '../data/store';
import './screens.css';
import './TasksScreen.css';

/**
 * Every task from every capture — the hi-fi Task View: the list (grouped
 * To Do · In Progress · Done) and a 280px side panel to filter by tag, see
 * who owns what, and how far along it all is.
 *
 * Each card says where it came from ("From: Product Sync") and opens AT the
 * line it came from — a task pulled out of speech is only trustworthy if you
 * can hear the sentence it came from.
 */

type Filter = 'all' | TaskStatus | 'mine';
const GROUPS: { status: TaskStatus; label: string }[] = [
  { status: 'todo', label: 'To Do' },
  { status: 'in-progress', label: 'In Progress' },
  { status: 'done', label: 'Done' },
];
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'todo', label: 'To Do' }, { id: 'in-progress', label: 'In Progress' },
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
  const open = everything.filter(({ task }) => task.status !== 'done').length;

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

  return (
    <div className="mb-split mb-tasks-split">
      <section className="mb-split-list" aria-labelledby="tasks-page-h">
        <div className="mb-page-head">
          <div className="mb-page-title-row">
            <h1 id="tasks-page-h" ref={heading} tabIndex={-1} className="mb-display-page mb-page-title">All Tasks</h1>
            <ChipMeta tone="count">{open}</ChipMeta>
          </div>
          <Button variant="primary" size="sm" className="mb-new-task" onClick={() => setAdding(true)} aria-expanded={adding}>+ New Task</Button>
        </div>
        <div className="mb-toolbar" role="group" aria-label="Filter tasks">
          {FILTERS.map((f) => (
            <ChipFilter key={f.id} pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</ChipFilter>
          ))}
        </div>

        {adding && <NewTask captures={captures} onCancel={() => setAdding(false)} onAdd={(captureId, task) => { dispatch({ type: 'addTask', captureId, task }); setAdding(false); follow.current = task.id; }} />}

        {all.length === 0 && <div className="mb-empty"><p>{everything.length ? 'No tasks match these filters.' : 'No tasks yet. They appear here as captures mention them.'}</p></div>}

        {all.length > 0 && groups.map((g) => {
          const rows = all.filter(({ task }) => task.status === g.status);
          return (
            <section key={g.status} aria-labelledby={`g-${g.status}`} className="mb-task-section">
              <h2 id={`g-${g.status}`} className={`mb-heading-sub mb-task-group${g.status === 'done' ? ' is-done' : ''}`}>
                {g.label} <span className="mb-tabular">{rows.length}</span>
              </h2>
              {rows.length === 0 ? (
                <p className="mb-body mb-muted mb-task-none">Nothing here.</p>
              ) : (
                <ul className="mb-list">
                  {rows.map(({ task, from }) => {
                    const line = from.lines.findIndex((l) => l.id === task.sourceLineId) + 1;
                    return (
                      <li key={task.id}>
                        <TaskCard
                          id={`task-cb-${task.id}`} task={task} people={peopleOf(from)} showStatus
                          from={from.title}
                          href={href({ name: 'capture', id: from.id, line: line || undefined })}
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
      </section>

      <div className="mb-split-rule" aria-hidden="true" />

      <aside className="mb-split-detail mb-task-panel" aria-label="Task overview">
        <h2 className="mb-heading-sub mb-panel-h">Filter by Tag</h2>
        <div className="mb-task-tags" role="group" aria-label="Filter by tag">
          {tagNames.map((t) => (
            <button key={t} type="button" className="mb-chip is-tag mb-tag-toggle" aria-pressed={tags.includes(t)}
              onClick={() => setTags((x) => (x.includes(t) ? x.filter((y) => y !== t) : [...x, t]))}>
              {t}
            </button>
          ))}
        </div>

        <div className="mb-review-rule" aria-hidden="true" />
        <h2 className="mb-heading-sub mb-panel-h">
          Task Summary
          {owner && <button type="button" className="mb-link-button mb-meta" onClick={() => setOwner(null)}>Show everyone</button>}
        </h2>
        <ul className="mb-list">
          {[...owners.entries()].sort((a, b) => b[1] - a[1]).map(([who, n]) => (
            <li key={who}>
              <button
                type="button" className={`mb-owner${owner === who ? ' is-on' : ''}`} aria-pressed={owner === who}
                onClick={() => setOwner((o) => (o === who ? null : who))}
              >
                {who === 'Unassigned'
                  ? <span className="mb-avatar is-md is-unconfirmed" aria-hidden="true">?</span>
                  : <Avatar name={who} colorIndex={colorFor(who)} size="md" />}
                <span className="mb-label-large mb-owner-name">{who}</span>
                <span className="mb-meta mb-muted">{n} {n === 1 ? 'task' : 'tasks'}</span>
              </button>
            </li>
          ))}
        </ul>

        <div className="mb-task-progress">
          <h2 className="mb-label-strong mb-panel-h">Overall Progress</h2>
          <Track percent={everything.length ? (done / everything.length) * 100 : 0} label="Tasks complete" valueText={`${done} of ${everything.length} tasks complete`} />
          <p className="mb-meta mb-muted mb-tabular">{done} of {everything.length} tasks complete</p>
          <Button variant="primary" block onClick={exportAll} disabled={everything.length === 0}>Export All Tasks</Button>
        </div>
      </aside>
    </div>
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
