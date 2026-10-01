import { useSyncExternalStore } from 'react';

/**
 * Whether a recording is running, and for how long — so the HEADER can say
 * "● Recording · 0:42" while you're on the Record screen. The header and the
 * Record screen are in different parts of the tree; this is the one shared
 * value between them, and nothing else reads or writes it.
 */
export interface RecordingStatus { state: 'idle' | 'recording' | 'paused'; elapsed: number }

let current: RecordingStatus = { state: 'idle', elapsed: 0 };
const listeners = new Set<() => void>();

export function setRecordingStatus(next: RecordingStatus) {
  if (next.state === current.state && Math.floor(next.elapsed) === Math.floor(current.elapsed)) return;
  current = next;
  listeners.forEach((l) => l());
}

export function useRecordingStatus(): RecordingStatus {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => current,
  );
}
