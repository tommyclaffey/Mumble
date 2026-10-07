import { useState } from 'react';
import { photoFor } from '../../data/workspace';
import './Avatar.css';

/**
 * Avatar — a person's photo, or their initials on a speaker colour.
 *
 * Photos come from the workspace (the team demo has them; the personal demo
 * doesn't), so every avatar in the app gets a face without any screen
 * knowing. A photo that fails to load falls back to the initials.
 *
 * An unconfirmed speaker ("Speaker 3") gets a dashed ring instead of a fill:
 * the model has not earned a face for them yet — so never a photo either.
 */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (/^speaker$/i.test(parts[0]) && parts[1]) return parts[1].slice(0, 2);
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function Avatar(
  { name, colorIndex = 0, unconfirmed, size = 'md' }:
  { name: string; colorIndex?: number; unconfirmed?: boolean; size?: 'sm' | 'md' | 'lg' | 'xl' },
) {
  const [failed, setFailed] = useState(false);
  const photo = unconfirmed || failed ? undefined : photoFor(name);
  return (
    <span
      className={`mb-avatar is-c${colorIndex % 5} is-${size}${unconfirmed ? ' is-unconfirmed' : ''}${photo ? ' has-photo' : ''}`}
      aria-hidden="true"
    >
      {/* Decorative: the name is always written beside it, or in the
          group's label (AvatarStack). */}
      {photo ? <img src={photo} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} /> : initials(name)}
    </span>
  );
}

/**
 * A person's colour: their speaker colour when they spoke, so the same person
 * is the same colour in the attendee row and beside their lines. Otherwise a
 * stable pick from their name.
 */
export function colorFor(name: string, speakers: { name: string; colorIndex: number }[] = []): number {
  const spoke = speakers.find((s) => s.name === name);
  if (spoke) return spoke.colorIndex;
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 5;
}

/**
 * Faces for a meeting, overlapped (Phase 3 backlog: "attendees with faces
 * everywhere"). Up to four, then "+N". One accessible name for the group — a
 * screen reader hears the list once, not initials four times.
 */
export function AvatarStack(
  { names, speakers = [], max = 4 }: { names: string[]; speakers?: { name: string; colorIndex: number }[]; max?: number },
) {
  const shown = names.slice(0, max);
  const more = names.length - shown.length;
  return (
    <span className="mb-avatar-stack" role="img" aria-label={`Attendees: ${names.join(', ')}`}>
      {shown.map((n) => <Avatar key={n} name={n} colorIndex={colorFor(n, speakers)} size="sm" />)}
      {more > 0 && <span className="mb-avatar is-sm is-more" aria-hidden="true">+{more}</span>}
    </span>
  );
}
