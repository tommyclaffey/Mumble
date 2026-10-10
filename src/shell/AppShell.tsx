import { showWelcome } from '../components/Welcome/welcomeState';
import { BRAND } from '../brand';
import { useEffect, type ReactNode } from 'react';
import { Icon, type IconName } from '../components/Icon/Icon';
import { formatDuration, openTasks, isMeeting } from '../data/model';
import { go, href, sectionOf, type Route } from '../data/route';
import { useStore } from '../data/store';
import { tagColor } from '../data/tagColor';
import { useRecordingStatus } from '../record/recordingStatus';
import { Avatar } from '../components/Avatar/Avatar';
import { isTeam, workspace } from '../data/workspace';
import '../components/Button/Button.css';
import './AppShell.css';

/**
 * The frame every screen sits in (Figma page 07): a white header — logo,
 * search, Start Mumble — and the navy sidebar. Every screen keeps the
 * sidebar now, the note included: opening something never throws you out of
 * the app.
 *
 * Desktop: header + sidebar. Tablet: the sidebar is an icon rail. Phone: a
 * bottom tab bar with the record button raised in the middle.
 *
 * Nav items are LINKS (<a href="#/tasks">), not buttons with click handlers:
 * they go somewhere, so middle-click, copy-link and the back button all work.
 */

type Section = 'recent' | 'tasks' | 'tags' | 'meetings' | 'team' | 'settings';
const NAV: { id: Section; label: string; icon: IconName; route: Route }[] = [
  { id: 'recent', label: 'Recent', icon: 'clock', route: { name: 'recent', filter: 'all' } },
  { id: 'tasks', label: 'Tasks', icon: 'list', route: { name: 'tasks' } },
  { id: 'meetings', label: 'Meetings', icon: 'users', route: { name: 'meetings' } },
  { id: 'tags', label: 'Tags', icon: 'hash', route: { name: 'tags' } },
];
/* Team demo only: the people in the workspace. */
const TEAM = { id: 'team' as const, label: 'Team', icon: 'user' as IconName, route: { name: 'team' } as Route };
const SETTINGS = { id: 'settings' as const, label: 'Settings', icon: 'gear' as IconName, route: { name: 'settings' } as Route };

/**
 * Search: jump to the search box on this screen, or — on a screen without
 * one — to Recent's, which searches every capture. ⌘K does the same.
 */
function focusSearch() {
  const here = document.querySelector<HTMLInputElement>('[data-search]');
  if (here) { here.focus(); return; }
  if (!location.hash.startsWith('#/recent')) go({ name: 'recent', filter: 'all' });
  /* Recent's field only exists once asked for. */
  setTimeout(() => window.dispatchEvent(new Event('mumble:search')), 30);
}

