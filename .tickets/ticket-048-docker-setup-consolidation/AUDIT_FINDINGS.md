# Ticket 048 — Docker Setup Audit Findings

## Summary

The OCC project has **5 docker-compose files** in different locations with overlapping and unclear purposes. This document provides detailed audit results to inform consolidation efforts.

---

## Docker Compose Files

### 1. `docker-compose.yml` (root level)

**Purpose**: Development environment for OCC editor and web services (VSCode fork)

**Location**: `/home/linuxdev/Desktop/workshop/studio/hustle/occ/docker-compose.yml`

**Services**:
- `editor`: VSCode-based editor (OCC fork)
  - Build: `Dockerfile.build-linux`
  - Image: `occ-build-linux:latest`
  - Container: `occ-editor-dev`
  - Mount: Workspace volume + docker socket
  - Healthcheck: HTTP 9888 (cold start ~9 min)
  - Restart: unless-stopped
  - Privileged: true
  - Network: host mode

- `web`: Next.js web app
  - Build: `Dockerfile.build-linux`
  - Image: `occ-build-linux:latest`
  - Container: `occ-web-dev`
  - Port: 3002:3000
  - Healthcheck: HTTP 3000
  - Depends on: editor (healthy)

**Usage**: Local development; referenced in AGENTS.md, DOCKER_SETUP.md

**Issues**:
- Separate concern from OpenClaw services (different Dockerfile, different purpose)
- Should remain at root level (legacy editor/web dev)
- No conflict; only issue is documentation clarity

---

### 2. `docker/docker-compose.openclaw.yml`

**Purpose**: Production-like OpenClaw gateway services (base config)

**Location**: `/home/linuxdev/Desktop/workshop/studio/hustle/occ/docker/docker-compose.openclaw.yml`

**Services**:
- `occ-gateway`: OpenClaw gateway service
  - Build: `docker/Dockerfile.openclaw` from parent context (`..`)
  - Image: `openclaw/pod:latest`
  - Command: Sets up openclaw.json, installs packages, runs gateway
  - Port: 18789 (configurable via env vars)
  - Bind: `${GATEWAY_BIND_HOST:-127.0.0.1}:${GATEWAY_PORT:-18789}`
  - Environment: DATABASE_URL, REDIS_URL
  - Healthcheck: HTTP health endpoint, 30s start period
  - Depends on: postgres, redis (healthy)
  - Network: occ-network (bridge)

- `occ-postgres`: PostgreSQL 16
  - Image: postgres:16-alpine
  - Environment: POSTGRES_PASSWORD, POSTGRES_DB, POSTGRES_USER
  - Volume: occ-postgres-data (named volume)
  - Network: occ-network
  - Healthcheck: pg_isready

- `occ-redis`: Redis 7
  - Image: redis:7-alpine
  - Network: occ-network
  - Healthcheck: redis-cli ping

**Volumes**:
- `occ-postgres-data`: Persistent database
- `occ-redis-data`: Persistent cache (defined but not used)

**Networks**:
- `occ-network`: Custom bridge network

**Environment Files**:
- `.env.openclaw`: Canonical configuration
- `.env.openclaw.example`: Template

**Syntax**: Valid YAML, version 3.9

**Usage**: Production-like setup; referenced in AGENTS.md for gateway provisioning

**Issues**:
- Clean, valid config
- Sometimes referenced with override file, sometimes standalone
- Purpose is clear when read, but documentation is scattered

---

### 3. `docker/docker-compose.openclaw.override.yml`

**Purpose**: Development overrides for OpenClaw services (to be used with base config)

**Location**: `/home/linuxdev/Desktop/workshop/studio/hustle/occ/docker/docker-compose.openclaw.override.yml`

