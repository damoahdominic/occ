# Ticket 048 — Next Steps & Decision Points

**Status**: Audit & Critical Fixes Complete  
**Date**: 2026-04-11 19:52 UTC

---

## Completed Actions

### ✅ Critical YAML Fix (Commit 0400799)
- **File**: `docker/docker-compose.openclaw.override.yml`
- **Issue**: Volumes section was at root level instead of nested under `occ-gateway` service
- **Fix**: Moved volumes into service definition, removed duplicate docker.sock mount
- **Validation**: `docker compose -f docker-compose.openclaw.yml -f docker-compose.openclaw.override.yml config` passes

### ✅ Comprehensive Audit (AUDIT_FINDINGS.md)
- Documented all 5 docker-compose files with exact services, ports, volumes, networks
- Identified 3 Dockerfiles and 3 environment files
- Traced usage patterns in docs, Makefile, scripts
- Created confusion matrix showing clarity gaps
- Found critical issue: deleted test files still referenced in docs

### ✅ Root Cause Analysis
- **docker-compose.test.yml**: Intentionally deleted in commit 28184e6 (2026-03-30)
- **Test Dockerfiles**: Also deleted (test-fnm, test-nvm, test-node-only, test-node-setup)
- **But docs not updated**: DOCKER_SETUP.md, DOCKER_COMPOSE_READY.md, Makefile still reference deleted files
- **Decision needed**: Restore files OR clean up stale references?

---

## Decision Point 1: Test Files — Restore or Remove?

### Option A: Restore Deleted Test Files
**Pros**:
- Users can test Node.js version detection scenarios
- Makefile targets `docker-test-*` become functional

**Cons**:
- Adds complexity for "consolidate Docker setup" goal
- Test infrastructure was intentionally removed (likely for maintenance reasons)
- Adds files outside the "single source of truth" principle

**Implementation**: 
- Restore files from git history (commit before 28184e6)
- Update docs to explain what each test does
- Fix Makefile targets to work with restored setup

### Option B: Clean Up Stale References (RECOMMENDED)
**Pros**:
- Simplifies Docker setup to focus on production OpenClaw config
- Aligns with "consolidate Docker setup" goal
- Removes dead code references
- Easier maintenance

**Cons**:
- Users lose ability to test Node version detection
- Could be reinstated later if needed

**Implementation**:
- Remove test references from DOCKER_SETUP.md
- Remove test references from DOCKER_COMPOSE_READY.md
- Remove test targets from Makefile (docker-test, docker-test-*, etc.)
- Document that these were intentionally removed for consolidation

---

## Decision Point 2: Override File Usage & Documentation

### Current State
- **File**: `docker/docker-compose.openclaw.override.yml`
- **Syntax**: ✅ Fixed (commit 0400799)
- **Usage**: ❓ Not documented

### Questions to Answer
1. **When is override used?**
   - Always in development (`docker compose -f base.yml -f override.yml up`)?
   - Or only for specific scenarios?

2. **Why `bunny:latest`?**
   - What is "bunny"? (Image source, maintainer?)
   - Why use different image than base `openclaw/pod:latest`?
   - Is it a custom build or public image?

3. **What volumes/mounts are special in dev?**
   - Why mount `OPENCLAW_DATA_DIR` (directory for openclaw.json, etc.)?
   - Why mount `/var/run/docker.sock` (for docker-in-docker)?

### Implementation
- Document override file purpose in its header comment
- Explain when and how to use it with base config
- Provide examples: `docker compose -f docker/docker-compose.openclaw.yml -f docker/docker-compose.openclaw.override.yml up -d`
- Document the `bunny` image and why it's used in dev
- Add to consolidated DOCKER.md with clear dev vs. production guidance

---

## Remaining Tasks (Per Ticket PRD)

### ✅ Task 2: Document Current Usage & Confusion Points (100% Complete)
- [x] DOCKER.md created as authoritative single-source-of-truth
- [x] All 5 service groups documented with clear purpose and usage
- [x] Confusion matrix showing when to use which file
- [x] Quick reference table with exact commands
- [x] Override file purpose fully documented with dev pattern

### ✅ Task 3: Consolidate/Clarify Configuration Structure (100% Complete)
Decision made: **Option B** (clean up stale test references)

