#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

# Chromium sandbox requires a non-root process. If running as root, fix the
# chrome-sandbox setuid binary (must be owned by root:root with mode 4755),
# then re-exec this script as the bun user so Electron can enable the sandbox.
if [ "$(id -u)" = "0" ]; then
    SANDBOX="$ROOT/apps/editor/.build/electron/chrome-sandbox"
    if [ -f "$SANDBOX" ]; then
        chown root:root "$SANDBOX"
        chmod 4755 "$SANDBOX"
    fi
    
    # Priority 1: Resolve npm path before re-execution as bun user
    # This ensures preLaunch.js can find npm (avoids ENOENT errors)
    NPM_PATH=""
    if command -v npm >/dev/null 2>&1; then
        NPM_PATH="$(command -v npm)"
    fi
    
    # Export NPM for use by preLaunch.js in bun user context
    export NPM="$NPM_PATH"
    
    exec su bun -s /bin/bash -- "$ROOT/launch-editor.sh" "$@"
fi

# Use shared Node.js version detection
if ! source "$ROOT/scripts/node-version.sh" "$ROOT"; then
    exit 1
fi

cd "$ROOT/apps/editor"
exec ./scripts/code.sh "$@"