#!/usr/bin/env bash
# clear-editor-cache.sh
# Clears OCcode editor user-data cache so the next launch starts fresh.
# Works on macOS, Linux, and Windows (Git Bash / WSL).

set -euo pipefail

# Dev builds use "code-oss-dev"; production builds use "OCcode"
APP_NAME="${OCC_APP_NAME:-code-oss-dev}"

# Resolve user-data directory for each OS
case "$(uname -s)" in
  Darwin)
    DATA_DIR="$HOME/Library/Application Support/$APP_NAME"
    ;;
  Linux)
    DATA_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/$APP_NAME"
    ;;
  MINGW*|MSYS*|CYGWIN*)
    # Git Bash / Cygwin on Windows
    DATA_DIR="${APPDATA}/$APP_NAME"
    ;;
  *)
    echo "Unsupported OS: $(uname -s)" >&2
    exit 1
    ;;
esac

if [ ! -d "$DATA_DIR" ]; then
  echo "No cache found at: $DATA_DIR"
  echo "Nothing to clear."
  exit 0
fi

echo "Clearing OCcode cache at: $DATA_DIR"
rm -rf "$DATA_DIR"
echo "Done. Next launch will start fresh."
