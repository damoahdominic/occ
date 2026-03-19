# MultiHost Architecture — Overview

> **Goal**: Enable OCCode to manage multiple OpenClaw installations across Local, Docker, SSH, and Cloud (MoltPod) hosts from a single desktop client.

## Problem Statement

Today, OCCode is a **single-host manager**. Every interaction assumes:
- One `~/.openclaw/openclaw.json` on the local filesystem
- One gateway at `http://localhost:{port}`
- One set of agents, channels, and cron jobs
- `child_process.spawn("openclaw", ...)` runs locally

Users who run OpenClaw on multiple machines (dev laptop + VPS, local + Docker container, etc.) must manually SSH in or switch contexts. There's no unified view.

## Vision

```
┌─────────────────────────────────────────────────────────┐
│                    OCCode Desktop                        │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │
│  │  Local    │  │  Docker  │  │   SSH    │  │  Cloud  │ │
│  │ Adapter   │  │ Adapter  │  │ Adapter  │  │ Adapter │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬────┘ │
│       │              │              │              │      │
│  ┌────┴──────────────┴──────────────┴──────────────┴───┐ │
│  │              Host Registry (~/.occ/)                 │ │
│  │         HostAdapter / HostConnection API             │ │
│  └─────────────────────┬───────────────────────────────┘ │
│                        │                                  │
│  ┌─────────────────────┴───────────────────────────────┐ │
│  │              Core Extension (openclaw)               │ │
│  │    Host Picker · Sidebar Tree · Control Center      │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
         │              │              │              │
    Local Machine   Docker Container   Remote VPS    MoltPod API
    ~/.openclaw/    /root/.openclaw/   ~/.openclaw/   REST endpoints
```

## Design Principles

1. **Separate extensions per host type** — modular install, independent release cycles, focused permissions
2. **`.occ/` for client state** — the desktop client owns `~/.occ/`, OpenClaw runtime owns `~/.openclaw/`. Never cross the streams.
3. **Native VS Code patterns** — use `FileSystemProvider`, `RemoteAuthorityResolver`, `TreeDataProvider`, Quick Pick. No custom explorer panels.
4. **Extension-to-extension API** — core exports a `registerHostAdapter()` API. Adapters are plugins to the core.
5. **Progressive disclosure** — local works out of the box. Docker/SSH/Cloud are opt-in extensions.
6. **Offline-first** — cached host state in `~/.occ/hosts/{id}/cache.json` for instant UI even when hosts are unreachable.

## Extension Map

| Extension | Package Name | Ships With OCCode? | Purpose |
|---|---|---|---|
| `openclaw` | `occ.openclaw` | ✅ Always | Core: host registry, picker, sidebar, control center |
| `openclaw-local` | `occ.openclaw-local` | ✅ Always | Local filesystem + process adapter |
| `openclaw-docker` | `occ.openclaw-docker` | ❌ Optional | Docker container adapter |
| `openclaw-ssh` | `occ.openclaw-ssh` | ❌ Optional | SSH remote host adapter |
| `openclaw-cloud` | `occ.openclaw-cloud` | ❌ Optional | MoltPod REST API adapter |

## Documents in This Plan

| File | Contents |
|---|---|
| `01-host-registry.md` | `~/.occ/` directory structure, `hosts.json` schema, host lifecycle |
| `02-extension-api.md` | `HostAdapter` and `HostConnection` interface specs, extension-to-extension protocol |
| `03-core-extension.md` | Core extension refactor plan — what moves, what stays, new UI components |
| `04-local-adapter.md` | Local host adapter — extracting existing code from `home.ts` |
| `05-docker-adapter.md` | Docker host adapter — container discovery, exec routing, port mapping |
| `06-ssh-adapter.md` | SSH host adapter — leveraging `open-remote-ssh`, key management |
| `07-cloud-adapter.md` | MoltPod Cloud adapter — REST API design, pod management |
| `08-ui-design.md` | Host picker, sidebar tree, control center multi-host views |
| `09-migration.md` | Migration path from current single-host to multi-host without breaking users |
| `10-build-order.md` | Phased implementation plan with effort estimates |
| `11-security.md` | Credential storage, SSH key handling, API token management |
| `12-testing.md` | Test strategy per extension, mock hosts, integration testing |
