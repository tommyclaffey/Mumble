import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { go, href } from '../../data/route';
import { isLowConfidence, isMeeting, speakerFor } from '../../data/model';
import { useStore } from '../../data/store';
import { useServices } from '../../services';
import { isTeam } from '../../data/workspace';
import { Button } from '../Button/Button';
import { endTour, setTourStep, tourSteps, useTourStep, type TourStep } from './tourState';
import './Tour.css';

/**
 * The tour on screen: everything dims except the thing being explained,
 * which gets Mumble's reading bar (the navy edge that follows the line being
 * spoken), and a small card says what it does.
 *
 * Moves between screens by itself. Keyboard: → next, ← back, Esc ends; Tab
 * stays in the card. The page behind can't be clicked or reached while it
 * runs. On a phone the card docks to the bottom — or to the top, when the
 * target itself lives at the bottom (the phone's docked player).
 */
interface Box { top: number; left: number; width: number; height: number }
const PAD = 8;
const CARD_W = 340;
const phone = () => window.matchMedia?.('(max-width: 600px)').matches ?? false;
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

function visible(selector: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(selector)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden') return el;
  }
  /* jsdom has no layout: everything measures 0 there, so take the first match. */
  const first = document.querySelector<HTMLElement>(selector);
  return first && first.getClientRects().length === 0 && navigator.userAgent.includes('jsdom') ? first : null;
}

export function Tour() {
  const step = useTourStep();
  const { capture } = useStore();
  const { recognizer } = useServices();
  const [steps, setSteps] = useState<TourStep[]>([]);
  const [box, setBox] = useState<Box | null>(null);
  const [shown, setShown] = useState<number | null>(null);
  const dir = useRef<1 | -1>(1);
  const target = useRef<HTMLElement | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const next = useRef<HTMLButtonElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  /* While it runs, the app behind is out of reach — as with the welcome card. */
  const running = step !== null;
  /* Which stops this visitor gets — decided once, when the tour starts. */
  if (running && steps.length === 0) {
    const sync = capture('c2');
    setSteps(tourSteps({
      team: isTeam(),
      phone: phone(),
      /* The same test the 🎤 buttons use to decide whether to show. */
      canDictate: recognizer().available && window.isSecureContext !== false,
      voiceToName: !!sync && isMeeting(sync) && sync.lines.some((l) => isLowConfidence(l, speakerFor(sync, l))),
    }));
  }
  if (!running && steps.length > 0) setSteps([]);
  useEffect(() => {
    if (!running) return;
    returnTo.current = document.activeElement as HTMLElement | null;
    const root = document.getElementById('root');
    root?.setAttribute('inert', ''); root?.setAttribute('aria-hidden', 'true');
    return () => {
      root?.removeAttribute('inert'); root?.removeAttribute('aria-hidden');
      returnTo.current?.focus?.({ preventScroll: true });
    };
  }, [running]);

  /* Go to the stop's screen, wait for its target, bring it into view. */
  useEffect(() => {
    if (step === null) { setShown(null); target.current = null; return; }
    if (steps.length === 0) return;
    const s = steps[step];
    if (!s) { endTour(); return; }
    const want = href(s.route);
    if (!location.hash.startsWith(want)) go(s.route);
    let tries = 0;
    let raf = 0;
    const find = () => {
      const el = visible(s.target);
      if (!el && tries++ < 40) { raf = requestAnimationFrame(find); return; }
      if (!el && !s.always) {
        const n = step + dir.current;
        if (n < 0 || n >= steps.length) endTour(); else setTourStep(n);
        return;
      }
      target.current = el;
      /* Centred, not to the top: the top is under the sticky header. */
      if (el) el.scrollIntoView?.({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' });
      setShown(step);
    };
    find();
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- steps is fixed for the whole tour; the index is what changes
  }, [step, steps.length]);

  /* Keep the spotlight on its target as the page scrolls or resizes. */
  useLayoutEffect(() => {
    if (shown === null) return;
    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = target.current?.getBoundingClientRect();
        setBox(r && r.width > 0 ? { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 } : null);
      });
    };
    measure();
    const late = window.setTimeout(measure, 450); // after a smooth scroll settles
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    next.current?.focus({ preventScroll: true });
    return () => {
      cancelAnimationFrame(raf); window.clearTimeout(late);
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [shown]);

  if (step === null || shown === null) return null;
  const s = steps[shown];
  if (!s) return null;
  const last = shown === steps.length - 1;
  const goTo = (n: number) => { dir.current = n > shown ? 1 : -1; setTourStep(n); };
  const forward = () => (last ? endTour() : goTo(shown + 1));
  const back = () => { if (shown > 0) goTo(shown - 1); };

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') { e.preventDefault(); endTour(); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); forward(); return; }
    if (e.key === 'ArrowLeft') { e.preventDefault(); back(); return; }
    if (e.key !== 'Tab' || !card.current) return;
    const items = [...card.current.querySelectorAll<HTMLElement>('button:not([disabled])')];
    const first = items[0], end = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); end.focus(); }
    else if (!e.shiftKey && document.activeElement === end) { e.preventDefault(); first.focus(); }
  }

  /* Below the target if it fits, else above; centred when there's no target. */
  const vw = window.innerWidth, vh = window.innerHeight;
  let pos: CSSProperties = {};
  if (!phone()) {
    if (box) {
      const left = Math.min(Math.max(16, box.left), vw - CARD_W - 16);
      const below = box.top + box.height + 12;
      pos = below + 220 < vh ? { top: below, left } : { top: Math.max(16, box.top - 12), left, transform: 'translateY(-100%)' };
    } else {
      pos = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
    }
  }

  return createPortal(
    <div className="mb-tour" onKeyDown={onKey}>
      {/* Catches clicks: the page behind is for looking at during the tour. */}
      <div className={`mb-tour-block${box ? '' : ' is-dim'}`} aria-hidden="true" />
      {box && <div className="mb-tour-spot" aria-hidden="true" style={{ top: box.top, left: box.left, width: box.width, height: box.height }} />}
      <div
        ref={card} className={`mb-tour-card${phone() ? (box && box.top + box.height > vh - 220 ? ' is-docked is-top' : ' is-docked') : ''}`} style={pos}
        role="dialog" aria-modal="true" aria-labelledby="tour-h" aria-describedby="tour-b"
      >
        <p className="mb-t-over mb-tour-count" aria-live="polite">Step {shown + 1} of {steps.length}</p>
        <h2 id="tour-h" className="mb-t-heading mb-tour-title">{s.title}</h2>
        <p id="tour-b" className="mb-t-body-sm mb-tour-body">{s.body}</p>
        <div className="mb-tour-foot">
          <span className="mb-tour-dots" aria-hidden="true">
            {steps.map((x, i) => <span key={x.id} className={i === shown ? 'is-on' : ''} />)}
          </span>
          <Button variant="ghost" size="sm" onClick={endTour}>End tour</Button>
          {shown > 0 && <Button size="sm" onClick={back}>Back</Button>}
          <button ref={next} type="button" className="mb-button is-primary is-sm" onClick={forward}>{last ? 'Finish' : 'Next'}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
