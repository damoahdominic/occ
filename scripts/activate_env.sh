#!/usr/bin/env bash

# Environment activation script for Docker tests
# This script is sourced by Docker containers to set up the environment

set -e

# Function to print Node.js version with detection message
print_node_version() {
    local node_version
    node_version=$(node --version 2>/dev/null || echo "unknown")
    echo "Node.js $node_version detected via system"
}

# Function to simulate nvm detection (for testing)
simulate_nvm() {
    echo "nvm detected, ensuring Node.js 20.18.2..."
    if ! nvm use 20.18.2 2>/dev/null; then
        echo "nvm: Node.js 20.18.2 not installed, installing..."
        nvm install 20.18.2
        nvm use 20.18.2
    fi
    echo "Using Node.js $(node --version) via nvm"
}

# Function to simulate fnm detection (for testing)
simulate_fnm() {
    echo "fnm detected, ensuring Node.js 20.18.2..."
    if ! fnm use 20.18.2 2>/dev/null; then
        echo "fnm: Node.js 20.18.2 not installed, installing..."
        fnm install 20.18.2
        fnm use 20.18.2
    fi
    echo "Using Node.js $(node --version) via fnm"
}

# Function to simulate Docker environment detection
simulate_docker() {
    echo "Docker environment detected, using system node ($(node --version))"
}

# Function to simulate Node.js installation
simulate_node_install() {
    echo "Installing Node.js 20.18.2..."
    # Simulate installation
    export PATH="/usr/local/bin:$PATH"
    echo "Node.js 20.18.2 installed successfully"
    echo "Using Node.js $(node --version) via auto-installed nvm"
}

# Export functions for use in tests
export -f print_node_version simulate_nvm simulate_fnm simulate_docker simulate_node_install