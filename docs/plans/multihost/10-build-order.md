# Build Order — Phased Implementation

## Overview

```
Phase 1 ──► Phase 2 ──► Phase 3 ──► Phase 4 ──► Phase 5
Foundation   Local       Docker      SSH         Cloud
(2 weeks)    (1 week)    (2 weeks)   (2 weeks)   (3 weeks)
```

Total estimated: **10–12 weeks** for the full stack. Each phase is independently shippable.

---

## Phase 1: Foundation (2 weeks)

### Goal
Extract the `HostConnection` abstraction, create `~/.occ/` infrastructure, and refactor the core extension without changing any user-facing behavior.

### Tasks

| # | Task | Est | Risk |
|---|---|---|---|
| 1.1 | Define TypeScript interfaces (`HostAdapter`, `HostConnection`, `HostEntry`) in `src/hosts/types.ts` | 1d | Low |
| 1.2 | Implement `HostRegistry` class — read/write `~/.occ/hosts.json`, file watching, auto-seed local-default | 2d | Low |
| 1.3 | Implement `HostManager` class — adapter registration, active host state, connection lifecycle | 2d | Medium |
| 1.4 | Implement `OpenClawCoreAPI` exports — the extension-to-extension API surface | 1d | Low |
| 1.5 | Create `HostStatusBarItem` — status bar host picker (hidden when only 1 host) | 1d | Low |
| 1.6 | Create `HostTreeProvider` — sidebar tree view (hidden when only 1 host) | 2d | Low |
| 1.7 | Audit all `cp.spawn()` and `fs.readFileSync()` calls in `home.ts`, `config.ts`, `setup.ts`, `extension.ts` — document every callsite that needs abstraction | 1d | Low |

### Deliverable
- `~/.occ/` directory created on first launch
- `hosts.json` seeded with local-default
- Interfaces defined and exported
- Host picker and tree view wired up (but hidden for single-host users)
- No behavior change for existing users

### Exit Criteria
- `npm test` passes with existing tests
- Manual test: fresh install → `~/.occ/hosts.json` created → no UI change
- API types compile and are importable by external extensions

---

## Phase 2: Local Adapter (1 week)

### Goal
Extract all local filesystem and process operations from `home.ts` into `LocalHostConnection`, register it as the first adapter.

### Tasks

| # | Task | Est | Risk |
|---|---|---|---|
| 2.1 | Implement `LocalHostAdapter` (discover, connect, testConnection, configFields) | 1d | Low |
| 2.2 | Implement `LocalHostConnection` (exec, readFile, writeFile, stat, etc.) | 2d | Medium |
| 2.3 | Refactor `home.ts` — replace ~40 direct `cp.spawn()` calls with `activeHost.exec()` | 2d | High |
| 2.4 | Refactor `config.ts` and `setup.ts` — replace `fs.readFileSync()` with `activeHost.readTextFile()` | 1d | Medium |
| 2.5 | Refactor `extension.ts` — `isWebServerReachable()` uses `activeHost.gatewayHealthCheck()` | 0.5d | Low |
| 2.6 | Regression testing — every existing feature still works through the abstraction | 1d | Medium |

### Deliverable
- All local operations go through `LocalHostConnection`
- The local adapter auto-registers on startup
- `home.ts` no longer directly calls `cp.spawn()` or `fs.readFileSync()` for host operations
- **Behavior is identical** — this is a pure refactor

### Exit Criteria
- Install wizard works
- Gateway start/stop/restart works
- Config editing works
- Status panel works
- Balance bar works

### Risk: `home.ts` Refactor

`home.ts` is 4,502 lines with deeply interleaved UI + host logic. The refactor must be surgical:

1. **Don't rewrite** — extract, don't restructure
2. **One callsite at a time** — replace `cp.spawn(...)` → `host.exec(...)` incrementally
3. **Keep the webview HTML** — don't refactor the webview at the same time
4. **Test each change** — the install flow, gateway management, and config editing are critical paths

---

## Phase 3: Docker Adapter (2 weeks)

### Goal
Ship `openclaw-docker` as a separate extension that manages OpenClaw in Docker containers.

### Tasks

| # | Task | Est | Risk |
|---|---|---|---|
| 3.1 | Scaffold `openclaw-docker` extension (package.json, activation, registration) | 0.5d | Low |
| 3.2 | Implement `DockerHostAdapter` — container discovery, connect, test | 2d | Medium |
| 3.3 | Implement `DockerHostConnection` — exec via `docker exec`, file ops via `docker cp` | 3d | Medium |
| 3.4 | Docker Compose support — `docker compose exec` routing | 1d | Low |
| 3.5 | Port mapping auto-detection — `docker port` parsing | 0.5d | Low |
| 3.6 | Add Host Wizard — Docker-specific discovery step and config fields | 1d | Low |
| 3.7 | Integration testing — real Docker containers with OpenClaw installed | 2d | High |

