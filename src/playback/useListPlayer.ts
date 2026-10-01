import { useEffect, useState } from 'react';
import type { Capture } from '../data/model';
import { useStore } from '../data/store';
import { usePlayer } from './usePlayer';

/**
 * One player shared by every card in a list — two recordings must never play
 * over each other. Pressing the playing card pauses it; pressing another
 * switches to it from the start.
 */
export function useListPlayer(captures: Capture[]) {
  const { prefs } = useStore();
  const [activeId, setActiveId] = useState<string | undefined>();
  const active = captures.find((c) => c.id === activeId);
  const player = usePlayer(active, prefs.speed);

  /* The playing card was filtered out by a search: stop it. Otherwise it
     keeps playing with no visible way to pause. */
  const { pause } = player;
  useEffect(() => {
    if (activeId && !active) { pause(); setActiveId(undefined); }
  }, [activeId, active, pause]);

  /* A newly chosen card starts once it's the active one. */
  const { play } = player;
  const [pending, setPending] = useState<string | undefined>();
  useEffect(() => {
    if (pending && pending === activeId) { setPending(undefined); play(); }
  }, [pending, activeId, play]);

  function toggle(id: string) {
    if (id === activeId) { player.toggle(); return; }
    setActiveId(id);
    setPending(id);
  }

  return {
    toggle,
    isPlaying: (id: string) => id === activeId && player.playing,
    progressOf: (id: string) => (id === activeId && player.started
      ? { time: player.time, duration: player.duration, line: player.line }
      : undefined),
  };
}
