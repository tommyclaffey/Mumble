import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { BRAND } from '../../brand';
import { href } from '../../data/route';
import { workspace } from '../../data/workspace';
import { Button } from '../Button/Button';
import { Icon } from '../Icon/Icon';
import { onShowWelcome, welcomeEnabled } from './welcomeState';
import { startTour } from '../Tour/tourState';
import './Welcome.css';

/**
 * The demo's welcome card — what Mumble is, who you are in it, and four
 * things to try, each one a link straight to where it happens. The same
 * idea as Queue's, in Mumble's own look.
 *
 * Once per browser (per workspace: the team demo has its own). Reopened
 * from Settings → "Show the welcome tour". Not inside the Mac app: that's
 * your own Mumble, not a demo.
 */
const KEY = 'mumble.welcome.v1';
const seenKey = () => `${KEY}.${workspace().id}`;

function hasSeen(): boolean {
  try { return localStorage.getItem(seenKey()) === '1'; } catch { return true; }
}
const inMacApp = () => typeof window !== 'undefined' && 'mumbleDesktop' in window;

interface Step { title: string; hint: string; to: string }

function steps(): Step[] {
  const team = workspace().id === 'team';
  return [
    { title: 'Listen to a meeting', hint: 'Press play on Product Sync. The line being spoken lights up as it goes, and the waveform is the real audio.', to: href({ name: 'capture', id: 'c2' }) },
    { title: 'Name a voice', hint: 'Speaker 3 isn’t confirmed. Answer “Who is this?” once and every line of theirs updates.', to: href({ name: 'capture', id: 'c2', line: 9 }) },
    { title: 'Record something', hint: 'Say “We need to send the proposal by Friday” and watch it turn into a task.', to: href({ name: 'record' }) },
    team
      ? { title: 'Meet the team', hint: 'Who recorded what, who was in which meeting, and who owns which task.', to: href({ name: 'team' }) }
      : { title: 'See every task', hint: 'Pulled from what people said, each one linked to the line it came from.', to: href({ name: 'tasks' }) },
  ];
}

export function WelcomeTour() {
  const [open, setOpen] = useState(() => welcomeEnabled() && !inMacApp() && !hasSeen());
  const card = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  useEffect(() => onShowWelcome(() => setOpen(true)), []);

  useEffect(() => {
    if (!open) return;
    try { localStorage.setItem(seenKey(), '1'); } catch { /* private mode: it shows again next time */ }
    returnTo.current = document.activeElement as HTMLElement | null;
    /* The page behind can't be reached while the card is up. */
    const root = document.getElementById('root');
    root?.setAttribute('inert', '');
    root?.setAttribute('aria-hidden', 'true');
    card.current?.focus({ preventScroll: true });
    return () => {
      root?.removeAttribute('inert');
      root?.removeAttribute('aria-hidden');
      returnTo.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  const close = () => setOpen(false);
  const ws = workspace();

  /* Esc closes; Tab goes round the card, never out of it. */
  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab' || !card.current) return;
    const items = [...card.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')];
    if (items.length === 0) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === card.current)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  return createPortal(
    <div className="mb-welcome-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div
        ref={card} className="mb-welcome" role="dialog" aria-modal="true"
        aria-labelledby="welcome-h" aria-describedby="welcome-lede" tabIndex={-1} onKeyDown={onKey}
      >
        <span className="mb-demo-tag mb-welcome-tag">Live demo</span>
        <h2 id="welcome-h" className="mb-welcome-title">Welcome to {BRAND.name}</h2>
        <p id="welcome-lede" className="mb-welcome-lede">
          Notes you speak instead of type. {BRAND.name} transcribes as you talk, tells the voices in a meeting apart,
          and pulls out the tasks, so you can listen back instead of reading.
        </p>
        <p className="mb-t-body-sm mb-muted">
          {ws.me
            ? `You’re ${ws.me.name}, ${ws.me.role} at ${ws.name}. Everyone here is made up, and nothing you record leaves this browser.`
            : 'These recordings are a demo: everyone in them is made up. Anything you record stays in this browser.'}
        </p>
        <p className="mb-t-over mb-welcome-over">Try these</p>
        <ol className="mb-welcome-steps">
          {steps().map((s, i) => (
            <li key={s.title}>
              <a className="mb-welcome-step" href={s.to} onClick={close}>
                <span className="mb-welcome-n" aria-hidden="true">{i + 1}</span>
                <span className="mb-welcome-text">
                  <span className="mb-t-label mb-welcome-step-title">{s.title}</span>
                  <span className="mb-t-body-sm mb-muted">{s.hint}</span>
                </span>
                <Icon name="chevron-right" size={18} />
              </a>
            </li>
          ))}
        </ol>
        <div className="mb-welcome-foot">
          <p className="mb-t-body-sm mb-muted">
            Designed and engineered by <a className="mb-welcome-link" href="https://www.tommyclaffey.com" target="_blank" rel="noopener">Tommy Claffey</a>
          </p>
          <div className="mb-welcome-actions">
            <Button onClick={close}>Start exploring</Button>
            <Button variant="primary" onClick={() => { close(); startTour(); }}>Take the tour</Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
