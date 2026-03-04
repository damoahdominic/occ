#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"

cd "$ROOT/apps/editor"
nvm use
exec ./scripts/code.sh "$@"

cd apps/editor && VSCODE_SKIP_PRELAUNCH=1 ./scripts/code.sh