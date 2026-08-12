#!/bin/sh
# Sign, notarize, staple, and DMG-package dist/Poppys.app for direct distribution
# (Path A: Developer ID + notarization — no App Store sandbox).
#
# Prerequisites (one-time, done by YOU — they need your Apple account):
#   1. Apple Developer Program membership.
#   2. A "Developer ID Application" certificate in your login keychain. Create via
#      Xcode ▸ Settings ▸ Accounts ▸ Manage Certificates ▸ + ▸ Developer ID Application
#      (or developer.apple.com ▸ Certificates). Confirm it's installed:
#        security find-identity -v -p codesigning
#      It prints e.g.  "Developer ID Application: Your Name (TEAMID)".
#   3. Notarization credentials stored in the keychain under a profile name:
#        xcrun notarytool store-credentials poppys-notary \
#          --apple-id "you@example.com" --team-id "TEAMID" \
#          --password "app-specific-password"   # from appleid.apple.com
#
# Then build the app (./desktop/build_app.sh) and run:
#   SIGN_IDENTITY="Developer ID Application: Your Name (TEAMID)" \
#   NOTARY_PROFILE="poppys-notary" \
#   ./desktop/sign_notarize.sh
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/dist/Poppys.app"
ENT="$ROOT/desktop/entitlements.plist"
DMG="$ROOT/dist/Poppys.dmg"

: "${SIGN_IDENTITY:?Set SIGN_IDENTITY to your 'Developer ID Application: ...' identity}"
: "${NOTARY_PROFILE:?Set NOTARY_PROFILE to the notarytool keychain profile name}"

[ -d "$APP" ] || { echo "No $APP — run ./desktop/build_app.sh first."; exit 1; }
[ -f "$ENT" ] || { echo "Missing $ENT"; exit 1; }

echo "==> 1/5  Signing nested binaries (deepest first) with the hardened runtime"
# Sign every Mach-O library/binary inside the bundle first, then the app itself.
find "$APP" -type f \( -name "*.dylib" -o -name "*.so" -o -perm -111 \) 2>/dev/null | while IFS= read -r f; do
  # only sign actual Mach-O files
  if file "$f" | grep -q "Mach-O"; then
    codesign --force --timestamp --options runtime -s "$SIGN_IDENTITY" "$f" 2>/dev/null || true
  fi
done

echo "==> 2/5  Signing the app bundle with entitlements"
codesign --force --timestamp --options runtime \
  --entitlements "$ENT" -s "$SIGN_IDENTITY" "$APP"
codesign --verify --deep --strict --verbose=2 "$APP"
echo "    signed OK"

echo "==> 3/5  Notarizing (this uploads to Apple and waits; can take a few minutes)"
ZIP="$ROOT/dist/Poppys-notarize.zip"
ditto -c -k --keepParent "$APP" "$ZIP"
xcrun notarytool submit "$ZIP" --keychain-profile "$NOTARY_PROFILE" --wait
rm -f "$ZIP"

echo "==> 4/5  Stapling the notarization ticket to the app"
xcrun stapler staple "$APP"
xcrun stapler validate "$APP"
spctl -a -vvv --type execute "$APP" || true   # should say: accepted / Notarized Developer ID

echo "==> 5/6  Building a drag-to-Applications DMG"
STAGE="$(mktemp -d)"
cp -R "$APP" "$STAGE/"
ln -s /Applications "$STAGE/Applications"
rm -f "$DMG"
hdiutil create -volname "Poppys" -srcfolder "$STAGE" -ov -format UDZO "$DMG" >/dev/null
rm -rf "$STAGE"

# The DMG is built after the app is notarized, so it starts out unsigned: spctl
# rejected it with "no usable signature" while the app inside was accepted. The
# app would still run, but the disk image a user actually downloads is the thing
# Gatekeeper checks first, so sign and notarize the container too.
echo "==> 6/6  Signing and notarizing the DMG itself"
codesign --force --timestamp --options runtime -s "$SIGN_IDENTITY" "$DMG"
codesign --verify --strict "$DMG"
xcrun notarytool submit "$DMG" --keychain-profile "$NOTARY_PROFILE" --wait
xcrun stapler staple "$DMG"
spctl -a -t open --context context:primary-signature -vv "$DMG" || true

echo
echo "Done ->  $DMG"
echo "Ship that DMG. Both it and the app inside are signed, notarized and stapled."
