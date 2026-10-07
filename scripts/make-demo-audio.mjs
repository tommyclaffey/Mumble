/**
 * Make the demo recordings.
 *
 *   node scripts/make-demo-audio.mjs
 *
 * The demo captures are transcripts with no audio. A reviewer pressing play
 * should HEAR a recording, so each one is voiced once, here, offline, with the
 * natural voice (Kokoro-82M) — a different voice per person — and saved as a
 * static file. Labelled "Demo recording" in the app.
 *
 * ⭐ The line timings come from the audio, not an estimate: each line's start
 * is where its audio actually begins in the file, so the highlighted line
 * matches what you hear. Written to src/data/demoAudio.json.
 *
 * Needs ffmpeg (brew install ffmpeg). Downloads the model (~330 MB) once.
 *
 * Covers the team demo's recordings too (src/data/teamDemo.ts). To voice only
 * some and keep the rest as they are:
 *
 *   ONLY=t1,t2 node scripts/make-demo-audio.mjs
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KokoroTTS } from 'kokoro-js';
import { teamCaptures } from '../src/data/teamDemo.ts';

const RATE = 24000;
const LEAD_IN = 0.3;         // seconds of room tone before the first word
const SAME_SPEAKER = 0.35;   // pause between two lines from one person
const TURN = 0.65;           // pause when the speaker changes

/* Who each voice is. "Speaker 3" in Product Sync is Sarah — the diarizer just
   doesn't know yet, which is the point of that demo — so she gets her voice. */
const PERSON_VOICE = {
  You: 'am_michael', 'Maya Chen': 'af_heart', 'John Park': 'am_fenrir',
  'Sarah Lee': 'af_bella', 'Speaker 3': 'af_bella', 'Alex Rivera': 'am_puck', 'Dana Whitfield': 'bf_emma',
  'Nadia Haddad': 'af_nicole',
};
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const JSON_PATH = join('src', 'data', 'demoAudio.json');

const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'fp32', device: 'cpu' });
/* Keep what's there for anything not being remade. */
const out = ONLY && existsSync(JSON_PATH) ? JSON.parse(readFileSync(JSON_PATH, 'utf8')) : {};
const tmp = join(tmpdir(), `mumble-demo-audio-${Date.now()}`);
mkdirSync(tmp, { recursive: true });

/* teamCaptures = the five personal demo recordings + the team's own. */
for (const c of teamCaptures(new Date()).filter((x) => !ONLY || ONLY.has(x.id))) {
  const chunks = [];
  const starts = [];
  let t = LEAD_IN;
  chunks.push(new Float32Array(Math.round(LEAD_IN * RATE)));
  let lastSpeaker;
  for (const [i, line] of c.lines.entries()) {
    /* A note is in the voice of whoever recorded it. */
    const who = c.kind === 'meeting' ? c.speakers.find((s) => s.id === line.speakerId)?.name ?? 'You' : c.recordedBy ?? 'You';
    const voice = PERSON_VOICE[who] ?? 'am_michael';
    if (i > 0) {
      const gap = line.speakerId === lastSpeaker ? SAME_SPEAKER : TURN;
      chunks.push(new Float32Array(Math.round(gap * RATE)));
      t += gap;
    }
    const audio = await tts.generate(line.text, { voice });
    starts.push(Math.round(t * 100) / 100);
    chunks.push(audio.audio);
    t += audio.audio.length / RATE;
    lastSpeaker = line.speakerId;
    process.stdout.write(`\r${c.id} ${i + 1}/${c.lines.length}   `);
  }
  chunks.push(new Float32Array(Math.round(0.4 * RATE)));
  const total = chunks.reduce((n, a) => n + a.length, 0);
  const pcm = new Float32Array(total);
  let o = 0;
  for (const a of chunks) { pcm.set(a, o); o += a.length; }

  const raw = join(tmp, `${c.id}.f32`);
  writeFileSync(raw, Buffer.from(pcm.buffer));
  /* AAC in .m4a: plays in every browser, ~0.4 MB a minute at 48 kbps mono. */
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'f32le', '-ar', String(RATE), '-ac', '1', '-i', raw,
    '-c:a', 'aac', '-b:a', '48k', join('public', 'demo-audio', `${c.id}.m4a`)]);
  out[c.id] = { duration: Math.round((total / RATE) * 100) / 100, starts };
  console.log(`\r${c.id}: ${c.lines.length} lines, ${out[c.id].duration}s`);
}

writeFileSync(JSON_PATH, JSON.stringify(out, null, 2) + '\n');
rmSync(tmp, { recursive: true, force: true });
console.log('Wrote public/demo-audio/*.m4a and src/data/demoAudio.json');
