# PRD: Ticket 014 - Linux ARM64 Support

## 1. Problem Statement

The OCCode wrapper's `PLATFORM_MAP` currently lacks coverage for Linux on ARM64 architecture (e.g., Raspberry Pi 4/5, AWS Graviton, newer ARM laptops). Users on these systems cannot install VSCodium because the wrapper cannot construct a valid download URL. The project should support at least `linux.arm64` (and possibly `linux.armhf` if demand exists). This requires adding correct platform mappings, ensuring the build/test infrastructure includes ARM64, and verifying downloads and installation work.

## 2. Proposed Solution

Extend the platform detection and URL generation to handle `arm64` on Linux:

- In `apps/wrapper/src/download.js` (or wherever `PLATFORM_MAP` lives), add entries:
  - `'linux.arm64'`: { assetSuffix: 'linux-arm64', binDir: 'bin', binary: 'codium' } (verify exact naming)
- Research actual VSCodium release assets: they typically provide `VSCodium-linux-arm64-<version>.tar.gz` or `...-armhf.tar.gz` for 32-bit. Use the official naming.
- Adjust any hardcoded checks that assume x64 only.
- Update CI/test configuration to include an ARM64 runner (e.g., GitHub Actions `runs-on: ubuntu-latest` with `ARCH=arm64` using QEMU or a ARM64 self-hosted runner if available).
- Update documentation (INSTALL.md) to mention ARM64 support.

## 3. Acceptance Criteria

- The wrapper correctly identifies a Linux ARM64 system (`process.platform === 'linux'` and `process.arch === 'arm64'`)
- The download URL is constructed to fetch the appropriate VSCodium ARM64 tarball (e.g., `https://github.com/VSCodium/vscodium/releases/download/1.99.3.24750/VSCodium-linux-arm64-1.99.3.24750.tar.gz`)
- The archive extracts to the expected directory structure with binaries in the right location
- The `codium` binary is marked executable and can be launched
- The wrapper's first-run flow works end-to-end on an ARM64 Linux machine (or in an ARM64 VM)
- If a user runs on an unsupported architecture (e.g., `armhf` not implemented), the wrapper shows a clear error message and possibly a link to manual install instructions

## 4. Technical Considerations

- **Asset naming:** VSCodium uses different naming conventions for ARM64 vs x64. Check latest release: `https://github.com/VSCodium/vscodium/releases/latest`. Identify exact asset names. They may also provide `VSCodium-linux-arm64.tar.gz` (without version in file name) in some releases; best to use versioned ones.
- **Extraction:** The tarball extraction code may assume a specific top-level folder name (e.g., `VSCodium-linux-x64-<version>`). Ensure it works for arm64 (different folder name).
- **Binary permissions:** After extraction, set `chmod +x` on the `codium` binary.
- **Testing without ARM64 hardware:** Use QEMU-based emulation in CI: `docker run --privileged --platform linux/arm64 multiarch/ubuntu-core:22.04` or GitHub Actions `runs-on: ubuntu-latest` with `arch: arm64` if supported. Alternatively, rely on unit tests that validate URL construction and asset naming logic.
- **Performance:** Emulated ARM64 will be slow, but functional for smoke tests.

## 5. Dependencies

- None; this is an isolated change to platform detection and download URL logic

## 6. Subtask Checklist

- [ ] Task 1: Confirm VSCodium ARM64 asset naming
  - **Problem:** Need accurate asset suffixes and folder structure
  - **Test:** Browse GitHub releases; find a recent ARM64 asset name and its internal folder structure after extraction
  - **Subtasks:**
    - [ ] Subtask 1.1: `curl -s https://api.github.com/repos/VSCodium/vscodium/releases/latest | jq '.assets[].name' | grep -i arm64`
    - [ ] Subtask 1.2: Download sample tarball, `tar -tzf` to see top-level directory name
    - [ ] Subtask 1.3: Note URL pattern: `https://github.com/VSCodium/vscodium/releases/download/{tag}/VSCodium-linux-arm64-{version}.tar.gz` (or similar)

