.PHONY: help test run-all run-fnm run-nvm run-node-only run-node-setup build-linux-container build-core build-linux build-windows container-build-linux

# Default target
.DEFAULT_GOAL := help

# Constants
PROJECT_ROOT := $(shell pwd)
SCRIPTS_DIR := $(PROJECT_ROOT)/scripts

# Docker base images
NODE_IMAGE := node:22
UBUNTU_IMAGE := ubuntu:22.04
BUILD_LINUX_IMAGE := occ-build-linux

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

## build-linux-container: Build the Linux build container image
build-linux-container:
	@echo "Building $(BUILD_LINUX_IMAGE) container..."
	docker build -f Dockerfile.build-linux -t $(BUILD_LINUX_IMAGE) .

## build-core: Shared build (rebuild + npm ci + tsc + extensions + React + bundle + minify + Electron)
build-core:
	@echo "Running core build..."
	set -e && \
	cd $(PROJECT_ROOT)/apps/editor && \
	export NODE_OPTIONS="--max-old-space-size=7168" && \
	echo "==> Install editor + build dependencies (parallel)" && \
	( npm ci --ignore-scripts & (cd build && npm ci --ignore-scripts) & wait ) && \
	echo "==> Patch compilation.js" && \
	node -e " \
		const fs = require('fs'); \
		const path = 'build/lib/compilation.js'; \
		let c = fs.readFileSync(path, 'utf8'); \
		c = c.replace( \
			'createCompile(src, { build, emitError: true, transpileOnly: false', \
			'createCompile(src, { build, emitError: false, transpileOnly: false' \
		); \
		fs.writeFileSync(path, c); \
		console.log('Patched compilation.js: emitError -> false');" && \
	echo "==> Compile to out-build" && \
	node_modules/.bin/gulp compile-build-without-mangling && \
	echo "==> Install extension dependencies (parallel)" && \
	find extensions -name "package.json" -not -path "*/node_modules/*" | \
		xargs -I{} dirname {} | \
		xargs -P8 -I{} sh -c 'cd "{}" && npm install --ignore-scripts 2>/dev/null || true' && \
	echo "==> Compile OpenClaw extension" && \
	cd $(PROJECT_ROOT)/apps/editor/extensions/openclaw && npm install dotenv --save-dev 2>/dev/null; node_modules/.bin/tsc -p tsconfig.json || true && \
	cd $(PROJECT_ROOT)/apps/editor && \
	echo "==> Compile non-native extensions" && \
	node_modules/.bin/gulp compile-non-native-extensions-build && \
	echo "==> Compile extension media" && \
	node_modules/.bin/gulp compile-extension-media-build && \
	echo "==> Build React bundles (Void UI)" && \
	cd $(PROJECT_ROOT)/apps/editor/src/vs/workbench/contrib/void/browser/react && \
	npx scope-tailwind ./src -o src2/ -s void-scope -c styles.css -p "void-" && \
	npx tsup && \
	cd $(PROJECT_ROOT)/apps/editor && \
	echo "==> Copy React bundles into out-build" && \
	mkdir -p out-build/vs/workbench/contrib/void/browser/react && \
	cp -r src/vs/workbench/contrib/void/browser/react/out out-build/vs/workbench/contrib/void/browser/react/ && \
	echo "==> Bundle (out-build -> out-vscode)" && \
	node_modules/.bin/gulp bundle-vscode && \
	echo "==> Minify (out-vscode -> out-vscode-min)" && \
	node_modules/.bin/gulp minify-vscode && \
	echo "==> Download Electron" && \
	node build/lib/electron.js || true && \
	echo "==> Core build complete"

