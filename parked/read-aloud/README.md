# Parked: read-aloud (Sept 30, 2026)

**Why parked:** Mumble's captures are *recordings*. Pressing play should play
the recording, not have a synthetic voice read the transcript. Tommy, Sept 30:
*"Work on maybe a read-out-loud feature later — just one really good voice."*

This folder is a snapshot of the working feature at the moment it was parked,
so the later version starts from here, not from nothing. It's outside `src/`,
so it isn't built, type-checked, linted or tested.

## What's here and whether to keep it

| Piece | Keep for the one-voice version? |
|---|---|
| `natural/` — Kokoro-82M in a Web Worker, WebGPU fp32 / WASM q8 fallback, load-error fallback, per-line cache + prefetch, Safari audio unlock | ✅ **Yes — this IS the one good voice.** Drop the voice picker (8 voices → 1: `af_heart`). |
| `useReadAloud.ts` — line-by-line player, cancel tokens, engine switching | ✅ Yes |
| `engine.ts` — device voices ranked, word boundaries | ⚠️ Only as the fallback if the model can't load |
| `ReaderBar` — "Line 4 of 18", announcer, keyboard hints | ✅ Mostly — the new recording player borrowed its structure |
| `SettingsScreen.tsx` — Natural / This device switch, download progress | ⚠️ Simplify to one toggle + download progress |
| Tests (`readAloud`, `naturalVoice`, `deviceEngine`) | ✅ Yes — 40+ tests of the tricky parts |

## Measured (real Chrome, M-series Mac, one 5-second line)

| Model | Download | Time to generate |
|---|---|---|
| WebGPU fp32 ✅ | 326 MB | ~0.7 s |
| WebGPU fp16 | 163 MB | ~0.7 s (output measured different — not chosen) |
| WASM q8 (fallback) | 92 MB | ~9 s — slower than real time |

## Known limits
- The ONNX export outputs only `waveform` — no word timings, so no word
  highlight with the natural voice.
- 326 MB is a lot for a web app. Consider generating on demand per document
  and caching, not per line.

## Reviving it
The files mirror `src/`. `CaptureScreen.tsx`, `store.tsx` and
`screens.test.tsx` here are the versions from when read-aloud was wired in —
use them as a reference for the wiring, not as drop-in replacements.
