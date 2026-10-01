# Mumble

Voice-first note taking. Capture by speaking; play it back with the transcript following along.

**Origin:** dyslexia. That is not a positioning line — it is why read-aloud
states its position as *"Line 4 of 18"* rather than a timeline scrubber, and
why running text has its own type style with looser leading.

## Stack

Vite · React · TypeScript · CSS custom properties · the browser's Web Speech
API. No component library and no Tailwind — the primitives are the point.

```
src/
├── styles/        tokens.css (3 tiers) · type.css (named styles)
├── data/          model.ts (the domain) · demo.ts · store.tsx · route.ts · filters.ts
├── playback/      usePlayer (a capture's recording, line-aware) · useListPlayer
├── record/        recognizer (SpeechRecognition) · micRecorder (MediaRecorder) · audioStore (IndexedDB)
├── components/    Surface, Chip, Button, Checkbox, Segmented, PlayButton, Track,
│                  Avatar, Toast, Icon, CaptureCard, PlayerBar, SpeakerFix, …
├── shell/         header, sidebar, mobile tab bar
└── screens/       Recent, Capture, Record, Tasks, Tags, Meetings, Settings
```

## What's real in the demo

| | |
|---|---|
| **Recording** | Real — the mic is recorded (saved in this browser) and transcribed live in Chrome, Edge and Safari |
| **Playback** | Real — the recording plays; the transcript follows, line by line |
| **Demo recordings** | Synthetic — one neural voice per person, generated once (`scripts/make-demo-audio.mjs`), labelled as such |
| **Speaker correction** | Real — on the demo meetings |
| **Task suggestions on new recordings** | A phrase rule, and labelled as one |
| **AI summaries** | Only on the demo captures. New recordings say they have none. |
| **Meeting recording** | Off, with the reason on screen — browsers can't tell voices apart |
| **Storage** | Your browser only (localStorage). Settings → Reset demo. |

## The two decisions already made

**1. A note and a meeting are different types.** In the Figma file they render
as the same screen — Transcript Review assumes speakers and diarization, the
Home Feed calls everything "Mumbles", which are solo captures. One type with
optional fields everywhere is how that ambiguity becomes permanent, so `kind`
is a required discriminant.

**2. Correcting a speaker propagates by voiceprint.** Diarization gets a person
wrong *consistently* — it decides turn 1 is "Speaker 2", then matches that
voiceprint forty more times. Fixing one line and leaving thirty-nine wrong
costs more than it saves.

## Foundations are real

Transcribed from [the Figma file](https://www.figma.com/design/KKImFpu7qv988QP6CVi9Mz/Mumble-App)
via the plugin API on Aug 30 2026 — 49 variables across three collections and
21 text styles. Not invented, not approximated.

**Light mode only.** The variable collection has one mode. An inverted palette
would be a mode nobody designed.

### 🔴 Three things the design system does not define

Named in one block in `tokens.css` so they are never mistaken for transcribed:

| Gap | Current stand-in |
|---|---|
| **Focus ring** | `accent/base`. Obvious, but it is a code decision that should be pushed back into Figma. |
| **Low-confidence tone** | Already logged in the vault as a defect — the chip is an instance override, not a `Tone` variant. |
| **Border widths** | No variable exists; 1px and 2px are used throughout. |
