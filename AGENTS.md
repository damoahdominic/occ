# OCcode — Agent Reference

This file is the authoritative reference for AI agents working in this repository.
It supersedes all older planning documents.

---

## Project Overview

**OCcode** is a branded IDE built on the [Void editor](https://github.com/voideditor/void) fork
(which is itself a fork of VS Code). It ships with the **OpenClaw** VS Code extension pre-bundled.

The old `apps/wrapper` (Electron bootstrapper that downloaded VSCodium) has been retired.
The Void editor fork is now the main platform.

---

## Monorepo Structure

```
occ/
├── apps/
│   ├── editor/           # Void editor fork — main IDE platform
│   └── web/              # Next.js marketing site
├── packages/
│   └── control-center/   # Shared React UI components
├── watch-editor.sh       # Dev: compile editor (macOS/Linux)
├── watch-editor.bat      # Dev: compile editor (Windows)
├── launch-editor.sh      # Dev: launch editor (macOS/Linux)
├── launch-editor.bat     # Dev: launch editor (Windows)
└── watch-react.sh        # Dev: watch Void React UI components (macOS/Linux)
```

**Root `package.json` workspaces:** `apps/web`, `packages/control-center`

`apps/editor` is **intentionally excluded from workspaces** — see the npm section below.

---

## apps/editor

A fork of the Void editor (vscode `code-oss-dev` v1.99.3). Already branded as OCcode:
- `product.json` → `applicationName: occode`, `dataFolderName: .occode-editor`

### Node version — critical

**Exact version required: `20.18.2`**

Enforced by `apps/editor/build/npm/preinstall.js`. Will hard-fail `npm install` on any other version.
The required version is pinned in `apps/editor/.nvmrc`.

```bash
nvm install 20.18.2   # first time only
cd apps/editor
nvm use               # reads .nvmrc automatically
npm install
```

### Why apps/editor is excluded from root workspaces

When `apps/editor` is in the root `workspaces` array, npm hoists its dependencies (including `gulp`)
to the root `node_modules/`. The editor's internal scripts reference `./node_modules/gulp/bin/gulp.js`
as a local path — hoisting breaks this, causing `Error: Cannot find module`.

Root `package.json` scripts use `npm --prefix apps/editor run <script>` instead of
`npm run --workspace=apps/editor <script>` to delegate without triggering hoisting.

### Installing editor dependencies

Always install inside the editor directory directly:

```bash
cd apps/editor && nvm use && npm install
```

Running `npm install` from the repo root will **not** install editor dependencies.

---

## Dev Cycle

### Step 1 — Build React components (once, or when React source changes)

The Void AI UI (sidebar, settings, Ctrl+K modal etc.) is a separate React build pipeline.
The compiled bundles must exist at `apps/editor/src/vs/workbench/contrib/void/browser/react/out/`
before the main TypeScript compilation runs. If they are missing, the main build emits ~9
"Cannot find module" errors for the React bundle paths.

```bash
# From repo root:
npm run editor:build-react

# Or directly:
cd apps/editor && npm run buildreact
```

Only re-run when editing files inside:
`apps/editor/src/vs/workbench/contrib/void/browser/react/src/`

The `watch-editor.sh` script automatically runs `buildreact` if `react/out/` is missing,
and compiles `extensions/openclaw/` if `extensions/openclaw/out/extension.js` is missing.

### Step 2 — Watch the editor (keep running in Terminal 1)

```bash
./watch-editor.sh       # macOS/Linux
watch-editor.bat        # Windows
```

Runs `gulp watch-client` with the correct Node version. Initial compile takes ~2 minutes,
incremental recompiles take a few seconds.

**Ready signal:**
```
Finished compilation with N errors after Xms
Starting compilation...         ← watch mode is now active
```

### Step 3 — Launch the editor (Terminal 2)

```bash
./launch-editor.sh      # macOS/Linux
launch-editor.bat       # Windows
```

Runs `apps/editor/scripts/code.sh` (or `code.bat`) against the compiled `out/` directory.
Any flags are passed through: `./launch-editor.sh --verbose`

### Step 4 — Reload after changes

After saving a source file, `watch-client` recompiles in seconds.
Pick up changes in the running editor: `Cmd+Shift+P` → `Developer: Reload Window`

### Optional — Watch React components (Terminal 3)

Only needed when editing Void AI React source files:

```bash
./watch-react.sh        # macOS/Linux
```

---

## Build System

Two completely independent pipelines:

### 1. Main TypeScript build (gulp)

| | |
|---|---|
| Command | `npm run watch-client` or `npm run compile` |
| Tool | gulp + custom tsc pipeline |
| Input | `src/**/*.ts` |
| Output | `out/` (~139 MB of compiled JS) |
| Config | `src/tsconfig.json` |

`noEmitOnError` is **not set** — JS is emitted even when TypeScript errors are present.

### 2. Void React build (tsup)

| | |
|---|---|
| Commands | `npm run buildreact` (one-off), `npm run watchreact` (watch) |
| Tools | `scope-tailwind` → `tsup` |
| Input | `react/src/` |
| Intermediate | `react/src2/` (auto-generated — never edit directly) |
| Output | `react/out/` (7 JS bundles) |

The React build must run before the main TypeScript build. The main TS code imports the
React bundles as external `.js` files — if they don't exist, TypeScript reports module
not found errors (but still emits JS for all other files).

---

## Void React Components

**Location:** `apps/editor/src/vs/workbench/contrib/void/browser/react/`

Seven bundles compiled by tsup, each with an `index.tsx` that exports a `mountXxx()` function:

| Bundle | Mount function(s) | Purpose |
|--------|-------------------|---------|
| `sidebar-tsx` | `mountSidebar` | AI chat panel — threads, messages, markdown |
| `void-settings-tsx` | `mountVoidSettings` | AI provider and model configuration UI |
| `void-editor-widgets-tsx` | `mountVoidCommandBar`, `mountVoidSelectionHelper` | Accept/reject diff bar inside the editor |
| `quick-edit-tsx` | `mountCtrlK` | Ctrl+K quick-edit modal |
| `void-onboarding` | `mountVoidOnboarding` | First-launch onboarding screen |
| `void-tooltip` | `mountVoidTooltip` | Tooltip system |
| `diff` | _(re-export)_ | `diffLines` / `Change` from the `diff` npm package |

### Key files

| File | Purpose |
|------|---------|
| `src/util/services.tsx` | State hub. Bridges VS Code services into React hooks (`useChatThreadsState`, `useSettingsState`, `useIsDark`, etc.) using manual listener sets — no Redux or Context API. |
| `src/util/mountFnGenerator.tsx` | Creates standardised `{ rerender, dispose }` mount functions used by all bundles. |
| `src/util/inputs.tsx` | Shared input components — `InputBox`, `SelectBox`, `Checkbox`, custom dropdowns. |
| `src/markdown/ChatMarkdownRender.tsx` | Markdown renderer for chat messages, including code blocks with apply/reject buttons. |
| `build.js` | Build orchestrator — runs scope-tailwind then tsup. |
| `tsup.config.js` | Bundles all npm deps; keeps `../../../*.js` imports external (VS Code services). |
| `tailwind.config.js` | Tailwind with `void-` prefix, colours mapped to `--vscode-*` CSS variables. |

### src/ vs src2/

- `src/` — Source files. **Edit these.**
- `src2/` — Auto-generated by `scope-tailwind`, which scopes all Tailwind classes under
  a `void-scope` namespace to prevent collisions with VS Code's own styles.
  **Never edit `src2/` directly** — it is overwritten on every build.

### How React mounts into VS Code

The main TypeScript code imports a compiled bundle and calls its mount function:

```typescript
import { mountSidebar } from './react/out/sidebar-tsx/index.js'
const { rerender, dispose } = mountSidebar(domElement, accessor)
```

`mountFnGenerator` handles ReactDOM root creation, registers VS Code service event listeners,
and returns lifecycle methods for the workbench contribution system.

---

## Known TypeScript Errors (pre-existing, non-blocking)

Every compilation produces 44 TypeScript errors. They fall into two categories:

**Category 1 — React bundles not built (~9 errors, fixable):**
```
Cannot find module '../react/out/diff/index.js'
Cannot find module './react/out/sidebar-tsx/index.js'
```
Fix: run `npm run editor:build-react` once.

**Category 2 — API version skew in Void fork (~35 errors, expected):**
```
vscode.d.ts(6,1): Definitions of the following identifiers conflict with those in another file
extHostMcp.ts: Property 'env' does not exist on type 'McpServerDefinition'
extHostTypes.ts: Class 'LanguageModelDataPart' incorrectly implements...
```
The Void fork's implementation is behind the `vscode.d.ts` type definitions it ships with.
These are inherited from upstream and do not affect runtime behaviour. `noEmitOnError` is unset
so all JS is emitted normally. **Do not attempt to fix these** without a clear reason — they
span the VS Code extension host API and changes risk breaking runtime behaviour.

---

## Root npm Scripts

| Script | What it does |
|--------|-------------|
| `npm run editor:build-react` | One-off build of Void React bundles |
| `npm run editor:watch-react` | Watch mode for Void React bundles |
| `npm run editor:compile` | One-off full compile of the editor |
| `npm run editor:build` | Full compile-build (for distribution) |
| `npm run dev` | `gulp watch-client` on the editor |
| `npm run dev:react` | `watchreact` on the editor |
| `npm run web` | Next.js dev server for `apps/web` at `http://localhost:3000` |
---

## apps/web — Marketing Site

Next.js 16 with Turbopack. Fully independent — no shared build steps with the editor.

```bash
npm run web    # dev server at http://localhost:3000
```

---

## Platform Notes

### macOS / Linux
- The helper scripts source `~/.nvm/nvm.sh` and call `nvm use` automatically.
- Editor launches via `apps/editor/scripts/code.sh`.

### Windows
- Requires [nvm-windows](https://github.com/coreybutler/nvm-windows).
- `.bat` scripts hardcode `nvm use 20.18.2` — nvm-windows does not read `.nvmrc`.
- Editor launches via `apps/editor/scripts/code.bat`.
