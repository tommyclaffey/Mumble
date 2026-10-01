import type { SpeechEngine } from '../engine';
import { NATURAL_VOICES, configKey, type FromWorker, type ModelConfig, type ToWorker } from './protocol';

/**
 * The natural voice — a neural text-to-speech model running on the device.
 *
 * Why this and not a cloud voice like Speechify's:
 *   · Free. No per-character bill, no API key, no server.
 *   · Private. The text is turned into speech on the device; only the model
 *     itself is downloaded (once, from Hugging Face). That keeps the promise
 *     on the Record screen — nothing is sent to Mumble.
 *   · Consistent. The same voice in Chrome, Safari and Edge, instead of
 *     whatever each OS happens to ship.
 *
 * The cost is a one-time download and a short wait per line, which is hidden
 * by generating the NEXT lines while the current one plays.
 *
 * ⭐ FAILURE IS A STATE, NOT AN ERROR PER LINE. If the model can't load, that
 * is reported once, as phase 'error' — and EnginesProvider switches read-aloud
 * to the device voice. Lines that were waiting are NOT failed one by one
 * (that used to stop reading with an error instead of falling back); they are
 * left for the hook, which restarts the current line on the new engine.
 */

export type NaturalPhase = 'idle' | 'downloading' | 'preparing' | 'ready' | 'error';

export interface NaturalStatus {
  phase: NaturalPhase;
  loadedBytes: number;
  totalBytes: number;
  /** A line was asked for and its audio isn't ready yet. */
  waiting: boolean;
  error?: string;
}

export interface WorkerLike {
  postMessage(m: ToWorker): void;
  onmessage: ((e: MessageEvent<FromWorker>) => void) | null;
}

/** Thrown to waiting lines when the whole model failed. Engines stay quiet on it. */
export class ModelFailed extends Error {}

const WASM: ModelConfig = { device: 'wasm', dtype: 'q8' };
const WEBGPU: ModelConfig = { device: 'webgpu', dtype: 'fp32' };

/* Measured Sept 30 on an M-series Mac, a 5-second line:
     webgpu fp32 · 326 MB · ~0.7s to generate  → far ahead of playback
     wasm   q8   ·  92 MB · ~9s   to generate  → slower than real time
   (webgpu fp16 was as fast at half the size, but its output measured clearly
   different from fp32 — the library recommends fp32 on WebGPU, so fp32.) */
const PLANS: Record<ModelConfig['device'], { sizeMB: number; realtime: boolean }> = {
  webgpu: { sizeMB: 330, realtime: true },
  wasm: { sizeMB: 95, realtime: false },
};

/** WebGPU if the browser has a working adapter; WebAssembly otherwise. */
export async function detectConfig(): Promise<ModelConfig> {
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    if (gpu && await gpu.requestAdapter()) return WEBGPU;
  } catch { /* no adapter */ }
  return WASM;
}

/** A silent WAV. Playing it inside the click "unlocks" audio in Safari. */
const SILENCE = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';
const CACHE_LIMIT = 120;

interface Request { text: string; voice: string; resolve: (b: Blob) => void; reject: (e: Error) => void }

export class NaturalVoice {
  private worker: WorkerLike | null = null;
  private st: NaturalStatus = { phase: 'idle', loadedBytes: 0, totalBytes: 0, waiting: false };
  private listeners = new Set<() => void>();
  private files = new Map<string, { loaded: number; total: number }>();
  private nextId = 1;
  private pending = new Map<number, Request>();
  private cache = new Map<string, Promise<Blob>>();
  private audio: HTMLAudioElement | null = null;
  private audioUrl: string | null = null;
  private seq = 0;
  private makeWorker: () => WorkerLike;
  private makeAudio: () => HTMLAudioElement;
  private detected: Promise<ModelConfig>;
  /** The config currently loading or loaded. Null until load() has resolved which. */
  private chosen: ModelConfig | null = null;
  /** Resolves once the load message has been SENT — generate requests wait on it. */
  private loadSent: Promise<void> | null = null;

