import timings from './demoAudio.json';
import type { Capture } from './model';

/**
 * Attach the demo recordings (made by scripts/make-demo-audio.mjs) to the demo
 * captures: each line's start comes from where its audio really begins, and
 * the duration is the file's. Kept out of demo.ts so the script that MAKES the
 * audio can import the transcripts without needing the audio to exist yet.
 */
const T = timings as Record<string, { duration: number; starts: number[] }>;

/* A couple of demo meetings start part-listened, so the "listened" track the
   design shows is visible before anyone presses play. Seconds. */
const LISTENED: Record<string, number> = { c3: 12, c5: 10 };

export function withDemoAudio(c: Capture): Capture {
  const t = T[c.id];
  if (c.source !== 'demo' || !t || t.starts.length !== c.lines.length) return c;
  return {
    ...c,
    audio: 'demo',
    listenedTo: c.listenedTo ?? LISTENED[c.id],
    durationSeconds: Math.round(t.duration),
    lines: c.lines.map((l, i) => ({ ...l, startsAt: t.starts[i] })),
  };
}

export function demoAudioUrl(id: string): string {
  return `${import.meta.env.BASE_URL}demo-audio/${id}.m4a`;
}
