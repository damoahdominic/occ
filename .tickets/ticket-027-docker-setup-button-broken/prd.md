# PRD: Fix Docker Setup Button — Wrong Compose File Path

## 2.1 Problem Statement

Clicking the **Docker Setup** button in the home panel silently fails or does not complete teardown/reset when the panel tries to locate the `docker-compose.full.yml` file.

**Root cause:** `_handleResetSetup` in `home.ts:696` resolved the compose file path using **3 `..` segments** from the extension directory, landing at `apps/docker/docker-compose.full.yml` (does not exist). The correct depth is **4 `..` segments** to reach the repo root `docker/` directory.

```
Extension path:  .../occ/apps/editor/extensions/openclaw
3 × ..  →        .../occ/apps/                ← wrong
4 × ..  →        .../occ/                     ← correct
Compose file:    .../occ/docker/docker-compose.full.yml
```

`runDockerProvision` (`home.ts:3270`) already had the correct 4-segment path and a fallback, so the initial provision flow was unaffected. The bug only manifested on teardown/reset triggered by the setup button's reset path.

## 2.2 Fix

One-line change in `_handleResetSetup`:

```ts
// Before
const composePath = path.join(this._extensionUri.fsPath, '..', '..', '..', 'docker', 'docker-compose.full.yml');

// After
const composePath = path.join(this._extensionUri.fsPath, '..', '..', '..', '..', 'docker', 'docker-compose.full.yml');
```

## 2.3 Acceptance Criteria

- [x] `_handleResetSetup` resolves compose path to `<repo-root>/docker/docker-compose.full.yml`
- [x] `docker compose down` runs successfully during reset (compose file found)
- [x] Full reset (volumes deleted) also uses the correct path
- [x] `runDockerProvision` path unchanged — already correct

## 2.4 Files Changed

- `apps/editor/extensions/openclaw/src/panels/home.ts:696` — add one extra `..` segment
