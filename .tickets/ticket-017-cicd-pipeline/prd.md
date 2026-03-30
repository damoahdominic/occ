# PRD: Ticket 017 - CI/CD Pipeline

## 1. Problem Statement

The OCCode repository lacks a continuous integration and delivery pipeline. Every change currently requires manual building, testing, and deployment. We need automated CI that runs:

- Linting and type-checking
- Unit/integration tests for backend and extension
- E2E tests (ticket-016)
- Build artifacts: editor compilation, extension VSIX packaging, Docker image
- (Optional) Automated deployment to staging/production

A well-configured CI will catch bugs early, ensure code quality, and enable rapid, reliable releases.

## 2. Proposed Solution

Set up GitHub Actions workflows in `.github/workflows/`:

**Workflows:**

1. **PR Check** (`pr.yml`) — triggered on `pull_request` to any branch:
   - Install dependencies (root, extension, web, packages)
   - Run ESLint and TypeScript compiler (`npm run lint`, `npx tsc --noEmit`)
   - Run unit tests (backend and extension) (`npm test --workspaces` or specific)
   - Run backend integration tests (with test DB)
   - If E2E tests are ready and not too flaky, also run them (maybe only on `main` PRs)
   - Build the editor (`npm --prefix apps/editor run compile`) and extension package (`npm --prefix apps/extension run ext:package`)
   - Upload build artifacts (editor binaries, extension VSIX) as PR artifacts for inspection

2. **Release** (`release.yml`) — triggered on `push` to `main` tag `v*`:
   - Same checks as PR, but all tests must pass
   - Build all artifacts
   - Create GitHub Release with assets:
     - `occ-VERSION-linux-x64.tar.gz` (if built)
     - `occ-VERSION-macos-x64.dmg`
     - `occ-VERSION-macos-arm64.dmg`
     - `occ-VERSION-windows-x64.exe` (or zip)
     - `occ-openclaw-VERSION.vsix`
     - `CHANGELOG.md` excerpt
   - Optionally deploy backend to staging/production (if included in repo)
   - Post message to Telegram/Discord about new release (via webhook)

3. **Nightly Build** (`nightly.yml`) — scheduled `cron` to build and upload pre-release builds to identify breakages early

Additional considerations:

- Use actions/cache to speed up `npm ci` and build caches
- Set up `DOCKER_BUILDKIT=1` for Docker builds (if any)
- For E2E tests, use `xvfb-run` on Linux to provide display
- Secrets: `STRIPE_SECRET_KEY`, `JWT_SECRET` etc. should not be needed for CI since tests use mocks; but if real integration tests run against a test backend, need service secrets in GitHub Secrets

## 3. Acceptance Criteria

- Every PR shows a CI check that runs all required steps and reports success/failure
- No PR can be merged unless CI passes
- On merge to `main` with a new semver tag, GitHub Release is automatically created with all platform binaries
- Nightly builds run and upload pre-release assets to a draft release or storage
- All build artifacts are reproducible (same hash given same source)
- CI completes within 20 minutes for PR, within 40 minutes for release (including E2E)
- CI logs are clear and actionable when a step fails

## 4. Technical Considerations