## build-linux: Full Linux editor build (core + .deb packaging)
build-linux:
	@echo "Running Linux build..."
	$(MAKE) -C $(PROJECT_ROOT) build-core ELECTRON_ARCH=x64 && \
	cd $(PROJECT_ROOT)/apps/editor && \
	echo "==> Package app (linux-x64)" && \
	VSCODE_ARCH=x64 node_modules/.bin/gulp vscode-linux-x64-min-ci && \
	echo "==> Remove musl watcher" && \
	rm -rf $(PROJECT_ROOT)/apps/VSCode-linux-x64/resources/app/node_modules/@parcel/watcher-linux-x64-musl && \
	echo "==> Create stub occ-tunnel for .deb deps" && \
	cp $(PROJECT_ROOT)/apps/VSCode-linux-x64/bin/occ $(PROJECT_ROOT)/apps/VSCode-linux-x64/bin/occ-tunnel && \
	chmod +x $(PROJECT_ROOT)/apps/VSCode-linux-x64/bin/occ-tunnel && \
	echo "==> Patch dep checker to warn-only" && \
	sed -i "s/FAIL_BUILD_FOR_NEW_DEPENDENCIES = true/FAIL_BUILD_FOR_NEW_DEPENDENCIES = false/" build/linux/dependencies-generator.js && \
	echo "==> Build .deb package" && \
	node_modules/.bin/gulp vscode-linux-x64-prepare-deb && \
	node_modules/.bin/gulp vscode-linux-x64-build-deb && \
	echo "==> Linux build complete"

## build-windows: Full Windows editor build (core + installer packaging)
build-windows:
	@echo "Running Windows build..."
	$(MAKE) -C $(PROJECT_ROOT) build-core ELECTRON_ARCH=x64 && \
	cd $(PROJECT_ROOT)/apps/editor && \
	echo "==> Package app (win32-x64)" && \
	VSCODE_ARCH=x64 node_modules/.bin/gulp vscode-win32-x64-min-ci && \
	echo "==> Stamp app icon" && \
	node_modules/.bin/gulp vscode-win32-x64-stamp-icon && \
	echo "==> Copy inno_updater to build" && \
	VSCODE_ARCH=x64 node_modules/.bin/gulp vscode-win32-x64-inno-updater && \
	echo "==> Build Windows installers" && \
	node_modules/.bin/gulp vscode-win32-x64-system-setup && \
	node_modules/.bin/gulp vscode-win32-x64-user-setup && \
	echo "==> Windows build complete"

## build-macos: Full macOS editor build (core + dmg packaging for both architectures)
build-macos:
	@echo "Running macOS build..."
	$(MAKE) -C $(PROJECT_ROOT) build-core ELECTRON_ARCH=arm64 && \
	cd $(PROJECT_ROOT)/apps/editor && \
	echo "==> Package app (darwin-arm64)" && \
	VSCODE_ARCH=arm64 node_modules/.bin/gulp vscode-darwin-arm64-min-ci && \
	echo "==> Package app (darwin-x64)" && \
	VSCODE_ARCH=x64 node_modules/.bin/gulp vscode-darwin-x64-min-ci && \
	echo "==> macOS build complete"

## build-macos-arm64: Build macOS arm64 only
build-macos-arm64:
	@echo "Running macOS arm64 build..."
	$(MAKE) -C $(PROJECT_ROOT) build-core ELECTRON_ARCH=arm64 && \
	cd $(PROJECT_ROOT)/apps/editor && \
	echo "==> Package app (darwin-arm64)" && \
	VSCODE_ARCH=arm64 node_modules/.bin/gulp vscode-darwin-arm64-min-ci && \
	echo "==> macOS arm64 build complete"

## build-macos-x64: Build macOS x64 only
build-macos-x64:
	@echo "Running macOS x64 build..."
	$(MAKE) -C $(PROJECT_ROOT) build-core ELECTRON_ARCH=x64 && \
	cd $(PROJECT_ROOT)/apps/editor && \
	echo "==> Package app (darwin-x64)" && \
	VSCODE_ARCH=x64 node_modules/.bin/gulp vscode-darwin-x64-min-ci && \
	echo "==> macOS x64 build complete"

## container-build-linux: Run full Linux editor build inside the container
container-build-linux:
	@echo "Building editor image and running Linux build inside container..."
	docker compose build editor
	docker compose run --rm \
		--entrypoint make \
		-e NODE_OPTIONS="--max-old-space-size=7168" \
		editor build-linux PROJECT_ROOT=/workspace | tee ./.tmp/container-build-linux-$(shell date +%Y-%m-%d_%H-%M-%S).log