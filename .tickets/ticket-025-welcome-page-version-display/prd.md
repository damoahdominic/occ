# PRD: Ticket 025 - Show Version Below OCC Logo on Welcome Page

## 1. Problem Statement

The OCC welcome/onboarding page and home panel display the OCC logo but give users no indication of which version of the extension they are running. This makes it harder to diagnose issues and verify updates.

## 2. Proposed Solution

Render the extension version string (e.g. `v3.2.46`) in small muted text immediately below the OCC logo image in:

1. **Onboarding panel** (`extensions/openclaw/src/panels/onboarding.ts`) — the first-run welcome screen.
2. **Home panel** (`extensions/openclaw/src/panels/home.ts`) — all HTML-generating methods that include the logo: `_getHtml`, `_getHostsOverviewHtml`, `_getHostTypeSelectionHtml`, and `_getLoadingHtml`.

The version is read from `context.extension.packageJSON.version` (already available in both panels via the passed `ExtensionContext`) and passed as a parameter to each private HTML-generator function.

## 3. Acceptance Criteria

- The version string appears directly below the OCC logo on every panel view that shows the logo.
- Format: `v{major}.{minor}.{patch}` (e.g. `v3.2.46`).
- Text is visually subtle — small font size (~11–12 px), muted color (`#666` or `var(--vscode-descriptionForeground)`), not bold.
- No layout shift or visual disruption to the existing logo + heading arrangement.
- Version is sourced dynamically from `packageJSON.version`, not hardcoded.

## 4. Technical Considerations

- `onboarding.ts`: `_show()` already receives `context: vscode.ExtensionContext`. Read `context.extension.packageJSON.version` there and pass it into `_getHtml(iconUri, version)`.
- `home.ts`: `_getHtml` and sibling methods are instance methods; read version once in `createOrShow` or the constructor from the passed `ExtensionContext` and store as `this._version`, then pass to each HTML method.
- Use a `<p class="version-label">` element styled inline or via the existing `<style>` block in each HTML string.
- No new files required — changes are isolated to the two panel files.

## 5. Dependencies

- None (read-only access to existing `packageJSON.version`).

## 6. Subtask Checklist

- [x] Task 1: Update `onboarding.ts`
  - **Problem:** `_getHtml` has no version parameter and no version display.
  - **Test:** Open OCC in first-run state; version appears below the logo.
  - **Subtasks:**
    - [x] Subtask 1.1: Read version in `_show()` via `context.extension.packageJSON.version` and pass to `_getHtml(iconUri, version)`.
    - [x] Subtask 1.2: Add `version` parameter to `_getHtml` signature.
    - [x] Subtask 1.3: Insert `<p class="version-label">v${version}</p>` after the `<img class="logo">` element.
    - [x] Subtask 1.4: Add `.version-label` CSS rule (11px, `#555`, `letter-spacing: 0.03em`) to the `<style>` block.

- [x] Task 2: Update `home.ts`
  - **Problem:** All four logo-displaying HTML methods lack version output.
  - **Test:** Open OCC Home panel in each state (loading, host picker, host overview, dashboard); version appears below logo in all states.
  - **Subtasks:**
    - [x] Subtask 2.1: Store version as `this._version` in constructor via `vscode.extensions.getExtension('openclaw.home')?.packageJSON?.version`.
    - [x] Subtask 2.2: Added `version` parameter to `_getHtml`, `_getHostsOverviewHtml`, `_getHostTypeSelectionHtml`, `_getLoadingHtml`; `_getHtml` passes through to `renderStatusHtml` (in `statusHtml.ts`).
    - [x] Subtask 2.3: Inserted `<p class="version-label">v${version}</p>` after each `<img class="logo">` element in all four methods.
    - [x] Subtask 2.4: Added `.version-label` CSS rule in each method's `<style>` block.

- [x] Task 3: Visual verification
  - **Problem:** Confirm no layout regressions across all panel states.
  - **Test:** `npm run compile` — clean build (0 errors). Pre-existing `TS1308` on the `await` in `onDidReceiveMessage` was also fixed (`msg =>` → `async msg =>`).
  - **Subtasks:**
    - [x] Subtask 3.1: Onboarding first-run view — `onboarding.js` contains 2 `version-label` occurrences (1 CSS, 1 HTML).
    - [x] Subtask 3.2: Home loading state — compiled into `home.js`.
    - [x] Subtask 3.3: Host type selection view — compiled into `home.js`.
    - [x] Subtask 3.4: Hosts overview view — compiled into `home.js`.
    - [x] Subtask 3.5: Full dashboard view — `statusHtml.js` contains 3 `version-label` occurrences (1 CSS, 2 HTML for installed/not-installed branches).
