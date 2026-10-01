/// <reference lib="webworker" />
import { KokoroTTS } from 'kokoro-js';
import { MODEL_ID, configKey, type FromWorker, type ModelConfig, type ToWorker } from './protocol';

/**
 * The natural voice, running off the main thread.
 *
 * Which weights run is decided by the page (see detectConfig): full-precision
 * on WebGPU where the browser has it — measured ~0.7s to generate a 5s line,
 * so it stays far ahead of playback — and 8-bit on WebAssembly otherwise,
 * which is smaller but slower than real time.
 *
 * Generation is SERIAL. The model session can't run two lines at once, so
 * requests queue behind each other. The page only ever asks for the current
 * line and the next two, so the queue stays short.
 */

const post = (m: FromWorker, transfer: Transferable[] = []) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m, transfer);

/**
 * One model at a time, identified by its config key. Asking for a DIFFERENT
 * config (the page falling back from WebGPU to WebAssembly) replaces it —
 * never ignored, which is what used to strand the fallback.
 */
let current: { key: string; promise: Promise<KokoroTTS> } | null = null;
let queue: Promise<unknown> = Promise.resolve();

function load(config: ModelConfig): Promise<KokoroTTS> {
  const key = configKey(config);
  if (current?.key === key) return current.promise;

  const promise = KokoroTTS.from_pretrained(MODEL_ID, {
    dtype: config.dtype,
    device: config.device,
    progress_callback: (p) => {
      if (current?.key !== key) return;
      if (p.status === 'progress') post({ type: 'progress', key, file: p.file, loaded: p.loaded, total: p.total });
      /* Only the model file finishing means "download over". Small files
         finish first and used to flip the status back and forth. */
      if (p.status === 'done' && /\.onnx$/.test(p.file)) post({ type: 'preparing', key });
    },
  }).then(async (tts) => {
    /* The first generation on WebGPU compiles its shaders (~2s). Do it now so
       the user's first line isn't the slow one — and if generating fails on
       this device, the LOAD fails, so the fallback kicks in. */
    await tts.generate('Ready.', { voice: 'af_heart' });
    return tts;
  });

  current = { key, promise };
  promise.then(
    () => { if (current?.key === key) post({ type: 'ready', key }); },
    (e: unknown) => {
      if (current?.key !== key) return;
      current = null; // retryable, not cached forever
      post({ type: 'load-error', key, message: e instanceof Error ? e.message : String(e) });
    },
  );
  return promise;
}

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  if (msg.type === 'load') { void load(msg.config).catch(() => {}); return; }
  if (msg.type === 'generate') {
    queue = queue.then(async () => {
      /* Generating never STARTS a load — only the page decides what loads.
         (Queued lines each restarting a failed load was a bug.) */
      const model = current?.promise;
      if (!model) {
        post({ type: 'error', id: msg.id, message: 'The voice model isn’t loaded.', modelFailed: true });
        return;
      }
      let tts: KokoroTTS;
      try { tts = await model; } catch (err) {
        post({ type: 'error', id: msg.id, message: err instanceof Error ? err.message : String(err), modelFailed: true });
        return;
      }
      try {
        const audio = await tts.generate(msg.text, { voice: msg.voice as never });
        post({ type: 'audio', id: msg.id, wav: audio.toBlob() });
      } catch (err) {
        post({ type: 'error', id: msg.id, message: err instanceof Error ? err.message : String(err), modelFailed: false });
      }
    });
  }
};
