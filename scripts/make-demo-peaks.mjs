/**
 * Waveform peaks for the demo recordings.
 *
 * Every waveform in Mumble is the SHAPE OF THE REAL AUDIO, not decoration —
 * a voice app drawing made-up bars would be the same lie as a progress bar
 * pretending to be audio. This decodes each demo file with ffmpeg and keeps
 * 160 loudness values (RMS per slice, scaled 0–1) in src/data/demoPeaks.json.
 *
 * Recordings made in the browser get theirs at save time (see waveform.ts).
 *
 *   node scripts/make-demo-peaks.mjs     (needs ffmpeg; rerun after make-demo-audio)
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'public/demo-audio';
const BUCKETS = 160;
const out = {};

for (const file of readdirSync(DIR).filter((f) => f.endsWith('.m4a')).sort()) {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', join(DIR, file), '-ac', '1', '-ar', '8000', '-f', 'f32le', '-'], { maxBuffer: 64 * 1024 * 1024 });
  const samples = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
  const size = Math.floor(samples.length / BUCKETS);
  const rms = [];
  for (let b = 0; b < BUCKETS; b++) {
    let sum = 0;
    for (let i = b * size; i < (b + 1) * size; i++) sum += samples[i] * samples[i];
    rms.push(Math.sqrt(sum / size));
  }
  const max = Math.max(...rms) || 1;
  out[file.replace('.m4a', '')] = rms.map((v) => Math.round((v / max) * 100) / 100);
  console.log(file, `${samples.length} samples → ${BUCKETS} peaks`);
}

writeFileSync('src/data/demoPeaks.json', `${JSON.stringify(out)}\n`);
console.log('wrote src/data/demoPeaks.json');
