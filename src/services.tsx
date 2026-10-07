import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { browserAudioStore, type AudioStore } from './record/audioStore';
import { browserMicRecorder, type MicRecorder } from './record/micRecorder';
import { browserRecognizer, type Recognizer } from './record/recognizer';
import { browserDiarizer, type Diarizer } from './record/diarizer';

/**
 * The browser things Mumble uses, provided once: an audio element to play
 * recordings, the store that keeps them, the microphone, live
 * transcription, and telling voices apart in a meeting. Tests pass fakes; the app gets the real ones. No component
 * touches Audio, IndexedDB, MediaRecorder or SpeechRecognition directly.
 */
export interface Services {
  makeAudio: () => HTMLAudioElement;
  audioStore: AudioStore;
  mic: () => MicRecorder;
  recognizer: () => Recognizer;
  diarizer: () => Diarizer;
}

const Ctx = createContext<Services | null>(null);

export function ServicesProvider({ children, ...overrides }: Partial<Services> & { children: ReactNode }) {
  const { makeAudio, audioStore, mic, recognizer, diarizer } = overrides;
  const value = useMemo<Services>(() => ({
    makeAudio: makeAudio ?? (() => new Audio()),
    audioStore: audioStore ?? browserAudioStore(),
    mic: mic ?? browserMicRecorder,
    recognizer: recognizer ?? browserRecognizer,
    diarizer: diarizer ?? browserDiarizer,
  }), [makeAudio, audioStore, mic, recognizer, diarizer]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useServices(): Services {
  const s = useContext(Ctx);
  if (!s) throw new Error('useServices must be used inside <ServicesProvider>');
  return s;
}
