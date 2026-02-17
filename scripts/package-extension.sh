#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR=$(cd -- "$(dirname "$0")/.." && pwd)
EXT_DIR="$ROOT_DIR/apps/extension"
OUTPUT_DIR="$ROOT_DIR/apps/wrapper/extensions"
TMP_DIR=$(mktemp -d)
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT
rsync -a --exclude '.git' --exclude 'node_modules' --exclude '.vscode' --exclude 'tsconfig.tsbuildinfo' "$EXT_DIR/" "$TMP_DIR/"
# Ensure compiled assets exist
if [[ ! -f "$EXT_DIR/out/extension.js" ]]; then
  echo "[package-extension] Missing out/ files. Run npm run ext:compile first." >&2
  exit 1
fi
# Copy compiled output + media explicitly
rsync -a "$EXT_DIR/out" "$EXT_DIR/media" "$TMP_DIR/"
# Ensure minimal dependencies are installed for vsce (only package.json)
cd "$TMP_DIR"
# Run vsce package without git context by forcing npm pack mode
npx --yes @vscode/vsce package --no-dependencies -o extension.vsix >/dev/null
mkdir -p "$OUTPUT_DIR"
mv extension.vsix "$OUTPUT_DIR/openclaw.vsix"
echo "[package-extension] VSIX written to $OUTPUT_DIR/openclaw.vsix"