**Current Content**:
```yaml
version: "3.9"

services:
  occ-gateway:
    image: bunny:latest
    command: bash -lc "mkdir -p /root/.openclaw && echo '{\"gateway\":{\"controlUi\":{\"dangerouslyAllowHostHeaderOriginFallback\":true}}}' > /root/.openclaw/openclaw.json; bun i -g @buape/carbon @larksuiteoapi/node-sdk @slack/web-api grammy && openclaw gateway run --allow-unconfigured --bind lan"
    ports:
      - "${GATEWAY_BIND_HOST:-127.0.0.1}:${GATEWAY_PORT:-18789}:18789"

volumes:
  - ${OPENCLAW_DATA_DIR:-./openclaw_docker_data}:/root/.openclaw
  - /var/run/docker.sock:/var/run/docker.sock
  - /var/run/docker.sock:/var/run/docker.sock
```

**Issues** (CRITICAL):
1. **Syntax Error**: Volumes section is incorrectly indented and has no service context. Should be under `occ-gateway.volumes`, not root-level `volumes`.
2. **Duplicate Socket Mount**: `/var/run/docker.sock` mounted twice (likely copy-paste error)
3. **No Service-Level Definition**: Override doesn't properly override service properties
4. **Unclear Purpose**: Why use `bunny:latest` instead of `openclaw/pod:latest`? Documentation missing.
5. **Mandatory vs Optional**: Not clear if override must always be used or only in dev

**Usage**: Intended for dev-local overrides; exact usage pattern unclear

---

### 4. `docker/docker-compose.playwright.yml`

**Purpose**: Test/automation environment with Playwright display and Chrome

**Location**: `/home/linuxdev/Desktop/workshop/studio/hustle/occ/docker/docker-compose.playwright.yml`

**Services**:
- `playwright-display`: MCP-based Playwright container
  - Image: `ghcr.io/xtr-dev/mcp-playwright-novnc:latest`
  - Container: `playwright-display`
  - Ports: 6080 (noVNC UI), 3080 (MCP SSE endpoint)
  - Environment: Screen resolution, browser choice (chromium)
  - Network: playwright-network (bridge)

**Networks**:
- `playwright-network`: Custom bridge network

**Syntax**: Valid YAML, version 3.9

**Usage**: Playwright tests, automation; separate test concern

**Issues**:
- Clear purpose; no syntax issues
- Separate from OpenClaw services (correct)

---

### 5. `docker-compose.windows.yml`

**Purpose**: Windows VM for cross-platform testing

**Location**: `/home/linuxdev/Desktop/workshop/studio/hustle/occ/docker-compose.windows.yml`

**Services**:
- `windows-vm`: Windows 11 VM via dockur/windows
  - Image: dockurr/windows
  - Container: occ-windows-vm
  - Environment: VERSION, RAM, CPU, credentials, language
  - Devices: /dev/kvm, /dev/net/tun (hardware acceleration)
  - Capabilities: NET_ADMIN
  - Ports: 8006 (web viewer), 3389 (RDP)
  - Volumes: ./docker/windows-storage, ./docker/windows-shared
  - Restart: unless-stopped
  - Grace period: 2 minutes

**Networks**:
- `dev-network`: Bridge network

**Syntax**: Valid YAML, version 3.8 (slightly older)

**Usage**: Cross-platform testing; specialized concern

**Issues**:
- Separate from all other services (correct)
- No conflicts; clear purpose

---

### 6. `docker-compose.test.yml` (INTENTIONALLY DELETED)

**Purpose**: Node.js version detection tests (fnm, nvm, node-only, setup scenarios)

**Location**: Not found in filesystem

**History**: 
- Originally created with test support (commits 0fc1ec8, 70b0e9f, e1ad9f5)
- **Deleted in commit 28184e6** (2026-03-30, "chore:clean up")
- Deleted files: `docker-compose.test.yml`, `docker/test-fnm.Dockerfile`, `docker/test-nvm.Dockerfile`, `docker/test-node-only.Dockerfile`, `docker/test-node-setup.Dockerfile`

