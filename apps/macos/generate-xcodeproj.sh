#!/usr/bin/env bash
# Generates RelayMac.xcodeproj — run from apps/macos if project is missing.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

if ! command -v xcodegen >/dev/null 2>&1; then
  echo "xcodegen not installed; using committed RelayMac.xcodeproj"
  exit 0
fi

cat > project.yml <<'YAML'
name: RelayMac
options:
  bundleIdPrefix: com.relay
  deploymentTarget:
    macOS: "26.0"
packages:
  RelayKit:
    path: RelayKit
targets:
  RelayMac:
    type: application
    platform: macOS
    sources:
      - RelayMac
    dependencies:
      - package: RelayKit
        product: RelayKit
    settings:
      PRODUCT_BUNDLE_IDENTIFIER: com.relay.mac
      INFOPLIST_FILE: RelayMac/Info.plist
      MACOSX_DEPLOYMENT_TARGET: "26.0"
      SWIFT_VERSION: "6.0"
      ENABLE_HARDENED_RUNTIME: YES
schemes:
  RelayMac:
    build:
      targets:
        RelayMac: all
    run:
      config: Debug
YAML

xcodegen generate
echo "Generated RelayMac.xcodeproj"
