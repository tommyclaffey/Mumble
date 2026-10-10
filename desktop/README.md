# Mumble for Mac

One app, three faces (option A, Oct 9):
- **The Mumble window** (Dock icon): the same screens as the website, built
  from this repo's web app and shipped inside the app.
- **The floating icon** (top-right, drag it anywhere): notices when a meeting
  starts and records it with one click.
- **The menu bar mic**: the same controls, out of the way.

A recorded call is transcribed **on this Mac** and arrives in the window as a
meeting: your mic's lines are **You**, the call's sound is split into
Speaker 1, 2… by Meeting mode. Closing the window keeps the icon watching.

```
./make-dmg.sh              # the installer: build/Mumble-<version>.dmg
./make-dmg.sh --install    # …and install it into /Applications, then open it
./make-app.sh              # just the app, in build/ (for development)
```
Needs only the Command Line Tools. The icon is drawn onto Apple's icon grid
(824 of 1024 px, transparent margin, shadow) by `make-icon.swift`, so it's the
same size as every other app in the Dock.

## How it works

| Piece | File | How |
|---|---|---|
| **Spots a meeting** | `MeetingDetector.swift` | macOS lists which apps are using the mic. Zoom, Teams, FaceTime, Slack, Discord, Webex or a browser (Meet) holding it for 3 s = a meeting. Off for 5 s = it ended. No window reading, no calendar. |
| **Records it** | `Recorder.swift` | Two tracks: `you.m4a` (your mic) and `others.m4a` (what the Mac plays: everyone else, via a Core Audio process tap, macOS 14.2+). |
| **Saves it** | `Recorder.swift` | `~/Documents/Mumble/<date> <app>/` with `you.m4a`, `others.m4a`, `meeting.json`. |
| **The floating widget** | `Widget.swift` | One button per action, each with a tooltip. Quiet mic (hover: "Start recording") → **Zoom meeting · [Record] [×]** → **● 12:34 ▮▮▮ · [Pause] [Stop]** → **Paused · 12:34 · [Resume] [Stop]** → **Transcribing on this Mac…** → **Saved · [Open] [×]**. Buttons answer the first click and never take focus from the call. While paused, neither track is written, so they stay in step. |
| **Menu bar** | `main.swift` | Start/stop, "Record meetings automatically", show/hide the icon, open Mumble, open the folder. |
| **Transcribes it** | `Transcriber.swift`, `Library.swift` | After Stop: both tracks mixed into `mix.m4a`, then each transcribed by Apple's `SpeechAnalyzer` (macOS 26, on-device, no permission prompt; the English model downloads once). Written to `transcript.json`. |
| **The window** | `MainWindow.swift`, `LocalServer.swift` | A WKWebView on `http://127.0.0.1:47821/`, served by the app itself from `Contents/Resources/web`, loopback only. 127.0.0.1 is a secure address, so IndexedDB, Meeting mode's worker and its model cache all work. The port never changes: saved data belongs to the address. |
| **Into Mumble** | `src/desktop/` (web side) | The page asks `/desktop/pending`, saves each call as a meeting (`meetingFromCall`), then `POST /desktop/imported/<id>`. A call recorded with the window closed arrives next time it opens. "Saved · Show" opens it. |
| **Recording from the window** | `src/desktop/MacRecordScreen.tsx` | Inside the app, New recording drives the Mac recorder (both tracks), not the browser's. The header timer follows it on every screen. |

Two tracks is deliberate: your voice and theirs never share a file, so "who
said what" starts half-solved. (On speakers instead of headphones, their
voices leak into your mic a little.)

## Permissions (asked once)

Ad-hoc signed: it opens normally on the Mac that built it. On anyone else's
Mac, Gatekeeper blocks the downloaded .dmg until it's signed and notarised.

- **Microphone**: your side.
- **System Audio Recording**: their side. Without it, `others.m4a` is silence and `meeting.json` says `"othersHeard": false`.

Ad-hoc signed, so it runs on this Mac. Giving it to anyone else needs a
Developer ID signature and notarisation (the $99/yr Apple account). Each
rebuild has a new signature, so macOS may ask for permissions again.

## Testing without a meeting

- `MUMBLE_ROOT=<dir> build/Mumble.app/Contents/MacOS/Mumble`: uses `<dir>` instead of
  Documents › Mumble, and a separate web store, so tests never touch your real
  recordings or Mumble data. Put a folder with `you.m4a`, `others.m4a` and
  `meeting.json` in it and the app finishes it on launch and opens it.
  `MUMBLE_SNAPSHOTS=<dir>` also writes what the window shows every 3 s.
- `MAC=1 npm run audit:a11y -- http://127.0.0.1:47821/` (app running): the accessibility
  audit as the window sees it, mid-recording.

- `Mumble --detect-any`: any app using the mic counts as a meeting, and state changes print.
- `Mumble --snapshots <dir>`: draws the icon in every state to PNGs.
- `Mumble --to-m4a <in> <out>`: the conversion each recording ends with.

`Sources/MicWatch` and `Sources/SystemTap` are the two spikes that proved
detection and system-audio capture work on macOS 26. The app needs macOS 26
(for on-device transcription).
