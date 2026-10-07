/// <reference lib="webworker" />
/**
 * Meeting mode's models, off the main thread so the app never freezes.
 *
 * The same two models the Oct 7 accuracy test used, through Transformers.js:
 *   · pyannote segmentation 3.0 (6.5 MB): who speaks when, 10 s at a time,
 *     up to 3 voices per window
 *   · WeSpeaker ResNet34 (26.5 MB): a voiceprint for each voice
 *
 * They download from Hugging Face the first time and are cached by the
 * browser after that. The AUDIO never leaves: it arrives here as numbers
 * from the page and the answer goes back the same way.
 *
 * In:  { pcm: Float32Array (16 kHz mono), people: number | null }
 * Out: progress messages, then { spans } or { error }.
 */
import { AutoModel, AutoModelForAudioFrameClassification, AutoProcessor, env, type PreTrainedModel, type Processor } from '@huggingface/transformers';
import { fitOf, groupVoices, unit, type VoiceSpan } from './diarize';

const SR = 16000;
const SEG = 'onnx-community/pyannote-segmentation-3.0';
const EMB = 'onnx-community/wespeaker-voxceleb-resnet34-LM';
env.allowLocalModels = false;

type Msg =
  | { type: 'progress'; stage: 'download'; percent: number }
  | { type: 'progress'; stage: 'listen'; done: number; total: number }
  | { type: 'done'; spans: VoiceSpan[]; people: number }
  | { type: 'error'; message: string };
const post = (m: Msg) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

let models: Promise<{ segProc: Processor; seg: PreTrainedModel; embProc: Processor; emb: PreTrainedModel }> | null = null;
function load() {
  if (models) return models;
  /* One percentage across all the files, as they arrive. */
  const files = new Map<string, { loaded: number; total: number }>();
  const progress_callback = (p: { status: string; file?: string; loaded?: number; total?: number }) => {
    if (p.status !== 'progress' || !p.file || !p.total) return;
    files.set(p.file, { loaded: p.loaded ?? 0, total: p.total });
    let loaded = 0; let total = 0;
    for (const f of files.values()) { loaded += f.loaded; total += f.total; }
    post({ type: 'progress', stage: 'download', percent: Math.round((loaded / total) * 100) });
  };
  models = Promise.all([
    AutoProcessor.from_pretrained(SEG, { progress_callback }),
    AutoModelForAudioFrameClassification.from_pretrained(SEG, { dtype: 'fp32', progress_callback }),
    AutoProcessor.from_pretrained(EMB, { progress_callback }),
    AutoModel.from_pretrained(EMB, { dtype: 'fp32', progress_callback }),
  ]).then(([segProc, seg, embProc, emb]) => ({ segProc, seg, embProc, emb }));
  models.catch(() => { models = null; }); // a failed download can be retried
  return models;
}

self.onmessage = async (e: MessageEvent<{ pcm: Float32Array; people: number | null }>) => {
  try {
    const { pcm, people } = e.data;
    const { segProc, seg, embProc, emb } = await load();
    const windows = Math.ceil(pcm.length / (10 * SR));

    /* 1 · Who speaks when, window by window. Class 1–3 = one of the
       window's voices; 0 = silence; 4–6 = two at once (skipped). */
    const found: { w: number; id: number; start: number; end: number }[] = [];
    for (let w = 0; w < windows; w++) {
      const chunk = pcm.subarray(w * 10 * SR, Math.min(pcm.length, (w + 1) * 10 * SR));
      if (chunk.length >= SR) {
        const { logits } = await seg(await segProc(chunk));
        const [res] = (segProc as unknown as { post_process_speaker_diarization: (l: unknown, n: number) => { id: number; start: number; end: number }[][] })
          .post_process_speaker_diarization(logits, chunk.length);
        for (const s of res) if (s.id >= 1 && s.id <= 3 && s.end - s.start >= 0.3) found.push({ w, id: s.id, start: w * 10 + s.start, end: w * 10 + s.end });
      }
      post({ type: 'progress', stage: 'listen', done: w + 1, total: windows });
    }

    /* 2 · One voiceprint per voice per window. */
    const keys = [...new Set(found.map((s) => `${s.w}:${s.id}`))];
    const prints: number[][] = [];
    for (const key of keys) {
      const parts = found.filter((s) => `${s.w}:${s.id}` === key).map((s) => pcm.subarray(Math.floor(s.start * SR), Math.floor(s.end * SR)));
      const joined = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
      let o = 0;
      for (const p of parts) { joined.set(p, o); o += p.length; }
      const out = await emb(await embProc(joined));
      const t = (out.last_hidden_state ?? out.embeddings ?? Object.values(out)[0]) as { data: Float32Array };
      prints.push(unit(Array.from(t.data)));
    }

    /* 3 · The same person across windows. */
    const g = groupVoices(prints, people);
    const fit = fitOf(prints, g.label, g.count);
    const spans: VoiceSpan[] = found.map((s) => {
      const k = keys.indexOf(`${s.w}:${s.id}`);
      return { start: s.start, end: s.end, who: g.label[k], fit: fit[k] };
    });
    post({ type: 'done', spans, people: g.count });
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
