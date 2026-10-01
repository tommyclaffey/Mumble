import { useEffect, useRef, useState } from 'react';
import type { Capture } from '../data/model';
import { useStore } from '../data/store';
import { useEngines } from './EngineContext';
import { useReadAloud } from './useReadAloud';

/**
 * One read-aloud voice shared by every card in a list.
 *
 * Two cards must never talk over each other, so a list owns ONE player and
 * hands it to whichever card was pressed last. Pressing the playing card
 * pauses it; pressing another switches to it from its first line.
 */
export function useListPlayer(captures: Capture[]) {
  const { prefs } = useStore();
  const { speech } = useEngines();
  const [activeId, setActiveId] = useState<string | undefined>();
  const active = captures.find((c) => c.id === activeId);
  const ra = useReadAloud(active?.lines.map((l) => l.text) ?? [], speech, prefs, activeId);

  const { play } = ra;
  const pending = useRef(false);
  useEffect(() => {
    if (!pending.current) return;
    pending.current = false;
    play(0);
  }, [activeId, play]);

  /* The playing card was filtered out by a search: stop it. Otherwise it
     keeps talking with no visible way to pause. */
  const { pause } = ra;
  useEffect(() => {
    if (activeId && !active) { pause(); setActiveId(undefined); }
  }, [activeId, active, pause]);

  function toggle(id: string) {
    if (id === activeId) { ra.toggle(); return; }
    pending.current = true;
    setActiveId(id);
  }

  return {
    available: speech.available,
    toggle,
    isPlaying: (id: string) => id === activeId && ra.playing,
    lineOf: (id: string) => (id === activeId ? ra.index : undefined),
  };
}
