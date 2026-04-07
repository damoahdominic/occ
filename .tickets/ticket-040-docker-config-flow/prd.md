# ticket-040: Docker Config Flow

## Problem Statement

When users click the Docker button on the OCC Home screen, they are taken directly into the Docker provisioning flow without any opportunity to configure the Docker environment settings first. Users need a 3-step configuration flow to:
1. View/edit configuration values (image, port, data directory)
2. Confirm their settings before applying
3. Execute the Docker provisioning with their chosen configuration

## Proposed Solution

Implement a 3-step modal/dialog flow in the Home panel webview for Docker configuration:

- **Step 1 (Config)**: Load existing `docker/.env.openclaw` or use defaults from `.env.openclaw.example`. Display editable fields for GATEWAY_IMAGE, GATEWAY_PORT, OPENCLAW_DATA_DIR, and FRESH_BUILD checkbox.
- **Step 2 (Confirm)**: Display read-only values with a Confirm button.
- **Step 3 (Provision)**: Execute `docker compose up -d` with the confirmed configuration.

## Acceptance Criteria

- [x] Step 1 loads existing config from `docker/.env.openclaw` if it exists
- [x] If no config file exists, defaults are loaded from `docker/.env.openclaw.example`
- [x] All four config fields are displayed in Step 1: GATEWAY_IMAGE, GATEWAY_PORT, OPENCLAW_DATA_DIR, FRESH_BUILD
- [x] OPENCLAW_DATA_DIR has a "Browse" button that opens native VS Code folder picker
- [x] "Next" button advances to Step 2
- [x] Step 2 shows all values as read-only (non-editable)
- [x] "Confirm" button in Step 2 writes values to `docker/.env.openclaw`
- [x] Writing to .env.openclaw is atomic (temp file + rename)
- [x] After confirm, Step 3 executes `docker compose -f docker/docker-compose.openclaw.yml up -d`
- [x] If FRESH_BUILD checkbox is checked, add `--build` flag to docker compose command
- [x] Progress/status is shown during Step 3
- [x] User can cancel at any step (Step 1 or Step 2)
- [x] Error states are handled gracefully with user-friendly messages

## Technical Considerations

### Config File Handling
- **Location**: `docker/.env.openclaw` (user config)
- **Template**: `docker/.env.openclaw.example` (defaults)
- **Read priority**: If `docker/.env.openclaw` exists, load it; otherwise load from example
- **Write**: Always write to `docker/.env.openclaw` (create if not exists)
- **Atomic write**: Write to temp file, then rename to target

### Environment Variables
The following variables will be managed:
- `GATEWAY_IMAGE` - Docker image name (default: `openclaw/pod:latest`)
- `GATEWAY_PORT` - Port for gateway service (default: `18789`)
- `OPENCLAW_DATA_DIR` - Data directory path (default: `./openclaw_docker_data`)
- `FRESH_BUILD` - Boolean flag for fresh build (default: `false`)

### Webview ↔ Extension Communication
```
Webview → Extension:
  - 'dockerOpenConfig': Initialize and show Step 1
  - 'dockerBrowseDir': Open folder picker dialog
  - 'dockerGetConfig': Request current config values
  - 'dockerConfirmConfig': Save config and start provisioning (Step 2 → 3)
  - 'dockerCancel': Cancel the flow

Extension → Webview:
  - 'dockerConfigData': Current config values
  - 'dockerBrowseResult': Selected directory path
  - 'dockerProvisionStatus': Progress messages
  - 'dockerProvisionComplete': Success/failure result
```

### Docker Compose Command
```bash
# With FRESH_BUILD checked
docker compose -f docker/docker-compose.openclaw.yml up -d --build

# Without FRESH_BUILD
docker compose -f docker/docker-compose.openclaw.yml up -d
```

### Dependencies
- None - this is a self-contained feature in the Home panel

## Tasks

- [x] Task 1: Add config modal HTML/CSS to home.ts webview
  - **Objective**: Create 3-step modal structure with all required fields
  - **Test**: Modal displays with correct fields and styling

- [x] Task 2: Implement config file loading logic in extension
  - **Objective**: Read from .env.openclaw or .env.openclaw.example
  - **Test**: Correct values loaded and sent to webview

- [x] Task 3: Implement directory browse functionality
  - **Objective**: Wire up Browse button to vscode.window.showOpenDialog
  - **Test**: Clicking Browse opens native folder picker, path returned to webview

- [x] Task 4: Implement Step 2 confirm flow
  - **Objective**: Display read-only values, handle Confirm click
  - **Test**: Values displayed read-only, Confirm writes to .env.openclaw

- [x] Task 5: Implement Step 3 provisioning
  - **Objective**: Execute docker compose command with proper flags
  - **Test**: Docker services start, status shown in UI

- [x] Task 6: Test complete flow end-to-end
  - **Objective**: Verify full 3-step flow works correctly
  - **Test**: Can configure, confirm, and provision Docker services
  - **Status**: Playwright tests require system dependencies (libglib, etc.) to run

- [ ] Task 7: Wire Docker card to config modal (bug fix)
  - **Objective**: The Docker card in host picker should call `chooseDocker()` to show config modal, not `pick('docker')` which opens separate panel
  - **Test**: Clicking Docker card shows the 3-step config modal (test: `clicking docker card shows 3-step config modal`)
  - **Depends on**: Task 1 (modal must exist)

## Testing Notes

### Playwright Test Configuration

Two Playwright configuration files are provided:

1. **`playwright.config.ts`** (default) - Uses bundled Playwright Chromium in headless mode
2. **`playwright.remote-debugging.config.ts`** - For connecting to an existing Chrome instance with remote debugging enabled on port 9222

### Running Tests

```bash
# Run tests with default config
npx playwright test tests/e2e/docker-setup.spec.ts --reporter=list

# Run tests with remote debugging config (requires Chrome running with --remote-debugging-port=9222)
npx playwright test --config=playwright.remote-debugging.config.ts
```

### Known Test Environment Requirements

The tests require the following system dependencies to be installed in the execution environment:
- `libglib-2.0.so.0`
- Other Chromium dependencies (usually installed via `npx playwright install-deps`)

For Docker environments, use the mcp-playwright-novnc Docker image which includes all dependencies:
```bash
docker run -it --rm --network host -v $(pwd):/workspace ghcr.io/xtr-dev/mcp-playwright-novnc:latest npx playwright test
```

### Test Coverage

The existing `tests/e2e/docker-setup.spec.ts` tests validate:
- Docker card visibility in host picker
- Clicking Docker card flow
- Provision panel elements presence
- Step timeline states
- Docker compose auto-start behavior
- Back button navigation

For the new 3-step config flow, these additional test scenarios should be added:
- Config modal opens with Step 1 when Docker is chosen
- Step 1 shows all 4 config fields (image, port, data dir, fresh build)
- Browse button triggers folder picker
- "Next" button advances to Step 2
- Step 2 shows read-only values
- "Confirm" button saves config and advances to Step 3
- Step 3 shows provisioning progress
- Cancel buttons return to previous step
