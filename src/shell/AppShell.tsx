import type { ReactNode } from 'react';
import { Icon, type IconName } from '../components/Icon/Icon';
import { go, href, sectionOf, type Route } from '../data/route';
import '../components/Button/Button.css';
import './AppShell.css';

/**
 * The frame every screen sits in.
 *
 * Desktop: header + dark sidebar. Mobile (<768px): the sidebar becomes a
 * bottom tab bar with the record button raised in the middle — on a phone the
 * one action that matters is "start talking", so it gets the thumb position.
 *
 * Nav items are LINKS (<a href="#/tasks">), not buttons with click handlers:
 * they go somewhere, so middle-click, copy-link and the browser's back button
 * all work without a line of code.
 */

type Section = 'recent' | 'tasks' | 'tags' | 'meetings' | 'settings';
const NAV: { id: Section; label: string; icon: IconName; route: Route }[] = [
  { id: 'recent', label: 'Recent', icon: 'clock', route: { name: 'recent', filter: 'all' } },
  { id: 'tasks', label: 'Tasks', icon: 'list', route: { name: 'tasks' } },
  { id: 'tags', label: 'Tags', icon: 'hash', route: { name: 'tags' } },
  { id: 'meetings', label: 'Meetings', icon: 'users', route: { name: 'meetings' } },
  { id: 'settings', label: 'Settings', icon: 'gear', route: { name: 'settings' } },
];

/**
 * Header Search: jump to the search box on this screen, or — on a screen
 * without one — to Recent's, which searches every capture. A real action,
 * not a decoration.
 */
function focusSearch() {
  const here = document.querySelector<HTMLInputElement>('[data-search]');
  if (here) { here.focus(); return; }
  if (!location.hash.startsWith('#/recent')) go({ name: 'recent', filter: 'all' });
  /* Recent's field only exists once asked for. */
  setTimeout(() => window.dispatchEvent(new Event('mumble:search')), 30);
}

export function AppShell({ route, children }: { route: Route; children: ReactNode }) {
  const current = sectionOf(route);
  const recording = route.name === 'record';
  /* The capture review and recording are focused screens in the design —
     no sidebar, and no Start Mumble (you're already in a capture). */
  const focus = route.name === 'capture' || route.name === 'record';

  return (
    <div className={`mb-shell${focus ? ' is-focus' : ''}`}>
      <a className="mb-skip" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>
        Skip to content
      </a>

      <header className="mb-header">
        {/* The logo artwork, exported from the Figma file as-is (92 × 36). */}
        <a className="mb-wordmark" href={href({ name: 'recent', filter: 'all' })}>
          <img src={`${import.meta.env.BASE_URL}mumble-logo.png`} alt="Mumble — home" width={92} height={36} />
        </a>
        <div className="mb-header-actions">
          <button type="button" className="mb-header-btn" onClick={focusSearch}>
            <Icon name="search" size={16} /> Search
          </button>
          {!recording && !focus && (
            <a className="mb-header-record" href={href({ name: 'record' })}>
              <span className="mb-dot" aria-hidden="true" /> Start Mumble
            </a>
          )}
        </div>
      </header>

      <nav className="mb-sidebar" aria-label="Main">
        <ul>
          {NAV.map((n) => (
            <li key={n.id}>
              <a className="mb-nav-item" href={href(n.route)} aria-current={current === n.id ? 'page' : undefined} title={n.label}>
                {/* The accent bar is INSIDE the item (Figma decision #3) — it
                    cannot drift out of sync with the active row. */}
                <span className="mb-nav-bar" aria-hidden="true" />
                <Icon name={n.icon} size={16} />
                <span className="mb-nav-label">{n.label}</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <main id="main" className="mb-main" tabIndex={-1}>{children}</main>

      <nav className="mb-tabbar" aria-label="Main tabs">
        {NAV.filter((n) => n.id !== 'tags').map((n, i) => (
          <TabLink key={n.id} n={n} active={current === n.id} before={i === 2} />
        ))}
      </nav>
    </div>
  );
}

function TabLink({ n, active, before }: { n: (typeof NAV)[number]; active: boolean; before: boolean }) {
  return (
    <>
      {before && (
        <a className="mb-tab mb-tab-record" href={href({ name: 'record' })} aria-label="Start Mumble">
          <span className="mb-tab-record-disc"><Icon name="mic" size={24} /></span>
          <span aria-hidden="true">Mumble</span>
        </a>
      )}
      <a className="mb-tab" href={href(n.route)} aria-current={active ? 'page' : undefined}>
        <Icon name={n.icon} size={20} />
        <span>{n.label}</span>
      </a>
    </>
  );
}
