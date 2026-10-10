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

# The window's screens: the web app, built for the root of its own address
# (the app serves it from http://127.0.0.1:47821/ — see LocalServer.swift).
(cd .. && BASE_PATH=/ npx vite build --outDir desktop/build/web --emptyOutDir >/dev/null)
mv build/web "$APP/Contents/Resources/web"

# The app icon: the web app's artwork (public/icons/icon-512.png) placed on
# Apple's icon grid by make-icon.swift, so it's the same size as the rest of the Dock.
ICONSET=build/Mumble.iconset
rm -rf "$ICONSET"; mkdir -p "$ICONSET"
swift make-icon.swift ../public/icons/icon-512.png build/icon-1024.png
for s in 16 32 128 256 512; do
  sips -z $s $s build/icon-1024.png --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
  sips -z $((s*2)) $((s*2)) build/icon-1024.png --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
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
  <key>CFBundleShortVersionString</key><string>0.4</string>
  <key>CFBundleVersion</key><string>4</string>
  <key>LSMinimumSystemVersion</key><string>26.0</string>
  <key>NSMicrophoneUsageDescription</key><string>Mumble records your side of the meeting. The recording stays on this Mac.</string>
  <key>NSAudioCaptureUsageDescription</key><string>Mumble records what the other people in your meeting say, from your Mac's sound. The recording stays on this Mac.</string>
</dict></plist>
PLIST

# Ad-hoc signed: enough to run on this Mac. (Sending it to someone else needs a
# Developer ID signature + notarisation — the $99/yr Apple account.)
codesign --force --sign - "$APP"
echo "Built $APP"
