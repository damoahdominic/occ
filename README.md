# OCcode

**AI-native open-source code editor** for [OpenClaw](https://openclaw.ai), built on a fork of [Void](https://github.com/voideditor/void) (which is itself an open-source VS Code fork with built-in AI coding agent).

## Architecture

```
editor/           # Void fork (git submodule → github.com/ninjaa/void)
                  #   Full VS Code fork with AI agent, chat, inline edits
apps/
  extension/      # OpenClaw VS Code extension — Home screen, Setup wizard, Status panel
  web/            # OCcode marketing website
  wrapper/        # Legacy Electron wrapper (VSCodium-based, being replaced by editor/)
packages/
  control-center/ # OpenClaw control center UI components
scripts/          # Build & packaging scripts
```

## Getting Started

### Editor (Void fork — new base)

```bash
cd editor
# Follow Void's build instructions in VOID_CODEBASE_GUIDE.md
```

### Extension (OpenClaw integration)

```bash
cd apps/extension
npm install
npm run compile
```

### Website

```bash
cd apps/web
npm install
npm run dev
```

### Legacy Wrapper (Electron — being phased out)

```bash
cd apps/wrapper
npm install
npm start
```

## Roadmap

- [x] Fork Void as editor base (`editor/` submodule)
- [ ] Integrate OpenClaw extension into Void's extension host
- [ ] Rebrand Void → OCcode (icons, product.json, splash)
- [ ] Remove legacy VSCodium wrapper (`apps/wrapper/`)
- [ ] Ship cross-platform builds (Win/Mac/Linux)

## License

Apache 2.0 — see [LICENSE](LICENSE)