  constructor(
    makeWorker: () => WorkerLike,
    makeAudio: () => HTMLAudioElement = () => new Audio(),
    config: ModelConfig | Promise<ModelConfig> = WASM,
  ) {
    this.makeWorker = makeWorker;
    this.makeAudio = makeAudio;
    this.detected = Promise.resolve(config);
  }

  /** What this device will download and how well it will run — shown BEFORE the user opts in. */
  async plan(): Promise<{ config: ModelConfig; sizeMB: number; realtime: boolean }> {
    const c = this.chosen ?? await this.detected;
    return { config: c, ...PLANS[c.device] };
  }

  /* ---- status, for useSyncExternalStore ---- */
  status = (): NaturalStatus => this.st;
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  private set(patch: Partial<NaturalStatus>) {
    this.st = { ...this.st, ...patch };
    this.listeners.forEach((l) => l());
  }

  /** Start the download (or, if it's cached, just wake the model). Safe to call repeatedly; also retries after an error. */
  load(): Promise<void> {
    if (this.loadSent && this.st.phase !== 'error') return this.loadSent;
    this.set({ phase: 'downloading', error: undefined, loadedBytes: 0, totalBytes: 0 });
    this.loadSent = (this.chosen ? Promise.resolve(this.chosen) : this.detected).then((c) => this.sendLoad(c));
    return this.loadSent;
  }

  private sendLoad(c: ModelConfig) {
    this.chosen = c;
    this.files.clear();
    this.ensureWorker().postMessage({ type: 'load', config: c });
  }

  private ensureWorker(): WorkerLike {
    if (this.worker) return this.worker;
    const w = this.makeWorker();
    w.onmessage = (e) => this.onMessage(e.data);
    this.worker = w;
    return w;
  }

  private current(key: string): boolean {
    return this.chosen !== null && configKey(this.chosen) === key;
  }

  private onMessage(m: FromWorker) {
    switch (m.type) {
      case 'progress': {
        if (!this.current(m.key) || this.st.phase === 'error' || this.st.phase === 'ready') return;
        this.files.set(m.file, { loaded: m.loaded, total: m.total });
        let loaded = 0, total = 0;
        this.files.forEach((f) => { loaded += f.loaded; total += f.total; });
        this.set({ phase: 'downloading', loadedBytes: loaded, totalBytes: total });
        return;
      }
      case 'preparing':
        if (this.current(m.key) && this.st.phase === 'downloading') this.set({ phase: 'preparing' });
        return;
      case 'ready':
        if (this.current(m.key)) this.set({ phase: 'ready', loadedBytes: this.st.totalBytes });
        return;
      case 'load-error':
        if (!this.current(m.key)) return;
        if (this.chosen?.device === 'webgpu') {
          /* WebGPU exists but the model wouldn't run on it (some Safari
             versions): fall back to WebAssembly once, and re-ask for every
             line that was waiting — they're still wanted. */
          this.set({ phase: 'downloading', loadedBytes: 0, totalBytes: 0 });
          this.sendLoad(WASM);
          this.loadSent = Promise.resolve();
          this.pending.forEach((r, id) => this.worker!.postMessage({ type: 'generate', id, text: r.text, voice: r.voice }));
          return;
        }
        /* Final failure. One status change; waiting lines get ModelFailed,
           which engines treat as "stay quiet — the provider is switching". */
        this.cache.clear();
        this.pending.forEach((r) => r.reject(new ModelFailed(m.message)));
        this.pending.clear();
        this.set({ phase: 'error', error: friendly(m.message), waiting: false });
        return;
      case 'audio':
        this.pending.get(m.id)?.resolve(m.wav);
        this.pending.delete(m.id);
        return;
      case 'error': {
        /* A line that failed because the MODEL failed is settled by the
           load-error path above (retried or failed as a whole), not here. */
        if (m.modelFailed) return;
        const r = this.pending.get(m.id);
        this.pending.delete(m.id);
        r?.reject(new Error(m.message));
        return;
      }
    }
  }