### Deliverable
- `openclaw-docker` extension installable from marketplace (or bundled)
- Users can discover and add Docker containers as hosts
- Gateway management works through Docker
- Terminal opens into container
- Explorer can attach to container (via Dev Containers if installed)

### Exit Criteria
- `docker run openclaw/pod` → discovered in OCCode → add as host → manage gateway
- Docker Compose service → same flow
- File read/write through container works
- Gateway health check through port mapping works

---

## Phase 4: SSH Adapter (2 weeks)

### Goal
Ship `openclaw-ssh` as a separate extension for managing remote OpenClaw instances.

### Tasks

| # | Task | Est | Risk |
|---|---|---|---|
| 4.1 | Scaffold `openclaw-ssh` extension | 0.5d | Low |
| 4.2 | Implement `SSHHostAdapter` — SSH config parsing, discovery, connect | 2d | Medium |
| 4.3 | Implement `SSHHostConnection` — exec over SSH, SFTP file operations | 3d | Medium |
| 4.4 | Port forwarding — tunnel gateway port to localhost | 1d | Medium |
| 4.5 | Authentication flows — key, agent, password, passphrase prompting | 2d | High |
| 4.6 | Integration with `open-remote-ssh` — delegate "Open Explorer" | 0.5d | Low |
| 4.7 | Reconnection logic — handle dropped connections gracefully | 1d | Medium |
| 4.8 | Jump host / bastion support | 0.5d | Medium |
| 4.9 | Integration testing — real SSH connections to test VPS | 1d | High |

### Deliverable
- `openclaw-ssh` extension installable
- Users can add SSH hosts manually or discover from `~/.ssh/config`
- All host operations work over SSH
- Gateway dashboard accessible via port forwarding
- "Open Explorer" triggers VS Code Remote SSH window

### Exit Criteria
- Add VPS via SSH → manage gateway → start/stop agents
- File editing via SFTP
- Port forwarding for gateway dashboard
- Survives network disconnection → reconnects

---

## Phase 5: Cloud Adapter — MoltPod (3 weeks)

### Goal
Ship `openclaw-cloud` with full MoltPod integration. **Requires MoltPod API endpoints to be built first.**

### Dependencies
- MoltPod API: `/api/v1/pods/*` endpoints (exec, files, gateway proxy)
- MoltPod OAuth: authorization flow for desktop clients
- MoltPod gateway proxy: `pod-{id}.gateway.moltpod.com` routing

### Tasks

| # | Task | Est | Risk |
|---|---|---|---|
| 5.1 | Scaffold `openclaw-cloud` extension | 0.5d | Low |
| 5.2 | MoltPod API client library | 2d | Medium |
| 5.3 | MoltPod `AuthenticationProvider` — OAuth flow | 2d | High |
| 5.4 | Implement `CloudHostAdapter` — pod discovery, connect | 1d | Low |
| 5.5 | Implement `CloudHostConnection` — exec via API, file ops via API | 3d | Medium |
| 5.6 | `FileSystemProvider` for `occ-cloud://` — browse pod files in explorer | 2d | Medium |
| 5.7 | `PseudoTerminal` — WebSocket-backed terminal to pod | 2d | High |
| 5.8 | Gateway proxy integration — dashboard via MoltPod proxy URL | 1d | Low |
| 5.9 | Pod management UI — create, start, stop, delete pods from sidebar | 2d | Medium |
| 5.10 | Integration testing with live MoltPod pods | 1d | High |

### Deliverable
- `openclaw-cloud` extension installable
- Sign in to MoltPod → see all pods → manage them
- File browsing in explorer without SSH
- Terminal to pods without SSH
- Pod lifecycle management (create, start, stop)

---

## Phase 6: Polish & Documentation (1 week)

| # | Task | Est |
|---|---|---|
| 6.1 | End-to-end testing across all 4 host types | 2d |
| 6.2 | Error message review — every error should tell the user what to do | 1d |
| 6.3 | Documentation — README, CONTRIBUTING, API docs for adapter authors | 2d |
| 6.4 | Marketplace listings — screenshots, descriptions for each extension | 0.5d |
| 6.5 | Performance profiling — ensure health check polling doesn't drain battery | 0.5d |

---

## Summary Timeline

```
Week  1-2:  Phase 1 — Foundation (interfaces, registry, manager)
Week  3:    Phase 2 — Local adapter (refactor home.ts)
Week  4-5:  Phase 3 — Docker adapter
Week  6-7:  Phase 4 — SSH adapter
Week  8-10: Phase 5 — Cloud adapter (requires MoltPod API)
Week  11:   Phase 6 — Polish & documentation
```

**Phases 1-4 can proceed independently of MoltPod API development.**
**Phase 5 can be parallelized** — the extension scaffold and API client can be built while MoltPod API endpoints are being developed.
