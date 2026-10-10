import { BRAND } from './brand';
import { useEffect, useRef } from 'react';
import { AppShell } from './shell/AppShell';
import { useRoute, type Route } from './data/route';
import { useStore } from './data/store';
import { CaptureScreen } from './screens/CaptureScreen';
import { MeetingsScreen } from './screens/MeetingsScreen';
import { RecentScreen } from './screens/RecentScreen';
import { RecordScreen } from './screens/RecordScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { TagsScreen } from './screens/TagsScreen';
import { TasksScreen } from './screens/TasksScreen';
import { TeamScreen } from './screens/TeamScreen';
import { DesktopImporter } from './desktop/DesktopImporter';
import { desktop } from './desktop/desktop';
import { MacRecordScreen } from './desktop/MacRecordScreen';
import { WelcomeTour } from './components/Welcome/Welcome';

/** Which PAGE this is. A filter change on Recent is the same page. */
function pageKey(r: Route): string {
  if (r.name === 'capture') return `capture/${r.id}`;
  /* Choosing an item in a list + detail screen is NOT a new page — the list
     stays, focus stays on what you clicked. */
  if (r.name === 'tags' || r.name === 'meetings') return r.name;
  return r.name;
}

export default function App() {
  const route = useRoute();
  const { capture } = useStore();
  const key = pageKey(route);

  /* The tab title says where you are — the one thing a screen-reader user
     and anyone with twelve tabs open both rely on. */
  const title =
    route.name === 'capture' ? capture(route.id)?.title ?? 'Not found'
    : route.name === 'tags' ? (route.tag ? `# ${route.tag}` : 'Tags')
    : { recent: 'Recent', record: BRAND.newTitle, tasks: 'Tasks', meetings: 'Meetings', team: 'Team', settings: 'Settings' }[route.name];
  useEffect(() => { document.title = `${title} — ${BRAND.name}`; }, [title]);

  /* A new page: start at the top, and move focus to its heading so a screen
     reader announces it. Hash navigation does neither on its own — a capture
     opened from the bottom of Recent used to open scrolled halfway down, and
     focus was left on a link that no longer existed. Not on first load. */
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    window.scrollTo?.(0, 0);
    const h1 = document.querySelector<HTMLElement>('#main h1');
    if (h1) {
      if (!h1.hasAttribute('tabindex')) h1.setAttribute('tabindex', '-1');
      h1.focus({ preventScroll: true });
    }
  }, [key]);

  return (
    <AppShell route={route}>
      <DesktopImporter />
      <WelcomeTour />
      {route.name === 'recent' && <RecentScreen filter={route.filter} />}
      {route.name === 'capture' && <CaptureScreen id={route.id} line={route.line} />}
      {route.name === 'record' && (desktop() ? <MacRecordScreen /> : <RecordScreen />)}
      {route.name === 'tasks' && <TasksScreen />}
      {route.name === 'tags' && <TagsScreen tag={route.tag} />}
      {route.name === 'meetings' && <MeetingsScreen />}
      {route.name === 'team' && <TeamScreen />}
      {route.name === 'settings' && <SettingsScreen />}
    </AppShell>
  );
}
