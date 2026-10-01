import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { SpeechEngine, WordRange } from './engine';

/**
 * Read-aloud, line by line.
 *
 * The position is a LINE INDEX, never a timestamp — see ReadPosition in the
 * model for why. Everything else (the label, the progress track, the gutter
 * bar on the line being read) is derived from that one number.
 *
 * ⭐ The token. Every utterance gets a number. Cancelling bumps the number, so
 * when a cancelled utterance reports "done" (Chrome fires an error event on
 * cancel), it is recognised as stale and does NOT advance the position. Without
 * this, pressing pause skips a line and seeking jumps two.
 */

export interface ReadAloud {
  playing: boolean;
  /** True after the last line finished. Play restarts from the top. */
  finished: boolean;
  /** Why reading stopped, when it wasn't the user's choice. Cleared on the next play. */
  error: string | null;
  /** The word being spoken in the current line, when the voice reports it. */
  word: WordRange | null;
  index: number;
  total: number;
  /** Start reading. `from` jumps to a line first; otherwise resumes where it stopped. */
  play(from?: number): void;
  pause(): void;
  toggle(): void;
  seek(index: number): void;
  next(): void;
  prev(): void;
}

export function useReadAloud(
  lines: string[],
  engine: SpeechEngine,
  opts: { rate: number; voiceURI?: string },
  /** Change this when a DIFFERENT document is loaded, and the position resets. */
  docKey?: string,
): ReadAloud {
  const [playing, setPlaying] = useState(false);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [word, setWord] = useState<WordRange | null>(null);
  const [rawIndex, setIndex] = useState(0);
  const token = useRef(0);

  /* Derived, not corrected in an effect: a shorter document can never leave
     the position pointing past its end, even for one render. (An effect here
     raced the document-reset effect and parked a new document on line 2.) */
  const index = Math.min(rawIndex, Math.max(0, lines.length - 1));

  /* Latest values for the async onDone callback, which outlives renders. */
  const latest = useRef({ lines, opts, engine, index, playing, finished });
  useLayoutEffect(() => {
    latest.current = { lines, opts, engine, index, playing, finished };
  });

  const speakFrom = useCallback(function speakFrom(i: number) {
    const { lines: ls, opts: o, engine: e } = latest.current;
    const mine = ++token.current;
    e.cancel();
    if (i >= ls.length) {
      /* Park on the last line so the label reads "Line 12 of 12" — the reader
         can see they reached the end. */
      setPlaying(false);
      setFinished(true);
      setIndex(Math.max(0, ls.length - 1));
      return;
    }
    setIndex(i);
    setWord(null);
    e.speak(ls[i], o, () => {
      if (mine !== token.current) return; // cancelled — not a real finish
      speakFrom(i + 1);
    }, (message) => {
      if (mine !== token.current) return;
      /* Stop on a failure rather than racing through every line failing. */
      token.current += 1;
      setPlaying(false);
      setError(message);
    }, (w) => {
      if (mine === token.current) setWord(w);
    });
    /* Engines that generate audio get the next two lines started now, so the
       gap between lines is the voice pausing, not the model thinking. */
    for (const next of ls.slice(i + 1, i + 3)) e.prepare?.(next);
  }, []);

  const pause = useCallback(() => {
    token.current += 1;
    latest.current.engine.cancel();
    setPlaying(false);
    setWord(null);
  }, []);

  const play = useCallback((from?: number) => {
    const { engine: e, lines: ls, finished: done, index: i } = latest.current;
    if (!e.available || ls.length === 0) return;
    setFinished(false);
    setError(null);
    setPlaying(true);
    speakFrom(from ?? (done ? 0 : i));
  }, [speakFrom]);

  const seek = useCallback((i: number) => {
    const { lines: ls, playing: p } = latest.current;
    const clamped = Math.min(Math.max(0, i), Math.max(0, ls.length - 1));
    setFinished(false);
    setWord(null);
    if (p) speakFrom(clamped);
    else setIndex(clamped);
  }, [speakFrom]);

  /* Speed or voice changed mid-sentence: restart the current line with the
     new setting rather than finishing it at the old one. */
  const settingsKey = `${engine.id}|${opts.rate}|${opts.voiceURI ?? ''}`;
  const lastKey = useRef(settingsKey);
  const lastEngine = useRef(engine);
  useEffect(() => {
    if (lastKey.current === settingsKey) return;
    lastKey.current = settingsKey;
    /* Switching engine: the OLD one must be silenced, or two voices talk. */
    if (lastEngine.current !== engine) { lastEngine.current.cancel(); lastEngine.current = engine; }
    if (latest.current.playing) speakFrom(latest.current.index);
  }, [settingsKey, engine, speakFrom]);

  /* A different document: stop, and start again from its first line. */
  const lastDoc = useRef(docKey);
  useEffect(() => {
    if (lastDoc.current === docKey) return;
    lastDoc.current = docKey;
    token.current += 1;
    latest.current.engine.cancel();
    setPlaying(false);
    setFinished(false);
    setError(null);
    setIndex(0);
  }, [docKey]);

  /* Leaving the screen must stop the voice. A browser keeps speaking after the
     component that started it is gone. */
  useEffect(() => () => {
    token.current += 1;
    latest.current.engine.cancel();
  }, []);

  return {
    playing,
    finished,
    error,
    word: playing ? word : null,
    index,
    total: lines.length,
    play,
    pause,
    toggle: () => (latest.current.playing ? pause() : play()),
    seek,
    next: () => seek(latest.current.index + 1),
    prev: () => seek(latest.current.index - 1),
  };
}
