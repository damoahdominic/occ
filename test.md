# OCcode Build QA Checklist

Manual test suite to run before shipping any build. Check each item. A build is shippable only when all critical items pass.

---

## 1. Editor Launch

- [ ] Editor opens without crashing
- [ ] No white/blank screen on startup
- [ ] OCC Home panel auto-opens on first launch
- [ ] OCC Home panel auto-opens on subsequent launches
- [ ] Window title shows "OCcode" (not "Visual Studio Code" or "Void")
- [ ] Activity bar shows only Explorer and Search (SCM, Debug, Extensions hidden)
- [ ] No error dialogs or notifications on cold start

---

## 2. Authentication — Login / Logout

- [ ] Clicking "Sign in with OCC" opens the browser and redirects to `occ.mba.sh/login`
- [ ] After browser login, the deep-link (`occode://`) redirects back to the editor
- [ ] OCC Home updates to show the logged-in state (user email/avatar visible)
- [ ] Credit balance status bar item appears in the bottom-right after login
- [ ] Credit balance shows the correct value from the backend (matches `occ.mba.sh/dashboard`)
- [ ] Clicking "Sign Out" in OCC Home clears the session
- [ ] After logout, OCC Home returns to the signed-out state
- [ ] After logout, credit balance status bar item disappears
- [ ] After logout, MoltPilot inference is blocked (chat returns an auth error or refuses to run)
- [ ] JWT is not persisted after logout (re-opening editor shows signed-out state)

---

## 3. Credit Balance

- [ ] Balance shown in status bar matches backend immediately after login
- [ ] Balance decreases after sending a MoltPilot chat message
- [ ] Balance decrease is proportional to message length / inference cost (rough check)
- [ ] Balance animates smoothly when it decreases (not a hard jump)
- [ ] Balance turns yellow/warning colour when below $0.20
- [ ] Balance turns red/error colour when near $0.00
- [ ] Clicking the balance status bar item shows the "OCC Credits" tooltip with current value and "Get More Credits" link
- [ ] "Get More Credits" link opens `occ.mba.sh/credits` in the external browser
- [ ] Balance auto-refreshes every ~60 seconds while the editor is open (check after waiting)
- [ ] Balance does not show when signed out

---

## 4. OpenClaw Installation

- [ ] OCC Home correctly detects that OpenClaw is NOT installed on a fresh machine
- [ ] "Install OpenClaw" flow launches without crashing
- [ ] Installation progress is shown in the OCC Home panel (log output visible)
- [ ] After installation, OCC Home detects the installed state automatically (no manual refresh needed)
- [ ] `~/.openclaw/openclaw.json` is created after a successful install
- [ ] `~/.openclaw/workspace/` directory is created and contains `AGENTS.md`, `IDENTITY.md`, `USER.md`, `TOOLS.md`
- [ ] OCC Home shows the correct CLI version after installation
- [ ] "Up to date" message appears when installed version matches latest npm version
- [ ] "Update available" banner appears when installed version is behind latest

---

## 5. OpenClaw Gateway

- [ ] Gateway status shows "Stopped" when the gateway is not running
- [ ] Clicking "Start" triggers the gateway start flow via MoltPilot
- [ ] While starting, the spinner animates (does not freeze)
- [ ] Status transitions from "Starting" → "Running" once the gateway is up
- [ ] Clicking "Stop" triggers the gateway stop flow via MoltPilot
- [ ] While stopping, the spinner animates
- [ ] Status transitions from "Stopping" → "Stopped" once the gateway is down
- [ ] Clicking "Restart" works correctly (Stopping → Starting → Running)
- [ ] Gateway status polls every ~2 seconds while the panel is open
- [ ] Correct port is used when a non-default port is configured in `openclaw.json`

---

## 6. OCC Home Panel — General

- [ ] Panel loads and renders fully (no blank sections)
- [ ] All buttons are clickable and responsive
- [ ] "Open Dashboard" opens `occ.mba.sh/dashboard` in the external browser
- [ ] Workspace files (AGENTS.md, IDENTITY.md, etc.) open correctly in the editor when clicked
- [ ] Panel re-renders correctly when the window regains focus
- [ ] No console errors in the extension host output channel

---

## 7. OpenClaw Configure Panel

- [ ] "Configure" button opens the Configure panel (in-editor browser)
- [ ] Configure panel loads the gateway UI at `localhost:18789`
- [ ] Page renders correctly inside the panel (no blank iframe)
- [ ] Cmd+C copies selected text inside the panel
- [ ] Cmd+V pastes text inside the panel
- [ ] Cmd+X cuts selected text inside the panel
- [ ] Right-click context menu is available inside the panel
- [ ] Refresh button reloads the page inside the panel
- [ ] "Open in External Browser" button opens `localhost:18789` in the system browser
- [ ] If the gateway is not running, clicking "Configure" prompts MoltPilot to start it

