/**
 * Messages between the page and the natural-voice worker.
 *
 * The model runs in a Web Worker so generating speech never freezes the page —
 * on the main thread, every line would stall scrolling and clicks for a second.
 */

export const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';

export type Device = 'wasm' | 'webgpu';
export type Dtype = 'fp32' | 'fp16' | 'q8' | 'q4' | 'q4f16';
export interface ModelConfig { device: Device; dtype: Dtype }

export type ToWorker =
  | { type: 'load'; config: ModelConfig }
  | { type: 'generate'; id: number; text: string; voice: string };

export const configKey = (c: ModelConfig) => `${c.device}/${c.dtype}`;

/**
 * Model-level messages carry the `key` of the config they belong to, so a
 * message from an abandoned load (the WebGPU attempt, after falling back to
 * WebAssembly) can be recognised and ignored instead of flipping the status.
 */
export type FromWorker =
  | { type: 'progress'; key: string; file: string; loaded: number; total: number }
  | { type: 'preparing'; key: string }
  | { type: 'ready'; key: string }
  | { type: 'load-error'; key: string; message: string }
  | { type: 'audio'; id: number; wav: Blob }
  /** `modelFailed`: this line failed only because the model did — not the line's own fault. */
  | { type: 'error'; id: number; message: string; modelFailed: boolean };

/**
 * The voices offered. Kokoro ships ~28 English voices; most are graded C or
 * lower by their own authors. These are the ones graded B- or better, so every
 * choice on the list is a good one.
 */
export const NATURAL_VOICES = [
  { id: 'af_heart', label: 'Heart', accent: 'US' },
  { id: 'af_bella', label: 'Bella', accent: 'US' },
  { id: 'af_nicole', label: 'Nicole', accent: 'US' },
  { id: 'am_michael', label: 'Michael', accent: 'US' },
  { id: 'am_fenrir', label: 'Fenrir', accent: 'US' },
  { id: 'am_puck', label: 'Puck', accent: 'US' },
  { id: 'bf_emma', label: 'Emma', accent: 'UK' },
  { id: 'bm_george', label: 'George', accent: 'UK' },
] as const;

export type NaturalVoiceId = (typeof NATURAL_VOICES)[number]['id'];
export const DEFAULT_NATURAL_VOICE: NaturalVoiceId = 'af_heart';
