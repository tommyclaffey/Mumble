/**
 * When the welcome card shows (Welcome.tsx).
 *
 * Only main.tsx turns it on, so the test suite renders the app without a
 * card over every screen. Tests that want it call enableWelcome().
 */
let enabled = false;
export function enableWelcome(on = true) { enabled = on; }
export const welcomeEnabled = () => enabled;

const openers = new Set<() => void>();
/** Open the card from anywhere (Settings → "Show the welcome tour"). */
export function showWelcome() { openers.forEach((o) => o()); }
export function onShowWelcome(o: () => void): () => void {
  openers.add(o);
  return () => { openers.delete(o); };
}
