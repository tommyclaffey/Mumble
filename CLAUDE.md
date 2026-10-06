# Mumble

React + TypeScript voice-first notes app. Capture by speaking; read it back by
listening. Public repo, deployed to GitHub Pages at
https://tommyclaffey.github.io/Mumble/ — live since Oct 1, 2026.
Every push to `main` deploys (tests must pass first).

## ⭐ Read BACKLOG.md first

`BACKLOG.md` is the memory bank — ideas, open decisions and known gaps,
captured so they survive between sessions. Check it at the start of any
Mumble session. When Tommy says *"add to the backlog: …"*, write it there.

The readable build log lives in the vault:
`Career/00 Projects/Mumble/(C) Mumble — Build Log.md`.

## How we work on this

Same rule as Growth: **Tommy writes the React. Claude explains, reviews and
corrects.** Exception in force when Tommy asks for a specific build, fix or
feature — Claude writes it, and it has to be explainable line by line in an
interview. The rule is about who drives the learning, not a prohibition.

## The product claims the code must honour

- **A note and a meeting are different types.** `kind` is a required
  discriminant. One capture screen, two states. Never add a meeting-only field
  to the base type "as optional".
- **A capture is a RECORDING; the transcript is its dictation.** Play plays
  the audio (demo files in `public/demo-audio/`, your recordings in IndexedDB);
  the transcript follows along. Position is still said as text first —
  "Line 4 of 18", then the time.
- **Demo audio is synthetic and labelled so.** Made once by
  `node scripts/make-demo-audio.mjs` (Kokoro, a voice per person); line
  timings come from the audio, not an estimate. Edit a demo line → regenerate;
  `tests/demoAudio.test.ts` fails until you do.
- **Read-aloud is PARKED** in `parked/read-aloud/` (Sept 30, Tommy: "later —
  just one really good voice"). Not built or tested. Read its README first.
- **Speaker correction propagates by voice** and always says how many lines
  it changed, with Undo.
- **AI output stays separable.** The summary sits on `--surface-ai`. Anything
  not produced by a model (the phrase-rule task suggester) says so.
- **Recordings never leave the browser.** Delete a capture → its audio goes
  too. Reset demo → all stored audio goes.
- **Honest about the browser.** No diarization in the browser, so Meeting
  recording is disabled *with the reason on screen*. Where audio goes is
  stated before recording. If the mic can't be recorded, the transcript is
  still saved and says it has no recording.

## Standards (inherited from Growth)

- **Every control does what it says.** No buttons without handlers, no
  settings that change nothing. If it isn't built, it isn't shown.
- **One rule, one place.** Search = `data/filters.ts`. Speaker correction =
  `correctSpeaker` in the model. Read-aloud = `useReadAloud`.
- **Verify the output, not the build.** Screenshot it. Headless Chrome won't
  go below ~500px wide — check mobile inside a 390px iframe, not a 390px window.
- **Test audio for real before claiming it works.** Headless Chrome plays
  audio and fakes a microphone (`--use-fake-device-for-media-stream`); drive
  it over the DevTools protocol. That's how Chrome's recordings reporting
  `duration: Infinity` were checked (seeking still works; the player falls
  back to the timed length).
- **Tests assert behaviour.** Render tests drive fake speech engines
  (`src/__tests__/fakes.ts`), never the real browser APIs.
- **Accessibility is audited, not assumed.** `src/__tests__/axe.test.tsx` runs
  axe on every screen in the test suite; `npm run audit:a11y` does it in real
  Chrome with contrast. Both were clean on Sept 30.
- **Focus never falls to nowhere.** Anything that unmounts the focused element
  (ticking a task, correcting a speaker, navigating) moves focus somewhere
  deliberate. There are tests for each.
- **No hex outside `tokens.css`.** `tests/cssLeaks.test.ts` enforces it.

## The refined design (Oct 1 2026)

Built from Figma page **07 · Desktop — Refined** (file Mumble-App). Every
screen is `<Page title subtitle panel>` (components/Page): main column + the
docked side panel of `<PanelCard>`s. Tokens added in the "REFINED" block of
`tokens.css`; type in the `.mb-t-*` classes. **Waveforms are measured from the
real audio** — never draw made-up bars.

## Hosting (Oct 5 2026)

| | URL | Deploys from |
|---|---|---|
| **Railway** | https://web-production-b20ad.up.railway.app | `main`, on every push (switched from `redesign` Oct 6) |
| GitHub Pages | https://tommyclaffey.github.io/Mumble/ | `main`, on every push |

Railway project `mumble`, service `web`. Railpack runs `npm run build`
then `npm start`; the service variable `BASE_PATH=/` serves it at the
domain root (Pages needs `/Mumble/`). HTTPS, so the mic works on phones.
The redesign shipped to `main` on Oct 4; both hosts now serve the same app.

## 🛑 More than one session may work in this repo at once

Oct 6: a docs commit used `git add -A` while another session had
uncommitted work on its own branch, and swept that work into the wrong
commit (caught before push, undone). So:

- **Check `git branch --show-current` and `git status` right before committing.**
- **Stage only the files you changed** (`git add <paths>`), never `-A`.
- **To commit to a branch you're not on, use a worktree**
  (`git worktree add /tmp/wt main`) — never switch someone else's branch.

## Commands

```
npm run dev     # localhost:5173/Mumble/
npm run dev:phone   # https on the local network — test recording on a phone
npm test        # vitest
npm run lint
npm run build
node scripts/make-demo-audio.mjs   # regenerate demo recordings after editing demo lines (needs ffmpeg)
node scripts/make-demo-peaks.mjs   # then their waveforms (needs ffmpeg)
npm run audit:a11y -- http://localhost:5173/Mumble/   # real-Chrome WCAG 2.2 AA, desktop + phone (dev server must be running)
```
