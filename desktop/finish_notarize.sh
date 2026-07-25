#!/bin/sh
# Finish the notarization once Apple's queue clears: staple the ticket to the
# already-signed dist/Poppys.app and build the DMG. No credentials needed —
# stapler fetches the ticket from Apple's CDN using the app's signature.
#
# Run this whenever you like; if Apple isn't done yet it just says "not ready".
#   ./desktop/finish_notarize.sh
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/dist/Poppys.app"
DMG="$ROOT/dist/Poppys.dmg"

[ -d "$APP" ] || { echo "No $APP — nothing to finish."; exit 1; }

echo "==> Trying to staple Apple's notarization ticket..."
if ! xcrun stapler staple "$APP" 2>/dev/null; then
  echo "    Not notarized yet — Apple is still processing. Try again later."
  echo "    (Signing is done and correct; we're only waiting on Apple's queue.)"
  exit 2
fi
xcrun stapler validate "$APP"
echo "    stapled OK"

echo "==> Building drag-to-Applications DMG..."
rm -f "$ROOT/dist/Poppys-notarize.zip"
STAGE="$(mktemp -d)"
cp -R "$APP" "$STAGE/"
ln -s /Applications "$STAGE/Applications"
rm -f "$DMG"
hdiutil create -volname "Poppys" -srcfolder "$STAGE" -ov -format UDZO "$DMG" >/dev/null
rm -rf "$STAGE"

echo
echo "Done ->  $DMG"
spctl -a -vvv --type execute "$APP" 2>&1 | head -3
echo "Signed, notarized, stapled. Ship the DMG."
