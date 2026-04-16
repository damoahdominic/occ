# ticket-046: Docker Setup Config Flow Enhancement

## Problem Statement

The multihost merge brought in the `openclaw-docker` extension with `DockerSetupPanel`, but it has hardcoded values:
- Image: `ghcr.io/openclaw/openclaw:latest`
- Port: 18790
- Data directory: `~/Desktop/occ-state-dir`
- Bind host: implicit

Users need a 3-step configuration flow (Config → Confirm → Provision) to customize these settings before Docker provisioning begins.

## Scope

Enhance the existing `DockerSetupPanel` in `openclaw-docker` extension with user-configurable options, implementing a 6-step flow:
- **Step 1 (Config)**: Configure image, port, data directory, bind host, fresh build
- **Step 2 (Confirm)**: Review settings before applying
- **Step 3**: Docker preflight check
- **Step 4**: Pull image
- **Step 5**: Onboard
- **Step 6**: Launch gateway

## User Flow

```
DockerSetupPanel
  └─ Step 1: Config
       ├─ Image field (editable, default: ghcr.io/openclaw/openclaw:latest)
       ├─ Port field (editable, default: 18790)
       ├─ Data Directory field + Browse button (editable, default: ./openclaw_docker_data)
       ├─ Bind Host dropdown (127.0.0.1 or 0.0.0.0)
       ├─ Fresh Build checkbox
       ├─ Stepper: [1. Config●] [2. Confirm] [3. Check] [4. Pull] [5. Onboard] [6. Launch]
       └─ [Next] → Step 2
  └─ Step 2: Confirm
       ├─ All 5 fields read-only
       ├─ Stepper: [1. Config✓] [2. Confirm●] [3. Check] [4. Pull] [5. Onboard] [6. Launch]
       ├─ [Back] → Step 1 (values preserved)
       └─ [Confirm] → Write config → Step 3 (Preflight)
  └─ Step 3: Preflight Check (existing)
  └─ Step 4: Pull Image (uses configured image)
  └─ Step 5: Onboard (existing)
  └─ Step 6: Launch Gateway (uses configured port, data dir, bind host)
```

## Acceptance Criteria

### Gherkin BDD Format

