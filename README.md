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

Linux dependencies:
1. Core GUI libraries (Ubuntu 24.04 example):
```bash
sudo apt-get update
sudo apt-get install -y \
  libatk1.0-0t64 libatk-bridge2.0-0t64 libgtk-3-0t64 libgbm1 libnss3 \
  libasound2t64 libx11-xcb1 libxcomposite1 libxdamage1 libxfixes3 \
  libxrandr2 libxss1 libxtst6 libxkbcommon0 libxkbcommon-x11-0 libxcb1 \
  libxcb-dri3-0 libxshmfence1 libcups2t64 libdrm2 libpango-1.0-0 \
  libpangocairo-1.0-0 libgdk-pixbuf2.0-0
```

2. Headless/CI virtual display:
```bash
sudo apt-get install -y xvfb
xvfb-run -a npm start
```

Notes:
1. Electron requires Linux user namespaces. If your environment blocks them
   (common in restricted containers), the wrapper will not start even with Xvfb.
2. If Electron reports a sandbox error, set SUID on `chrome-sandbox`:
```bash
sudo chown root:root node_modules/electron/dist/chrome-sandbox
sudo chmod 4755 node_modules/electron/dist/chrome-sandbox
```
3. If you see `sandbox_host_linux.cc(41)` errors, AppArmor may be blocking
   unprivileged user namespaces. On Ubuntu:
```bash
sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0
```
4. Launch command for Linux:
```bash
npm run wrapper
```
If you see GPU init errors, use:
```bash
npm run --workspace=apps/wrapper start -- --disable-gpu --disable-software-rasterizer
```
Note: the full flag is `--disable-software-rasterizer` (not truncated).

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

# Extension — .vsix package (bundled into wrapper)
npm run ext:compile
npm run ext:bundle
```

The bundle step copies the extension into a clean temp directory, runs `vsce package`
outside of the monorepo git workspace, and saves `openclaw.vsix` to
`apps/wrapper/extensions/`.

## CI

GitHub Actions builds the wrapper for Windows, macOS, and Linux on every push to `main`. Extension is compiled and packaged as a `.vsix` artifact.

## Contributing

PRs welcome! See [AGENTS.md](AGENTS.md) for the full plan and milestone tracker.

## License

MIT

## Updating VSCodium

VSCodium version + SHA-256 hashes live in `apps/wrapper/vscodium-manifest.json`.
Use `npm run vscodium:update <version>` to refresh the manifest directly from the
official release assets. Downloads are now verified against those hashes before
extracting.
