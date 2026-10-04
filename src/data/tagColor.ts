/**
 * Every tag has one colour, the same everywhere it appears — the card, the
 * note, the sidebar.
 *
 *   1. a colour YOU chose (the tag picker) — kept in the store
 *   2. the colour the design gave the demo's tags
 *   3. otherwise a stable pick from the name, so a new tag never changes
 *      colour between visits
 */
export type TagColor = 'gray' | 'blue' | 'green' | 'purple' | 'orange' | 'yellow' | 'pink';

/** In picker order. */
export const TAG_COLORS: { id: TagColor; label: string }[] = [
  { id: 'gray', label: 'Gray' }, { id: 'blue', label: 'Blue' }, { id: 'green', label: 'Green' },
  { id: 'yellow', label: 'Yellow' }, { id: 'orange', label: 'Orange' }, { id: 'pink', label: 'Pink' },
  { id: 'purple', label: 'Purple' },
];

const KNOWN: Record<string, TagColor> = {
  product: 'blue', ideas: 'yellow', sprint: 'purple', design: 'pink', team: 'green', client: 'orange', meetings: 'gray',
};
const CYCLE: TagColor[] = ['blue', 'green', 'purple', 'orange', 'yellow', 'pink', 'gray'];

/* The user's choices, mirrored from the store (StoreProvider keeps this in
   sync before it renders), so the many places that colour a tag don't each
   need the store passed down to them. Keyed lower-case. */
let chosen: Record<string, TagColor> = {};
export function setChosenTagColors(map: Record<string, TagColor>) { chosen = map; }

export function defaultTagColor(name: string): TagColor {
  const k = name.trim().toLowerCase();
  if (KNOWN[k]) return KNOWN[k];
  let h = 0;
  for (const ch of k) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return CYCLE[h % CYCLE.length];
}

export function tagColor(name: string): TagColor {
  return chosen[name.trim().toLowerCase()] ?? defaultTagColor(name);
}
