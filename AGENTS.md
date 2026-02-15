# AGENTS.md — OCcode Plan

## Goal
Build **OCcode**, a branded, cross‑platform app (Windows/Mac/Linux) that ships a portable VS Code/VSCodium bundle and auto‑installs the **OpenClaw** VS Code extension that provides a custom home screen and local OpenClaw setup tools.

## Requirements (from boss)
1) **Change app icon/name** (OCcode.exe / OCcode.dmg / OCcode.AppImage)  
2) **Custom home screen** (OpenClaw home panel)  
3) **OpenClaw extension** to install/configure local OpenClaw  
4) **Public GitHub repo**, contributors welcome  
5) **Cross‑platform binaries** (Win/Mac/Linux)

---

## Architecture Summary
**Two apps in one repo:**
- **Wrapper (Electron)** → Branding + installation flow + launches VS Code portable.
- **Extension (VS Code)** → Home UI + OpenClaw install/config wizard + status/logs.

**Why:** avoids forking VS Code while still delivering branded UX and custom panels.

---

## Milestones

### Milestone 1 — Repo Scaffolding
- [x] Create repo structure (`apps/wrapper`, `apps/extension`, `scripts`, `.github/workflows`).
- [x] Write README with goals.
- [ ] Add this AGENTS.md plan.

### Milestone 2 — Wrapper MVP (Electron)
**Goal:** OCcode launches, downloads portable VS Code/VSCodium, installs extension, starts editor.

**Tasks**
- [ ] Create Electron app in `apps/wrapper`.
- [ ] Branding: name, icon, window title.
- [ ] Download portable VS Code/VSCodium:
  - Win: ZIP build
  - Mac: ZIP/tar + custom `--user-data-dir`
  - Linux: tar.gz/AppImage + custom `--user-data-dir`
- [ ] Unpack to `~/.occode/vscode/` (per user).
- [ ] Install extension:
  - Use bundled `.vsix` (preferred for MVP)
  - or fetch latest from URL
- [ ] Set defaults:
  - `settings.json` (theme, icons, disable default welcome)
  - `workspace.code-workspace`
- [ ] Launch portable `code` binary from wrapper.

**Deliverable:** `OCcode` opens VS Code with OpenClaw extension installed.

### Milestone 3 — Extension MVP
**Goal:** Custom Home + OpenClaw local setup wizard.

**Tasks**
- [ ] Scaffold extension in `apps/extension`.
- [ ] Command: `OpenClaw: Home` (webview panel).
- [ ] Command: `OpenClaw: Setup Local` (wizard).
- [ ] Wizard steps:
  - Detect OS
  - Check prerequisites (git, node, python, docker?)
  - Download OpenClaw repo
  - Create `.env` template
  - Run setup script
- [ ] Status panel: show logs + running state.

**Deliverable:** Home panel + one‑click local setup.

### Milestone 4 — Packaging & CI
**Goal:** Build Win/Mac/Linux binaries automatically.

**Tasks**
- [ ] GitHub Actions workflow:
  - build wrapper (electron-builder)
  - upload artifacts
- [ ] Release automation:
  - attach installers
  - publish extension `.vsix`

---

## Technical Decisions
- **Wrapper:** Electron + Node.js
- **Extension:** VS Code API + Webviews
- **Bundled Editor:** VS Code ZIP or VSCodium portable
- **Update Strategy:**
  - Extension updated often (no wrapper rebuild)
  - Wrapper rebuild only for install‑flow changes

---

## Repo Conventions
- `apps/wrapper/` → Electron app, packaging scripts
- `apps/extension/` → VS Code extension
- `scripts/` → download/install helpers
- `.github/workflows/` → CI pipelines

---

## Risks & Mitigations
- **Portable builds differ per OS** → standardize with `--user-data-dir` and scripted install.
- **Extension APIs change** → pin VS Code version in wrapper until tested.
- **Large downloads** → cache in `~/.occode/` and only update when necessary.

---

## Next Actions
1) Scaffold Electron wrapper (MVP).
2) Scaffold extension with Home webview.
3) Add CI build workflow.
4) Test cross‑platform packaging.

---

## Owner
Dominic (boss) + contributors

## Status
Draft plan ready. Next step: scaffold wrapper + extension.
