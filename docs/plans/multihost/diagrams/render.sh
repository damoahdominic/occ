#!/usr/bin/env bash
# Render all *.puml sources in this directory to SVG via the plantuml/plantuml
# docker image. Output ownership is chown'd back to uid 1000 (the repo's
# canonical dev user per root AGENTS.md § Permission Management).
#
# Usage:  ./render.sh [format]
#   format defaults to svg. Override with png, pdf, eps, etc.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORMAT="${1:-svg}"

docker run --rm -v "${DIR}:/data" plantuml/plantuml:latest \
  "-t${FORMAT}" "/data/*.puml"

docker run --rm -v "${DIR}:/data" --user root alpine \
  chown -R 1000:1000 /data
