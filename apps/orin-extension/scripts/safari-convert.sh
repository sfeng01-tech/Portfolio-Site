#!/bin/sh
# One-time conversion of the shared MV3 extension into a Safari app wrapper.
# Safari web extensions live inside a containing app; Apple's converter reads
# the Chrome MV3 sources here and generates an Xcode project around them.
#
# Usage: sh apps/orin-extension/scripts/safari-convert.sh [output-dir]
# Defaults output to <repo-root>/safari (gitignored — it's generated per
# machine, not source). Requires Xcode 12.2+ (`xcode-select --install`).
set -eu

REPO_ROOT=$(cd "$(dirname "$0")/../.." && pwd)
OUTPUT_DIR=${1:-"$REPO_ROOT/safari"}

xcrun safari-web-extension-converter "$REPO_ROOT/apps/orin-extension" \
  --project-location "$OUTPUT_DIR" \
  --app-name "ORIN Saver" \
  --bundle-identifier "com.sahilfaizal.orin-saver" \
  --swift \
  --ios \
  --no-open \
  --no-prompt

echo "Open $OUTPUT_DIR/.*App*/... with Xcode, or load the extension directly in Safari."
