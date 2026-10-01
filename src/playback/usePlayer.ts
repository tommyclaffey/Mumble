import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { demoAudioUrl } from '../data/demoAudio';
import { lineAt, type Capture } from '../data/model';
import { useServices } from '../services';
import { useStore } from '../data/store';

/**
 * Plays a capture's RECORDING, and says where in the transcript it is.
 *
 * A capture is a recording first and a transcript second. Pressing play plays
 * what was said; the transcript follows along. The position is still stated as
 * a line ("Line 4 of 18") — the audio's time is turned into the line being
 * spoken — because what a reader needs is their place in the TEXT.
 *
 * One audio element per player. The list screens share one player between all
 * their cards, so two recordings can never play over each other.
 */
export interface Player {
  /** This capture has a recording to play. */
  hasAudio: boolean;
  playing: boolean;
  /** Has been played or positioned — before that, no line is highlighted. */
  started: boolean;
  finished: boolean;
  /** Waiting for audio data (the first load, or a slow connection). */
  loading: boolean;
  time: number;
  duration: number;
  line: number;
  total: number;
  error: string | null;
  /** Play. `fromLine` jumps to that line first. */
  play(fromLine?: number): void;
  pause(): void;
  toggle(): void;
  seek(seconds: number): void;
  seekLine(index: number): void;
  next(): void;
  prev(): void;
}

