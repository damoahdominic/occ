#!/usr/bin/env bash
#
# Shared Node.js version detection and activation logic
# Priority order: Docker → fnm → nvm → system node → auto-install nvm
#

set -e

detect_and_use_node() {
    local ROOT="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
    local NODE_VERSION="$(cat "$ROOT/apps/editor/.nvmrc" 2>/dev/null || echo "20.18.2")"

    echo "Desired Node.js version: $NODE_VERSION"
    echo "Node.js version management: checking..."

    # Priority 2: INSIDE DOCKER - Only skip version managers if running as root
    # Non-root users should still be able to use fnm/nvm if available
    if [ -f "/.dockerenv" ] || [ -f "/run/.containerenv" ]; then
        # Only apply Docker bypass for root users (typical container setup)
        if [ "$(id -u)" = "0" ]; then
            if command -v node >/dev/null 2>&1; then
                local CURRENT_NODE_VERSION
                CURRENT_NODE_VERSION="$(node --version 2>/dev/null || echo "unknown")"
                echo "Docker environment (root), using system Node $CURRENT_NODE_VERSION"
                return 0
            else
                echo "ERROR: Running inside Docker but no system node found." >&2
                echo "Make sure your Docker image includes Node.js $NODE_VERSION." >&2
                return 1
            fi
        else
            # Non-root in Docker: proceed to version manager detection (fnm/nvm)
            echo "Docker environment detected (non-root), checking version managers..."
        fi
    fi

    # 2. CHECK FNM (Fast Node Manager)
    if command -v fnm >/dev/null 2>&1; then
        echo "fnm detected, ensuring Node.js $NODE_VERSION..."
        if fnm use "$NODE_VERSION" 2>/dev/null; then
            echo "Using Node.js $(node --version) via fnm"
            return 0
        else
            echo "fnm: Node.js $NODE_VERSION not installed, trying to install..."
            if fnm install "$NODE_VERSION" 2>/dev/null && fnm use "$NODE_VERSION" 2>/dev/null; then
                echo "Using Node.js $(node --version) via fnm"
                return 0
            else
                echo "fnm: install failed (permission denied?), falling through to next option..." >&2
            fi
        fi
    fi

    # 3. CHECK NVM (Node Version Manager)
    export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
    if [ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh" 2>/dev/null; then
        echo "nvm detected, ensuring Node.js $NODE_VERSION..."
        if nvm use "$NODE_VERSION" 2>/dev/null; then
            echo "Using Node.js $(node --version) via nvm"
            return 0
        else
            echo "nvm: Node.js $NODE_VERSION not installed, installing..."
            nvm install "$NODE_VERSION"
            nvm use "$NODE_VERSION"
            echo "Using Node.js $(node --version) via nvm"
            return 0
        fi
    fi

    # 4. CHECK SYSTEM NODE
    if command -v node >/dev/null 2>&1; then
        local CURRENT_NODE_VERSION
        CURRENT_NODE_VERSION="$(node --version | sed 's/^v//')"
        if [ "$CURRENT_NODE_VERSION" = "$NODE_VERSION" ]; then
            echo "Using existing system Node.js $CURRENT_NODE_VERSION (matches required version)"
        else
            echo "WARNING: System Node.js $CURRENT_NODE_VERSION found, but $NODE_VERSION required." >&2
            echo "         Consider installing fnm or nvm for better version management." >&2
        fi
        return 0
    fi

    # 5. AUTO-INSTALL NVM (if nothing else works)
    if [ ! -s "$NVM_DIR/nvm.sh" ]; then
        echo "Installing nvm automatically..."
        if curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash -; then
            export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
            if [ -s "$NVM_DIR/nvm.sh" ]; then
                source "$NVM_DIR/nvm.sh"
                echo "nvm installed, installing Node.js $NODE_VERSION..."
                nvm install "$NODE_VERSION"
                nvm use "$NODE_VERSION"
                echo "Using Node.js $(node --version) via nvm (auto-installed)"
                return 0
            fi
        fi
    fi

    # 6. FINAL FALLBACK: Use whatever node we have (with warning)
    if command -v node >/dev/null 2>&1; then
        echo "WARNING: Using system Node.js $(node --version) - version does not match required $NODE_VERSION" >&2
        echo "         Consider installing fnm or nvm for better version management." >&2
        return 0
    fi

    echo "ERROR: Could not set up Node.js runtime." >&2
    echo "Please install one of:" >&2
    echo "  - fnm: https://fnm.vercel.app" >&2
    echo "  - nvm: https://github.com/nvm-sh/nvm" >&2
    echo "  - Node.js $NODE_VERSION directly from https://nodejs.org" >&2
    return 1
}

# Allow sourcing this script without running immediately
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    detect_and_use_node "$@"
fi
