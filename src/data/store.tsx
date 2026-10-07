import {
  createContext, useCallback, useContext, useEffect, useMemo, useReducer, type ReactNode,
} from 'react';
import { withDemoAudio } from './demoAudio';
import { setChosenTagColors, type TagColor } from './tagColor';
import { workspace } from './workspace';
import { correctSpeaker, isMeeting, type Capture, type Speaker, type Task, type TaskStatus } from './model';

/**
 * App state — captures and preferences, saved to localStorage.
 *
 * One reducer, one place. Every change to a capture goes through here, so a
 * task ticked on the Tasks screen is ticked on the capture screen too — the
 * same object, not two copies that drift.
 */

export const SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;
export type Speed = (typeof SPEEDS)[number];
/** "1.0×", "1.25×", "2.0×" — as the design writes it. */
export const speedLabel = (s: Speed) => `${Number.isInteger(s) ? s.toFixed(1) : s}×`;

export interface Prefs {
  /** Playback speed for recordings. Remembered across captures. */
  speed: Speed;
  /** Space / ← → on a recording. On by default; off for anyone whose
      assistive tech or habits already use those keys. */
  shortcuts: boolean;
  /** Suggest tasks from phrasing ("we need to…") while recording. */
  taskHints: boolean;
}

export const DEFAULT_PREFS: Prefs = { speed: 1, shortcuts: true, taskHints: true };

export interface State {
  captures: Capture[];
  prefs: Prefs;
  /** Tag colours you picked, keyed by lower-case tag name. */
  tagColors: Record<string, TagColor>;
}

type Action =
  | { type: 'setTaskStatus'; captureId: string; taskId: string; status: TaskStatus }
  | { type: 'correctSpeaker'; captureId: string; speakerId: string; name: string }
  | { type: 'replaceCapture'; capture: Capture }
  | { type: 'updateCapture'; captureId: string; patch: { title?: string; tags?: string[] } }
  | { type: 'setListened'; captureId: string; seconds: number }
  | { type: 'addTask'; captureId: string; task: Task }
  /** Undo a speaker correction — speakers and attributions ONLY, so a task
      ticked while the Undo toast was up survives the undo. */
  | { type: 'restoreSpeakers'; captureId: string; speakers: Speaker[]; lineSpeakers: Record<string, string | undefined>; attendees?: string[] }
  | { type: 'addCapture'; capture: Capture }
  | { type: 'deleteCapture'; captureId: string }
  | { type: 'setPrefs'; prefs: Partial<Prefs> }
  | { type: 'setTagColor'; tag: string; color: TagColor }
  | { type: 'resetDemo' };

/* One key per workspace: the team demo never touches your recordings. */
const storageKey = () => workspace().storageKey;

export function initialState(now = new Date()): State {
  return { captures: workspace().captures(now).map(withDemoAudio), prefs: DEFAULT_PREFS, tagColors: {} };
}

export function reducer(state: State, action: Action): State {
  const mapCapture = (id: string, fn: (c: Capture) => Capture): State => ({
    ...state, captures: state.captures.map((c) => (c.id === id ? fn(c) : c)),
  });

  switch (action.type) {
    case 'setTaskStatus':
      return mapCapture(action.captureId, (c) => ({
        ...c, tasks: c.tasks.map((t) => (t.id === action.taskId ? { ...t, status: action.status } : t)),
      }));
    case 'correctSpeaker':
      return mapCapture(action.captureId, (c) =>
        isMeeting(c) ? correctSpeaker(c, action.speakerId, action.name).meeting : c);
    case 'restoreSpeakers':
      return mapCapture(action.captureId, (c) => (isMeeting(c) ? {
        ...c,
        speakers: action.speakers,
        attendees: action.attendees ?? c.attendees,
        lines: c.lines.map((l) => (l.id in action.lineSpeakers ? { ...l, speakerId: action.lineSpeakers[l.id] } : l)),
      } : c));
    case 'addTask':
      return mapCapture(action.captureId, (c) => ({ ...c, tasks: [action.task, ...c.tasks] }));
    case 'setListened':
      return mapCapture(action.captureId, (c) => ({ ...c, listenedTo: Math.round(action.seconds * 10) / 10 }));
    case 'updateCapture':
      return mapCapture(action.captureId, (c) => ({ ...c, ...action.patch }));
    case 'replaceCapture':
      return mapCapture(action.capture.id, () => action.capture);
    case 'addCapture':
      return { ...state, captures: [action.capture, ...state.captures] };
    case 'deleteCapture':
      return { ...state, captures: state.captures.filter((c) => c.id !== action.captureId) };
    case 'setPrefs':
      return { ...state, prefs: { ...state.prefs, ...action.prefs } };
    case 'setTagColor':
      return { ...state, tagColors: { ...state.tagColors, [action.tag.trim().toLowerCase()]: action.color } };
    case 'resetDemo':
      return { ...initialState(), prefs: state.prefs };
  }
}

function load(): State {
  try {
    const raw = localStorage.getItem(storageKey());
    if (raw) {
      const parsed = JSON.parse(raw) as State;
      /* Merge over defaults: a save from before a pref existed still loads. */
      /* Demo captures saved before they had recordings get them now —
         without touching any edits made to them. */
      if (Array.isArray(parsed.captures)) {
        return {
          captures: parsed.captures.map((c) => (c.source === 'demo' && (!c.audio || !c.peaks) ? withDemoAudio(c) : c)),
          /* Only known prefs survive — a save from the read-aloud days had
             engine/voice settings that no longer mean anything. */
          tagColors: parsed.tagColors && typeof parsed.tagColors === 'object' ? parsed.tagColors : {},
          prefs: {
            speed: SPEEDS.includes((parsed.prefs as Partial<Prefs> | undefined)?.speed as Speed) ? parsed.prefs.speed : DEFAULT_PREFS.speed,
            shortcuts: typeof parsed.prefs?.shortcuts === 'boolean' ? parsed.prefs.shortcuts : DEFAULT_PREFS.shortcuts,
            taskHints: typeof parsed.prefs?.taskHints === 'boolean' ? parsed.prefs.taskHints : DEFAULT_PREFS.taskHints,
          },
        };
      }
    }
  } catch {
    /* Corrupt or unavailable storage: start from the demo rather than crash.
       Losing a demo edit is recoverable; a blank screen is not. */
  }
  return initialState();
}

interface Store extends State {
  dispatch: (a: Action) => void;
  capture: (id: string) => Capture | undefined;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children, initial }: { children: ReactNode; initial?: State }) {
  const [state, dispatch] = useReducer(reducer, initial, (i) => (i ? { ...i, tagColors: i.tagColors ?? {} } : load()));
  /* Before anything below renders, so every tag is drawn in its chosen colour. */
  setChosenTagColors(state.tagColors);

  useEffect(() => {
    try { localStorage.setItem(storageKey(), JSON.stringify(state)); } catch { /* quota / private mode */ }
  }, [state]);

  const capture = useCallback((id: string) => state.captures.find((c) => c.id === id), [state.captures]);
  const value = useMemo(() => ({ ...state, dispatch, capture }), [state, capture]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore must be used inside <StoreProvider>');
  return s;
}
