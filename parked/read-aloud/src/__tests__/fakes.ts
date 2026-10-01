import type { SpeechEngine } from '../readAloud/engine';
import type { Recognizer, RecognizerEvents } from '../record/recognizer';

/** A speech engine you can step through by hand: finish() ends the current line. */
export function fakeSpeech(available = true) {
  const spoken: { text: string; rate: number }[] = [];
  let pending: (() => void) | null = null;
  let onWord: ((w: { start: number; end: number }) => void) | undefined;
  let cancels = 0;
  const engine: SpeechEngine = {
    id: 'fake',
    available,
    speak(text, { rate }, onDone, _onError, w) { spoken.push({ text, rate }); pending = onDone; onWord = w; },
    /* Like Chrome: cancelling fires the utterance's end/error callback. The hook
       must treat that as stale, not as "line finished". */
    cancel() { cancels += 1; const p = pending; pending = null; p?.(); },
    voices: () => [{ uri: 'v1', name: 'Test Voice', lang: 'en-US', score: 20 }],
    onVoicesChanged: () => () => {},
  };
  return {
    engine,
    spoken,
    get cancels() { return cancels; },
    finish() { const p = pending; pending = null; p?.(); },
    word(w: { start: number; end: number }) { onWord?.(w); },
  };
}

/** A recogniser the test speaks into. */
export function fakeRecognizer(available = true) {
  let events: RecognizerEvents | null = null;
  const state = { started: 0, stopped: 0 };
  const make = (): Recognizer => ({
    available,
    start(e) { events = e; state.started += 1; },
    stop() { state.stopped += 1; },
  });
  return {
    make,
    state,
    say(text: string, confidence = 0.9) { events?.onFinal({ text, confidence }); },
    hear(text: string) { events?.onInterim(text); },
    fail(message: string) { events?.onError(message); },
  };
}
