import { useSyncExternalStore } from 'react';
import { setRecordingStatus } from '../record/recordingStatus';

/**
 * What the Mac app's recorder is doing, as it tells the page
 * (MainWindow.swift → 'mumble:desktop-state'). The header's live timer
 * follows it on every screen, as it follows a browser recording.
 */
export interface MacState {
  phase: 'idle' | 'meeting' | 'recording' | 'paused' | 'saving' | 'problem';
  /** Recording: when it would have started had it never paused, ms since
      1970, so the time is always now − since. */
  since?: number;
  /** Paused: seconds recorded so far. */
  elapsed?: number;
  /** The meeting app it spotted ("Zoom"), if any. */
  app?: string | null;
  /** What's wrong, for 'problem'. */
  message?: string;
}

const w = window as unknown as { __mumbleMacState?: MacState };
let current: MacState = w.__mumbleMacState ?? { phase: 'idle' };
const listeners = new Set<() => void>();
let ticker: ReturnType<typeof setInterval> | undefined;

function syncHeader() {
  clearInterval(ticker);
  if (current.phase === 'recording' && current.since) {
    const tick = () => setRecordingStatus({ state: 'recording', elapsed: (Date.now() - current.since!) / 1000 });
    tick();
    ticker = setInterval(tick, 1000);
  } else if (current.phase === 'paused') {
    setRecordingStatus({ state: 'paused', elapsed: current.elapsed ?? 0 });
  } else {
    setRecordingStatus({ state: 'idle', elapsed: 0 });
  }
}

let started = false;
/** Listen for the app's state. Once, and only inside the Mac app. */
export function followMacState() {
  if (started) return;
  started = true;
  window.addEventListener('mumble:desktop-state', (e) => {
    current = (e as CustomEvent<MacState>).detail ?? { phase: 'idle' };
    syncHeader();
    listeners.forEach((l) => l());
  });
  syncHeader();
}

export function useMacState(): MacState {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => current);
}