```gherkin
Feature: Docker Configuration Flow

  Scenario: Config step loads existing settings
    Given no configuration file exists
    When the user opens Docker setup
    Then Step 1 shows default values:
      | Field       | Default Value                        |
      | Image       | ghcr.io/openclaw/openclaw:latest    |
      | Port        | 18790                                |
      | Data Dir    | ./openclaw_docker_data               |
      | Bind Host   | 127.0.0.1                            |
      | Fresh Build | unchecked                            |

  Scenario: Config step loads saved settings
    Given docker/.env.openclaw exists with:
      """
      GATEWAY_IMAGE=custom:latest
      GATEWAY_PORT=18795
      OPENCLAW_DATA_DIR=/custom/path
      BIND_HOST=0.0.0.0
      FRESH_BUILD=true
      """
    When the user opens Docker setup
    Then Step 1 shows the saved values

  Scenario: Browse button opens folder picker
    Given the user is on Step 1 Config
    When the user clicks Browse next to Data Directory
    Then VS Code shows a native folder picker dialog
    And selected folder path appears in the Data Directory field

  Scenario: Next button advances to Confirm
    Given the user is on Step 1 Config
    When the user fills in valid values and clicks Next
    Then Step 2 Confirm shows all values as read-only

  Scenario: Back button returns to Config with values preserved
    Given the user is on Step 2 Confirm
    When the user clicks Back
    Then Step 1 Config displays the previously entered values

  Scenario: Confirm writes config and starts provisioning
    Given the user is on Step 2 Confirm
    When the user clicks Confirm
    Then config is written to docker/.env.openclaw (atomic)
    And Step 3 Preflight begins with config values

  Scenario: User can cancel at any step
    Given the user is on any step
    When the user clicks Cancel
    Then the panel closes
    And the host picker reopens

  Scenario: Invalid port shows error
    Given the user is on Step 1 Config
    When the user enters port "99999"
    And clicks Next
    Then an error message shows "Port must be between 1 and 65535"

  Scenario: Empty data directory shows error
    Given the user is on Step 1 Config
    When the user clears the Data Directory field
    And clicks Next
    Then an error message shows "Data directory is required"

## Acceptance Criteria Status

- [x] Step 1 loads existing config from `docker/.env.openclaw` if it exists
- [x] If no config file exists, defaults are loaded
- [x] All 5 config fields displayed in Step 1: image, port, data dir, fresh build, bind host
- [x] Data directory has "Browse" button opening native VS Code folder picker
- [x] "Next" button advances to Step 2
- [x] Step 2 shows all values as read-only
- [x] "Confirm" button writes to `docker/.env.openclaw` (atomic)
- [x] After confirm, Step 3 (Preflight) executes with config values
- [x] User can go Back from Confirm to Config (values preserved)
- [x] User can Cancel at any step
- [x] Error states handled gracefully

## Technical Considerations

### Config File Handling

- **Location**: `docker/.env.openclaw` (user config)
- **Template**: `docker/.env.openclaw.example` (defaults)
- **Read priority**: If `docker/.env.openclaw` exists, load it; otherwise use defaults
- **Write**: Always write to `docker/.env.openclaw` (create if not exists)
- **Atomic write**: Write to temp file, then rename to target
- **Defaults path**: Relative to `docker/` folder (e.g., `./openclaw_docker_data`)

### Environment Variables

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| GATEWAY_IMAGE | string | ghcr.io/openclaw/openclaw:latest | Docker image to pull |
| GATEWAY_PORT | number | 18790 | Host port for gateway |
| OPENCLAW_DATA_DIR | string | ./openclaw_docker_data | Path to data directory |
| BIND_HOST | string | 127.0.0.1 | Host binding (127.0.0.1 or 0.0.0.0) |
| FRESH_BUILD | boolean | false | Whether to rebuild image |

### Webview ↔ Extension Communication

```
Webview → Extension:
  - 'dockerBrowseDir': Open folder picker
  - 'dockerSaveConfig': { image, port, dataDir, freshBuild, bindHost }
  - 'dockerConfirmConfig': Save and proceed to Step 3
  - 'dockerBack': Return to previous step
  - 'dockerCancel': Close panel

Extension → Webview:
  - 'dockerConfigLoaded': { image, port, dataDir, freshBuild, bindHost }
  - 'dockerBrowseResult': { path }
  - 'dockerConfigError': { message }
```

### Container Name

Keep as `occ-openclaw` (not configurable) to maintain compatibility with existing logic.

## Tasks

- [x] Task 1: Add config state management to DockerSetupPanel
  - **Objective**: Add state for config step, draft values, step tracking
  - **Test**: State variables initialized correctly on panel creation

- [x] Task 2: Implement config file load/save helpers
  - **Objective**: Read from docker/.env.openclaw or defaults; write atomically
  - **Test**: Config loads from file, saves to file, handles missing file

- [x] Task 3: Add Step 1 Config HTML and handlers
  - **Objective**: Render form with all 5 fields, wire Browse button
  - **Test**: Form displays, fields are editable, Browse opens picker

- [x] Task 4: Add Step 2 Confirm HTML and handlers
  - **Objective**: Render read-only values, Back/Confirm buttons
  - **Test**: Values display read-only, Back preserves values, Confirm saves

- [x] Task 5: Wire config into provisioning steps
  - **Objective**: Use config values in preflight, pull, launch
  - **Test**: Provisioning uses configured image, port, data dir

- [x] Task 6: Add validation and error handling
  - **Objective**: Validate port range, required fields
  - **Test**: Invalid input shows appropriate error messages

- [x] Task 7: Update step timeline UI
  - **Objective**: Show all 6 steps in stepper
  - **Test**: Timeline updates correctly on each step transition

## Dependencies

- None — this is a self-contained enhancement to existing DockerSetupPanel

## Files Modified

- `apps/editor/extensions/openclaw-docker/src/setup-panel.ts`
- `apps/editor/extensions/openclaw-docker/src/extension.ts` (if needed for new commands)