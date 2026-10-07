import { useEffect, useState } from 'react';

/**
 * Hash routes.
 *
 * Hash, not history, because the demo is served from GitHub Pages, which has
 * no server to answer /Mumble/capture/c2 with index.html. And the route lives
 * in the URL at all so a reload keeps you where you were — Growth shipped with
 * "reload sends you back to Overview" and it was one of the first bugs found.
 */

export type Route =
  | { name: 'recent'; filter: RecentFilter }
  | { name: 'capture'; id: string; line?: number }
  | { name: 'record' }
  | { name: 'tasks' }
  | { name: 'tags'; tag?: string }
  | { name: 'meetings'; id?: string }
  | { name: 'team' }
  | { name: 'settings' };

export type RecentFilter = 'all' | 'notes' | 'meetings' | 'tasks';
const FILTERS: RecentFilter[] = ['all', 'notes', 'meetings', 'tasks'];

export function parseRoute(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?');
  /* A malformed escape ("#/tags/50%") throws in decodeURIComponent — and a
     throw here blanks the whole app. Fall back to the raw text. */
  const parts = path.split('/').filter(Boolean).map((p) => { try { return decodeURIComponent(p); } catch { return p; } });
  switch (parts[0]) {
    case 'capture': {
      if (!parts[1]) return { name: 'recent', filter: 'all' };
      const line = Number(new URLSearchParams(query).get('line'));
      return Number.isInteger(line) && line > 0 ? { name: 'capture', id: parts[1], line } : { name: 'capture', id: parts[1] };
    }
    case 'record': return { name: 'record' };
    case 'tasks': return { name: 'tasks' };
    case 'tags': return { name: 'tags', tag: parts[1] };
    case 'meetings': return { name: 'meetings', id: parts[1] };
    case 'team': return { name: 'team' };
    case 'settings': return { name: 'settings' };
    default: {
      const f = new URLSearchParams(query).get('filter') as RecentFilter | null;
      return { name: 'recent', filter: f && FILTERS.includes(f) ? f : 'all' };
    }
  }
}

export function href(r: Route): string {
  switch (r.name) {
    case 'recent': return r.filter === 'all' ? '#/recent' : `#/recent?filter=${r.filter}`;
    /* `line` is 1-based, as people say it ("line 9"). */
    case 'capture': return `#/capture/${encodeURIComponent(r.id)}${r.line ? `?line=${r.line}` : ''}`;
    case 'tags': return r.tag ? `#/tags/${encodeURIComponent(r.tag)}` : '#/tags';
    case 'meetings': return r.id ? `#/meetings/${encodeURIComponent(r.id)}` : '#/meetings';
    default: return `#/${r.name}`;
  }
}

export function go(r: Route): void {
  window.location.hash = href(r);
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

/** Which sidebar item a route belongs to. A capture opened from Meetings is still a capture. */
export function sectionOf(r: Route): 'recent' | 'tasks' | 'tags' | 'meetings' | 'team' | 'settings' | 'record' {
  if (r.name === 'capture') return 'recent';
  return r.name;
}