export function AppShell({ route, children }: { route: Route; children: ReactNode }) {
  const demo = typeof window === 'undefined' || !('mumbleDesktop' in window);
  const current = sectionOf(route);
  const { captures } = useStore();
  const rec = useRecordingStatus();
  const onRecord = route.name === 'record';

  /* ⌘K / Ctrl+K — the shortcut the search field advertises. */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); focusSearch(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const counts: Record<Section, number | undefined> = {
    recent: undefined,
    tasks: captures.reduce((n, c) => n + openTasks(c), 0),
    meetings: captures.filter(isMeeting).length,
    tags: new Set(captures.flatMap((c) => c.tags)).size,
    team: workspace().members.length,
    settings: undefined,
  };
  /* The four tags you use most — a shortcut list that keeps itself current
     (the design calls it "Pinned"; there's no pinning in the demo, so it says
     what it is). */
  const usage = new Map<string, number>();
  for (const c of captures) for (const t of c.tags) usage.set(t, (usage.get(t) ?? 0) + 1);
  const ws = workspace();
  const team = isTeam();
  const nav = team ? [...NAV, TEAM] : NAV;
  const topTags = [...usage.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 4);

  return (
    /* is-note: on a phone the note's own bar (‹ Recent · share · export)
       takes the top, as in Figma M04 — not the logo bar plus another row. */
    <div className={`mb-shell${route.name === 'capture' ? ' is-note' : ''}`}>
      <a className="mb-skip" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>
        Skip to content
      </a>

      <header className="mb-header">
        <div className="mb-header-brand">
          {/* The logo artwork, exported from the Figma file as-is (92 × 36). */}
          <a className="mb-wordmark" href={href({ name: 'recent', filter: 'all' })}>
            <img src={`${import.meta.env.BASE_URL}mumble-logo.png`} alt={BRAND.logoAlt} width={92} height={36} />
          </a>
          {/* The demo account says so beside the logo, as Queue's does. */}
          {/* Both demos (not the Mac app, which is your own): the tag brings
              back the welcome card, and the tour from there. */}
          {demo && (
            <button type="button" className="mb-demo-btn" onClick={showWelcome}
              title={team ? 'A made-up team. Everyone and everything here is fictional.' : 'This is a demo. Click for the welcome card and the tour.'}
              aria-label="Demo: show the welcome card and tour">
              <span className="mb-demo-tag">Demo</span>
            </button>
          )}
        </div>
        <div className="mb-header-search">
          {/* Looks like a field, is a button: it takes you to the search box
              for the screen you're on. The hint is decoration; its name is "Search". */}
          <button type="button" className="mb-searchbar" onClick={focusSearch} aria-keyshortcuts="Meta+K Control+K">
            <Icon name="search" size={16} />
            <span className="mb-searchbar-text">Search<span className="mb-searchbar-hint" aria-hidden="true"> recordings, people, tasks</span></span>
            <kbd className="mb-kbd" aria-hidden="true">⌘K</kbd>
          </button>
        </div>
        <div className="mb-header-actions">
          {onRecord && rec.state !== 'idle' ? (
            <span className="mb-header-live" role="status">
              <span className={`mb-dot${rec.state === 'recording' ? ' is-live' : ''}`} aria-hidden="true" />
              {rec.state === 'recording' ? 'Recording' : 'Paused'} · <span className="mb-tabular">{formatDuration(rec.elapsed)}</span>
            </span>
          ) : !onRecord && (
            <a className="mb-header-record" href={href({ name: 'record' })}>
              <Icon name="mic" size={16} /> {BRAND.startLabel}
            </a>
          )}
          {team && ws.me && (
            <a className="mb-header-me" href={href({ name: 'team' })} aria-label={`${ws.me.name}, ${ws.name} — see the team`}>
              <Avatar name="You" size="lg" />
            </a>
          )}
        </div>
      </header>

      <nav className="mb-sidebar" aria-label="Main">
        <ul className="mb-nav">
          {nav.map((n) => <NavItem key={n.id} n={n} active={current === n.id} count={counts[n.id]} />)}
        </ul>
        {topTags.length > 0 && (
          <div className="mb-nav-section">
            <p className="mb-t-over mb-nav-section-h" id="top-tags-h">Top tags</p>
            <ul className="mb-nav" aria-labelledby="top-tags-h">
              {topTags.map(([t, n]) => (
                <li key={t}>
                  <a className="mb-nav-item is-tag" href={href({ name: 'tags', tag: t })}
                    aria-current={route.name === 'tags' && route.tag === t ? 'page' : undefined}>
                    <span className={`mb-nav-dot is-${tagColor(t)}`} aria-hidden="true" />
                    <span className="mb-nav-label">{t}</span>
                    <span className="mb-nav-count" aria-label={`${n} ${n === 1 ? 'recording' : 'recordings'}`}>{n}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mb-nav-foot">
          {/* Who's signed in, and where — the team demo only. The personal
              demo has no account, so it doesn't pretend to. */}
          {team && ws.me && (
            <a className="mb-nav-account" href={href({ name: 'team' })} title={`${ws.me.name} · ${ws.name}`}>
              <Avatar name="You" size="lg" />
              <span className="mb-nav-account-text">
                <span className="mb-nav-account-name">{ws.me.name}</span>
                <span className="mb-nav-account-ws">{ws.name}</span>
              </span>
            </a>
          )}
          <ul className="mb-nav"><NavItem n={SETTINGS} active={current === 'settings'} /></ul>
          <p className="mb-nav-privacy"><Icon name="lock" size={14} /> <span>Stays in this browser</span></p>
        </div>
      </nav>

      <main id="main" className="mb-main" tabIndex={-1}>{children}</main>

      <nav className="mb-tabbar" aria-label="Main tabs">
        {[NAV[0], NAV[1], NAV[2], SETTINGS].map((n, i) => (
          <TabLink key={n.id} n={n} active={current === n.id} before={i === 2} recording={onRecord && rec.state !== 'idle'} />
        ))}
      </nav>
    </div>
  );
}

function NavItem({ n, active, count }: { n: { id: string; label: string; icon: IconName; route: Route }; active: boolean; count?: number }) {
  return (
    <li>
      <a className="mb-nav-item" href={href(n.route)} aria-current={active ? 'page' : undefined} title={n.label}>
        <Icon name={n.icon} size={18} />
        <span className="mb-nav-label">{n.label}</span>
        {count !== undefined && <span className="mb-nav-count">{count}</span>}
      </a>
    </li>
  );
}

function TabLink({ n, active, before, recording }: { n: { id: string; label: string; icon: IconName; route: Route }; active: boolean; before: boolean; recording: boolean }) {
  return (
    <>
      {/* The raised record disc. While a recording runs it becomes a stop
          square and says "Recording" — the tab bar itself tells you, from
          anywhere in the app (Figma page 08, Tab bar · Active=Recording). */}
      {before && (
        <a className={`mb-tab mb-tab-record${recording ? ' is-recording' : ''}`} href={href({ name: 'record' })}
          aria-label={recording ? 'Recording in progress' : BRAND.startLabel} aria-current={recording ? 'page' : undefined}>
          <span className="mb-tab-record-disc"><Icon name={recording ? 'stop' : 'mic'} size={24} /></span>
          <span aria-hidden="true">{recording ? 'Recording' : BRAND.name}</span>
        </a>
      )}
      <a className="mb-tab" href={href(n.route)} aria-current={active ? 'page' : undefined}>
        <Icon name={n.icon} size={20} />
        <span>{n.label}</span>
      </a>
    </>
  );
}
