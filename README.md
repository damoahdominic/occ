# OCC — AI-native code editor

OCC is a free, open-source AI code editor built for everyone — no technical setup required.
It is based on [Void](https://github.com/voideditor/void), an open-source VS Code fork with built-in AI agent, chat, and inline edits.

[![Build](https://github.com/ninjaa/occ/actions/workflows/build-macos.yml/badge.svg)](https://github.com/ninjaa/occ/actions/workflows/build-macos.yml)

## Features

- AI chat, inline edits, and agentic code execution built in
- **OCC Free Tier** — $1 of free inference, no API key needed
- **Bring Your Own Key** — connect Anthropic, OpenAI, OpenRouter, Ollama, and more
- Ships as a native desktop app for macOS (Apple Silicon + Intel), Windows, and Linux

## Repository structure

| Path | Description |
|------|-------------|
| `apps/editor` | OCC editor (Void/VS Code fork — full source) |
| `apps/web` | Marketing website (Next.js) |
| `apps/extension` | OpenClaw VS Code extension bundled in the editor |
| `packages/control-center` | Shared React UI components |

## Getting started

See [CONTRIBUTING.md](CONTRIBUTING.md) for full build instructions.

**Quick start — website:**
```bash
npm install && npm run web   # http://localhost:3000
```

**Quick start — editor (requires Node 20.18.2):**
```bash
cd apps/editor
npm ci --ignore-scripts
node_modules/.bin/gulp transpile-client-esbuild
cd extensions/openclaw && npx tsc -p ./ && cd ../..
# Launch on macOS:
VSCODE_SKIP_PRELAUNCH=1 NODE_ENV=development VSCODE_DEV=1 \
  ./.build/electron/OCcode.app/Contents/MacOS/Electron .
```

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## Security

To report a security vulnerability, see [SECURITY.md](SECURITY.md).

## License

MIT — see [LICENSE](LICENSE)

> The underlying VS Code and Void codebases are licensed under MIT.
> OpenClaw's API/billing layer is a separate closed-source service.
