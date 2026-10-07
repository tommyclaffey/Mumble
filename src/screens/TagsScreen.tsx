import { useState } from 'react';
import { Icon } from '../components/Icon/Icon';
import { Page, PanelCard } from '../components/Page/Page';
import { TaskCard } from '../components/TaskCard/TaskCard';
import { formatDuration, formatWhen, isMeeting, openTasks } from '../data/model';
import { href } from '../data/route';
import { useStore } from '../data/store';
import { tagColor } from '../data/tagColor';
import './screens.css';
import './TagsScreen.css';
import { DictateButton } from '../components/Dictate/Dictate';

/**
 * Tags — a grid of tag cards; the chosen one fills the side panel with its
 * recordings and open tasks (Figma page 07, frame 06). The chosen tag is in
 * the URL (#/tags/Product), so it survives a reload.
 */
export function TagsScreen({ tag }: { tag?: string }) {
  const { captures, dispatch } = useStore();
  const [query, setQuery] = useState('');
  const [order, setOrder] = useState<'used' | 'az'>('used');
  const stats = (n: string) => {
    const cs = captures.filter((c) => c.tags.includes(n));
    const last = cs.map((c) => c.createdAt).sort().at(-1);
    return { captures: cs.length, tasks: cs.reduce((s, c) => s + openTasks(c), 0), last };
  };
  const names = [...new Set(captures.flatMap((c) => c.tags))]
    .sort((a, b) => (order === 'az' ? a.localeCompare(b) : stats(b).captures - stats(a).captures || a.localeCompare(b)));
  const shown = names.filter((n) => n.toLowerCase().includes(query.trim().toLowerCase()));
  const selected = tag && names.includes(tag) ? tag : shown[0];
  const tagged = selected ? captures.filter((c) => c.tags.includes(selected)) : [];
  const tasks = tagged.flatMap((c) => c.tasks.filter((t) => t.status !== 'done').map((t) => ({ t, from: c })));
  const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

  const panel = selected && (
    <>
      {/* Phone: a tag opens as its own screen — this is the way back. */}
      <a className="mb-phone-only mb-back-link" href={href({ name: 'tags' })}><Icon name="arrow-left" size={16} /> Tags</a>
      <PanelCard id="tag-detail-h" title={selected} icon="hash" meta="Selected">
        <p className="mb-t-body-sm mb-muted">{plural(tagged.length, 'recording')} and {plural(tasks.length, 'open task')} carry this tag.</p>
      </PanelCard>
      <PanelCard id="tag-recs-h" title="Recordings" icon="mic" meta={tagged.length}>
        <ul className="mb-prows">
          {tagged.map((c) => (
            <li key={c.id}>
              <div className="mb-prow">
                <span className="mb-tag-kind" aria-hidden="true"><Icon name={isMeeting(c) ? 'users' : 'mic'} size={14} /></span>
                <a className="mb-t-body-sm mb-prow-link mb-tag-rec" href={href({ name: 'capture', id: c.id })}>{c.title}</a>
                <span className="mb-t-meta mb-muted">{formatWhen(c.createdAt).split(' · ')[0]}</span>
              </div>
            </li>
          ))}
        </ul>
      </PanelCard>
      <PanelCard id="tag-tasks-h" title="Open tasks" icon="check" meta={tasks.length}>
        {tasks.length === 0 ? <p className="mb-t-body-sm mb-muted">No open tasks under this tag.</p> : (
          <ul className="mb-prows">
            {tasks.map(({ t, from }) => {
              const idx = from.lines.findIndex((l) => l.id === t.sourceLineId);
              return (
                <li key={t.id}>
                  <TaskCard
                    task={t} people={isMeeting(from) ? from.attendees : ['You']} from={from.title}
                    at={idx >= 0 ? formatDuration(from.lines[idx].startsAt) : undefined}
                    href={href({ name: 'capture', id: from.id, line: idx + 1 || undefined })}
                    onToggle={(done) => dispatch({ type: 'setTaskStatus', captureId: from.id, taskId: t.id, status: done ? 'done' : 'todo' })}
                    onStatus={(status) => dispatch({ type: 'setTaskStatus', captureId: from.id, taskId: t.id, status })}
                    onDue={(due) => dispatch({ type: 'replaceCapture', capture: { ...from, tasks: from.tasks.map((x) => (x.id === t.id ? { ...x, due } : x)) } })}
                    onAssign={(who) => dispatch({ type: 'replaceCapture', capture: { ...from, tasks: from.tasks.map((x) => (x.id === t.id ? { ...x, assignee: who } : x)) } })}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </PanelCard>
    </>
  );

  return (
    <Page
      title="Tags" subtitle={`${plural(names.length, 'tag')} across ${plural(captures.length, 'recording')}`}
      panel={panel || undefined} panelLabel="Chosen tag"
      /* Phone (Figma M06): the list, OR a chosen tag on its own screen. */
      phoneView={tag && names.includes(tag) ? 'tag-detail' : 'tag-list'}
    >
      <div className="mb-viewbar">
        <label className="mb-search mb-tag-search">
          <Icon name="search" size={16} />
          <span className="mb-sr-only">Search tags</span>
          <input data-search type="search" placeholder="Search tags" value={query} onChange={(e) => setQuery(e.target.value)} />
          <DictateButton label="Search tags by voice" plain size="sm" onText={setQuery} />
        </label>
        <div className="mb-viewbar-end">
          <label className="mb-dropdown-wrap">
            <span className="mb-sr-only">Order</span>
            <select className="mb-dropdown" value={order} onChange={(e) => setOrder(e.target.value as 'used' | 'az')}>
              <option value="used">Most used</option>
              <option value="az">A–Z</option>
            </select>
            <Icon name="chevron-down" size={14} />
          </label>
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="mb-empty"><p>{names.length ? `No tags match “${query}”.` : 'No tags yet.'}</p></div>
      ) : (
        <ul className="mb-tag-grid" aria-label="Tags">
          {shown.map((n) => {
            const k = stats(n);
            const c = tagColor(n);
            return (
              <li key={n}>
                <div className={`mb-tag-card mb-stretch${n === selected ? ' is-selected' : ''}`}>
                  <div className="mb-tag-card-top">
                    <span className={`mb-tag-swatch is-${c}`} aria-hidden="true"><Icon name="hash" size={18} /></span>
                    <h2 className="mb-t-heading mb-tag-card-name">
                      <a className="mb-stretch-link" href={href({ name: 'tags', tag: n })} aria-current={n === selected ? 'true' : undefined}>{n}</a>
                    </h2>
                  </div>
                  <div className="mb-tag-card-stats mb-t-body-sm">
                    <span className="mb-tag-card-counts"><span>{plural(k.captures, 'recording')}</span><span>{plural(k.tasks, 'task')}</span></span>
                    {k.last && <span className="mb-t-meta mb-muted mb-tag-card-last">{formatWhen(k.last).split(' · ')[0]}</span>}
                  </div>
                  <span className="mb-tag-card-chev" aria-hidden="true"><Icon name="chevron-down" size={16} /></span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Page>
  );
}
