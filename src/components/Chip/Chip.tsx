import type { ReactNode } from 'react';
import './Chip.css';

/**
 * Chips — identical in shape, different in meaning. The ELEMENT carries the
 * meaning, so the type system enforces it:
 *
 *   ChipMeta    STATES A FACT. Not interactive. A <span>.  (duration, date, "5 tasks")
 *   ChipTag     NAMES A CATEGORY. A link when it goes somewhere, a span when not.
 *   ChipAction  ACCEPTS A VALUE. A <button>.               (assign, add tag)
 *   ChipFilter  NARROWS A LIST. A toggle button with aria-pressed.
 *
 * `meta` and `action` were one component in the Figma file until Aug 23,
 * which meant a read-only fact rendered with a hover state and invited a
 * click that did nothing.
 */

interface Common { children: ReactNode; className?: string }

export type MetaTone = 'default' | 'accent' | 'low-confidence' | 'count';

export function ChipMeta({ children, tone = 'default', className = '', title }: Common & { tone?: MetaTone; title?: string }) {
  return <span className={`mb-chip is-meta is-${tone} ${className}`.trim()} title={title}>{children}</span>;
}

export function ChipTag({ children, href, className = '' }: Common & { href?: string }) {
  const cls = `mb-chip is-tag ${className}`.trim();
  return href ? <a className={`${cls} is-link`} href={href}>{children}</a> : <span className={cls}>{children}</span>;
}

export function ChipAction(
  { children, onClick, className = '', empty, label }: Common & { onClick: () => void; empty?: boolean; label?: string },
) {
  return (
    <button
      type="button" aria-label={label}
      className={`mb-chip is-action${empty ? ' is-empty' : ''} ${className}`.trim()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function ChipFilter(
  { children, pressed, onClick, className = '' }: Common & { pressed: boolean; onClick: () => void },
) {
  return (
    <button
      type="button" aria-pressed={pressed}
      className={`mb-chip is-filter ${className}`.trim()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
