#!/usr/bin/env bash
# Build and launch RelayMac as a proper .app bundle (better keyboard focus than raw binary).
set -euo pipefail
cd "$(dirname "$0")"

xcrun swift build -c release

APP="RelayMac.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

cp .build/release/RelayMac "$APP/Contents/MacOS/RelayMac"
chmod +x "$APP/Contents/MacOS/RelayMac"

cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>RelayMac</string>
    <key>CFBundleIdentifier</key>
    <string>com.relay.mac</string>
    <key>CFBundleName</key>
    <string>Relay</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>LSMinimumSystemVersion</key>
    <string>26.0</string>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>NSPrincipalClass</key>
    <string>NSApplication</string>
</dict>
</plist>
PLIST

open "$APP"
