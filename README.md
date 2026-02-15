# OCcode

Branded, cross‑platform OpenClaw IDE built on a VS Code portable bundle + custom extension.

## Structure
```
apps/
  wrapper/        # Electron app (branding, install flow)
  extension/      # VS Code extension (OpenClaw UI + commands)
scripts/
.github/workflows/
```

## Goals
- Ship OCcode.exe / OCcode.dmg / OCcode.AppImage
- Custom home screen + panels via extension
- Install/config OpenClaw locally via extension wizard

## Plan (MVP)
**Wrapper (Electron)**
1. Download portable VS Code/VSCodium
2. Install OpenClaw extension (.vsix or URL)
3. Write default settings/workspace
4. Launch VS Code

**Extension (OpenClaw)**
- Custom Home webview
- Install/config local OpenClaw
- Start/stop + logs/status

## Next
- Scaffold wrapper app
- Scaffold VS Code extension
- Add CI for Windows/Mac/Linux builds
