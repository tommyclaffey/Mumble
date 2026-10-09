import { useEffect, useRef } from 'react';
import { go } from '../data/route';
import { useStore } from '../data/store';
import { peaksFromBlob } from '../record/waveform';
import { useServices } from '../services';
import { audioUrl, desktop, meetingFromCall, type DesktopCall } from './desktop';
import { followMacState } from './macState';

/**
 * Inside the Mac app: saves each finished call as a meeting. Renders nothing.
 *
 * It asks the app for finished calls when the window opens and whenever the
 * app says one is ready, so a call recorded with the window closed still
 * arrives. Each is saved once: the app is told, and a call already in the
 * list is never added twice.
 */
export function DesktopImporter() {
  const { captures, dispatch, prefs } = useStore();
  const services = useServices();
  const latest = useRef({ captures, prefs });
  useEffect(() => { latest.current = { captures, prefs }; }, [captures, prefs]);
  const busy = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (!desktop()) return;
    followMacState();

    async function importOne(call: DesktopCall) {
      const exists = latest.current.captures.some((c) => c.id === call.id);
      if (!exists) {
        let stored = false;
        let peaks: number[] | undefined;
        try {
          const mix = await (await fetch(audioUrl(call, 'mix.m4a'))).blob();
          await services.audioStore.put(call.id, mix);
          stored = true;
          peaks = await peaksFromBlob(mix);
        } catch { /* the words still arrive, without a player */ }
        let voices = null;
        if (call.others.length > 0) {
          try {
            const theirs = await (await fetch(audioUrl(call, 'others.m4a'))).blob();
            voices = await services.diarizer().run(theirs, call.others.map((l) => l.start), null, () => {});
          } catch { /* everyone else stays one "Speaker 1", flagged for "Who is this?" */ }
        }
        dispatch({ type: 'addCapture', capture: meetingFromCall(call, voices, { stored, peaks, taskHints: latest.current.prefs.taskHints }) });
      }
      await fetch(`/desktop/imported/${encodeURIComponent(call.id)}`, { method: 'POST' });
    }

    function sync(open: string | null) {
      busy.current = busy.current.then(async () => {
        try {
          const calls = (await (await fetch('/desktop/pending', { cache: 'no-store' })).json()) as DesktopCall[];
          for (const call of calls) await importOne(call);
        } catch { /* the app isn't answering: try again next time */ }
        if (open) go({ name: 'capture', id: open });
      });
    }

    sync(null);
    const onCall = (e: Event) => sync((e as CustomEvent<{ open: string | null }>).detail?.open ?? null);
    window.addEventListener('mumble:desktop', onCall);
    return () => window.removeEventListener('mumble:desktop', onCall);
  }, [dispatch, services]);

  return null;
}
