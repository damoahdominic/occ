.PHONY: help test run-all run-fnm run-nvm run-node-only run-node-setup

# Default target
.DEFAULT_GOAL := help

# Constants
PROJECT_ROOT := $(shell pwd)
SCRIPTS_DIR := $(PROJECT_ROOT)/scripts

# Docker base images
NODE_IMAGE := node:22
UBUNTU_IMAGE := ubuntu:22.04

# Test runner script
TEST_RUNNER := $(SCRIPTS_DIR)/test-node-version-detection.sh

## help: Show this help message
help:
	@./scripts/help.awk $(MAKEFILE_LIST)

## test: Run all Node version detection tests
test: run-all

## run-all: Run all test scenarios using the test runner
run-all:
	@echo "Running all test scenarios..."
	$(TEST_RUNNER)

## run-fnm: Run fnm test scenario
run-fnm:
	@echo "Running fnm test scenario..."
	docker run --rm -v $(PROJECT_ROOT):/app $(NODE_IMAGE) bash -c "curl -fsSL https://fnm.vercel.app/install | bash -s -- --install-dir /usr/local && export PATH=\"/root/.local/bin:\$$PATH\" && cd /app && npm ci --ignore-scripts && source ./scripts/activate_env.sh && ./launch-editor.sh --version-check"

## run-nvm: Run nvm test scenario
run-nvm:
	@echo "Running nvm test scenario..."
	docker run --rm -v $(PROJECT_ROOT):/app $(NODE_IMAGE) bash -c "curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash && export NVM_DIR=\"/root/.nvm\" && echo 'export NVM_DIR=\"\$$HOME/.nvm\"' >> ~/.bashrc && echo '[ -s \"\$$NVM_DIR/nvm.sh\" ] && source \"\$$NVM_DIR/nvm.sh\"' >> ~/.bashrc && cd /app && npm ci --ignore-scripts && source ~/.bashrc && source ./scripts/activate_env.sh && ./launch-editor.sh --version-check"

## run-node-only: Run system Node only test scenario
run-node-only:
	@echo "Running node-only test scenario..."
	docker run --rm -v $(PROJECT_ROOT):/app $(NODE_IMAGE) bash -c "cd /app && npm ci --ignore-scripts && source ./scripts/activate_env.sh && ./launch-editor.sh --version-check"

## run-node-setup: Run auto-install test scenario
run-node-setup:
	@echo "Running node-setup test scenario..."
	docker run --rm -v $(PROJECT_ROOT):/app $(UBUNTU_IMAGE) bash -c "apt-get update && apt-get install -y curl wget git && curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash && export NVM_DIR=\"/root/.nvm\" && echo 'export NVM_DIR=\"\$$HOME/.nvm\"' >> ~/.bashrc && echo '[ -s \"\$$NVM_DIR/nvm.sh\" ] && source \"\$$NVM_DIR/nvm.sh\"' >> ~/.bashrc && cd /app && npm ci --ignore-scripts && source ~/.bashrc && source ./scripts/activate_env.sh && ./launch-editor.sh --setup-and-run"

## docker-test: Run all tests using docker-compose
docker-test:
	@echo "Running all test scenarios with docker-compose..."
	docker-compose -f docker-compose.test.yml up --abort-on-container-exit

## docker-test-fnm: Run fnm test with docker-compose
docker-test-fnm:
	@echo "Running fnm test scenario with docker-compose..."
	docker-compose -f docker-compose.test.yml run --rm test-fnm

## docker-test-nvm: Run nvm test with docker-compose
docker-test-nvm:
	@echo "Running nvm test scenario with docker-compose..."
	docker-compose -f docker-compose.test.yml run --rm test-nvm

## docker-test-node-only: Run node-only test with docker-compose
docker-test-node-only:
	@echo "Running node-only test scenario with docker-compose..."
	docker-compose -f docker-compose.test.yml run --rm test-node-only

## docker-test-node-setup: Run node-setup test with docker-compose
docker-test-node-setup:
	@echo "Running node-setup test scenario with docker-compose..."
	docker-compose -f docker-compose.test.yml run --rm test-node-setup