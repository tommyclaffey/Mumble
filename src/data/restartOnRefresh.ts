/**
 * Nov 7, Tommy: "have all my demo restart after a refresh."
 *
 * Imported first in main.tsx, so it runs before anything reads storage: a
 * refresh on the public demo goes back to the 5 demo recordings, the welcome
 * card and the first screen. Only on the public demo's own addresses -- never
 * in the Mac app, where the notes are someone's real notes.
 */
const DEMO_HOSTS = ['tommyclaffey.github.io', 'web-production-b20ad.up.railway.app'];

const nav = performance.getEntriesByType?.('navigation')[0] as PerformanceNavigationTiming | undefined;
// Inside another page's frame (the portfolio's viewer) a refresh of that page reports "navigate", so every load there counts.
if ((nav?.type === 'reload' || window.self !== window.top) && DEMO_HOSTS.includes(location.hostname) && !('mumbleDesktop' in window)) {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('mumble')) localStorage.removeItem(k);
    indexedDB.deleteDatabase('mumble');
  } catch { /* private mode: nothing was saved anyway */ }
  history.replaceState(null, '', location.pathname + location.search);
}
