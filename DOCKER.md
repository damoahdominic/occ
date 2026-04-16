# Docker Setup Guide

Complete reference for OCC Docker services, configurations, and usage patterns.

---

## Overview

OCC uses Docker Compose to manage multiple service groups across development, testing, and automation:

1. **Editor & Web Dev** — Root-level services (VSCode fork, Next.js web app)
2. **OpenClaw Services** — `docker/` directory (gateway, postgres, redis)
3. **Test & Automation** — Specialized services (Playwright, Windows VM)

Each group has a clear purpose and usage pattern. This document explains which file to use and when.

---

## File Structure

```
.
├── docker-compose.yml                          # Dev: editor + web services
├── docker-compose.windows.yml                  # Test: Windows 11 VM
├── docker/
│   ├── docker-compose.openclaw.yml             # Base: OpenClaw services (prod-like)
│   ├── docker-compose.openclaw.override.yml    # Dev: overrides for local development
│   ├── docker-compose.playwright.yml           # Test: Playwright automation
│   ├── Dockerfile.openclaw                     # Build image for gateway
│   └── .env.openclaw                           # Configuration for OpenClaw services
├── Dockerfile                                  # Base image (legacy)
├── Dockerfile.build-linux                      # Build image for editor/web
├── .env.openclaw.example                       # Template for .env.openclaw
└── DOCKER.md                                   # This file
```

---

## Services Reference

### 1. Root-Level: `docker-compose.yml`

**Purpose**: Development environment for OCC editor (VSCode fork) and Next.js web app.

**Services**:

- **editor**
  - Image: `occ-build-linux:latest` (built from `Dockerfile.build-linux`)
  - Container: `occ-editor-dev`
  - Port: 9888 (HTTP)
  - Volumes: Workspace + docker socket (for docker-in-docker)
  - Healthcheck: HTTP 9888, ~9 min cold start
  - Restart: unless-stopped
  - Network: host mode
  - Command: Via `scripts/docker-dev.sh`

- **web**
  - Image: `occ-build-linux:latest` (same as editor)
  - Container: `occ-web-dev`
  - Port: 3002 → 3000
  - Depends on: editor (healthy)
  - Healthcheck: HTTP 3000

**Usage**:

```bash
# Start both services
docker-compose up -d

# View logs
docker-compose logs -f editor
docker-compose logs -f web

# Access container
docker-compose exec editor bash

# Stop
docker-compose down
```

**Notes**:
- Separate concern from OpenClaw services
- Uses root-level location (legacy convention, keep as-is)
- Never used in CI/build pipelines

---

### 2. OpenClaw Base: `docker/docker-compose.openclaw.yml`

**Purpose**: Production-ready configuration for OpenClaw gateway services (postgres, redis, gateway).

**Key Principle**: This is the **ONLY** config used for production/CI builds. No dev-specific logic.

**Services**:

- **occ-gateway**
  - Image: `openclaw/pod:latest`
  - Container: `occ-gateway`
  - Port: Configurable (default 18789)
  - Bind: `${GATEWAY_BIND_HOST:-127.0.0.1}:${GATEWAY_PORT:-18789}:18789`
  - Environment: DATABASE_URL, REDIS_URL
  - Healthcheck: HTTP health endpoint, 30s start period
  - Depends on: postgres, redis (healthy)
  - Network: occ-network (bridge)
  - Command: Sets up openclaw.json, installs packages, runs gateway

- **occ-postgres**
  - Image: `postgres:16-alpine`
  - Container: `occ-postgres`
  - Environment: POSTGRES_PASSWORD, POSTGRES_DB, POSTGRES_USER
  - Volume: `occ-postgres-data` (persistent)
  - Healthcheck: `pg_isready`
  - Network: occ-network

- **occ-redis**
  - Image: `redis:7-alpine`
  - Container: `occ-redis`
  - Healthcheck: `redis-cli ping`
  - Network: occ-network

**Configuration File**: `.env.openclaw`

Required variables:
- `POSTGRES_PASSWORD` — Database password
- `POSTGRES_DB` — Database name
- `POSTGRES_USER` — Database user
- `DATABASE_URL` — Full connection string for gateway
- `REDIS_URL` — Redis connection URL
- `GATEWAY_PORT` — Port for gateway (optional, default 18789)
- `GATEWAY_BIND_HOST` — Bind address (optional, default 127.0.0.1)

