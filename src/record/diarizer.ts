import { linesToSpeakers } from './diarize';

/**
 * Meeting mode's service: hand it the recording and the transcript lines,
 * get back who said each line and how sure it is.
 *
 * Option A (Oct 7, Tommy: "start with the free version, then the paid one
 * once it makes sense"): it runs in this browser — diarize.worker.ts. The
 * paid service would be a second Diarizer with the same shape, so nothing
 * else in the app changes when it arrives.
 *
 * Tests pass a fake (src/__tests__/fakes.ts); nothing else touches the models.
 */
export type DiarizeProgress =
  | { stage: 'download'; percent: number }
  | { stage: 'listen'; done: number; total: number };

export interface DiarizeResult {
  /** Per line: 0 = the first person to speak, 1 = the next… */
  speaker: number[];
  /** Per line, 0–1. Below LOW_CONFIDENCE the line is flagged. */
  confidence: number[];
  /** How many people it heard. */
  count: number;
}

export interface Diarizer {
  readonly available: boolean;
  /** `people` = how many were there; null = it works it out. */
  run(audio: Blob, starts: number[], people: number | null, onProgress: (p: DiarizeProgress) => void): Promise<DiarizeResult>;
}

/** 16 kHz mono — what both models expect. */
async function decode16k(blob: Blob): Promise<Float32Array> {
  const ctx = new AudioContext();
  const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
  void ctx.close();
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(audio.duration * 16000)), 16000);
  const src = off.createBufferSource();
  src.buffer = audio;
  src.connect(off.destination);
  src.start();
  return (await off.startRendering()).getChannelData(0);
}

export function browserDiarizer(): Diarizer {
  const g = globalThis as { Worker?: unknown; WebAssembly?: unknown; OfflineAudioContext?: unknown; AudioContext?: unknown };
  const available = !!(g.Worker && g.WebAssembly && g.OfflineAudioContext && g.AudioContext);
  return {
    available,
    async run(audio, starts, people, onProgress) {
      const pcm = await decode16k(audio);
      /* Measured now: handing the samples to the worker empties this copy. */
      const duration = pcm.length / 16000;
      const worker = new Worker(new URL('./diarize.worker.ts', import.meta.url), { type: 'module' });
      try {
        const spans = await new Promise<import('./diarize').VoiceSpan[]>((resolve, reject) => {
          worker.onmessage = (e) => {
            const m = e.data;
            if (m.type === 'progress') onProgress(m.stage === 'download' ? { stage: 'download', percent: m.percent } : { stage: 'listen', done: m.done, total: m.total });
            else if (m.type === 'done') resolve(m.spans);
            else if (m.type === 'error') reject(new Error(m.message));
          };
          worker.onerror = (e) => reject(new Error(e.message || 'The voice models could not start.'));
          worker.postMessage({ pcm, people }, [pcm.buffer]);
        });
        if (spans.length === 0) throw new Error('No voices were found in the recording.');
        return linesToSpeakers(starts, duration, spans);
      } finally {
        worker.terminate();
      }
    },
  };
}
