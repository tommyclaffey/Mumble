import { BRAND } from '../brand';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CaptureCard } from '../components/CaptureCard/CaptureCard';
import { ChipFilter } from '../components/Chip/Chip';
import { Icon } from '../components/Icon/Icon';
import { Page, PanelCard } from '../components/Page/Page';
import { Checkbox } from '../components/Checkbox/Checkbox';
import { formatDuration, openTasks, type Capture } from '../data/model';
import { go, href, type RecentFilter } from '../data/route';
import { dayGroup, matches } from '../data/filters';
import { useStore } from '../data/store';
import { useListPlayer } from '../playback/useListPlayer';
import './screens.css';

/**
 * Recent — every recording, grouped by day (Figma page 07, frame 01).
 *
 * The filter lives in the URL (#/recent?filter=meetings), so it survives a
 * reload and the back button undoes it. The side panel is what to do next:
 * the open tasks, and the week at a glance.
 */
const FILTERS: { id: RecentFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'notes', label: 'Notes' },
  { id: 'meetings', label: 'Meetings' },
  { id: 'tasks', label: 'Has tasks' },
];

export function RecentScreen({ filter }: { filter: RecentFilter }) {
  const { captures, dispatch } = useStore();
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [oldestFirst, setOldestFirst] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  /* The header's Search asks this page to open its field. */
  useEffect(() => {
    const open = () => { setSearching(true); requestAnimationFrame(() => searchRef.current?.focus()); };
    window.addEventListener('mumble:search', open);
    return () => window.removeEventListener('mumble:search', open);
  }, []);
  const sorted = useMemo(
    () => [...captures].sort((a, b) => (oldestFirst ? a : b).createdAt.localeCompare((oldestFirst ? b : a).createdAt)),
    [captures, oldestFirst],
  );
  const shown = sorted.filter((c) => matches(c, filter, query));
  const player = useListPlayer(shown);
  const open = captures.reduce((n, c) => n + openTasks(c), 0);

  const groups: { label: string; items: Capture[] }[] = [];
  for (const c of shown) {
    const label = dayGroup(c.createdAt);
    const g = groups.find((x) => x.label === label);
    if (g) g.items.push(c); else groups.push({ label, items: [c] });
  }

  /* The panel's "Up next": open tasks, newest recording first. */
  const upNext = sorted
    .flatMap((c) => c.tasks.filter((t) => t.status !== 'done').map((t) => ({ t, from: c })))
    .slice(0, 4);
  const total = captures.reduce((s, c) => s + c.durationSeconds, 0);
  const found = captures.reduce((s, c) => s + c.tasks.length, 0);

  const panel = (
    <>
      <PanelCard id="upnext-h" title="Up next" icon="check" meta={`${open} open`}>
        {upNext.length === 0 ? <p className="mb-t-body-sm mb-muted">Nothing open. Tasks appear here as recordings mention them.</p> : (
          <ul className="mb-prows">
            {upNext.map(({ t, from }) => (
              <li key={t.id}>
                <div className="mb-prow mb-prow-task">
                  <Checkbox label={`Done: ${t.text}`} checked={false}
                    onChange={() => dispatch({ type: 'setTaskStatus', captureId: from.id, taskId: t.id, status: 'done' })} />
                  <div className="mb-prow-text">
                    <a className="mb-t-body-sm mb-prow-link" href={href({ name: 'capture', id: from.id, line: from.lines.findIndex((l) => l.id === t.sourceLineId) + 1 || undefined })}>{t.text}</a>
                    <span className="mb-t-meta mb-muted">{from.title} · {t.assignee ?? 'Unassigned'}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <a className="mb-plink" href={href({ name: 'tasks' })}>View all tasks <Icon name="arrow-right" size={14} /></a>
      </PanelCard>
      <PanelCard id="week-h" title="All recordings" icon="clock">
        <div className="mb-pstats">
          <div><strong className="mb-tabular">{captures.length}</strong><span>recordings</span></div>
          <div><strong className="mb-tabular">{formatDuration(total)}</strong><span>recorded</span></div>
          <div><strong className="mb-tabular">{found}</strong><span>tasks found</span></div>
        </div>
      </PanelCard>
    </>
  );

  return (
    <Page title="Recent" subtitle={`${captures.length} recordings · ${open} open tasks`} panel={panel} panelLabel="Up next" panelOnPhone="hide">
      {/* Phone: the panel's "Up next", folded into one card above the feed. */}
      {upNext.length > 0 && (
        <div className="mb-phone-only mb-phone-card">
          <div className="mb-phone-card-head">
            <span className="mb-pcard-icon"><Icon name="check" size={16} /></span>
            <p className="mb-phone-card-title">Up next</p>
            <span className="mb-t-meta mb-muted">{open} open</span>
          </div>
          <ul className="mb-prows">
            {upNext.slice(0, 2).map(({ t, from }) => (
              <li key={t.id}>
                <div className="mb-prow mb-prow-task">
                  <Checkbox label={`Done: ${t.text}`} checked={false}
                    onChange={() => dispatch({ type: 'setTaskStatus', captureId: from.id, taskId: t.id, status: 'done' })} />
                  <div className="mb-prow-text">
                    <a className="mb-t-body-sm mb-prow-link" href={href({ name: 'capture', id: from.id, line: from.lines.findIndex((l) => l.id === t.sourceLineId) + 1 || undefined })}>{t.text}</a>
                    <span className="mb-t-meta mb-muted">{from.title} · {t.assignee ?? 'Unassigned'}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <a className="mb-plink" href={href({ name: 'tasks' })}>View all {open} tasks <Icon name="arrow-right" size={14} /></a>
        </div>
      )}
      {(searching || query) && (
        <label className="mb-search mb-search-page">
          <Icon name="search" size={16} />
          <span className="mb-sr-only">Search captures</span>
          <input
            data-search ref={searchRef} type="search" placeholder="Search titles, tags and transcripts"
            value={query} onChange={(e) => setQuery(e.target.value)}
            onBlur={() => { if (!query) setSearching(false); }}
          />
        </label>
      )}

      <div className="mb-viewbar">
        <div className="mb-filterbar" role="group" aria-label="Filter captures">
          {FILTERS.map((f) => (
            <ChipFilter key={f.id} pressed={filter === f.id} onClick={() => go({ name: 'recent', filter: f.id })}>
              {f.label} <span className="mb-chip-count">{captures.filter((c) => matches(c, f.id, '')).length}</span>
            </ChipFilter>
          ))}
        </div>
        <div className="mb-viewbar-end">
          <label className="mb-dropdown-wrap">
            <span className="mb-sr-only">Order</span>
            <select className="mb-dropdown" value={oldestFirst ? 'oldest' : 'newest'} onChange={(e) => setOldestFirst(e.target.value === 'oldest')}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
            <Icon name="chevron-down" size={14} />
          </label>
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="mb-empty">
          {captures.length === 0 ? (
            <>
              <p>No recordings yet. Say something.</p>
              <a className="mb-button is-accent is-md" href={href({ name: 'record' })}><Icon name="mic" size={16} /> {BRAND.startLabel}</a>
            </>
          ) : (
            <p>Nothing matches{query ? ` “${query}”` : ''} in this filter.</p>
          )}
        </div>
      ) : (
        <div className="mb-feed">
          {groups.map((g) => (
            <section key={g.label} className="mb-feed-group" aria-labelledby={`g-${g.label}`}>
              <h2 id={`g-${g.label}`} className="mb-t-over mb-feed-h">{g.label} <span className="mb-feed-count">{g.items.length}</span></h2>
              <ul className="mb-list" aria-label={`${g.label}, captures`}>
                {g.items.map((c) => (
                  <li key={c.id}>
                    <CaptureCard capture={c} playing={player.isPlaying(c.id)} progress={player.progressOf(c.id)} onPlay={() => player.toggle(c.id)} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Page>
  );
}