Optional variables:
- `GATEWAY_PROXY_URL` — Proxy URL for gateway dashboard (optional)
  - Use when gateway runs behind a reverse proxy or on non-standard port
  - If set, takes precedence over `GATEWAY_PORT` and `GATEWAY_BIND_HOST`
  - Examples: `https://gateway.example.com/`, `http://localhost:8443/gateway/`
  - If unset, dashboard URL is constructed from `GATEWAY_BIND_HOST` and `GATEWAY_PORT`

**Usage** (production-like, base config only):

```bash
# Start OpenClaw services (production mode)
docker compose -f docker/docker-compose.openclaw.yml up -d

# View status
docker compose -f docker/docker-compose.openclaw.yml ps

# Check logs
docker compose -f docker/docker-compose.openclaw.yml logs -f occ-gateway

# Stop
docker compose -f docker/docker-compose.openclaw.yml down
```

**Notes**:
- Always use this file for production builds and CI/CD
- Never include the override file in production contexts
- Contains no dev-specific logic (bunny image, local mounts)
- Persistent volumes for postgres/redis data

---

### 3. OpenClaw Dev Overrides: `docker/docker-compose.openclaw.override.yml`

**Purpose**: Development-only overrides to base config (local mounts, bunny image for faster iteration).

**Key Principle**: Applied **only** in development via multi-file composition. Never in production/CI.

**Overrides**:

- **occ-gateway** image: `bunny:latest` (dev-fast iteration image)
- **occ-gateway** volumes: Mounts `OPENCLAW_DATA_DIR` for local config, docker socket for docker-in-docker
- **ports**: May differ from base for local dev access

**Configuration**:

Environment variable `OPENCLAW_DATA_DIR` controls where dev data is stored (default: `./openclaw_docker_data`).

**Usage** (development only):

```bash
# Start OpenClaw services with dev overrides (local dev pattern)
docker compose \
  -f docker/docker-compose.openclaw.yml \
  -f docker/docker-compose.openclaw.override.yml \
  up -d

# View logs
docker compose \
  -f docker/docker-compose.openclaw.yml \
  -f docker/docker-compose.openclaw.override.yml \
  logs -f occ-gateway

# Stop
docker compose \
  -f docker/docker-compose.openclaw.yml \
  -f docker/docker-compose.openclaw.override.yml \
  down
```

**Create an alias for convenience**:

```bash
alias docker-dev="docker compose -f docker/docker-compose.openclaw.yml -f docker/docker-compose.openclaw.override.yml"

# Then simply:
docker-dev up -d
docker-dev logs -f
```

**Notes**:
- Only use in local development
- Override file is optional; base config can run standalone
- `bunny` image is used for faster development iteration vs `openclaw/pod`
- Local data persists in `./openclaw_docker_data` (git-ignored)
- Docker socket mount enables docker-in-docker for gateway functionality

---

### 3b. Proxy URL Configuration

**Purpose**: Configure gateway dashboard URL when running behind a reverse proxy or on non-standard ports.

**When to Use**:
- Gateway runs behind nginx/HAProxy reverse proxy
- Gateway is accessible via non-standard port
- Gateway uses HTTPS while container uses HTTP
- Gateway is accessed via hostname instead of IP

**Configuration via Environment**:

Set `GATEWAY_PROXY_URL` in `.env.openclaw`:

```bash
# Examples:
GATEWAY_PROXY_URL=https://gateway.example.com/
GATEWAY_PROXY_URL=https://myproxy.internal:9443/gateway/
GATEWAY_PROXY_URL=http://localhost:8443/
```

**How It Works**:

1. If `GATEWAY_PROXY_URL` is set, the OCC extension uses it directly for dashboard links
2. If not set, the extension constructs URL from `GATEWAY_BIND_HOST` and `GATEWAY_PORT`
3. `GATEWAY_PROXY_URL` takes precedence over port-based construction

**Development Example**:

