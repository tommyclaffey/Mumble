# Mumble — Backlog

Newest decisions at the top of each section.

## 🔴 Open decisions (Tommy's call)

- **Real Meeting mode.** Needs a server-side model with diarization (e.g. a
  hosted speech API). That is a cost and a privacy decision, not a code one.
- **AI summaries for recorded notes.** Same shape as Growth's assistant (a dev
  server route holding the Anthropic key). Parked until Meeting mode is decided
  — both need the same "does audio/text leave the browser" answer.

## 🟡 Design-system gaps found by building (push back into Figma)

- **(Oct 1 redesign) "Pinned tags" → "Top tags".** The Figma sidebar says
  *Pinned*; there's no pinning in the demo, so the code lists the four most-used
  tags and says so. Either build pinning or rename it in Figma.
- **(Oct 1 redesign) Tasks keeps a Status column.** The Figma frame dropped it as
  a duplicate of the group heading — but it's the only control that moves a
  task between groups. Kept, styled as a pill. Figma should show it.
- **(Oct 1 redesign) The record meter is your real mic level** (AnalyserNode);
  the Figma frame's bars are illustrative. Flat until you speak.

- **`border/control` is new** — added in code as `--border-control`
  (neutral-500). The file's only border token is invisible on form controls.
- **`--text-secondary` (#80808C) fails AA** for small text on white (3.9:1).
  Code uses `--text-muted` for any meta text a reader needs. Figma should either
  darken the token or restrict it to ≥18px.
- **Speaker colours don't exist.** Figma defines one accent. Avatars use
  accent/neutral steps as stand-ins (`Avatar.css`). Needs a real 5-step ramp.
- **Focus ring, low-confidence tone, border widths** — the three original gaps,
  still defined only in code (`tokens.css`, "NOT IN THE FIGMA FILE" block).
- **Figma Settings screen** has Account / Integrations / Notifications / Plan.
  None exist in the demo, so the built Settings has only Read aloud + Demo
  data. Either design what the demo can honour, or mark those as future.

## 🟢 Next build ideas

- **Read-aloud, one really good voice** (Tommy, Sept 30). Start from
  `parked/read-aloud/` — its README says what to keep. One voice (`af_heart`),
  no picker. Probably generate per document on demand, not per line.

- *(read-aloud, parked)* **Word-by-word highlight with the natural voice.** Checked Sept 30: the ONNX
  export (onnx-community/Kokoro-82M-v1.0-ONNX) outputs ONLY `waveform` — no
  per-phoneme durations. The PyTorch model has them (`pred_dur`), so it needs a
  re-export with a durations output. Not faked with an estimate meanwhile.
- *(read-aloud, parked)* **Faster natural voice without WebGPU.** WebAssembly runs single-threaded
  here (~9s per 5s line). Multi-threading needs cross-origin isolation (COOP/COEP
  headers); GitHub Pages can't send them, but `coi-serviceworker` can.
- *(read-aloud, parked)* **Half-size WebGPU model.** fp16 was as fast as fp32 at 163 MB vs 326 MB, but
  its output measured clearly different. Needs a listening test before switching.

- Word-level highlighting inside the current line (`SpeechSynthesisUtterance`
  `boundary` events). Most voices support it; Safari's are patchy.
- Per-document reading speed (the idea captured in the demo data itself).
- Re-export the case-study mockups from the running app once the design settles
  (Phase 3: "the 7 images on the site go stale").

## ✅ Done

- **Oct 1 — the refined design, built** (branch `redesign`). Figma page
  07 · Desktop — Refined, all 8 screens: one shell (white header with search
  + ⌘K, navy sidebar with counts and top tags, a side panel of cards on every
  screen), the note inside the app, Meetings opening the note, the Tasks table,
  the Tags grid, Settings with switches that work. Waveforms are the REAL
  audio (demo: `scripts/make-demo-peaks.mjs`; yours: measured at save). New
  prefs: keyboard shortcuts, task suggestions. 104 tests; axe clean in jsdom
  and in real Chrome (desktop + phone, with contrast).

- **Oct 1 — live.** `app-v1` fast-forwarded into `main`; Pages switched on
  (source: GitHub Actions). https://tommyclaffey.github.io/Mumble/

- **Sept 30 — captures are recordings.** Tommy: "these are recordings and then
  dictation" — so play plays the RECORDING, not a synthetic voice reading the
  transcript. Read-aloud parked (`parked/read-aloud/`). Recording now saves the
  mic audio (MediaRecorder → IndexedDB) alongside live transcription. New
  PlayerBar: line-first position, seek slider, speed with natural pitch, play
  from any line, highlight follows the audio. Demo captures got synthetic
  recordings (Kokoro, a voice per person, real line timings). 89 tests.
  Verified in real Chrome: demo playback + highlight; fake-mic record → store →
  read back → play → seek.

- **Sept 30 overnight — hardening.** Two independent audits (correctness,
  accessibility) found 25 issues; all fixed, each with a test. 115 tests.
  - Correctness (11): WebGPU→WASM fallback stranded by queued lines; natural
    voice failure stopped reading instead of falling back (now hands the SAME
    line to the device voice mid-play); warm-up errors swallowed; device voice
    errors counted as "finished" (raced through silently); demo dates in the
    future; Undo wiped unrelated edits; audio errors left "Reading aloud"
    forever + object-URL leaks; voiceprint line counts; malformed URL blanked
    the app; pause then save lost the last phrase; hidden card kept talking.
  - Accessibility (14): line being read scrolled under the sticky/fixed bars;
    no room at 400% zoom; focus lost on task tick, speaker fix and navigation;
    Undo vanished while you reached for it; checkbox and field borders ~1.3:1
    (new `--border-control` token, 3.9:1); waits not announced; position
    announced over the voice every line; page changes silent (no title, no
    focus); read-from-here hidden / faint / a Tab stop per line; px type
    ignored the browser font-size setting (now rem); play button double
    state; cards claimed "Line 1 of N" unplayed; smooth scroll ignored
    reduced motion; one avatar colour 2.8:1; no Tags on phones.
- **Sept 30 overnight — features.** Keyboard (Space, ← →), word-by-word
  highlight where the voice reports boundaries, rename a capture, add/remove
  tags, `npm run audit:a11y`, attendee faces on meeting cards and the meeting
  header (Phase 3 item), coloured to match each person's speaker colour.

- **Sept 30 — natural voice.** Device voices now ranked (Premium / Natural /
  Google first, novelty voices hidden) and the best is used by default. New
  **Natural** option: Kokoro-82M on-device. Measured in real Chrome on an
  M-series Mac, per 5-second line:
  | | size | time to generate |
  |---|---|---|
  | WebGPU fp32 ✅ chosen | 326 MB | ~0.7s |
  | WebGPU fp16 | 163 MB | ~0.7s (output differs — not chosen) |
  | WebGPU q8 | 92 MB | ~11s |
  | WebAssembly q8 (fallback) | 92 MB | ~9s |
  | WebAssembly q4 | — | crashed the tab |
  Shaders are warmed on load so the first line isn't the slow one. 74 tests.

- **Sept 30 — v1 app** on branch `app-v1`: shell, Recent, Capture (read-aloud,
  speaker correction, tasks, summary, export), Record (live browser
  transcription), Tasks, Tags, Meetings, Settings. 56 tests.
