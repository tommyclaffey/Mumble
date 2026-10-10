#!/bin/zsh
# Builds the installer: build/Mumble-<version>.dmg — open it, drag Mumble
# into Applications, as with any Mac app you download.
#   ./make-dmg.sh             build the .dmg
#   ./make-dmg.sh --install   …and install it into /Applications, then open it
set -e
cd "$(dirname "$0")"
./make-app.sh
VERSION=$(/usr/libexec/PlistBuddy -c "Print CFBundleShortVersionString" build/Mumble.app/Contents/Info.plist)
DMG="build/Mumble-$VERSION.dmg"
STAGE=build/dmg
rm -rf "$STAGE" "$DMG"; mkdir -p "$STAGE"
ditto build/Mumble.app "$STAGE/Mumble.app"
ln -s /Applications "$STAGE/Applications"
hdiutil create -volname "Mumble $VERSION" -srcfolder "$STAGE" -ov -format UDZO -quiet "$DMG"
rm -rf "$STAGE"
echo "Built $DMG ($(du -h "$DMG" | cut -f1))"

if [[ "$1" == "--install" ]]; then
  # Quit the running copy (from here or /Applications) before replacing it.
  osascript -e 'tell application id "com.tommyclaffey.mumble.companion" to quit' 2>/dev/null || true
  sleep 1; pkill -f "Mumble.app/Contents/MacOS/Mumble" 2>/dev/null || true
  MNT=$(hdiutil attach -nobrowse -readonly "$DMG" | awk -F'\t' '/\/Volumes\//{print $NF}')
  rm -rf /Applications/Mumble.app
  ditto "$MNT/Mumble.app" /Applications/Mumble.app
  hdiutil detach -quiet "$MNT"
  open /Applications/Mumble.app
  echo "Installed /Applications/Mumble.app"
fi