- **Matrix strategy:** Build editor binaries per platform. Since GitHub Actions `ubuntu-latest` is Linux x64, macOS runner provides macOS builds, and Windows runner provides Windows builds. For ARM64 macOS, need macOS runner on ARM hardware (GitHub's macOS runners are Apple Silicon as of 2024, so both x64 and arm64 can be built via Rosetta or native). For Linux ARM64, may need self-hosted runner or QEMU.
- **Workspace installation:** Root `package.json` likely uses workspaces. Use `npm ci` at root to install all workspaces.
- **Build steps:** The editor build has a complex dependency on specific Node version (20.18.2). Use `actions/setup-node` with `node-version: 20.18.2` and `cache: npm`.
- **Electron E2E:** On Linux headless, need Xvfb. Use `xvfb-run --auto-servernum --server-args='-screen 0 1920x1080x24'` before `npx playwright test`.
- **Artifact upload:** Use `actions/upload-artifact` for PR artifacts to allow downloading the built VSIX for manual testing. Use `github-release-upload` or `softprops/action-gh-release` for release assets.
- **Security:** No secrets in PR builds. For release builds that might deploy backend, store service tokens in GitHub Secrets (`STRIPE_SECRET_KEY`, `INFERENCE_API_KEY`, etc.), and use them only when `github.event_name == 'push' && contains(github.ref, 'tags/')`.
- **Dotenv:** Load environment variables from `.env` file for local dev; in CI, use `env:` block in workflow.
- **Failure handling:** If any step fails, the workflow should fail immediately (no need to continue).

## 5. Dependencies

- None; this is a repo infrastructure task

## 6. Subtask Checklist

- [ ] Task 1: Create PR workflow (`pr.yml`)
  - **Problem:** Run checks on every PR
  - **Test:** Open a PR; GitHub checks appear; all succeed on clean repo
  - **Subtasks:**
    - [ ] Subtask 1.1: Define `on: pull_request` trigger; branches: `main`, `*`
    - [ ] Subtask 1.2: Set up jobs: `lint`, `test`, `build`, `e2e` (optional)
    - [ ] Subtask 1.3: In `lint` job: `npm ci`, `npm run lint`
    - [ ] Subtask 1.4: In `test` job: `npm ci && npm test` (runs unit tests for backend and extension)
    - [ ] Subtask 1.5: In `build` job: `npm run build` (editor and extension packaging) and upload editor build and VSIX as artifacts
    - [ ] Subtask 1.6: In `e2e` job (if included): start mock backend, xvfb-run Playwright, upload HTML report on failure

- [ ] Task 2: Create release workflow (`release.yml`)
  - **Problem:** Automated release publishing on tag push
  - **Test:** Merge to main and push tag `v0.1.0`; GitHub Release created with assets
  - **Subtasks:**
    - [ ] Subtask 2.1: `on: push` with `tags: ['v*']`
    - [ ] Subtask 2.2: Checkout code, setup Node 20.18.2, cache npm, `npm ci`
    - [ ] Subtask 2.3: Run full test suite (including E2E) – release must be green
    - [ ] Subtask 2.4: Build all platform binaries. This may require matrix for os:
      ```yaml
      strategy:
        matrix:
          os: [ubuntu-latest, macos-latest, windows-latest]
      ```
    - [ ] Subtask 2.5: For each OS, run appropriate build script (e.g., `npm run package:linux`, `npm run package:mac`, `npm run package:win`). These scripts will produce `.tar.gz`, `.dmg`, `.exe` etc.
    - [ ] Subtask 2.6: Also package extension: `npm --prefix apps/extension run ext:package`
    - [ ] Subtask 2.7: Use `softprops/action-gh-release` to create release with tag name; upload all artifacts with appropriate MIME types
    - [ ] Subtask 2.8: Include `CHANGELOG.md` content in release body (read file and pass to action)

- [ ] Task 3: Nightly build workflow (`nightly.yml`)
  - **Problem:** Detect breakages not caught by PRs (e.g., dependency updates)
  - **Test:** Scheduled run at 2 AM UTC; builds and uploads draft release with timestamp
  - **Subtasks:**
    - [ ] Subtask 3.1: `on: schedule: - cron: '0 2 * * *'`
    - [ ] Subtask 3.2: Build all platforms and extension
    - [ ] Subtask 3.3: Create a draft release "Nightly <date>" and upload assets (no notification)
    - [ ] Subtask 3.4: Optionally post to Telegram channel if builds fail (alerting)

- [ ] Task 4: Add build scripts to `package.json`
  - **Problem:** CI needs simple commands to produce artifacts
  - **Test:** `npm run package:linux` yields a `.tar.gz` with editor binary
  - **Subtasks:**
    - [ ] Subtask 4.1: Research packaging for the VSCodium-based editor. Likely using `electron-builder`? The repo may already have scripts; if not, create:
      - `package:linux`: `npm --prefix apps/editor run package --linux --x64` (adjust)
      - `package:mac`: `npm --prefix apps/editor run package --mac --x64` and `--arm64` in separate steps
      - `package:win`: `npm --prefix apps/editor run package --win --x64`
    - [ ] Subtask 4.2: Ensure build output directory (`apps/editor/dist` or `release/`) is known for artifact upload
    - [ ] Subtask 4.3: Test each script locally before committing CI

- [ ] Task 5: Configure caching to speed up CI
  - **Problem:** CI runs take too long due to `npm ci`
  - **Test:** Workflow runs with cache hit reduce time by ~50%
  - **Subtasks:**
    - [ ] Subtask 5.1: Use `actions/cache` with `key: ${{ runner.os }}-npm-${{ hashFiles('**/package-lock.json') }}` and `path: |
        ~/.npm
        node_modules
        .openclaw` (if any)
    - [ ] Subtask 5.2: Set `restore-keys` to fallback
    - [ ] Subtask 5.3: Cache Playwright browsers with `actions/cache` using `~/.cache/ms-playwright` (if using E2E)

- [ ] Task 6: Handle E2E test environment
  - **Problem:** E2E needs display and mock backend
  - **Test:** E2E job runs without display errors; mock server starts on port 3001; tests pass
  - **Subtasks:**
    - [ ] Subtask 6.1: Use `xvfb-run` wrapper for Linux job: `run: xvfb-run --auto-servernum --server-args='-screen 0 1920x1080x24' npx playwright test`
    - [ ] Subtask 6.2: Start mock server: `node test/mock-backend.js &`; wait for port
    - [ ] Subtask 6.3: Set `OCC_BACKEND_URL=http://localhost:3001` env for editor process via `process.env` in fixture or wrapper script
    - [ ] Subtask 6.4: Cleanup: kill mock server after tests

- [ ] Task 7: Secrets management (if needed for integration tests)
  - **Problem:** Some tests might require real Stripe or inference keys (unlikely)
  - **Test:** If not needed, ignore. If needed, store in GitHub Secrets and use in `env:` of needed jobs (only for push to main?).
  - **Subtasks:**
    - [ ] Subtask 7.1: Add `STRIPE_SECRET_KEY`, `JWT_SECRET` as GitHub Secrets (encrypted)
    - [ ] Subtask 7.2: In workflow, pass as `env: STRIPE_SECRET_KEY: ${{ secrets.STRIPE_SECRET_KEY }}` only for integration tests, not for PR builds from forks
    - [ ] Subtask 7.3: Ensure secrets not logged (no `echo $STRIPE_SECRET_KEY`)

- [ ] Task 8: Monitoring and alerts
  - **Problem:** CI failures should be visible
  - **Test:** If any workflow fails, a notification is sent to a Telegram/Discord channel
  - **Subtasks:**
    - [ ] Subtask 8.1: Use `actions/telegram` or `Ilshidur/action-notification` to send to OCCThings group on failure
    - [ ] Subtask 8.2: Configure to send only on PR failure and nightly failure (not release, since release will be evident)
    - [ ] Subtask 8.3: Include link to failed run in message

- [ ] Task 9: Documentation
  - **Problem:** Developers need to understand CI
  - **Test:** `README.md` contains a "CI/CD" section explaining workflows and how to trigger release
  - **Subtasks:**
    - [ ] Subtask 9.1: Document the workflow files: `pr.yml` runs on PRs; `release.yml` on tags; `nightly.yml` on schedule
    - [ ] Subtask 9.2: Explain how to create a release: `git tag v0.1.0 && git push origin v0.1.0`
    - [ ] Subtask 9.3: Note about required Node version and environment variables for local builds

- [ ] Task 10: Verify and iterate
  - **Problem:** First CI may have issues; need to fix
  - **Test:** After initial commit, monitor runs; fix any failures (path issues, missing env, timeouts)
  - **Subtasks:**
    - [ ] Subtask 10.1: Tune timeouts: if E2E takes long, increase job timeout (`timeout-minutes: 60`)
    - [ ] Subtask 10.2: If caching causes corruption, clear caches manually in GitHub UI
    - [ ] Subtask 10.3: If builds fail on Windows due to path length, enable long paths in runner (maybe add `core.longpaths` config)
