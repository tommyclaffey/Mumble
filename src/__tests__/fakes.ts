import { memoryAudioStore } from '../record/audioStore';
import type { MicRecorder } from '../record/micRecorder';
import type { Recognizer, RecognizerEvents } from '../record/recognizer';
import type { DiarizeProgress, DiarizeResult, Diarizer } from '../record/diarizer';

/**
 * An audio element the test drives by hand: `at(12.5)` moves the playhead
 * and fires timeupdate, `end()` finishes it. jsdom's own <audio> can't play.
 */
export class FakeAudio extends EventTarget {
  src = '';
  currentTime = 0;
  duration = NaN;
  paused = true;
  playbackRate = 1;
  defaultPlaybackRate = 1;
  preservesPitch = false;
  plays = 0;
  /** Set to make the next play() reject, like a browser blocking autoplay. */
  rejectNext: string | null = null;

  play(): Promise<void> {
    if (this.rejectNext) {
      const name = this.rejectNext; this.rejectNext = null;
      const e = new Error(name); e.name = name;
      return Promise.reject(e);
    }
    this.plays += 1;
    this.paused = false;
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  }
  pause() {
    if (this.paused) return;
    this.paused = true;
    this.dispatchEvent(new Event('pause'));
  }
  removeAttribute(name: string) { if (name === 'src') this.src = ''; }
  getAttribute(name: string) { return name === 'src' ? this.src || null : null; }
  at(t: number) { this.currentTime = t; this.dispatchEvent(new Event('timeupdate')); }
  meta(duration: number) { this.duration = duration; this.dispatchEvent(new Event('loadedmetadata')); }
  end() { this.currentTime = this.duration || this.currentTime; this.paused = true; this.dispatchEvent(new Event('ended')); }
  fail() { this.dispatchEvent(new Event('error')); }
}

/** Every audio element the app makes, newest last. */
export function fakeAudioFactory() {
  const made: FakeAudio[] = [];
  return {
    made,
    make: () => { const a = new FakeAudio(); made.push(a); return a as unknown as HTMLAudioElement; },
    /** The element for the page's main player (the first one made). */
    get main() { return made[0]; },
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

/** A microphone that "records" a fixed blob. */
export function fakeMic(opts: { available?: boolean; refuse?: boolean } = {}) {
  const state = { started: 0, paused: 0, resumed: 0, stopped: 0 };
  const blob = new Blob(['audio'], { type: 'audio/webm' });
  const make = (): MicRecorder => {
    let running = false;
    return {
      available: opts.available ?? true,
      start: async () => { state.started += 1; if (opts.refuse) throw new Error('NotAllowedError'); running = true; },
      pause: () => { state.paused += 1; },
      resume: () => { state.resumed += 1; },
      stop: async () => { state.stopped += 1; const had = running; running = false; return had ? blob : undefined; },
    };
  };
  return { make, state, blob };
}

/**
 * Meeting mode without the models. `answer` decides who said each line
 * (default: lines alternate between two people, all sure). `calls` records
 * what the screen asked for — the head count especially.
 */
export function fakeDiarizer(opts: {
  available?: boolean;
  answer?: (starts: number[], people: number | null) => DiarizeResult;
  fail?: string;
  progress?: DiarizeProgress[];
  /** Hold the answer until `release()` — to see the screen mid-way. */
  hold?: boolean;
} = {}) {
  const calls: { starts: number[]; people: number | null }[] = [];
  let release = () => {};
  const held = new Promise<void>((r) => { release = r; });
  const make = (): Diarizer => ({
    available: opts.available ?? true,
    async run(_audio, starts, people, onProgress) {
      calls.push({ starts, people });
      for (const p of opts.progress ?? []) onProgress(p);
      if (opts.hold) await held;
      if (opts.fail) throw new Error(opts.fail);
      return opts.answer?.(starts, people)
        ?? { speaker: starts.map((_, i) => i % 2), confidence: starts.map(() => 0.95), count: Math.min(2, starts.length) };
    },
  });
  return { make, calls, release: () => release() };
}

export { memoryAudioStore };
