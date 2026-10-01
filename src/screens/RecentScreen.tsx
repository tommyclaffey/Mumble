import { useEffect, useMemo, useRef, useState } from 'react';
import { CaptureCard } from '../components/CaptureCard/CaptureCard';
import { ChipFilter, ChipMeta } from '../components/Chip/Chip';
import { Icon } from '../components/Icon/Icon';
import { go, href, type RecentFilter } from '../data/route';
import { matches } from '../data/filters';
import { useStore } from '../data/store';
import { useListPlayer } from '../playback/useListPlayer';
import './screens.css';

/**
 * Recent — every capture, newest first.
 *
 * The filter lives in the URL (#/recent?filter=meetings), so it survives a
 * reload and the back button undoes it.
 */

/* The design's four: All · Tasks · Meetings · Ideas. "Ideas" are the solo
   mumbles (notes); "Tasks" are captures with open tasks. */
const FILTERS: { id: RecentFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'meetings', label: 'Meetings' },
  { id: 'notes', label: 'Ideas' },
];

export function RecentScreen({ filter }: { filter: RecentFilter }) {
  const { captures } = useStore();
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  /* The header's Search asks this page to open its field. */
  useEffect(() => {
    const open = () => { setSearching(true); requestAnimationFrame(() => searchRef.current?.focus()); };
    window.addEventListener('mumble:search', open);
    return () => window.removeEventListener('mumble:search', open);
  }, []);
  const sorted = useMemo(
    () => [...captures].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [captures],
  );
  const shown = sorted.filter((c) => matches(c, filter, query));
  const player = useListPlayer(shown);

  return (
    <div className="mb-page">
      <div className="mb-page-head">
        <div className="mb-page-title-row">
          <h1 className="mb-display-page mb-page-title">Recent Mumbles</h1>
          <ChipMeta tone="count">{shown.length}</ChipMeta>
        </div>
        {/* Not in the design's Home Feed — it appears when the header's
            Search is pressed (or while there's a search), so the page stays
            as calm as the frame the rest of the time. */}
        {(searching || query) && (
          <label className="mb-search">
            <Icon name="search" size={16} />
            <span className="mb-sr-only">Search captures</span>
            <input
              data-search ref={searchRef} type="search" placeholder="Search titles, tags and transcripts"
              value={query} onChange={(e) => setQuery(e.target.value)}
              onBlur={() => { if (!query) setSearching(false); }}
            />
          </label>
        )}
      </div>

      <div className="mb-toolbar" role="group" aria-label="Filter captures">
        {FILTERS.map((f) => (
          <ChipFilter key={f.id} pressed={filter === f.id} onClick={() => go({ name: 'recent', filter: f.id })}>
            {f.label}
          </ChipFilter>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="mb-empty">
          {captures.length === 0 ? (
            <>
              <p>No captures yet. Say something.</p>
              <a className="mb-button is-accent is-md" href={href({ name: 'record' })}><Icon name="mic" size={16} /> Start Mumble</a>
            </>
          ) : (
            <p>Nothing matches{query ? ` “${query}”` : ''} in this filter.</p>
          )}
        </div>
      ) : (
        <ul className="mb-list" aria-label="Captures">
          {shown.map((c) => (
            <li key={c.id}>
              <CaptureCard
                capture={c} playing={player.isPlaying(c.id)} progress={player.progressOf(c.id)} onPlay={() => player.toggle(c.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
