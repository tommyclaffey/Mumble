// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NaturalVoice, type WorkerLike } from '../readAloud/natural/NaturalVoice';
import type { FromWorker, ToWorker } from '../readAloud/natural/protocol';
import { rankVoices, voiceScore } from '../readAloud/engine';

function fakeWorker() {
  const sent: ToWorker[] = [];
  const w: WorkerLike = { postMessage: (m) => sent.push(m), onmessage: null };
  const reply = (m: FromWorker) => w.onmessage?.({ data: m } as MessageEvent<FromWorker>);
  const gens = () => sent.filter((m): m is Extract<ToWorker, { type: 'generate' }> => m.type === 'generate');
  return { w, sent, reply, gens };
}

function fakeAudio() {
  const el = {
    src: '', playbackRate: 1, preservesPitch: false, onended: null as null | (() => void), onerror: null as null | (() => void),
    plays: [] as string[], paused: false,
    play() { this.plays.push(this.src); return Promise.resolve(); },
    pause() { this.paused = true; },
  };
  return el;
}

const tick = () => new Promise((r) => setTimeout(r, 0));
const WAV = new Blob(['x'], { type: 'audio/wav' });

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:line');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

function setup(config = { device: 'webgpu' as const, dtype: 'fp32' as const }) {
  const fw = fakeWorker();
  const audio = fakeAudio();
  const nv = new NaturalVoice(() => fw.w, () => audio as unknown as HTMLAudioElement, config);
  return { nv, fw, audio };
}

const GPU = 'webgpu/fp32';

describe('natural voice — loading', () => {
  it('asks the worker to load with the detected config, and reports progress across files', async () => {
    const { nv, fw } = setup();
    await nv.load();
    expect(fw.sent[0]).toEqual({ type: 'load', config: { device: 'webgpu', dtype: 'fp32' } });
    fw.reply({ type: 'progress', key: GPU, file: 'model.onnx', loaded: 100, total: 300 });
    fw.reply({ type: 'progress', key: GPU, file: 'config.json', loaded: 1, total: 1 });
    expect(nv.status()).toMatchObject({ phase: 'downloading', loadedBytes: 101, totalBytes: 301 });
    fw.reply({ type: 'preparing', key: GPU });
    expect(nv.status().phase).toBe('preparing');
    fw.reply({ type: 'ready', key: GPU });
    expect(nv.status().phase).toBe('ready');
  });

  it('load is idempotent — pressing twice never downloads twice', async () => {
    const { nv, fw } = setup();
    void nv.load(); await nv.load();
    expect(fw.sent.filter((m) => m.type === 'load')).toHaveLength(1);
  });

  it('a line is never requested before the load has been sent', async () => {
    const { nv, fw } = setup();
    void nv.synth('hello', 'af_heart');
    expect(fw.sent).toHaveLength(0); // the config is still being detected
    await tick();
    expect(fw.sent.map((m) => m.type)).toEqual(['load', 'generate']);
  });

  it('if WebGPU fails to load, it falls back to WebAssembly and re-asks for the waiting lines', async () => {
    const { nv, fw } = setup();
    void nv.synth('line one', 'af_heart');
    await tick();
    fw.reply({ type: 'load-error', key: GPU, message: 'webgpu op not supported' });
    expect(fw.sent.slice(2)).toEqual([
      { type: 'load', config: { device: 'wasm', dtype: 'q8' } },
      { type: 'generate', id: 1, text: 'line one', voice: 'af_heart' },
    ]);
    expect(nv.status().phase).toBe('downloading');
    expect((await nv.plan()).realtime).toBe(false);
  });

  it('messages from the abandoned WebGPU load are ignored', async () => {
    const { nv, fw } = setup();
    await nv.load();
    fw.reply({ type: 'load-error', key: GPU, message: 'nope' });
    fw.reply({ type: 'ready', key: GPU });
    fw.reply({ type: 'load-error', key: GPU, message: 'nope again' });
    expect(nv.status().phase).toBe('downloading'); // still loading WebAssembly, not "ready", not "error"
  });

  it('a per-line error caused by the model failing does not fail the line', async () => {
    const { nv, fw } = setup();
    const p = nv.synth('line one', 'af_heart');
    let settled = false;
    p.then(() => { settled = true; }, () => { settled = true; });
    await tick();
    fw.reply({ type: 'error', id: 1, message: 'model gone', modelFailed: true });
    await tick();
    expect(settled).toBe(false); // it's the load-error path's job to retry or fail it
  });

  it('a final failure is one status change, not a failed line each', async () => {
    const { nv, fw } = setup({ device: 'wasm', dtype: 'q8' } as never);
    const onError = vi.fn();
    nv.engine('af_heart').speak('line one', { rate: 1 }, () => {}, onError);
    await tick();
    fw.reply({ type: 'load-error', key: 'wasm/q8', message: 'Failed to fetch' });
    await tick();
    expect(nv.status().phase).toBe('error');
    expect(nv.status().error).toMatch(/couldn’t download/);
    expect(onError).not.toHaveBeenCalled(); // the provider falls back instead
  });

  it('progress after a failure can’t un-fail it', async () => {
    const { nv, fw } = setup({ device: 'wasm', dtype: 'q8' } as never);
    await nv.load();
    fw.reply({ type: 'load-error', key: 'wasm/q8', message: 'x' });
    fw.reply({ type: 'progress', key: 'wasm/q8', file: 'model.onnx', loaded: 1, total: 2 });
    expect(nv.status().phase).toBe('error');
  });

  it('load() after an error retries', async () => {
    const { nv, fw } = setup({ device: 'wasm', dtype: 'q8' } as never);
    await nv.load();
    fw.reply({ type: 'load-error', key: 'wasm/q8', message: 'x' });
    await nv.load();
    expect(fw.sent.filter((m) => m.type === 'load')).toHaveLength(2);
    expect(nv.status().phase).toBe('downloading');
  });

  it('states size and speed before anyone opts in', async () => {
    expect(await setup().nv.plan()).toMatchObject({ sizeMB: 330, realtime: true });
    expect(await setup({ device: 'wasm', dtype: 'q8' } as never).nv.plan()).toMatchObject({ sizeMB: 95, realtime: false });
  });
});