```bash
# Using reverse proxy locally
GATEWAY_PROXY_URL=http://localhost:8443/gateway/
GATEWAY_BIND_HOST=127.0.0.1
GATEWAY_PORT=18789

# Gateway runs on 18789 internally, but accessible via proxy at 8443/gateway/
# OCC extension opens http://localhost:8443/gateway/ in browser
```

**Production Example**:

```bash
# External access via HTTPS
GATEWAY_PROXY_URL=https://gateway.company.com/
GATEWAY_BIND_HOST=0.0.0.0
GATEWAY_PORT=18789

# Gateway runs on 18789, reverse proxy (nginx) handles HTTPS
# OCC extension opens https://gateway.company.com/ in browser
```

**Path Handling**:

The proxy URL is merged with dashboard paths:
- Dashboard file @ `/dashboard/index.html`
- Proxy URL: `https://gateway.example.com/api/gateway/`
- Result: `https://gateway.example.com/api/gateway/dashboard/index.html`

Paths are normalized to remove duplicate slashes and handle trailing slashes correctly.

---

### 4. Playwright Test Automation: `docker/docker-compose.playwright.yml`

**Purpose**: Isolated test/automation environment with Playwright, browser display, and MCP server.

**Services**:

- **playwright-display**
  - Image: `ghcr.io/xtr-dev/mcp-playwright-novnc:latest`
  - Container: `playwright-display`
  - Ports:
    - 6080 → noVNC web UI (visual browser debugging)
    - 3080 → MCP SSE endpoint (for agents/tools)
  - Environment: Screen resolution, browser (chromium)
  - Network: playwright-network

**Usage**:

```bash
# Start Playwright container
docker compose -f docker/docker-compose.playwright.yml up -d

# Access browser display (if available)
# http://localhost:6080

# Stop
docker compose -f docker/docker-compose.playwright.yml down
```

**Notes**:
- Separate from OpenClaw services (different network)
- Dedicated for E2E tests and automation
- See Playwright E2E test patterns in memory for integration details

---

### 5. Windows VM Testing: `docker-compose.windows.yml`

**Purpose**: Windows 11 VM for cross-platform testing (UI testing, Windows-specific builds).

**Services**:

- **windows-vm**
  - Image: `dockurr/windows`
  - Container: `occ-windows-vm`
  - Environment: VERSION, RAM, CPU, credentials, language
  - Devices: `/dev/kvm`, `/dev/net/tun` (hardware acceleration)
  - Ports:
    - 8006 → Web viewer
    - 3389 → RDP (remote desktop)
  - Volumes: `./docker/windows-storage`, `./docker/windows-shared`
  - Restart: unless-stopped
  - Grace period: 2 minutes

**Usage**:

```bash
# Start Windows VM
docker-compose -f docker-compose.windows.yml up -d

# View logs
docker-compose -f docker-compose.windows.yml logs -f windows-vm

# Access via RDP
# Host: localhost:3389

# Stop
docker-compose -f docker-compose.windows.yml down
```

**Notes**:
- Separate from all other services (specialized cross-platform testing)
- Requires KVM hardware acceleration support
- Can be resource-intensive; only run when needed

---

## Quick Reference: When to Use Which File

| Scenario | Command | File(s) |
|----------|---------|---------|
| **Dev: Editor + Web** | `docker-compose up -d` | `docker-compose.yml` |
| **Dev: OpenClaw services** | `docker compose -f docker/docker-compose.openclaw.yml -f docker/docker-compose.openclaw.override.yml up -d` | `docker-compose.openclaw.yml` + override |
| **Prod/Build: OpenClaw services** | `docker compose -f docker/docker-compose.openclaw.yml up -d` | `docker-compose.openclaw.yml` only |
| **Test: Playwright automation** | `docker compose -f docker/docker-compose.playwright.yml up -d` | `docker-compose.playwright.yml` |
| **Test: Cross-platform Windows** | `docker-compose -f docker-compose.windows.yml up -d` | `docker-compose.windows.yml` |

---

## Environment Configuration

### OpenClaw Services

Copy the template and configure:

```bash
cp docker/.env.openclaw.example docker/.env.openclaw
# Edit docker/.env.openclaw with your values
```

