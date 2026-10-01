import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { browserEngine, type SpeechEngine } from './engine';
import { naturalSupported, sharedNaturalVoice, type NaturalVoice } from './natural/NaturalVoice';
import { useNaturalStatus } from './natural/useNaturalStatus';
import { browserRecognizer, type Recognizer } from '../record/recognizer';
import { useStore } from '../data/store';

/**
 * The browser speech services, provided once.
 *
 * `speech` is whichever engine the user chose in Settings — the device's own
 * voices, or the natural on-device model. Screens never know which; they get
 * one SpeechEngine and the same controls work on both.
 *
 * Tests pass fakes here; the app gets the real ones. No component touches
 * window.speechSynthesis, SpeechRecognition or the model directly.
 */
interface Engines {
  speech: SpeechEngine;
  device: SpeechEngine;
  natural: NaturalVoice | null;
  recognizer: () => Recognizer;
}

const Ctx = createContext<Engines | null>(null);

export function EnginesProvider(
  { children, speech, natural, recognizer }:
  { children: ReactNode; speech?: SpeechEngine; natural?: NaturalVoice | null; recognizer?: () => Recognizer },
) {
  const { prefs } = useStore();
  const device = useMemo(() => speech ?? browserEngine(), [speech]);
  const nat = useMemo(
    () => (natural !== undefined ? natural : naturalSupported() ? sharedNaturalVoice() : null),
    [natural],
  );

  /* Chose the natural voice on an earlier visit: wake it now (from the
     browser's cache — no second download) so the first play isn't a wait. */
  useEffect(() => {
    if (prefs.engine === 'natural' && nat) nat.load();
  }, [prefs.engine, nat]);

  /* If the natural voice fails, fall back to the device's — read-aloud must
     never simply stop working because the better option broke. */
  const failed = useNaturalStatus(nat).phase === 'error';
  const useNatural = prefs.engine === 'natural' && nat !== null && !failed;

  const value = useMemo<Engines>(() => ({
    device,
    natural: nat,
    speech: useNatural && nat ? nat.engine(prefs.naturalVoice) : device,
    recognizer: recognizer ?? browserRecognizer,
  }), [device, nat, useNatural, prefs.naturalVoice, recognizer]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useEngines(): Engines {
  const e = useContext(Ctx);
  if (!e) throw new Error('useEngines must be used inside <EnginesProvider>');
  return e;
}
