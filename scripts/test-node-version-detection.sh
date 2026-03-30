#!/usr/bin/env bash

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "Running Node.js version detection tests..."
echo "=========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
print_pass() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_fail() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# Run each test scenario
test_fnm() {
    echo -e "\nTesting fnm scenario..."

    echo "Running fnm test..."
    local output
    output=$(timeout 180 docker run --rm -v "$PROJECT_ROOT:/app" node:22 bash -c 'curl -fsSL https://fnm.vercel.app/install | bash -s -- --install-dir /usr/local && source /root/.bashrc && cd /app && npm ci --ignore-scripts && fnm --version 2>&1')

    if echo "$output" | grep -qE "fnm [0-9]+\.[0-9]+"; then
        print_pass "fnm scenario passed - fnm is available"
        echo "$output" | grep -E "fnm [0-9]"
        return 0
    else
        print_fail "fnm scenario failed - fnm not installed"
        echo "$output" | tail -5
        return 1
    fi
}

test_nvm() {
    echo -e "\nTesting nvm scenario..."

    echo "Running nvm test..."
    local output
    output=$(timeout 180 docker run --rm -v "$PROJECT_ROOT:/app" node:22 bash -c "curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash && source ~/.bashrc && nvm --version 2>&1" 2>&1)

    if echo "$output" | grep -qE "[0-9]+\.[0-9]+"; then
        print_pass "nvm scenario passed - nvm is available"
        echo "$output" | grep -E "[0-9]+\.[0-9]+" | tail -1
        return 0
    else
        print_fail "nvm scenario failed - nvm not found"
        echo "$output" | tail -3
        return 1
    fi
}

test_node_only() {
    echo -e "\nTesting system Node only scenario..."

    echo "Running Node only test..."
    local output
    output=$(timeout 60 docker run --rm -v "$PROJECT_ROOT:/app" node:22 bash -c "node --version 2>&1" 2>&1)

    if echo "$output" | grep -qE "v[0-9]+\.[0-9]+"; then
        print_pass "Node only scenario passed"
        echo "$output" | grep -E "v[0-9]+"
        return 0
    else
        print_fail "Node only scenario failed"
        echo "$output" | tail -5
        return 1
    fi
}

test_node_setup() {
    echo -e "\nTesting auto-install scenario..."

    echo "Running Node setup test..."
    local output
    output=$(timeout 240 docker run --rm -v "$PROJECT_ROOT:/app" ubuntu:22.04 bash -c 'apt-get update && apt-get install -y curl wget git && curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash && export NVM_DIR="/root/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh" && nvm install 20.18.2 && node --version 2>&1' 2>&1)

    if echo "$output" | grep -qE "v[0-9]+\.[0-9]+"; then
        print_pass "Node setup scenario passed"
        echo "$output" | grep -E "v[0-9]+" | tail -1
        return 0
    else
        print_fail "Node setup scenario failed"
        echo "$output" | tail -3
        return 1
    fi
}

# Main execution
main() {
    local passed=0
    local failed=0

    # Make sure all scripts are executable
    chmod +x "$PROJECT_ROOT/scripts/"*.sh

    # Run all tests
    if test_fnm; then ((passed++)); else ((failed++)); fi
    if test_nvm; then ((passed++)); else ((failed++)); fi
    if test_node_only; then ((passed++)); else ((failed++)); fi
    if test_node_setup; then ((passed++)); else ((failed++)); fi

    # Summary
    echo -e "\n=========================================="
    echo -e "Test Summary:"
    echo -e "  Passed: ${GREEN}$passed${NC}"
    echo -e "  Failed: ${RED}$failed${NC}"
    echo -e "=========================================="

    if [ $failed -eq 0 ]; then
        echo -e "${GREEN}All tests passed!${NC}"
        exit 0
    else
        echo -e "${RED}Some tests failed. Check output above for details.${NC}"
        exit 1
    fi
}

# Run main function
main "$@"