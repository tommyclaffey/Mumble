/**
 * Speaker-label accuracy test — option A, the in-browser models (Oct 7).
 *
 *   node scripts/speaker-test.mjs
 *
 * The question: if Meeting mode ran entirely in the browser, how often would
 * it put the right name on a line? This answers it with a number, on the
 * demo meetings, where we KNOW who said every line.
 *
 * Same models, same library (Transformers.js) the browser would run — here
 * in Node, so it can be scored. Two ways of doing it:
 *
 *   by line      one voiceprint per transcript line, then group the lines
 *                into as many people as were in the meeting. Mumble already
 *                has lines with start times, so this is the simple version.
 *   full         the standard recipe: the segmentation model finds who
 *                speaks when (10-second windows, up to 3 voices each), a
 *                voiceprint per voice per window, then group them across
 *                the whole recording. Doesn't use the lines at all.
 *
 * Both are told how many people were there (the attendee list), and both
 * also run blind, guessing the number of people themselves.
 *
 * ⚠️ The demo voices are synthetic (Kokoro) — clean, consistent, nobody
 * talking over anyone. Real meetings are harder. Treat this as the ceiling.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { AutoModel, AutoModelForAudioFrameClassification, AutoProcessor } from '@huggingface/transformers';
import { teamCaptures } from '../src/data/teamDemo.ts';

const SR = 16000;
const timings = JSON.parse(readFileSync('src/data/demoAudio.json', 'utf8'));
/* "Speaker 3" in Product Sync is Sarah's voice — the demo is about the model
   not knowing that yet. For scoring, the truth is the voice. */
const TRUE_NAME = { 'Speaker 3': 'Sarah Lee' };
/* Chosen before looking at any result: two voiceprints at least this
   similar are treated as one person when the number of people is unknown. */
const SAME_PERSON = 0.5;

function decode(file) {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 256 * 1024 * 1024 });
  return new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
}
const slice = (pcm, a, b) => pcm.subarray(Math.max(0, Math.floor(a * SR)), Math.min(pcm.length, Math.floor(b * SR)));
const norm = (v) => { const n = Math.hypot(...v) || 1; return v.map((x) => x / n); };
const cos = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);

/* ---- models ------------------------------------------------------------ */
const SEG = 'onnx-community/pyannote-segmentation-3.0';
const EMB = 'onnx-community/wespeaker-voxceleb-resnet34-LM';
const segProc = await AutoProcessor.from_pretrained(SEG);
const segModel = await AutoModelForAudioFrameClassification.from_pretrained(SEG, { dtype: 'fp32' });
const embProc = await AutoProcessor.from_pretrained(EMB);
const embModel = await AutoModel.from_pretrained(EMB, { dtype: 'fp32' });

async function voiceprint(pcm) {
  const out = await embModel(await embProc(pcm));
  const t = out.last_hidden_state ?? out.embeddings ?? Object.values(out)[0];
  return norm(Array.from(t.data));
}

/* ---- grouping: average-linkage, merge the closest pair until done ------- */
function group(prints, k) {
  let clusters = prints.map((_, i) => [i]);
  const sim = (A, B) => { let s = 0; for (const a of A) for (const b of B) s += cos(prints[a], prints[b]); return s / (A.length * B.length); };
  while (clusters.length > 1) {
    let best = [-1, -1, -Infinity];
    for (let i = 0; i < clusters.length; i++) for (let j = i + 1; j < clusters.length; j++) {
      const s = sim(clusters[i], clusters[j]); if (s > best[2]) best = [i, j, s];
    }
    if (k ? clusters.length <= k : best[2] < SAME_PERSON) break;
    clusters[best[0]] = clusters[best[0]].concat(clusters[best[1]]);
    clusters.splice(best[1], 1);
  }
  const label = new Array(prints.length);
  clusters.forEach((c, ci) => c.forEach((i) => { label[i] = ci; }));
  return { label, count: clusters.length };
}

