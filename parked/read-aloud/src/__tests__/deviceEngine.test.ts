// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { browserEngine, wordLength } from '../readAloud/engine';

/* A stand-in for the browser's speechSynthesis, enough to drive one utterance. */
class Utterance {
  text: string; rate = 1; voice: unknown; lang = '';
  onend: (() => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onboundary: ((e: { name: string; charIndex: number; charLength?: number }) => void) | null = null;
  constructor(t: string) { this.text = t; }
}
let last: Utterance | null = null;

function install() {
  Object.assign(window, {
    SpeechSynthesisUtterance: Utterance,
    speechSynthesis: {
      speak: (u: Utterance) => { last = u; }, cancel: () => {}, getVoices: () => [],
      addEventListener: () => {}, removeEventListener: () => {},
    },
  });
  (globalThis as Record<string, unknown>).SpeechSynthesisUtterance = Utterance;
}
afterEach(() => { last = null; vi.restoreAllMocks(); });

describe('device voice', () => {
  it('a real voice error STOPS reading — it is not "line finished"', () => {
    install();
    const done = vi.fn(); const err = vi.fn();
    browserEngine().speak('hello', { rate: 1 }, done, err);
    last!.onerror!({ error: 'synthesis-failed' });
    expect(err).toHaveBeenCalledWith(expect.stringMatching(/synthesis-failed/));
    expect(done).not.toHaveBeenCalled();
  });

  it('cancel’s "interrupted" is just the line ending', () => {
    install();
    const done = vi.fn(); const err = vi.fn();
    browserEngine().speak('hello', { rate: 1 }, done, err);
    last!.onerror!({ error: 'interrupted' });
    expect(done).toHaveBeenCalledOnce();
    expect(err).not.toHaveBeenCalled();
  });

  it('reports word boundaries, measuring the word when Safari omits the length', () => {
    install();
    const onWord = vi.fn();
    browserEngine().speak("Okay, I'm here", { rate: 1 }, () => {}, undefined, onWord);
    last!.onboundary!({ name: 'word', charIndex: 6 });
    last!.onboundary!({ name: 'sentence', charIndex: 0 });
    expect(onWord).toHaveBeenCalledTimes(1);
    expect(onWord).toHaveBeenCalledWith({ start: 6, end: 9 });
    expect(wordLength('well-known, yes', 0)).toBe(10);
  });
});
