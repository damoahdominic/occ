#!/usr/bin/env bash
# docker-dev.sh — entrypoint for the `editor` service in docker-compose.yml
#
# Starts the watch compiler in the background, waits for the initial
# compilation to produce out/vs/nls.js, then starts the code-server.
# This prevents the server crashing on cold starts when compiled output
# does not yet exist.

set -e
cd /workspace

echo "[docker] Installing root dependencies..."
npm i --ignore-scripts

cd /workspace/apps/editor

echo "[docker] Installing editor dependencies..."
npm i --ignore-scripts

# @vscode/ripgrep downloads its rg binary via a postinstall script which is
# skipped by --ignore-scripts.  The Docker image has system ripgrep from apt,
# so we symlink it to the expected location instead of hitting the network.
if [ -x /usr/bin/rg ]; then
  mkdir -p node_modules/@vscode/ripgrep/bin
  ln -sf /usr/bin/rg node_modules/@vscode/ripgrep/bin/rg
  echo "[docker] Linked /usr/bin/rg → node_modules/@vscode/ripgrep/bin/rg"
fi

echo "[docker] Starting watch compiler..."
npm run watch &
WATCH_PID=$!

echo "[docker] Waiting for initial compilation (out/vs/nls.js)..."
until [ -f /workspace/apps/editor/out/vs/nls.js ]; do
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