/* ---- scoring: best one-to-one match of groups to real people ------------ */
function score(pred, truth) {
  const people = [...new Set(truth)];
  const groups = [...new Set(pred.filter((p) => p !== undefined))];
  let best = 0;
  const perm = (left, used, map) => {
    if (!left.length) {
      best = Math.max(best, pred.filter((p, i) => p !== undefined && map.get(p) === truth[i]).length);
      return;
    }
    const [g, ...rest] = left;
    perm(rest, used, map); // this group matches nobody
    for (const p of people) if (!used.has(p)) { map.set(g, p); used.add(p); perm(rest, used, map); used.delete(p); map.delete(g); }
  };
  perm(groups, new Set(), new Map());
  return best;
}

/* ---- the two methods ------------------------------------------------------ */
async function byLine(pcm, starts, duration, k) {
  const prints = [];
  for (let i = 0; i < starts.length; i++) prints.push(await voiceprint(slice(pcm, starts[i], (starts[i + 1] ?? duration) - 0.2)));
  return group(prints, k);
}

async function full(pcm, starts, duration, k) {
  /* Who speaks when, in 10-second windows. ids 1–3 are the window's voices;
     0 is silence, 4–6 are two people at once (skipped). */
  const segs = [];
  for (let w = 0; w * 10 < duration; w++) {
    const chunk = slice(pcm, w * 10, w * 10 + 10);
    if (chunk.length < SR) continue;
    const { logits } = await segModel(await segProc(chunk));
    const [res] = segProc.post_process_speaker_diarization(logits, chunk.length);
    for (const s of res) if (s.id >= 1 && s.id <= 3 && s.end - s.start >= 0.3) segs.push({ w, id: s.id, start: w * 10 + s.start, end: w * 10 + s.end });
  }
  /* One voiceprint per voice per window. */
  const keys = [...new Set(segs.map((s) => `${s.w}:${s.id}`))];
  const prints = [];
  for (const key of keys) {
    const parts = segs.filter((s) => `${s.w}:${s.id}` === key).map((s) => slice(pcm, s.start, s.end));
    const joined = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0; for (const p of parts) { joined.set(p, o); o += p.length; }
    prints.push(await voiceprint(joined));
  }
  const g = group(prints, k);
  for (const s of segs) s.who = g.label[keys.indexOf(`${s.w}:${s.id}`)];
  /* Each line goes to whoever the model heard most during it. */
  const label = starts.map((a, i) => {
    const b = starts[i + 1] ?? duration;
    const time = new Map();
    for (const s of segs) { const t = Math.min(b, s.end) - Math.max(a, s.start); if (t > 0) time.set(s.who, (time.get(s.who) ?? 0) + t); }
    return [...time.entries()].sort((x, y) => y[1] - x[1])[0]?.[0];
  });
  return { label, count: g.count };
}

/* ---- run ----------------------------------------------------------------- */
const meetings = teamCaptures(new Date()).filter((c) => c.kind === 'meeting');
const rows = [];
for (const m of meetings) {
  const pcm = decode(`public/demo-audio/${m.id}.m4a`);
  const t = timings[m.id];
  const truth = m.lines.map((l) => { const n = m.speakers.find((s) => s.id === l.speakerId).name; return TRUE_NAME[n] ?? n; });
  const k = new Set(truth).size;
  const row = { id: m.id, title: m.title, lines: truth.length, people: k };
  for (const [name, fn] of [['byLine', byLine], ['full', full]]) {
    const known = await fn(pcm, t.starts, t.duration, k);
    const blind = await fn(pcm, t.starts, t.duration, 0);
    row[`${name}Known`] = score(known.label, truth);
    row[`${name}Blind`] = score(blind.label, truth);
    row[`${name}BlindCount`] = blind.count;
  }
  rows.push(row);
  console.log(JSON.stringify(row));
}

const total = rows.reduce((n, r) => n + r.lines, 0);
const pct = (key) => Math.round((rows.reduce((n, r) => n + r[key], 0) / total) * 100);
const summary = {
  lines: total,
  byLineKnown: pct('byLineKnown'), byLineBlind: pct('byLineBlind'),
  fullKnown: pct('fullKnown'), fullBlind: pct('fullBlind'),
};
console.log('\nRight person, % of lines:', summary);
writeFileSync('speaker-test-results.json', JSON.stringify({ when: new Date().toISOString(), models: [SEG, EMB], rows, summary }, null, 2) + '\n');
