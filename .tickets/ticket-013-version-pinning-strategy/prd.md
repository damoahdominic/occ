# PRD: Ticket 013 - Version Pinning Strategy

## 1. Problem Statement

The OCCode wrapper (or the editor build) currently hardcodes the VSCodium version in `apps/wrapper/src/download.js` (e.g., `'1.96.4.25027'`). This causes the wrapper to try downloading a non-existent version if not updated manually, leading to 404 errors and broken first-run experience. We need a strategy to automatically or easily keep the VSCodium version current without manual code changes every release.

## 2. Proposed Solution

Implement one of two approaches:

**Approach A — GitHub API auto-discovery (preferred):**
- In `download.js`, when building the download URL, query GitHub releases API for the latest VSCodium release matching the current platform/arch
- Cache the result for a short period (e.g., 6 hours) to avoid hitting rate limits
- Fallback to a hardcoded "known good" version if API fails

**Approach B — Config file with manual updates:**
- Move the version string to a JSON file (e.g., `vscodium-manifest.json`) that lists SHA-256 hashes and versions per platform
- Provide a script `npm run vscodium:update` that fetches the latest releases from GitHub, updates the manifest, and verifies hashes
- The download code reads the manifest and picks the correct entry for the current platform

Both approaches require verifying download integrity (SHA-256) before extraction.

## 3. Acceptance Criteria

- The wrapper/editor automatically downloads the latest stable VSCodium release for the detected platform
- The download process verifies the SHA-256 checksum of the downloaded archive before extraction
- If the auto-discovery fails (network error, rate limit), the wrapper falls back to a known working version (hardcoded or last cached)
- The version update mechanism is documented and easy to run in CI or by a maintainer
- No manual code edits required to bump the version in normal operation
- All supported platforms (Linux x64, macOS x64/arm64, Windows x64) are covered

## 4. Technical Considerations

- **GitHub API:** `GET https://api.github.com/repos/VSCodium/vscodium/releases/latest` returns the latest release tag (e.g., `1.99.3.24750`). The tag format may differ per platform; need to extract version number from the release assets (e.g., `VSCodium-linux-x64-1.99.3.24750.tar.gz`)
- **Rate limiting:** Unauthenticated GitHub API is limited to 60 req/hour per IP. Use caching or a personal token for CI. For local wrapper runs, caching to disk is sufficient.
- **Checksum verification:** Need a source for SHA-256 hashes. The VSCodium releases page provides SHA-256SUMS file. Approach B can store hashes in manifest; Approach A can download the SHA-256SUMS file alongside the archive and verify.
- **Platform mapping:** The code already has a `PLATFORM_MAP` for mapping Node's `process.platform` and `process.arch` to VSCodium naming conventions. Ensure it covers `linux.x64`, `darwin.x64`, `darwin.arm64`, `win32.x64`.
- **Fallback:** Keep a minimal object in code with last-known-good versions and their hashes as a safety net.
- **Security:** Do not download from non-HTTPS sources; verify signatures if available (VSCodium provides GPG signatures but that may be overkill; SHA-256 is sufficient if fetched from official GitHub).

## 5. Dependencies

- None; this is an internal improvement to the wrapper/editor build

## 6. Subtask Checklist

- [ ] Task 1: Choose and design approach
  - **Problem:** Decide between auto-discovery and manifest-based
  - **Test:** Documented decision with rationale; issue comment approved
  - **Subtasks:**
    - [ ] Subtask 1.1: Evaluate auto-discovery pros/cons: simplicity vs. rate limits vs. offline usage
    - [ ] Subtask 1.2: Evaluate manifest pros/cons: manual/scheduled updates vs. deterministic builds
    - [ ] Subtask 1.3: Pick one (likely B for reproducibility) and create design doc

