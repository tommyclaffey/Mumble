import { useEffect, useState, type ReactNode } from 'react';
import './Toast.css';

/**
 * Toast — reports a change the user cannot otherwise see, with a way back.
 *
 * Used for the speaker correction: "Sarah Lee · 4 lines updated". A bulk edit
 * that happens silently is a claim the user cannot check; the count makes it
 * checkable and Undo makes it safe.
 *
 * Accessibility, from the Sept 30 audit:
 *   · It renders INSIDE <ToastRegion>, a live region that is always on the
 *     page. A live region created in the same render as its message is often
 *     not announced at all.
 *   · The timer PAUSES while the pointer is over it or focus is in it — an
 *     Undo that disappears while you're reaching for it isn't an Undo (2.2.1).
 *   · With an Undo it stays 10 seconds, not 6.
 */
export function Toast(
  { message, onUndo, onDismiss, ms }:
  { message: string; onUndo?: () => void; onDismiss: () => void; ms?: number },
) {
  const [held, setHeld] = useState(false);
  const life = ms ?? (onUndo ? 10_000 : 6_000);

  useEffect(() => {
    if (held) return;
    const t = setTimeout(onDismiss, life);
    return () => clearTimeout(t);
  }, [message, life, onDismiss, held]);

  return (
    <div
      className="mb-toast"
      onMouseEnter={() => setHeld(true)} onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)} onBlur={() => setHeld(false)}
    >
      <span>{message}</span>
      {onUndo && <button type="button" className="mb-toast-action" onClick={() => { onUndo(); onDismiss(); }}>Undo</button>}
    </div>
  );
}

/** The always-present live region toasts appear in. */
export function ToastRegion({ children }: { children: ReactNode }) {
  return <div className="mb-toast-region" role="status" aria-live="polite">{children}</div>;
}