export function usePlayer(c: Capture | undefined, rate: number): Player {
  const { makeAudio, audioStore } = useServices();
  const { dispatch } = useStore();
  const [el] = useState(() => makeAudio());
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [loading, setLoading] = useState(false);
  const [time, setTime] = useState(0);
  const [mediaDuration, setMediaDuration] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wantPlay = useRef(false);
  /* A ref as well as state: play() can be called in the same commit the
     source was attached, when the state it closed over still says "not ready". */
  const readyRef = useRef(false);
  const objectUrl = useRef<string | null>(null);

  const id = c?.id;
  const kind = c?.audio;

  const doPlay = useCallback(() => {
    wantPlay.current = false;
    setError(null);
    setStarted(true);
    const p = el.play();
    if (p && typeof p.catch === 'function') {
      p.catch((e: unknown) => {
        const name = e instanceof Error ? e.name : '';
        if (name === 'AbortError') return; // a newer load or pause interrupted it — not a failure
        setPlaying(false);
        setError(name === 'NotAllowedError' ? 'The browser blocked playback. Press play again.' : 'The recording couldn’t play.');
      });
    }
  }, [el]);

  /* ---- Load the recording whenever the capture changes ---- */
  useEffect(() => {
    let live = true;
    el.pause();
    readyRef.current = false;
    setReady(false); setPlaying(false); setStarted(false); setFinished(false);
    setLoading(false); setTime(0); setMediaDuration(null); setError(null);
    if (objectUrl.current) { URL.revokeObjectURL(objectUrl.current); objectUrl.current = null; }

    /* Resume where listening stopped — unless it was at the very end. */
    const resumeAt = c?.listenedTo && c.listenedTo < (c.durationSeconds - 1) ? c.listenedTo : 0;
    const attach = (src: string) => {
      el.src = src;
      if (resumeAt) { el.currentTime = resumeAt; setTime(resumeAt); }
      readyRef.current = true;
      setReady(true);
      if (wantPlay.current) doPlay();
    };

    if (!id || !kind) {
      el.removeAttribute('src');
    } else if (kind === 'demo') {
      attach(demoAudioUrl(id));
    } else {
      audioStore.get(id).then((blob) => {
        if (!live) return;
        if (!blob) { wantPlay.current = false; setError('This recording isn’t in this browser any more.'); return; }
        objectUrl.current = URL.createObjectURL(blob);
        attach(objectUrl.current);
      }, () => { if (live) setError('The recording couldn’t be read from this browser’s storage.'); });
    }
    return () => { live = false; };
  }, [el, id, kind, audioStore, doPlay]);

  /* ---- Follow the element ---- */
  useEffect(() => {
    const on = (type: string, fn: () => void) => { el.addEventListener(type, fn); return () => el.removeEventListener(type, fn); };
    const offs = [
      on('play', () => { setPlaying(true); setFinished(false); }),
      on('pause', () => setPlaying(false)),
      on('ended', () => { setPlaying(false); setFinished(true); setTime(el.currentTime); }),
      on('timeupdate', () => setTime(el.currentTime)),
      on('waiting', () => setLoading(true)),
      on('playing', () => setLoading(false)),
      on('canplay', () => setLoading(false)),
      on('loadedmetadata', () => { if (Number.isFinite(el.duration)) setMediaDuration(el.duration); }),
      on('error', () => { if (el.getAttribute?.('src') || el.src) { setPlaying(false); setLoading(false); setError('The recording couldn’t be loaded.'); } }),
    ];
    return () => offs.forEach((off) => off());
  }, [el]);

  /* timeupdate fires ~4 times a second — too coarse for a highlight that
     should change as a line starts. While playing, read the clock each frame. */
  useEffect(() => {
    if (!playing || typeof requestAnimationFrame !== 'function') return;
    let raf = 0;
    const tick = () => { setTime(el.currentTime); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, el]);

  /* Remember where listening got to: when it pauses or ends, and every few
     seconds while playing (so closing the tab mid-play still keeps it). */
  const saveRef = useRef<(t: number) => void>(() => {});
  saveRef.current = (t: number) => { if (id && Math.abs((c?.listenedTo ?? 0) - t) > 0.5) dispatch({ type: 'setListened', captureId: id, seconds: t }); };
  useEffect(() => {
    const save = () => saveRef.current(el.currentTime);
    el.addEventListener('pause', save);
    el.addEventListener('ended', save);
    return () => { el.removeEventListener('pause', save); el.removeEventListener('ended', save); };
  }, [el]);
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => saveRef.current(el.currentTime), 5000);
    return () => clearInterval(t);
  }, [playing, el]);

  /* Speed up without the chipmunk effect. */
  useEffect(() => {
    el.defaultPlaybackRate = rate;
    el.playbackRate = rate;
    el.preservesPitch = true;
  }, [el, rate, ready]);

  /* Leaving the screen stops the recording and frees its memory. */
  useEffect(() => () => {
    el.pause();
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
  }, [el]);

  const lines = useMemo(() => c?.lines ?? [], [c]);
  const duration = mediaDuration ?? c?.durationSeconds ?? 0;

  const seek = useCallback((seconds: number) => {
    const t = Math.max(0, Math.min(seconds, duration || seconds));
    el.currentTime = t;
    setTime(t);
    setStarted(true);
    setFinished(false);
  }, [el, duration]);

  const seekLine = useCallback((i: number) => {
    if (lines.length === 0) return;
    const clamped = Math.max(0, Math.min(i, lines.length - 1));
    seek(lines[clamped].startsAt);
  }, [lines, seek]);

  const play = useCallback((fromLine?: number) => {
    if (!kind) return;
    if (fromLine !== undefined) seekLine(fromLine);
    else if (finished) seek(0);
    if (!readyRef.current) { wantPlay.current = true; setStarted(true); return; }
    doPlay();
  }, [kind, seekLine, finished, seek, doPlay]);

  const pause = useCallback(() => { wantPlay.current = false; el.pause(); }, [el]);

  const line = lines.length ? lineAt(c!, time) : 0;

  return {
    hasAudio: !!kind,
    playing, started, finished, loading, time, duration, line, total: lines.length, error,
    play,
    pause,
    toggle: () => (playing || wantPlay.current ? pause() : play()),
    seek,
    seekLine,
    next: () => seekLine(line + 1),
    prev: () => {
      /* Like every audio player: a few seconds into a line, "previous" goes
         back to the START of this line; right at its start, to the one before. */
      const into = time - (lines[line]?.startsAt ?? 0);
      seekLine(into > 1.5 ? line : line - 1);
    },
  };
}