describe('natural voice — speaking', () => {
  it('generates each line once, however often it is asked for', async () => {
    const { nv, fw } = setup();
    void nv.synth('hello', 'af_heart');
    void nv.synth('hello', 'af_heart');
    await tick();
    expect(fw.gens()).toHaveLength(1);
    void nv.synth('hello', 'bf_emma');
    await tick();
    expect(fw.gens()).toHaveLength(2); // a different voice is a different recording
  });

  it('plays the line when its audio arrives, at the chosen speed, without the chipmunk effect', async () => {
    const { nv, fw, audio } = setup();
    const done = vi.fn();
    nv.engine('af_heart').speak('Line one.', { rate: 1.5 }, done);
    expect(audio.plays[0]).toMatch(/^data:audio\/wav/); // Safari unlock, inside the click
    expect(nv.status().waiting).toBe(true);
    await tick();
    fw.reply({ type: 'audio', id: fw.gens()[0].id, wav: WAV });
    await tick();
    expect(nv.status().waiting).toBe(false);
    expect(audio.plays[1]).toBe('blob:line');
    expect(audio.playbackRate).toBe(1.5);
    expect(audio.preservesPitch).toBe(true);
    audio.onended!();
    expect(done).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:line');
  });

  it('cancelling while a line is generating means it never plays', async () => {
    const { nv, fw, audio } = setup();
    const e = nv.engine('af_heart');
    const done = vi.fn();
    e.speak('Line one.', { rate: 1 }, done);
    e.cancel();
    await tick();
    fw.reply({ type: 'audio', id: fw.gens()[0].id, wav: WAV });
    await tick();
    expect(audio.plays.filter((s) => s === 'blob:line')).toHaveLength(0);
    expect(done).not.toHaveBeenCalled();
  });

  it('cancelling mid-line releases the audio memory', async () => {
    const { nv, fw } = setup();
    const e = nv.engine('af_heart');
    e.speak('Line one.', { rate: 1 }, () => {});
    await tick();
    fw.reply({ type: 'audio', id: fw.gens()[0].id, wav: WAV });
    await tick();
    e.cancel();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:line');
  });

  it('an audio error mid-line reports, instead of "Reading aloud" forever', async () => {
    const { nv, fw, audio } = setup();
    const onError = vi.fn();
    nv.engine('af_heart').speak('Line one.', { rate: 1 }, () => {}, onError);
    await tick();
    fw.reply({ type: 'audio', id: fw.gens()[0].id, wav: WAV });
    await tick();
    (audio as unknown as { onerror: () => void }).onerror();
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/couldn’t play/));
  });

  it('prepare() starts the next line early, so it is ready when needed', async () => {
    const { nv, fw } = setup();
    const e = nv.engine('af_heart');
    e.prepare!('Line two.');
    await tick();
    expect(fw.gens().map((g) => g.text)).toEqual(['Line two.']);
    e.speak('Line two.', { rate: 1 }, () => {});
    await tick();
    expect(fw.gens()).toHaveLength(1); // reused, not regenerated
  });

  it('a line that fails on its own reports an error', async () => {
    const { nv, fw } = setup();
    const onError = vi.fn();
    nv.engine('af_heart').speak('Line one.', { rate: 1 }, () => {}, onError);
    await tick();
    fw.reply({ type: 'error', id: fw.gens()[0].id, message: 'boom', modelFailed: false });
    await tick();
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/stopped working/));
  });

  it('an unknown voice id falls back to the default voice', () => {
    const { nv } = setup();
    expect(nv.engine('nope').id).toBe('natural:af_heart');
  });
});

describe('device voices are ranked, best first', () => {
  const v = (name: string, lang = 'en-US') => ({ name, lang });
  it('premium, natural and Google voices beat the compact default', () => {
    const ranked = rankVoices([v('Samantha'), v('Ava (Premium)'), v('Google US English'), v('Microsoft Aria Online (Natural) - English (United States)')], 'en-US');
    expect(ranked.map((r) => r.name)).toEqual([
      'Ava (Premium)', 'Microsoft Aria Online (Natural) - English (United States)', 'Google US English', 'Samantha',
    ]);
  });
  it('novelty voices are hidden entirely', () => {
    expect(rankVoices([v('Bubbles'), v('Bad News'), v('Zarvox'), v('Samantha')]).map((r) => r.name)).toEqual(['Samantha']);
  });
  it('other languages rank last and never get chosen automatically', () => {
    expect(voiceScore(v('Thomas', 'fr-FR'), 'en-US')).toBe(0);
    expect(voiceScore(v('Daniel', 'en-GB'), 'en-US')).toBeGreaterThan(0);
  });
});
