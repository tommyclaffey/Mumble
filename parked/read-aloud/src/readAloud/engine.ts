/**
 * The speech engines behind read-aloud.
 *
 * An interface rather than direct calls to window.speechSynthesis, for three
 * reasons: tests drive a fake one deterministically; there are now TWO real
 * engines (the device's voices, and the natural on-device model) behind the
 * same controls; and the browser API's traps are handled here, once:
 *
 *   1. Long utterances get cut off in Chrome after ~15 seconds. So nothing
 *      long is ever sent — the hook speaks ONE LINE at a time, which is also
 *      what makes "Line 4 of 18" exact rather than estimated.
 *
 *   2. pause()/resume() are unreliable across browsers. So engines have no
 *      pause. Pausing cancels, and playing again restarts the current line
 *      from its first word — the better behaviour anyway for someone who lost
 *      their place.
 */

export interface VoiceOption { uri: string; name: string; lang: string; score: number }

export interface SpeakOptions { rate: number; voiceURI?: string }

/** Where in the line the voice is: a character range of the word being spoken. */
export interface WordRange { start: number; end: number }

export interface SpeechEngine {
  /** Changes when the engine or its voice changes, so playback can restart on the new one. */
  readonly id: string;
  readonly available: boolean;
  speak(
    text: string, opts: SpeakOptions, onDone: () => void,
    onError?: (message: string) => void,
    /** Called as each word starts, where the voice reports it. Not every voice does. */
    onWord?: (word: WordRange) => void,
  ): void;
  /** Get a line ready before it's needed. Engines that generate audio use this to hide the wait. */
  prepare?(text: string): void;
  cancel(): void;
  voices(): VoiceOption[];
  /** Voices load asynchronously in Chrome; subscribe to hear when they arrive. */
  onVoicesChanged(fn: () => void): () => void;
}

/* --------------------------------------------------- ranking voices -- */

/**
 * Not all device voices are equal, and the system default is usually the
 * worst one. On a Mac that's a compact voice from 2011. Premium and Enhanced
 * voices (Apple), Natural voices (Microsoft, in Edge) and Google's voices (in
 * Chrome) are the good ones, so they rank first and the best one is used
 * unless the user chooses otherwise.
 *
 * Novelty voices ("Bubbles", "Bad News", "Zarvox") are hidden entirely.
 * Nobody reading their notes wants a voice that sings.
 */
const NOVELTY = /^(albert|bad news|bahh|bells|boing|bubbles|cellos|wobble|good news|jester|organ|superstar|trinoids|whisper|zarvox|deranged|hysterical|pipe organ|fred|junior|ralph|kathy|princess|bruce|agnes|vicki|victoria)\b/i;

export function voiceScore(v: { name: string; lang: string }, preferredLang = 'en-US'): number {
  if (NOVELTY.test(v.name)) return -1;
  const lang = v.lang.replace('_', '-').toLowerCase();
  const pref = preferredLang.toLowerCase();
  let s = 0;
  if (lang === pref) s += 20;
  else if (lang.split('-')[0] === pref.split('-')[0]) s += 10;
  else return 0; // other languages: listed last, never chosen automatically
  if (/premium/i.test(v.name)) s += 60;
  else if (/\bnatural\b/i.test(v.name)) s += 58;
  else if (/neural/i.test(v.name)) s += 55;
  else if (/enhanced/i.test(v.name)) s += 40;
  else if (/siri/i.test(v.name)) s += 35;
  else if (/^google/i.test(v.name)) s += 30;
  return s;
}

/** A voice below this is a basic one. The UI says so and points at better ones. */
export const GOOD_VOICE = 40;

export function rankVoices<T extends { name: string; lang: string }>(voices: T[], preferredLang?: string): (T & { score: number })[] {
  return voices
    .map((v) => ({ ...v, score: voiceScore(v, preferredLang) }))
    .filter((v) => v.score >= 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

/* ------------------------------------------------ the device's voices -- */

export function browserEngine(): SpeechEngine {
  const synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : undefined;
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return unavailableEngine();
  const lang = () => (typeof navigator !== 'undefined' && navigator.language) || 'en-US';

  function pick(voiceURI?: string): SpeechSynthesisVoice | undefined {
    const all = synth!.getVoices();
    if (voiceURI) {
      const chosen = all.find((v) => v.voiceURI === voiceURI);
      if (chosen) return chosen;
    }
    /* No choice made (or the chosen voice is gone): the best on the device,
       not whatever the OS default happens to be. */
    return rankVoices(all, lang())[0];
  }

  return {
    id: 'device',
    available: true,
    speak(text, { rate, voiceURI }, onDone, onError, onWord) {
      const u = new SpeechSynthesisUtterance(text);
      /* Word boundaries drive the word highlight. Local voices report them;
         some network voices (Google's) don't, and the highlight simply stays
         at line level — never a guess. */
      if (onWord) {
        u.onboundary = (e) => {
          if (e.name !== 'word') return;
          onWord({ start: e.charIndex, end: e.charIndex + (e.charLength || wordLength(text, e.charIndex)) });
        };
      }
      u.rate = rate;
      const voice = pick(voiceURI);
      if (voice) { u.voice = voice; u.lang = voice.lang; }
      u.onend = onDone;
      /* 'error' also fires on cancel() ("interrupted" / "canceled") — that's
         just the utterance ending, and the hook ignores it as stale. Anything
         else is a real failure and must STOP reading: treating it as "line
         finished" raced through every line in silence and said "Finished". */
      u.onerror = (e) => {
        if (e.error === 'interrupted' || e.error === 'canceled') onDone();
        else if (onError) onError(`The voice stopped (${e.error}). Press play to try again.`);
        else onDone();
      };
      synth.speak(u);
    },
    cancel() { synth.cancel(); },
    voices() {
      return rankVoices(synth.getVoices().map((v) => ({ uri: v.voiceURI, name: v.name, lang: v.lang })), lang());
    },
    onVoicesChanged(fn) {
      synth.addEventListener('voiceschanged', fn);
      return () => synth.removeEventListener('voiceschanged', fn);
    },
  };
}

/** Safari doesn't send charLength; measure to the next space or punctuation. */
export function wordLength(text: string, from: number): number {
  const m = /^[\p{L}\p{N}'’-]+/u.exec(text.slice(from));
  return m ? m[0].length : 0;
}

export function unavailableEngine(): SpeechEngine {
  return {
    id: 'none',
    available: false,
    speak() {},
    cancel() {},
    voices: () => [],
    onVoicesChanged: () => () => {},
  };
}
