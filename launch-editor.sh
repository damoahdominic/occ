#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

# Determine how to activate the correct Node.js version.
#
# Priority:
#   1. Inside a Docker container  -> use system node (skip nvm entirely)
#   2. nvm is available           -> use nvm as before
#   3. System node is available   -> use system node directly
#   4. Nothing found              -> print helpful error and exit 1

if [ -f "/.dockerenv" ]; then
  # Running inside a Docker container; rely on system node.
  if ! command -v node >/dev/null 2>&1; then
    echo "ERROR: Running inside Docker but no system node found." >&2
    echo "Make sure your Docker image includes Node.js." >&2
    exit 1
  fi
  echo "Docker environment detected, using system node ($(node --version))."
else
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh" 2>/dev/null; then
    # nvm is available – use the version pinned in .nvmrc / .node-version.
    nvm use
  elif command -v node >/dev/null 2>&1; then
    echo "nvm not found; using system node ($(node --version))."
  else
    echo "ERROR: No suitable Node.js runtime found." >&2
    echo "Please install nvm (https://github.com/nvm-sh/nvm) or Node.js directly," >&2
    echo "then re-run this script." >&2
    exit 1
  fi
fi

cd "$ROOT/apps/editor"
exec ./scripts/code.sh "$@"