---

## 8. MoltPilot (AI Chat)

### Basic Functionality
- [ ] Chat sidebar opens via the sidebar icon
- [ ] Sending a message receives a response
- [ ] Response streams in token-by-token (not all at once)
- [ ] Chat history persists within the session
- [ ] Switching between Normal / Agent / Gather modes works

### System Prompt Accuracy
- [ ] MoltPilot never asks "What OS are you on?" — it already knows
- [ ] MoltPilot never asks for info already in the system prompt (open files, workspace, terminal IDs)
- [ ] MoltPilot identifies itself correctly and doesn't break character

### OpenClaw Status Awareness
- [ ] If OpenClaw is already installed, MoltPilot does NOT suggest installing it
- [ ] If an AI model is already configured, MoltPilot does NOT suggest setting one up
- [ ] If the first agent is already configured, MoltPilot does NOT suggest creating one
- [ ] If a channel is connected (`"enabled": true`), MoltPilot does NOT suggest connecting it
- [ ] If a channel is disabled (`"enabled": false`), MoltPilot treats it as NOT connected
- [ ] MoltPilot only suggests next steps that are genuinely incomplete

### Non-Technical User Rules
- [ ] MoltPilot never tells the user to run a terminal command manually (in Agent mode it runs commands itself)
- [ ] In Normal mode, MoltPilot suggests switching to Agent mode rather than showing shell commands

### Tool Calls (Agent Mode)
- [ ] Edit file tool works: edits are applied to files correctly
- [ ] Write file tool works: new file content is written as a string (not as an object)
- [ ] Read file tool works: correct file contents returned
- [ ] Terminal tool works: commands execute and output is captured
- [ ] Search/Replace blocks apply correctly (no "ORIGINAL not found" errors on clean edits)

### Auth Gating
- [ ] Signed out → sending a chat message is blocked or returns an auth error
- [ ] Signed in → inference works
- [ ] Signing out mid-session stops further inference

---

## 9. Onboarding Walkthrough

- [ ] VS Code walkthrough appears on first launch ("Get Started" tab)
- [ ] Step 1 (Choose AI) — both MoltPilot and BYOK buttons work
- [ ] Step 2 (Theme) — Dark and Light theme buttons apply the correct theme
- [ ] Walkthrough does not re-appear on subsequent launches after being completed

---

## 10. Workspace Behaviour

- [ ] `~/.openclaw` folder is opened as "My OpenClaw Workspace" after installation
- [ ] Workspace file is stored in `~/.occ/` (not polluting `~/.openclaw`)
- [ ] Re-opening the editor re-opens the same workspace
- [ ] Explorer shows `~/.openclaw` contents correctly

---

## 11. Editor Core

- [ ] Files open, edit, and save correctly
- [ ] Syntax highlighting works for common languages (TypeScript, Python, JSON, Markdown)
- [ ] Search (`Cmd+Shift+F`) works across the workspace
- [ ] File explorer (`Cmd+Shift+E`) shows workspace files
- [ ] Terminal opens and accepts commands (`Ctrl+\``)
- [ ] Extensions panel is hidden (not visible in activity bar)
- [ ] SCM / Git panel is hidden

---

## 12. Regression — Known Past Bugs

These have been fixed. Verify they do not regress.

- [ ] Gateway spinner actually spins (CSS `@keyframes gw-spin` defined)
- [ ] Cmd+C/X/V work inside the Configure panel iframe
- [ ] Write file tool receives a string, not a parsed JSON object
- [ ] Edit file tool handles CRLF line endings without "ORIGINAL not found" errors
- [ ] Edit file tool handles trailing whitespace mismatches
- [ ] Edit file tool handles literal `\n` escape sequences from LLM output
- [ ] Logout clears the JWT from both renderer settings and extension host storage
- [ ] `ocFreeModel` is only "configured" when a JWT is present (not always)
- [ ] Channels with `"enabled": false` are NOT reported as connected to MoltPilot

---

## How to Run

1. Kill any running OCcode instance
2. Run `clear-editor-cache.sh` to start from a clean state
3. Launch: `VSCODE_SKIP_PRELAUNCH=1 NODE_ENV=development VSCODE_DEV=1 .build/electron/OCcode.app/Contents/MacOS/Electron .`
4. Work through each section above
5. Mark items `[x]` as they pass, note failures with details

A build with any **critical** failures (sections 2, 3, 8 auth gating) should not ship.
