# OCcode

**Branded, cross-platform IDE wrapper** that ships a portable VSCodium bundle with the **OpenClaw** VS Code extension pre-installed.

## Structure

```
apps/
  wrapper/      # Electron app — downloads VSCodium, installs extension, launches editor
  extension/    # VS Code extension — Home screen, Setup wizard, Status panel
.github/
  workflows/    # CI: build wrapper (Win/Mac/Linux) + package extension
```

## Quick Start

### Wrapper (Electron)

```bash
cd apps/wrapper
npm install
npm start
```

The wrapper will:
1. Download portable VSCodium (pinned version) to `~/.occode/vscode/`
2. Install any bundled `.vsix` extensions
3. Set default settings (theme, disable welcome)
4. Launch VSCodium with a custom user-data directory

### Extension (VS Code)

```bash
cd apps/extension
npm install
npm run compile
```

Then press F5 in VS Code to launch the Extension Development Host.

**Commands:**
- `OpenClaw: Home` — branded home screen with quick links
- `OpenClaw: Setup Local` — wizard to detect OS, check prerequisites (git, node, docker), and guide OpenClaw setup
- `OpenClaw: Status` — shows whether the OpenClaw gateway is running

## Building

```bash
# Wrapper — platform-specific installer
cd apps/wrapper && npm run build

# Extension — .vsix package
cd apps/extension && npx @vscode/vsce package
```

## CI

GitHub Actions builds the wrapper for Windows, macOS, and Linux on every push to `main`. Extension is compiled and packaged as a `.vsix` artifact.

## Contributing

PRs welcome! See [AGENTS.md](AGENTS.md) for the full plan and milestone tracker.

## License

MIT
