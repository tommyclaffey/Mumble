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
- **Meeting mode tells voices apart IN the browser** (Oct 7, option A:
  free now, a paid service later). `record/diarizer.ts` is the service; the
  models run in `record/diarize.worker.ts`; the maths is `record/diarize.ts`.
  Tested Oct 7 in real Chrome on the 4 demo meetings: right person on 94% of
  lines when told how many people (synthetic voices, so the ceiling). Every
  line carries a confidence; unsure lines are flagged. A paid service would
  be a second `Diarizer` — nothing else changes. If it fails, the recording
  is saved as a note and the screen says so.
- **Honest about the browser.** Meeting mode is disabled *with the reason on
  screen* where the models can't run or the audio can't be recorded. Where audio goes is
  stated before recording. If the mic can't be recorded, the transcript is
  still saved and says it has no recording.

## Standards (inherited from Growth)

- **Anything you can type, you can say** (Tommy, Oct 6). Every text field
  gets a `DictateButton` (components/Dictate). Tasks can always be added by
  hand, and say "Added by you".
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
⚠️ Oct 7: Railway did NOT pick up a push to `main` on its own — check
`railway deployment list` after pushing, and `railway up --detach` if the
newest deploy is older than the push.

## The team demo (Oct 7 2026)

A second workspace with a made-up team, at its own link:
**/Mumble/team/** (Pages) · **/team/** (Railway). That page just redirects to
`?workspace=team`, which is what `data/workspace.ts` reads.

- **One workspace per page load, chosen by the address** — never a switch
  inside the app, so a link always opens the same thing.
- **Its own storage key** (`mumble.team.v1`): the team demo never touches
  the personal demo's recordings.
- **"You" stays "You" in the data.** In the team demo, You is Jordan Ellis;
  his face and name come from `workspace().me`.
- **Faces come from the workspace, through `Avatar`** — no screen knows
  about photos. Unconfirmed voices never get one.
- **Photos are Unsplash portraits** (credits in `public/people/CREDITS.md`).
  The Team screen says everyone is made up. Never add a real, named person.
- Recordings: the 5 personal ones + `t1` (Nadia's readout) and `t2` (Maya's
  notes) in `data/teamDemo.ts`. Voiced with `ONLY=t1,t2 node scripts/make-demo-audio.mjs`.

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