**Current References** (STALE, not updated after deletion):
- Mentioned in DOCKER_SETUP.md (added later in commit 6221c32)
- DOCKER_COMPOSE_READY.md documents 4 test scenarios
- Makefile has targets: `docker-test-fnm`, `docker-test-nvm`, `docker-test-node-only`, `docker-test-node-setup`

**Status**: Intentionally removed; documentation and Makefile not updated to reflect deletion

**Issue**: Dead code references in docs and Makefile; attempting to run `make docker-test-*` will fail. Need to decide: restore files or update/remove stale references.

---

## Dockerfiles

### 1. `Dockerfile` (root level)

**Purpose**: Base image for build (likely for building OCC editor/web)

**Location**: `/home/linuxdev/Desktop/workshop/studio/hustle/occ/Dockerfile`

**Build Context**: Root

**Issues**: Not examined in detail; separate concern from docker-compose

---

### 2. `Dockerfile.build-linux` (root level)

**Purpose**: Build Linux artifact for editor/web services

**Location**: `/home/linuxdev/Desktop/workshop/studio/hustle/occ/Dockerfile.build-linux`

**Build Context**: Root

**Used by**: `docker-compose.yml` (both `editor` and `web` services)

**Issues**: Used by root-level compose file; separate concern

---

### 3. `docker/Dockerfile.openclaw`

**Purpose**: Build OpenClaw gateway image

**Location**: `/home/linuxdev/Desktop/workshop/studio/hustle/occ/docker/Dockerfile.openclaw`

**Build Context**: Parent directory (`..`)

**Used by**: `docker/docker-compose.openclaw.yml`

**Issues**: Build context relative to dockerfile location (parent); clear purpose

---

## Environment Files

### 1. `.env`

**Location**: `/home/linuxdev/Desktop/workshop/studio/hustle/occ/.env`

**Purpose**: Unknown; not examined

**Issues**: Unclear relationship to other env files

---

### 2. `.env.openclaw`

**Location**: `/home/linuxdev/Desktop/workshop/studio/hustle/occ/docker/.env.openclaw`

**Purpose**: Canonical configuration for OpenClaw services

**Content**: (not examined in detail)

**Issues**: Location in `docker/` subdirectory; should be clear this is for openclaw only

---

### 3. `.env.openclaw.example`

**Location**: `/home/linuxdev/Desktop/workshop/studio/hustle/occ/docker/.env.openclaw.example`

**Purpose**: Template for `.env.openclaw`

**Issues**: Template; need to verify it's complete and accurate

---

## Usage Patterns

### In Documentation

**AGENTS.md**:
- References `docker-compose.yml` (root) for editor service
- References `docker compose -f docker/docker-compose.openclaw.yml` for gateway
- No mention of override file
- Commands: `docker compose up -d`, `docker compose ps`, `docker compose logs -f`

**DOCKER_SETUP.md**:
- Lists files: `docker-compose.test.yml` (test), `docker-compose.yml` (dev)
- Test scenarios: fnm, nvm, node-only, node-setup
- No mention of `docker/docker-compose.openclaw.yml`

**DOCKER_COMPOSE_READY.md**:
- Mentions `docker-compose.yml` and `docker-compose.test.yml`
- References 4 test scenarios
- Shows `docker-compose logs` commands
- No mention of OpenClaw services

### In Makefile

**Targets found**:
- `docker-test`: Run all tests with `docker-compose.test.yml`
- `docker-test-fnm`, `docker-test-nvm`, `docker-test-node-only`, `docker-test-node-setup`: Individual test targets
- Tests use `docker-compose -f docker-compose.test.yml run --rm test-<scenario>`

### In Scripts

**docker-dev.sh**:
- Entrypoint for editor service in `docker-compose.yml`
- Referenced as the command for the editor service
- No docker-compose invocations (it's the container's startup script)

---

## Confusion Matrix

