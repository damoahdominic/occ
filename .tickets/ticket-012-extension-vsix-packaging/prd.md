# PRD: Ticket 012 - Extension VSIX Packaging

## 1. Problem Statement

The OCCode extension (`apps/extension/`) must be packaged as a `.vsix` file and included in the `apps/wrapper/extensions/` directory (or inside the editor bundle) so that the wrapper or the pre-bundled editor can install it automatically. Currently there is no pre-built `.vsix` in the repo, which causes the wrapper's `installExtension()` to fail silently if the file is missing. The build process must create a production-ready, signed (if needed) VSIX package.

## 2. Proposed Solution

Create a reproducible build pipeline that:

- Compiles TypeScript to JavaScript
- Bundles all source files
- Packages extension manifest (`package.json` with `extensionKind`, `publisher`, `version`, `engines.vscode`) and assets into a `.vsix` (which is a ZIP with specific layout)
- Places the output into `apps/wrapper/extensions/` as `openclaw.vsix` (or `occ-openclaw.vsix`)
- Optionally signs the package with publisher certificate if required by marketplace

The `package.json` scripts should include:

```json
{
  "scripts": {
    "ext:build": "...",
    "ext:package": "vsce package -o ../wrapper/extensions/occ-openclaw.vsix"
  }
}
```

The build should be deterministic (timestamps, etc. should not vary) to support caching.

## 3. Acceptance Criteria

- Running the package command produces a `.vsix` file in `apps/wrapper/extensions/` (or another agreed location)
- The `.vsix` installs successfully in VS Code / VSCodium via `code --install-extension path/to/file.vsix`
- The extension loads without errors (check `Developer: Show Running Extensions`)
- The wrapper's `installExtension()` finds the file and installs it silently during first-run flow
- The extension version in the VSIX matches the root `package.json` version
- The build works on all supported platforms (Linux, macOS, Windows)

## 4. Technical Considerations

- **Tooling:** Use `@vscode/vsce` (VS Code Extension CLI) to package. Ensure it's in `devDependencies`
- **Publisher:** The extension's `package.json` needs a `publisher` field (e.g., `"openclaw"`). If publishing to Marketplace, use a publisher ID and possibly a signing key; for internal packaging, a dummy publisher is fine but must be consistent
- **Manifest:** Ensure `engines.vscode` is compatible with the editor's VS Code version (Void editor fork based on 1.99.3)
- **Pre-publish checks:** `vsce package` will run a `prepublish` script if defined; ensure it compiles TypeScript and does any bundling (e.g., `esbuild` or `tsc`)
- **Resources:** `prepublish` script should copy any needed assets (icons, README, CHANGELOG) into the extension directory
- **Wrapper expectation:** The wrapper's `installExtension()` looks for `.vsix` files in the `extensions/` directory. Naming matters: use a predictable name like `occ-openclaw.vsix`

## 5. Dependencies

- `apps/extension` must be in a releasable state (compiles, works) before packaging

## 6. Subtask Checklist

- [ ] Task 1: Install and configure `vsce`
  - **Problem:** Need the official packaging tool
  - **Test:** `npx vsce --version` works
  - **Subtasks:**
    - [ ] Subtask 1.1: `npm install -D @vscode/vsce` in `apps/extension`
    - [ ] Subtask 1.2: Verify `package.json` has required fields (`name`, `publisher`, `version`, `engines`, `activationEvents`, `contributes`, `main` points to compiled JS)

- [ ] Task 2: Create a `prepublish` build script
  - **Problem:** Package must contain compiled JS, not TS source
  - **Test:** `npm run prepublish` produces `out/` or `dist/` directory with `.js` files
  - **Subtasks:**
    - [ ] Subtask 2.1: Add `"prepublish": "tsc -p tsconfig.json"` (or `npm run build` if using bundler)
    - [ ] Subtask 2.2: Ensure `tsconfig.json` outputs to `out/` with `declmap` etc. appropriate for VS Code extensions
    - [ ] Subtask 2.3: If using a bundler like `esbuild`, configure to produce a single file with external `vscode` module

- [ ] Task 3: Add `ext:package` script
  - **Problem:** Easy one-command packaging
  - **Test:** `npm run ext:package` creates `../wrapper/extensions/openclaw.vsix`
  - **Subtasks:**
    - [ ] Subtask 3.1: In `apps/extension/package.json`, add `"ext:package": "vsce package -o ../../wrapper/extensions/occ-openclaw.vsix"` (adjust path from extension dir to wrapper's extensions)
    - [ ] Subtask 3.2: Verify output path exists; create `extensions/.gitkeep` if needed

- [ ] Task 4: Ensure extension package is lean
  - **Problem:** VSIX should not contain dev files, tests, source maps unless needed
  - **Test:** Inspect ZIP contents; no `src/*.ts`, `test/`, `.git/`
  - **Subtasks:**
    - [ ] Subtask 4.1: Add `.vscodeignore` file in extension root (like `.gitignore`) excluding `src`, `test`, `**/*.map`, `**/tsconfig.json`, etc.
    - [ ] Subtask 4.2: Rebuild and verify ignored files are not in archive

- [ ] Task 5: Integrate into wrapper build flow
  - **Problem:** When wrapper is built or first-run, extension should be pre-installed
  - **Test:** Wrapper's `installExtension()` finds `occ-openclaw.vsix` and installs it without errors
  - **Subtasks:**
    - [ ] Subtask 5.1: In wrapper source, confirm path to `extensions/` and filename
    - [ ] Subtask 5.2: If wrapper expects specific naming, adjust package output name accordingly
    - [ ] Subtask 5.3: Test full wrapper first-run flow: launch wrapper, it installs extension, editor starts with OCC Home panel

- [ ] Task 6: CI/CD step to publish artifact (optional if automating)
  - **Problem:** GitHub Releases should contain the built `.vsix` for manual install
  - **Test:** Release asset includes `occ-openclaw-<version>.vsix`
  - **Subtasks:**
    - [ ] Subtask 6.1: Create GitHub Actions workflow: on `release` or `push tag`, run `npm --prefix apps/extension run ext:package`
    - [ ] Subtask 6.2: Upload artifact with `actions/upload-release-asset`
    - [ ] Subtask 6.3: Ensure version in `package.json` matches tag

- [ ] Task 7: Documentation
  - **Problem:** Developers need to know how to build the extension
  - **Test:** README in extension mentions `npm run ext:package`
  - **Subtasks:**
    - [ ] Subtask 7.1: Add section in `apps/extension/README.md`: "Building" → `npm install && npm run ext:package`
    - [ ] Subtask 7.2: Note the output filename and location
    - [ ] Subtask 7.3: Mention any required environment variables (if extension uses them) for testing