  /** Audio for one line, generated once and remembered. */
  synth(text: string, voice: string): Promise<Blob> {
    const key = `${voice}|${text}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const sent = this.load();
    const id = this.nextId++;
    const p = new Promise<Blob>((resolve, reject) => {
      this.pending.set(id, { text, voice, resolve, reject });
    });
    void sent.then(() => this.ensureWorker().postMessage({ type: 'generate', id, text, voice }));
    p.catch(() => this.cache.delete(key));
    this.cache.set(key, p);
    if (this.cache.size > CACHE_LIMIT) this.cache.delete(this.cache.keys().next().value!);
    return p;
  }

  private el(): HTMLAudioElement {
    if (!this.audio) {
      this.audio = this.makeAudio();
      /* Speed up without the chipmunk effect. */
      this.audio.preservesPitch = true;
    }
    return this.audio;
  }

  /** Object URLs hold the audio in memory until revoked — release on every stop. */
  private releaseUrl() {
    if (this.audioUrl) { URL.revokeObjectURL(this.audioUrl); this.audioUrl = null; }
  }

  /** A SpeechEngine speaking with one of the natural voices. */
  engine(voice: string): SpeechEngine {
    const known = NATURAL_VOICES.some((v) => v.id === voice) ? voice : NATURAL_VOICES[0].id;
    return {
      id: `natural:${known}`,
      available: true,
      speak: (text, { rate }, onDone, onError) => {
        const mine = ++this.seq;
        const el = this.el();
        /* Must happen synchronously inside the click, or Safari refuses to
           play the real audio when it arrives a second later. */
        if (!el.src) { el.src = SILENCE; el.play().catch(() => {}); }
        this.set({ waiting: true });
        this.synth(text, known).then((wav) => {
          if (mine !== this.seq) return; // cancelled while generating
          this.set({ waiting: false });
          this.releaseUrl();
          const url = URL.createObjectURL(wav);
          this.audioUrl = url;
          el.onended = () => { if (mine === this.seq) { this.releaseUrl(); onDone(); } };
          /* A decode failure or a lost output device mid-line: without this,
             neither 'ended' nor anything else fires and the reader says
             "Reading aloud" forever. */
          el.onerror = () => { if (mine === this.seq) { this.releaseUrl(); onError?.('The audio for this line couldn’t play. Press play to try again.'); } };
          el.src = url;
          el.playbackRate = rate;
          el.play().catch((e: unknown) => {
            if (mine === this.seq) onError?.(`The browser blocked playback (${e instanceof Error ? e.name : 'unknown'}). Press play again.`);
          });
        }, (e: Error) => {
          if (mine !== this.seq) return;
          this.set({ waiting: false });
          if (e instanceof ModelFailed) return; // the provider switches engines; the hook restarts the line
          onError?.(friendly(e.message));
        });
      },
      prepare: (text) => { void this.synth(text, known).catch(() => {}); },
      cancel: () => {
        this.seq += 1;
        const el = this.audio;
        if (el) { el.onended = null; el.onerror = null; el.pause(); }
        this.releaseUrl();
        if (this.st.waiting) this.set({ waiting: false });
      },
      voices: () => NATURAL_VOICES.map((v) => ({ uri: v.id, name: `${v.label} (${v.accent})`, lang: v.accent === 'US' ? 'en-US' : 'en-GB', score: 100 })),
      onVoicesChanged: () => () => {},
    };
  }
}

function friendly(message: string): string {
  if (/fetch|network|load failed/i.test(message)) return 'The natural voice couldn’t download. Check your connection and try again.';
  if (/memory|allocation/i.test(message)) return 'This device ran out of memory loading the natural voice.';
  return `The natural voice stopped working (${message}).`;
}

/** Can this browser run it at all? (Workers + WebAssembly.) */
export function naturalSupported(): boolean {
  return typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined';
}

let shared: NaturalVoice | null = null;
/** One model per page — loading it twice would double the memory for nothing. */
export function sharedNaturalVoice(): NaturalVoice {
  if (!shared) {
    shared = new NaturalVoice(
      () => new Worker(new URL('./kokoro.worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike,
      undefined,
      detectConfig(),
    );
  }
  return shared;
}
