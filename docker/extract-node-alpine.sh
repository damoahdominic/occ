#!/bin/bash
# Extract node binary from Alpine Docker image using docker-compose
# Usage: extract-node-alpine.sh <image-name> <node-version>

set -e

IMAGE_NAME="${1:-node}"
NODE_VERSION="${2:-latest}"

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Create a temporary docker-compose file for this task
TEMP_COMPOSE=$(mktemp)
trap "rm -f '$TEMP_COMPOSE'" EXIT

cat > "$TEMP_COMPOSE" << EOF
version: '3.8'
services:
  alpine-extract:
    image: ${IMAGE_NAME}:${NODE_VERSION}-alpine
    command: /bin/sh -c 'cat \`which node\`'
EOF

# Run the container and extract binary output
docker-compose -f "$TEMP_COMPOSE" run --rm alpine-extract
