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
    
    # Priority 1: Fix fnm permissions and provide explicit npm path
    # Ensure bun user can access fnm node and npm
    if [ -d "/opt/fnm" ]; then
        chmod -R g+rx /opt/fnm 2>/dev/null || true
        chmod -R o+rx /opt/fnm 2>/dev/null || true
    fi
    if [ -d "/root/.local/state/fnm_multishells" ]; then
        chmod -R g+rx /root/.local/state/fnm_multishells 2>/dev/null || true
        chmod -R o+rx /root/.local/state/fnm_multishells 2>/dev/null || true
    fi
    
    exec su bun -s /bin/bash -- "$ROOT/launch-editor.sh" "$@"
fi

# Use shared Node.js version detection
if ! source "$ROOT/scripts/node-version.sh" "$ROOT"; then
    exit 1
fi

cd "$ROOT/apps/editor"
exec ./scripts/code.sh "$@"