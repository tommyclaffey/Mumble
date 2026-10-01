import { useSyncExternalStore } from 'react';
import type { NaturalStatus, NaturalVoice } from './NaturalVoice';

const NONE: NaturalStatus = { phase: 'idle', loadedBytes: 0, totalBytes: 0, waiting: false };
const noop = () => () => {};

/** Live download / readiness of the natural voice, for any screen that needs to show it. */
export function useNaturalStatus(natural: NaturalVoice | null): NaturalStatus {
  return useSyncExternalStore(natural?.subscribe ?? noop, natural?.status ?? (() => NONE));
}

export function mb(bytes: number): string {
  return `${Math.round(bytes / 1_000_000)} MB`;
}
