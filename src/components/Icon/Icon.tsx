/**
 * Icons — vectors, never text glyphs.
 *
 * Defect #38 in the Figma file: the play triangle, the close button and the
 * checkmarks were all TEXT CHARACTERS (▶ × ✓). Glyphs carry font side-bearings
 * that differ at every size, so they cannot be centred reliably — which is why
 * the play button looked off-centre at 20px and fine at 32px. Every icon here
 * is a path on a 24-unit grid.
 *
 * Sizes come from the icon scale (16/20/24/32), not the layout grid. They are
 * different axes — see tokens.css.
 */

export type IconName =
  | 'clock' | 'list' | 'hash' | 'users' | 'gear' | 'search' | 'mic' | 'play' | 'pause'
  | 'x' | 'check' | 'pencil' | 'prev' | 'next' | 'download' | 'copy' | 'arrow-left' | 'plus' | 'stop' | 'speaker'
  | 'sparkle' | 'lock' | 'chevron-down' | 'info' | 'help' | 'keyboard' | 'database' | 'arrow-right' | 'share'
  | 'quote' | 'user' | 'chart' | 'trash' | 'loader';

const PATHS: Record<IconName, string> = {
  clock: 'M12 7v5l3 2 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  list: 'M9 6h11 M9 12h11 M9 18h11 M4 6h.01 M4 12h.01 M4 18h.01',
  hash: 'M5 9h14 M4 15h14 M10 3 8 21 M16 3l-2 18',
  users: 'M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20 M10 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z M20 20v-1.5a3.5 3.5 0 0 0-2.5-3.35 M15.5 4.65a3.5 3.5 0 0 1 0 6.7',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z M20 20l-4-4',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z M19 11a7 7 0 0 1-14 0 M12 18v3 M8.5 21h7',
  /* Measured Sept 30: the old triangle sat ~2px right of centre in a 24px
     circle (its box was offset AND the button nudged it). This one puts the
     triangle's visual weight dead centre (±0.1px), with the small rightward
     lean a triangle needs to LOOK centred. No nudge needed. */
  play: 'M8.5 6.2v11.6a.9.9 0 0 0 1.38.76l9.1-5.8a.9.9 0 0 0 0-1.52l-9.1-5.8A.9.9 0 0 0 8.5 6.2Z',
  pause: 'M8 5v14 M16 5v14',
  x: 'M6 6l12 12 M18 6 6 18',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  pencil: 'M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z M13.5 6.5l4 4',
  prev: 'M6 5v14 M18 6 9 12l9 6V6Z',
  next: 'M18 5v14 M6 6l9 6-9 6V6Z',
  download: 'M12 4v11 M7 10l5 5 5-5 M5 20h14',
  copy: 'M9 9h10v11H9z M5 15H4V4h11v1',
  'arrow-left': 'M19 12H5 M11 6l-6 6 6 6',
  plus: 'M12 5v14 M5 12h14',
  stop: 'M7 7h10v10H7z',
  speaker: 'M4 10v4h4l5 4V6L8 10H4Z M16.5 9a4 4 0 0 1 0 6 M19 6.5a7.5 7.5 0 0 1 0 11',
  /* Added for the refined design (Oct 1) — the same 24-grid, round-capped
     line style as the rest. */
  sparkle: 'M12 3l1.9 5.4L19 10l-5.1 1.6L12 17l-1.9-5.4L5 10l5.1-1.6L12 3Z',
  lock: 'M6 11h12v9H6z M8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  'chevron-down': 'M6 9l6 6 6-6',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M12 16v-4 M12 8h.01',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3 M12 17h.01',
  keyboard: 'M3 6h18v12H3z M7 10h.01 M11 10h.01 M15 10h.01 M7 14h10',
  database: 'M12 8c4.4 0 8-1.3 8-3s-3.6-3-8-3-8 1.3-8 3 3.6 3 8 3Z M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5 M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  'arrow-right': 'M5 12h14 M13 6l6 6-6 6',
  share: 'M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7 M16 6l-4-4-4 4 M12 2v13',
  quote: 'M7 17c2 0 3-1.5 3-3.5V8H5v5h3 M17 17c2 0 3-1.5 3-3.5V8h-5v5h3',
  user: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  chart: 'M4 4v15a1 1 0 0 0 1 1h15 M9 16v-4 M13 16V8 M17 16v-6',
  trash: 'M4 7h16 M10 11v6 M14 11v6 M6 7l1 13h10l1-13 M9 7V4h6v3',
  loader: 'M21 12a9 9 0 1 1-6.2-8.6',
};

/** Shapes that read as solid marks rather than outlines. */
const FILLED: ReadonlySet<IconName> = new Set(['play', 'stop']);

export function Icon({ name, size = 20, label }: { name: IconName; size?: 12 | 14 | 16 | 18 | 20 | 24 | 28 | 32; label?: string }) {
  const filled = FILLED.has(name);
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor" strokeWidth={filled ? 0 : 1.75}
      strokeLinecap="round" strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      style={{ flexShrink: 0, display: 'block' }}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
