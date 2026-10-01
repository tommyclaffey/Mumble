import { useState } from 'react';
import { ChipMeta } from '../components/Chip/Chip';
import { Surface } from '../components/Surface/Surface';
import { TaskCard } from '../components/TaskCard/TaskCard';
import { formatWhen, isMeeting, openTasks } from '../data/model';
import { PlayButton } from '../components/PlayButton/PlayButton';
import { useListPlayer } from '../playback/useListPlayer';
import { href } from '../data/route';
import { useStore } from '../data/store';
import './screens.css';
import './TagsScreen.css';

/**
 * Tags — list + detail, as in the wireframe: a searchable grid of tag cards
 * (each with its counts), a rule, and the chosen tag's captures and tasks.
 * The chosen tag is in the URL (#/tags/Product), so it survives a reload.
 */
export function TagsScreen({ tag }: { tag?: string }) {
  const { captures, dispatch } = useStore();
  const [query, setQuery] = useState('');
  const names = [...new Set(captures.flatMap((c) => c.tags))].sort((a, b) => a.localeCompare(b));
  const shown = names.filter((n) => n.toLowerCase().includes(query.trim().toLowerCase()));
  const selected = tag && names.includes(tag) ? tag : shown[0];
  const tagged = selected ? captures.filter((c) => c.tags.includes(selected)) : [];
  const tasks = tagged.flatMap((c) => c.tasks.map((t) => ({ t, from: c })));
  const count = (n: string) => {
    const cs = captures.filter((c) => c.tags.includes(n));
    return { captures: cs.length, tasks: cs.reduce((s, c) => s + openTasks(c), 0) };
  };
  const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
  /* One voice for the tag's mumbles — the design gives each a big play button. */
  const player = useListPlayer(tagged);

  return (
    <div className="mb-split mb-tags-split">
      <section className="mb-split-list" aria-labelledby="tags-h">
        <h1 id="tags-h" className="mb-display-page mb-page-title">All Tags</h1>
        <label className="mb-search mb-split-search mb-tag-search">
          <span className="mb-sr-only">Search tags</span>
          <input data-search type="search" placeholder="Search tags…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        {shown.length === 0 ? (
          <div className="mb-empty"><p>{names.length ? `No tags match “${query}”.` : 'No tags yet.'}</p></div>
        ) : (
          <ul className="mb-tag-grid" aria-label="Tags">
            {shown.map((n) => {
              const k = count(n);
              return (
                <li key={n}>
                  <Surface className={`mb-tag-card${n === selected ? ' is-selected' : ''}`}>
                    <a className="mb-heading-card mb-tag-link" href={href({ name: 'tags', tag: n })} aria-current={n === selected ? 'true' : undefined}>{n}</a>
                    <div className="mb-card-chips">
                      <ChipMeta>{plural(k.captures, 'mumble')}</ChipMeta>
                      <ChipMeta>{plural(k.tasks, 'task')}</ChipMeta>
                    </div>
                  </Surface>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="mb-split-rule" aria-hidden="true" />

      {selected && (
        <section className="mb-split-detail mb-tag-detail" aria-labelledby="tag-detail-h">
          <h2 id="tag-detail-h" className="mb-display-page mb-meeting-title">{selected}</h2>
          <div className="mb-card-chips">
            <ChipMeta tone="count">{plural(tagged.length, 'mumble')}</ChipMeta>
            <ChipMeta tone="count">{plural(tasks.filter(({ t }) => t.status !== 'done').length, 'task')}</ChipMeta>
          </div>
          <div className="mb-review-rule" aria-hidden="true" />

          <h3 className="mb-label-strong mb-tag-detail-h">Mumbles</h3>
          <ul className="mb-list">
            {tagged.map((c) => (
              <li key={c.id}>
                <Surface className="mb-tag-row mb-stretch">
                  <div className="mb-card-head">
                    <a className="mb-heading-sub mb-tag-row-title mb-stretch-link" href={href({ name: 'capture', id: c.id })}>{c.title}</a>
                    <span className="mb-card-when">{formatWhen(c.createdAt)}</span>
                  </div>
                  {c.summary && <p className="mb-body-small mb-muted mb-tag-row-summary">{c.summary}</p>}
                  <div className="mb-card-rule" aria-hidden="true" />
                  {c.audio ? (
                    <span className="mb-raise mb-tag-row-play">
                      <PlayButton size="md" playing={player.isPlaying(c.id)} onClick={() => player.toggle(c.id)} label={`recording of ${c.title}`} />
                    </span>
                  ) : <span className="mb-meta mb-muted">No recording · transcript only</span>}
                </Surface>
              </li>
            ))}
          </ul>

          <div className="mb-review-rule" aria-hidden="true" />
          <h3 className="mb-label-strong mb-tag-detail-h">Tasks</h3>
          {tasks.length === 0 ? <p className="mb-body mb-muted">No tasks under this tag.</p> : (
            <ul className="mb-list">
              {tasks.map(({ t, from }) => (
                <li key={t.id}>
                  <TaskCard
                    task={t} people={isMeeting(from) ? from.attendees : ['You']} from={from.title}
                    onToggle={(done) => dispatch({ type: 'setTaskStatus', captureId: from.id, taskId: t.id, status: done ? 'done' : 'todo' })}
                    onStatus={(status) => dispatch({ type: 'setTaskStatus', captureId: from.id, taskId: t.id, status })}
                    onDue={(due) => dispatch({ type: 'replaceCapture', capture: { ...from, tasks: from.tasks.map((x) => (x.id === t.id ? { ...x, due } : x)) } })}
                    href={href({ name: 'capture', id: from.id, line: from.lines.findIndex((l) => l.id === t.sourceLineId) + 1 || undefined })}
                    onAssign={(who) => dispatch({ type: 'replaceCapture', capture: { ...from, tasks: from.tasks.map((x) => (x.id === t.id ? { ...x, assignee: who } : x)) } })}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
