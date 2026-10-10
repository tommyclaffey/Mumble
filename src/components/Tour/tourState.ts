import { useSyncExternalStore } from 'react';
import type { Route } from '../../data/route';

/**
 * The demo's tour: eight stops on the real screens, each spotlighting one
 * thing and saying what it does (Tour.tsx draws it). The same idea as
 * Growth's tour; Mumble's spotlight is its own reading bar.
 *
 * It starts from the welcome card ("Take the tour"); the Demo tag beside the
 * logo brings the welcome card back. It leads with what only Mumble does:
 * listening while you read, telling voices apart, tasks that point to what
 * was said.
 *
 * Targets are CSS selectors, first VISIBLE match wins: the phone and desktop
 * versions of a screen are both in the page, and only one shows. A stop
 * whose target isn't on screen (the team link on a phone, a voice you've
 * already named) is skipped in the direction you were going — except the
 * last, which shows in the middle of the screen instead.
 */
export interface TourStep {
  id: string;
  route: Route;
  target: string;
  title: string;
  body: string;
  /** Shown centred when its target isn't there, instead of skipped. */
  always?: boolean;
}

/** What this visitor can actually see, worked out when the tour starts, so
    "Step N of M" counts only the stops they'll get. (Anything still missing
    when it's reached is skipped then, as a fallback.) */
export interface TourContext {
  team: boolean;
  /** Phone width: the sidebar (and its Team link) isn't there. */
  phone: boolean;
  /** The browser can dictate, so the 🎤 buttons exist. */
  canDictate: boolean;
  /** Product Sync still has a voice to name. */
  voiceToName: boolean;
}

const RECENT: Route = { name: 'recent', filter: 'all' };
const SYNC: Route = { name: 'capture', id: 'c2' };

export function tourSteps(ctx: TourContext): TourStep[] {
  const team = ctx.team && !ctx.phone;
  const all: (TourStep | false)[] = [
    { id: 'card', route: RECENT, target: '.mb-card', title: 'Every recording, ready to play',
      body: 'Press play right here. The waveform is the real audio, and the part you’ve heard turns navy.' },
    team
      ? { id: 'team', route: RECENT, target: '.mb-nav-item[href="#/team"]', title: 'Your team',
          body: 'Who recorded what, who was in which meeting, and who owns which task.' }
      : { id: 'upnext', route: RECENT, target: 'section[aria-labelledby="upnext-h"], .mb-phone-card', title: 'Tasks from what people said',
          body: 'Every task found across your recordings, newest first. Tick one off right here.' },
    { id: 'player', route: SYNC, target: '.mb-player', title: 'Listen and read',
      body: 'The line being spoken lights up as it plays. Space plays or pauses, and the arrow keys move by line.' },
    ctx.voiceToName && { id: 'voice', route: SYNC, target: '.mb-speaker-who', title: 'Name a voice once',
      body: 'Mumble flags voices it isn’t sure of. Say who it is once, and every one of their lines updates, with an Undo.' },
    { id: 'task', route: SYNC, target: '.mb-line.is-task', title: 'Every task shows its source',
      body: 'A task always points back to the line it came from, so you can hear exactly what was said.' },
    /* The title's mic: always on screen (on Recent the 🎤 only appears once search is open). */
    ctx.canDictate && { id: 'mic', route: SYNC, target: '.mb-dictate', title: 'Anything you can type, you can say',
      body: 'Every text box has a mic, starting with this title. Search, tags and tasks too.' },
    { id: 'record', route: RECENT, target: '.mb-header-record, .mb-tab-record', title: 'Talk instead of type',
      body: 'Start a note or a meeting. It’s transcribed as you talk, and tasks are spotted while you speak.' },
    { id: 'demo', route: RECENT, target: '.mb-demo-btn', title: 'That’s the tour', always: true,
      body: 'Click Demo beside the logo anytime to see the welcome card or take the tour again. Everything here is yours to click.' },
  ];
  return all.filter((s): s is TourStep => !!s);
}

/* Which stop is showing; null = no tour. In memory only: a reload ends it. */
let step: number | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function startTour() { step = 0; emit(); }
export function endTour() { step = null; emit(); }
export function setTourStep(n: number) { step = n; emit(); }
export function useTourStep(): number | null {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => step);
}
