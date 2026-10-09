# Mumble for Mac — the desktop companion

A small floating icon (top-right, drag it anywhere) and a menu bar item.
It notices when a meeting starts and records it with one click.

```
./make-app.sh && open build/Mumble.app     # needs only the Command Line Tools
```

## How it works

| Piece | File | How |
|---|---|---|
| **Spots a meeting** | `MeetingDetector.swift` | macOS lists which apps are using the mic. Zoom, Teams, FaceTime, Slack, Discord, Webex or a browser (Meet) holding it for 3 s = a meeting. Off for 5 s = it ended. No window reading, no calendar. |
| **Records it** | `Recorder.swift` | Two tracks: `you.m4a` (your mic) and `others.m4a` (what the Mac plays: everyone else, via a Core Audio process tap, macOS 14.2+). |
| **Saves it** | `Recorder.swift` | `~/Documents/Mumble/<date> <app>/` with `you.m4a`, `others.m4a`, `meeting.json`. |
| **The icon** | `Widget.swift` | Quiet mic → "Zoom meeting · Record" → "Recording · 12:34" → "Saved · Show". Never takes focus from the call. |
| **Menu bar** | `main.swift` | Start/stop, "Record meetings automatically", show/hide the icon, open the folder. |

Two tracks is deliberate: your voice and theirs never share a file, so "who
said what" starts half-solved. (On speakers instead of headphones, their
voices leak into your mic a little.)

## Permissions (asked once)

- **Microphone**: your side.
- **System Audio Recording**: their side. Without it, `others.m4a` is silence and `meeting.json` says `"othersHeard": false`.

Ad-hoc signed, so it runs on this Mac. Giving it to anyone else needs a
Developer ID signature and notarisation (the $99/yr Apple account). Each
rebuild has a new signature, so macOS may ask for permissions again.

## Testing without a meeting

- `Mumble --detect-any`: any app using the mic counts as a meeting, and state changes print.
- `Mumble --snapshots <dir>`: draws the icon in every state to PNGs.
- `Mumble --to-m4a <in> <out>`: the conversion each recording ends with.

`Sources/MicWatch` and `Sources/SystemTap` are the two spikes that proved
detection and system-audio capture work on macOS 26.