- [ ] Task 2: Implement auto-discovery (if chosen)
  - **Problem:** Query GitHub and parse latest release
  - **Test:** Without pre-set version, wrapper downloads working VSCodium
  - **Subtasks:**
    - [ ] Subtask 2.1: Add `node-fetch` or native `fetch` (Node 20+) to query GitHub API
    - [ ] Subtask 2.2: Parse releases; find asset matching current platform/arch; extract version from asset name
    - [ ] Subtask 2.3: Cache response to `~/.occode/vscodium-latest.json` with timestamp; reuse if <6h old
    - [ ] Subtask 2.4: On API error (rate limit, network), read cached file; if stale or missing, use hardcoded fallback
    - [ ] Subtask 2.5: Download SHA-256SUMS file from same release; verify archive

- [ ] Task 3: Implement manifest-based (if chosen)
  - **Problem:** Maintain a manifest file with versions and hashes
  - **Test:** Updating manifest with script updates hardcoded values in repo; wrapper uses manifest
  - **Subtasks:**
    - [ ] Subtask 3.1: Create `apps/wrapper/vscodium-manifest.json` structure: `{ "versions": { "1.99.3.24750": { "linux.x64": { "url": "...", "sha256": "..." }, ... } } }`
    - [ ] Subtask 3.2: Write `scripts/update-vscodium.js` that:
      - Fetches latest release from GitHub API
      - For each platform, finds asset URL and downloads SHA-256SUMS to get hash
      - Updates the manifest file with new entry (or updates a `latest` pointer)
      - Commits changes (if run in CI)
    - [ ] Subtask 3.3: Modify `download.js` to read manifest, pick entry for current platform, and download
    - [ ] Subtask 3.4: If platform missing in manifest, fallback to previous entry or hardcoded

- [ ] Task 4: Add SHA-256 verification
  - **Problem:** Ensure downloaded archive integrity
  - **Test:** Corrupting the file triggers verification error; re-download
  - **Subtasks:**
    - [ ] Subtask 4.1: In `download.js`, after download completes, compute SHA-256 hash (use Node `crypto.createHash('sha256')`)
    - [ ] Subtask 4.2: Compare to expected hash from manifest or GitHub SHA-256SUMS
    - [ ] Subtask 4.3: If mismatch, delete temp file, show error in UI, allow retry

- [ ] Task 5: Handle platform coverage gaps
  - **Problem:** Need to support arm64 Linux/macOS and future architectures
  - **Test:** Wrapper attempts download on arm64; if no asset, gracefully error with helpful message
  - **Subtasks:**
    - [ ] Subtask 5.1: Extend `PLATFORM_MAP` to include `linux.arm64`, `darwin.arm64`
    - [ ] Subtask 5.2: In manifest/discovery, map these correctly; if asset not found, attempt using closest version (e.g., x64 via Rosetta?) or show "unsupported" message

- [ ] Task 6: Test across platforms
  - **Problem:** Must work on all OSes we ship
  - **Test:** Run wrapper on Linux x64, macOS x64/arm64, Windows x64; verify VSCodium downloads and launches
  - **Subtasks:**
    - [ ] Subtask 6.1: Set up CI matrix for at least Linux and macOS; run wrapper with `--headless` test mode if possible
    - [ ] Subtask 6.2: Manually test on Windows if CI cannot cover
    - [ ] Subtask 6.3: Simulate rate limit by mocking API error; ensure fallback works

- [ ] Task 7: Documentation and monitoring
  - **Problem:** If auto-update fails, we need to know
  - **Test:** Wrapper logs version resolution steps; errors are captured optionally
  - **Subtasks:**
    - [ ] Subtask 7.1: Add debug logging: "Using cached manifest", "Fetching GitHub", "Selected version X", "Hash Y"
    - [ ] Subtask 7.2: Document the fallback behavior and how to trigger a manual update
    - [ ] Subtask 7.3: Add heartbeat check or ping to `https://api.github.com/rate_limit` to warn if接近 limit (optional)
