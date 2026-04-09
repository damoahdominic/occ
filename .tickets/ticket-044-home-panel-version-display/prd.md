# PRD: OCC Home Panel Version Display from version.txt

## Problem Statement

The OCC Home panel currently displays the version from the extension's `package.json` (`openclaw.home` extension at `apps/editor/extensions/openclaw/package.json`). This shows `0.2.2` which is the extension's internal version, not the product version.

The root `version.txt` at the repository root contains `3.4.3`, which is the actual OCcode/OCC product version that should be displayed to users.

## Scope

Modify the Home panel to read and display the version from `version.txt` at the repo root instead of from the extension's package.json.

## Technical Considerations

- The `version.txt` is at the repository root: `/home/linuxdev/Desktop/workshop/studio/hustle/occ/version.txt`
- The value is currently `3.4.3`
- The extension runs inside VS Code/Void editor, so it needs to read the file from disk using the workspace root path
- VS Code provides `vscode.workspace.workspaceFolders` to get the workspace root

## File to Modify

- `apps/editor/extensions/openclaw/src/panels/home.ts`
  - Line 133 currently reads: `this._version = (vscode.extensions.getExtension('openclaw.home')?.packageJSON as { version?: string })?.version ?? '';`
  - This needs to be changed to read from `version.txt` instead

## Acceptance Criteria

- [ ] Version displayed in OCC Home panel matches the content of `version.txt` (currently `3.4.3`)
- [ ] The version is read from the workspace root's `version.txt` file
- [ ] Fallback to empty string if `version.txt` cannot be read

## Tasks

- [ ] Task 1: Modify `home.ts` to read version from `version.txt` at workspace root
  - Use `vscode.workspace.workspaceFolders[0].uri.fsPath` to get the workspace root
  - Read `version.txt` using `vscode.workspace.fs.readFile`
  - Parse the version string and assign to `this._version`
  - Handle errors gracefully with fallback to empty string
