#!/bin/bash
# Simple test script for browser-use
set -e

echo "=== Testing browser-use with OCC editor ==="

# Start a session and navigate
echo "1. Opening editor..."
browser-use --browser chromium --headless open http://localhost:9888

sleep 3

echo "2. Getting page state..."
browser-use state | head -100

echo "3. Closing session..."
browser-use close

echo "Done!"