- [ ] Task 2: Update `PLATFORM_MAP` with ARM64 entry
  - **Problem:** Map `'linux.arm64'` to correct asset suffix and binary path
  - **Test:** `getPlatform(process.platform, process.arch)` returns correct mapping; `getDownloadUrl(version, mapping)` produces valid URL
  - **Subtasks:**
    - [ ] Subtask 2.1: Add `'linux.arm64': { assetSuffix: 'linux-arm64', binDir: 'bin', binary: 'codium' }` (adjust `assetSuffix` after Task 1 confirmation)
    - [ ] Subtask 2.2: Add `'linux.armhf'` if needed (future)
    - [ ] Subtask 2.3: Add unit test for `'linux.arm64'` mapping to ensure URL format matches pattern

- [ ] Task 3: Adjust extraction logic if needed
  - **Problem:** Extraction code may rely on `process.platform === 'linux'` but also assume `assetSuffix` matches folder name
  - **Test:** Extracting an ARM64 tarball results in expected `~/.occode/vscode/` layout
  - **Subtasks:**
    - [ ] Subtask 3.1: Check `extractTar(url, dest)` logic; ensure it does not hardcode `x64` in folder naming
    - [ ] Subtask 3.2: If folder name includes architecture suffix, derive it from the asset name, not hardcoded
    - [ ] Subtask 3.3: Add condition to handle case where top-level folder name includes architecture (e.g., `VSCodium-linux-arm64-1.99.3`)

- [ ] Task 4: Update binary path detection and execution
  - **Problem:** The binary path may differ slightly on ARM64
  - **Test:** After install, `~/.occode/vscode/bin/codium` exists and is executable
  - **Subtasks:**
    - [ ] Subtask 4.1: Verify `bin` directory name stays same (likely `bin`);
    - [ ] Subtask 4.2: Ensure `chmod +x` is applied to `$INSTALL_DIR/bin/codium`
    - [ ] Subtask 4.3: Test launch: `child_process.spawn('~/.occode/vscode/bin/codium', ['--version'])` returns version string

- [ ] Task 5: CI/CD integration
  - **Problem:** Need to test ARM64 build automatically
  - **Test:** CI workflow runs on Linux ARM64 runner (or emulated) and passes
  - **Subtasks:**
    - [ ] Subtask 5.1: If using GitHub Actions with `ubuntu-latest` which is x64_64, add a job using `runs-on: ubuntu-latest` with `arch: arm64` setting (if supported) or a self-hosted ARM runner
    - [ ] Subtask 5.2: Alternatively, use `docker run --rm --platform linux/arm64 node:20-alpine` to run wrapper unit tests inside container
    - [ ] Subtask 5.3: Ensure CI job installs dependencies and runs `npm test` with platform set to `linux.arm64`

- [ ] Task 6: Manual verification on real hardware (optional but ideal)
  - **Problem:** Emulation may miss subtle issues
  - **Test:** On a Raspberry Pi 4 (or other ARM64 Linux), run wrapper; VSCodium installs and launches
  - **Subtasks:**
    - [ ] Subtask 6.1: Build wrapper on ARM64 (or cross-compile if possible)
    - [ ] Subtask 6.2: Run the downloader; verify binary launches
    - [ ] Subtask 6.3: Report any issues and fix

- [ ] Task 7: Update documentation
  - **Problem:** Users need to know ARM64 is supported
  - **Test:** `INSTALL.md` includes ARM64 in supported platforms table
  - **Subtasks:**
    - [ ] Subtask 7.1: Add row: `Linux ARM64 (Raspberry Pi 4/5, Graviton)` with any special notes
    - [ ] Subtask 7.2: Mention that if auto-detect fails, users can manually install VSCodium and skip wrapper download
    - [ ] Subtask 7.3: Update `CHANGELOG.md` or `README.md` to announce ARM64 support in next release

- [ ] Task 8: Error handling for unknown arch
  - **Problem:** If a new architecture appears (`riscv64`, `s390x`), wrapper should not crash
  - **Test:** On unknown `process.platform/arch`, wrapper shows "Unsupported platform" and offers manual install link
  - **Subtasks:**
    - [ ] Subtask 8.1: In platform detection, if mapping not found, set `supported = false`
    - [ ] Subtask 8.2: In UI, render error panel: "Your system architecture is not yet supported. You can manually install VSCodium from https://vscodium.com and then point OCCode to it."
    - [ ] Subtask 8.3: Provide a "Skip install" button that proceeds to gateway setup without VSCodium