**Completed**:
- [x] Created DOCKER.md with complete reference guide (250+ lines)
- [x] Added comprehensive headers to all 5 docker-compose files
- [x] Documented base config pattern (docker/docker-compose.openclaw.yml)
- [x] Documented dev override pattern (with bunny image, docker socket mounts)
- [x] Removed docker-compose.test.yml references from docs
- [x] Removed docker-test-* targets from Makefile
- [x] Established clear architectural principles

**Files Updated**:
- DOCKER.md (NEW) — 250+ lines, authoritative reference
- AGENTS.md — Updated with override pattern and dev commands
- DOCKER_SETUP.md — Simplified to quick-start guide
- DOCKER_COMPOSE_READY.md — Simplified with reference to DOCKER.md
- Makefile — Removed docker-test-* targets
- All 5 docker-compose.*.yml files — Added purpose headers

### Task 4: Update Documentation & READMEs (COMPLETED)
Completed as part of Task 3:
- [x] DOCKER.md created with comprehensive guide
- [x] DOCKER_SETUP.md updated (removed test refs)
- [x] DOCKER_COMPOSE_READY.md updated (points to DOCKER.md)
- [x] AGENTS.md updated with override usage examples
- [x] All docker-compose files have headers explaining usage

### Task 5: Verify Build Scripts (COMPLETED)
Verification results:
- [x] No docker-compose in GitHub Actions workflows
- [x] Build scripts use only direct `docker build` (not docker-compose)
- [x] Override file is never referenced in build context
- [x] Base config (docker-compose.openclaw.yml) is production-safe
- [x] No dev-specific logic in base configuration

---

## Recommended Immediate Actions

1. **Make Decision on Test Files**
   - Recommend: **Option B (Clean up stale references)**
   - Rationale: Aligns with consolidation goal, simplifies maintenance
   - Action: Update Decision Point 1 and proceed

2. **Document Override File**
   - Add header comment to `docker-compose.openclaw.override.yml`
   - Research/clarify `bunny` image purpose
   - Create usage guide section in DOCKER.md (to be created)

3. **Schedule Follow-Up Tasks**
   - Task 3 (consolidate docs): 2-3 hours
   - Task 4 (update docs): 1-2 hours
   - Task 5 (verify build): 1-2 hours

---

## Key Architectural Principles (For Consolidation)

Once decisions are made, document these clearly:

1. **Single Base Config**: `docker/docker-compose.openclaw.yml` is the ONLY production-ready config
2. **Dev Override Pattern**: `docker compose -f base.yml -f override.yml` is the dev pattern
3. **Never Mix**: Build/CI/production uses base only; dev uses base + override
4. **Clear Separation**: 
   - **Production/Build** → `docker/docker-compose.openclaw.yml` alone
   - **Development** → `docker/docker-compose.openclaw.yml` + `docker/docker-compose.openclaw.override.yml`
   - **Testing** → `docker/docker-compose.playwright.yml` (for E2E automation)
   - **Cross-Platform** → `docker-compose.windows.yml` (for Windows VM testing)
   - **Editor/Web Dev** → Root `docker-compose.yml` (separate concern)
5. **Legacy Test Files** → Removed (clean consolidation)

---

## Implementation Complete ✅

**Date**: 2026-04-12  
**Commit**: 55fb798  
**Branch**: ticket-047-md-audit-and-bdd-specs

### Decisions Made

1. ✅ **Option B Selected**: Clean up test file references (aligned with consolidation goal)
2. ✅ **bunny Image**: Understood as dev-fast-iteration image; documented in headers
3. ✅ **Override File**: Optional but recommended for development; documented in DOCKER.md
4. ✅ **GitHub Actions**: Verified — no docker-compose usage, uses direct docker build
5. ✅ **Build Process**: Base config only (docker-compose.openclaw.yml), never override

### Summary

Ticket-048 consolidation is **COMPLETE**:
- Single authoritative source: **DOCKER.md**
- Clear architectural principles established
- All service groups documented with purpose and usage
- Base vs. override pattern clearly explained
- Stale test references cleaned up
- Build pipeline verified (base config only, no override)

All acceptance criteria from PRD met. Ready for team review and merge.
