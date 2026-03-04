#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"

cd "$ROOT/apps/editor"
nvm use

# Build Void React bundles if missing (required before watch-client)
if [ ! -d "src/vs/workbench/contrib/void/browser/react/out" ]; then
  echo "Building Void React components..."
  npm run buildreact
fi

# Compile openclaw extension if missing
if [ ! -f "extensions/openclaw/out/extension.js" ]; then
  echo "Compiling openclaw extension..."
  cd "$ROOT/apps/editor/extensions/openclaw"
  npm install
  npm run compile
  cd "$ROOT/apps/editor"
fi

exec npm run watch-client
