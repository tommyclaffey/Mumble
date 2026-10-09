#!/bin/zsh
# Builds Mumble.app (the desktop companion) into desktop/build/.
#   ./make-app.sh            then open build/Mumble.app
# Needs only the Command Line Tools (xcode-select --install). No Xcode.
set -e
cd "$(dirname "$0")"
swift build -c release --product MumbleCompanion
APP=build/Mumble.app
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp .build/release/MumbleCompanion "$APP/Contents/MacOS/Mumble"

# The app icon: the same artwork as the web app's (public/icons/icon-512.png).
ICONSET=build/Mumble.iconset
rm -rf "$ICONSET"; mkdir -p "$ICONSET"
for s in 16 32 128 256 512; do
  sips -z $s $s ../public/icons/icon-512.png --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
  sips -z $((s*2)) $((s*2)) ../public/icons/icon-512.png --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/Mumble.icns"
rm -rf "$ICONSET"

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleIdentifier</key><string>com.tommyclaffey.mumble.companion</string>
  <key>CFBundleName</key><string>Mumble</string>
  <key>CFBundleDisplayName</key><string>Mumble</string>
  <key>CFBundleExecutable</key><string>Mumble</string>
  <key>CFBundleIconFile</key><string>Mumble</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>0.1</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSMinimumSystemVersion</key><string>14.2</string>
  <!-- Menu bar + floating icon only: no Dock icon. -->
  <key>LSUIElement</key><true/>
  <key>NSMicrophoneUsageDescription</key><string>Mumble records your side of the meeting. The recording stays on this Mac.</string>
  <key>NSAudioCaptureUsageDescription</key><string>Mumble records what the other people in your meeting say, from your Mac's sound. The recording stays on this Mac.</string>
</dict></plist>
PLIST

# Ad-hoc signed: enough to run on this Mac. (Sending it to someone else needs a
# Developer ID signature + notarisation — the $99/yr Apple account.)
codesign --force --sign - "$APP"
echo "Built $APP"