| Question | Current Clarity | Issue |
|----------|-----------------|-------|
| What's the base production config? | Medium | `docker-compose.openclaw.yml` is production-like, but unclear if it's the real base |
| When do I use the override file? | Very Low | Purpose and usage pattern not documented anywhere |
| What's the difference between root and docker/ files? | Low | Different naming conventions; not obvious why they're separated |
| Is there a single source of truth? | No | Multiple files, unclear hierarchy |
| Which files for CI/build? | Unclear | No explicit build documentation |
| How do test files relate? | Low | `docker-compose.test.yml` mentioned in docs but file not found |
| What about Windows VM? | Low | Purpose clear (cross-platform) but integration with other services unclear |
| What about Playwright config? | Low | Purpose clear (test automation) but integration unclear |

---

## Recommendations for Consolidation

### Priority 1 (Critical)

1. **Fix `docker-compose.openclaw.override.yml` syntax** ✅ DONE (commit 0400799)
   - Move volumes into `occ-gateway.volumes` ✅
   - Remove duplicate mounts ✅
   - Validate with `docker-compose config` ✅

2. **Reconcile deleted test files with documentation** (NEXT)
   - Decision needed: Restore files OR Update/remove stale references?
   - **Option A (Restore)**: Recreate docker-compose.test.yml and test Dockerfiles; restore Makefile targets
   - **Option B (Clean)**: Remove test references from DOCKER_SETUP.md, DOCKER_COMPOSE_READY.md, and Makefile
   - **Recommendation**: Option B aligns with "consolidate Docker setup" goal — focus on production OpenClaw config, not deprecated test infrastructure

3. **Document override file purpose** (TODO)
   - When is it used? (dev only? always?)
   - How is it used? (with which base config?)
   - Why `bunny:latest`? (image source, when to use?)

### Priority 2 (Important)

4. **Separate concerns clearly**
   - OpenClaw services → `docker/` with override pattern
   - Editor/Web → root level (status quo)
   - Test/CI → explicit files (playwright, windows, test)

5. **Consolidate documentation**
   - Single source of truth: `DOCKER.md`
   - Clear section per file explaining purpose and usage
   - Decision: DOCKER_SETUP.md and DOCKER_COMPOSE_READY.md — merge or keep separate?

6. **Standardize environment files**
   - `.env.openclaw` as canonical
   - `.env.openclaw.example` as template
   - Clarity on which env file applies to which compose file

### Priority 3 (Future)

7. **Build/CI verification**
   - Ensure build uses only base config
   - Document production build process
   - Add pre-commit validation

8. **Environment variable schema**
   - Document required vs. optional variables
   - Add validation at startup
   - Consider env variable docs in each compose file

---

## Files Requiring No Changes

- `docker-compose.yml` (root): Valid, clear purpose, separate concern
- `docker-compose.windows.yml`: Valid, clear purpose, separate concern
- `docker/docker-compose.playwright.yml`: Valid, clear purpose, separate concern
- `docker/docker-compose.openclaw.yml`: Valid, good structure, only needs clarification in docs

---

## Estimated Scope

- **Immediate**: Fix override file syntax, verify test.yml, document override purpose
- **Short-term**: Consolidate docs, standardize env files, create DOCKER.md
- **Medium-term**: Verify build/CI usage, add validation
- **Long-term**: Environment variable schema, monitoring for drift

---

## Questions for Clarification (Before Task 3)

1. Is `docker-compose.test.yml` missing or was it deleted? Should it be recreated?
2. What is the exact intended usage of the override file? Always use it in dev, or only sometimes?
3. Why use `bunny:latest` in the override instead of `openclaw/pod:latest`? What is bunny?
4. Should DOCKER_SETUP.md and DOCKER_COMPOSE_READY.md be merged into a single DOCKER.md?
5. What is the production build process? Which files/scripts are used?
6. Are there GitHub Actions or CI/CD workflows that need updating?
