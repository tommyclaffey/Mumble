/**
 * Every tag has one colour, the same everywhere it appears — the card, the
 * note, the sidebar. The demo's tags have the colours the design gave them;
 * any new tag gets a stable pick from its name, so it never changes colour
 * between visits.
 */
export type TagColor = 'gray' | 'blue' | 'green' | 'purple' | 'orange' | 'yellow' | 'pink';

const KNOWN: Record<string, TagColor> = {
  product: 'blue', ideas: 'yellow', sprint: 'purple', design: 'pink', team: 'green', client: 'orange', meetings: 'gray',
};
const CYCLE: TagColor[] = ['blue', 'green', 'purple', 'orange', 'yellow', 'pink', 'gray'];

export function tagColor(name: string): TagColor {
  const k = name.trim().toLowerCase();
  if (KNOWN[k]) return KNOWN[k];
  let h = 0;
  for (const ch of k) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return CYCLE[h % CYCLE.length];
}
