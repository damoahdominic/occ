# Contributing to OCC

Thanks for your interest in contributing!

## Repository structure

| Path | Description |
|------|-------------|
| `apps/editor` | OCC editor (Void/VS Code fork) |
| `apps/web` | Marketing website (Next.js) |
| `apps/extension` | OpenClaw VS Code extension |
| `packages/control-center` | Shared React UI components |

## Prerequisites

- **Node 20.18.2** — the editor enforces this via `build/npm/preinstall.js`
  ```bash
  nvm install 20.18.2 && nvm use 20.18.2
  ```
- Python 3 (for native module builds)
- Git

## Local development

### Marketing website
```bash
npm install
npm run web        # http://localhost:3000
```

### Editor
```bash
cd apps/editor
npm ci --ignore-scripts

# Compile main editor (fast, ~5 s, no type-check errors)
node_modules/.bin/gulp transpile-client-esbuild

# Compile OpenClaw extension
cd extensions/openclaw && npx tsc -p ./ && cd ../..

# Launch (macOS)
VSCODE_SKIP_PRELAUNCH=1 NODE_ENV=development VSCODE_DEV=1 \
  ./.build/electron/OCcode.app/Contents/MacOS/Electron .
```

### OCC Free Tier (optional)
The built-in free tier uses an inference backend configured via environment variables.
Copy `.env.example` to `.env` and fill in your own endpoint if you want to test it:
```bash
cp .env.example .env
# Edit .env with your OCC_INFERENCE_ENDPOINT and OCC_INFERENCE_API_KEY
```
Without these, the editor works fine — users can supply their own API keys (BYOK).

## Pull requests

1. Fork the repo and create a branch from `main`.
2. Keep changes focused — one feature or fix per PR.
3. Run the editor locally to verify your changes before opening a PR.
4. Open the PR against `main`.

## Code of conduct

Be respectful and constructive. We follow the [Contributor Covenant](https://www.contributor-covenant.org/).
