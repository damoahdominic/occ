#!/usr/bin/env bash
# docker-dev.sh — entrypoint for the `editor` service in docker-compose.yml
#
# Starts the watch compiler in the background, waits for the initial
# compilation to produce out/vs/nls.js, then starts the code-server.
# This prevents the server crashing on cold starts when compiled output
# does not yet exist.

set -e
cd /workspace

# One install to rule them all.
# Root postinstall cascades into apps/editor → build/npm/postinstall.js which
# installs build/, remote/, and ~45 extension dirs in parallel.
echo "[docker] Installing all dependencies..."
npm install

cd /workspace/apps/editor

# @vscode/ripgrep downloads its rg binary via postinstall.  The Docker image
# has system ripgrep from apt, so we symlink it instead of hitting the network.
if [ -x /usr/bin/rg ]; then
  mkdir -p node_modules/@vscode/ripgrep/bin
  ln -sf /usr/bin/rg node_modules/@vscode/ripgrep/bin/rg
  echo "[docker] Linked /usr/bin/rg → node_modules/@vscode/ripgrep/bin/rg"
fi

echo "[docker] Starting watch compiler..."
# Remove stale nls.js so we wait for a fresh compilation, not a leftover from a
# previous (possibly failed) run.
rm -f /workspace/apps/editor/out/vs/nls.js
npm run watch &
WATCH_PID=$!

echo "[docker] Waiting for initial compilation (out/vs/nls.js)..."
until [ -f /workspace/apps/editor/out/vs/nls.js ]; do
  # If the watch process died, bail immediately instead of waiting forever.
  if ! kill -0 "$WATCH_PID" 2>/dev/null; then
    echo "[docker] ERROR: watch compiler exited before compilation finished"
    exit 1
  fi
  sleep 3
done
# Give esbuild a moment to flush the remaining file writes before the server
# starts loading modules.
sleep 5

echo "[docker] Compilation ready — starting code-server..."
npm run editor:serve &
SERVER_PID=$!

# Forward SIGTERM/SIGINT to both child processes on shutdown.
trap "kill $WATCH_PID $SERVER_PID 2>/dev/null; wait" SIGTERM SIGINT

# Exit as soon as either child process dies so Docker's restart policy fires.
wait -n $WATCH_PID $SERVER_PID
EXIT_CODE=$?
kill $WATCH_PID $SERVER_PID 2>/dev/null
wait
exit $EXIT_CODE
