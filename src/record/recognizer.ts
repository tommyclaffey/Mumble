/**
 * Live transcription via the browser's SpeechRecognition.
 *
 * ⚠️ Honest about what this is:
 *   · Chrome and Edge send the audio to their vendor's speech service to
 *     transcribe it. Safari transcribes on-device where it can. Firefox has
 *     no support at all. The Record screen says this in plain words.
 *   · It CANNOT tell voices apart. There is no diarization in the browser,
 *     which is why Meeting mode is not offered in the demo — a meeting
 *     transcript with every line credited to "Speaker 1" would be a lie
 *     about the feature this product is built around.
 *
 * Wrapped in an interface for the same reason as the speech engine: tests
 * drive a fake, and the browser's quirks are handled in one place. The main
 * quirk: Chrome ends a "continuous" session by itself after a pause in speech.
 * The wrapper restarts it until the user actually presses Stop.
 */

export interface RecognizedLine { text: string; confidence: number }

export interface RecognizerEvents {
  onFinal(line: RecognizedLine): void;
  onInterim(text: string): void;
  onError(message: string): void;
}

export interface Recognizer {
  readonly available: boolean;
  start(events: RecognizerEvents): void;
  stop(): void;
}

/* The constructor is still vendor-prefixed in Chrome and Safari. */
interface SRResult { isFinal: boolean; 0: { transcript: string; confidence: number } }
interface SREvent { resultIndex: number; results: { length: number; [i: number]: SRResult } }
interface SR {
  continuous: boolean; interimResults: boolean; lang: string;
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
type SRCtor = new () => SR;

function ctor(): SRCtor | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

const ERRORS: Record<string, string> = {
  'not-allowed': 'Microphone access was blocked. Allow it in the address bar and try again.',
  'service-not-allowed': 'This browser will not let the page use speech recognition.',
  'audio-capture': 'No microphone was found.',
  network: 'The speech service could not be reached. Check your connection.',
};

export function browserRecognizer(): Recognizer {
  const Ctor = ctor();
  if (!Ctor) return { available: false, start() {}, stop() {} };

  let sr: SR | null = null;
  let wanted = false;

  return {
    available: true,
    start(events) {
      wanted = true;
      sr = new Ctor();
      sr.continuous = true;
      sr.interimResults = true;
      sr.lang = navigator.language || 'en-US';
      sr.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          const text = r[0].transcript.trim();
          if (!text) continue;
          if (r.isFinal) events.onFinal({ text: sentence(text), confidence: r[0].confidence || 0 });
          else interim += `${text} `;
        }
        events.onInterim(interim.trim());
      };
      sr.onerror = (e) => {
        /* "no-speech" and "aborted" are normal — silence, or our own stop. */
        if (e.error === 'no-speech' || e.error === 'aborted') return;
        wanted = false;
        events.onError(ERRORS[e.error] ?? `Speech recognition stopped (${e.error}).`);
      };
      sr.onend = () => {
        if (wanted && sr) {
          try { sr.start(); } catch { /* already starting */ }
        }
      };
      sr.start();
    },
    stop() {
      wanted = false;
      sr?.stop();
      sr = null;
    },
  };
}

/** Recognisers return lowercase fragments with no punctuation. */
export function sentence(text: string): string {
  const t = text.trim();
  if (!t) return t;
  const cap = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?]$/.test(cap) ? cap : `${cap}.`;
}