**Required variables**:
- `POSTGRES_PASSWORD` — Secure password for postgres user
- `POSTGRES_DB` — Database name (e.g., `openclaw`)
- `POSTGRES_USER` — Postgres user (e.g., `openclaw`)
- `DATABASE_URL` — Full connection string: `postgresql://user:pass@occ-postgres:5432/openclaw`
- `REDIS_URL` — Redis URL: `redis://occ-redis:6379`

**Optional variables**:
- `GATEWAY_PORT` — Port for gateway (default 18789)
- `GATEWAY_BIND_HOST` — Bind address (default 127.0.0.1)
- `OPENCLAW_DATA_DIR` — Dev data directory (default `./openclaw_docker_data`)

---

## Build & CI Usage

### Key Rule: Production builds use **base config ONLY**

```bash
# ✅ CORRECT - Production build
docker compose -f docker/docker-compose.openclaw.yml build

# ❌ WRONG - Never include override in build
docker compose -f docker/docker-compose.openclaw.yml -f docker/docker-compose.openclaw.override.yml build
```

**Why**: The override file contains dev-specific logic:
- Different image (`bunny` vs `openclaw/pod`)
- Local mounts that won't exist in CI
- Development binds that aren't production-safe

**CI/CD Guidelines**:
1. Use only `docker-compose.openclaw.yml` for builds
2. Load environment from `.env.openclaw` (or CI secrets)
3. Validate config: `docker compose -f docker/docker-compose.openclaw.yml config`
4. Never pass `-f docker/docker-compose.openclaw.override.yml` to CI build steps

---

## Troubleshooting

### Editor Won't Start (Blank Page)

**Symptom**: Editor service starts but shows blank page on port 9888.

**Root Cause**: Race condition with ripgrep initialization (see `scripts/docker-dev.sh` for fix).

**Solution**: Check logs and restart:
```bash
docker-compose logs -f editor
docker-compose restart editor
```

### OpenClaw Gateway Health Check Failing

**Symptom**: `occ-gateway` container fails healthcheck.

**Common Causes**:
- Missing environment variables (check `.env.openclaw`)
- PostgreSQL not ready (check `occ-postgres` healthcheck)
- Redis not ready (check `occ-redis` healthcheck)

**Solution**:
```bash
# Check service status
docker compose -f docker/docker-compose.openclaw.yml ps

# View logs
docker compose -f docker/docker-compose.openclaw.yml logs -f occ-gateway

# Verify env file
cat docker/.env.openclaw

# Rebuild and start fresh
docker compose -f docker/docker-compose.openclaw.yml down -v
docker compose -f docker/docker-compose.openclaw.yml up -d
```

### Port Already in Use

**Solution**: Change port in `.env.openclaw` or kill process:

```bash
# Check what's using the port
lsof -i :18789

# Or change port in .env.openclaw
GATEWAY_PORT=18790
```

### Docker Socket Permission Denied

**Solution**: Add user to docker group:

```bash
sudo usermod -aG docker $USER
newgrp docker
```

---

## Architecture Principles

These principles guide all Docker setup decisions:

1. **Single Base Config**: `docker/docker-compose.openclaw.yml` is the **only** production config
2. **Dev Override Pattern**: `docker compose -f base.yml -f override.yml` for development only
3. **Clear Separation**:
   - **Editor/Web** → Root `docker-compose.yml` (separate concern)
   - **OpenClaw** → `docker/docker-compose.openclaw.yml` (production)
   - **Test/Automation** → Explicit test configs (playwright, windows)
4. **Never Mix**: Build/CI uses base only; dev uses base + override
5. **Environment Isolation**: Each service group has isolated networks and data volumes

---

## Related Files

- **DOCKER_SETUP.md** — Quick start guide
- **DOCKER_COMPOSE_READY.md** — Status and quick commands
- **AGENTS.md** — Integration with agent workflows
- **scripts/docker-dev.sh** — Editor service entrypoint
- **Dockerfile.build-linux** — Editor/web build image
- **docker/Dockerfile.openclaw** — OpenClaw gateway build image
- **.env.openclaw** — Configuration (git-ignored)
- **.env.openclaw.example** — Configuration template

---

## See Also

For E2E test integration patterns, see **Playwright E2E Test Patterns** in project memory.
