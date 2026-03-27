#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

# Use shared Node.js version detection
if ! source "$ROOT/scripts/node-version.sh" "$ROOT"; then
    exit 1
fi

cd "$ROOT/apps/editor"
exec ./scripts/code.sh "$@"