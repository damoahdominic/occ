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

### Task 2: Document Current Usage & Confusion Points (50% Complete)
- [x] DOCKER_ANALYSIS.md created (as AUDIT_FINDINGS.md)
- [x] Current usage patterns traced
- [ ] Confusion points clearly listed and explained
- [ ] Need: Decision on test files → impacts this task
- [ ] Need: Override file purpose documented → impacts this task

### Task 3: Consolidate/Clarify Configuration Structure (NOT STARTED)
Depends on:
- Decision on test files (Option A or B)
- Override file documentation (Decision Point 2)

**Work Items**:
- Update/create `DOCKER.md` with clear sections per file
- Add comment headers to each docker-compose.yml explaining purpose
- Document environment variable dependencies
- Create usage matrix (which file for which scenario)

### Task 4: Update Documentation & READMEs (NOT STARTED)
Depends on: Task 3

**Work Items**:
- Update DOCKER_SETUP.md (remove test refs if Option B)
- Update DOCKER_COMPOSE_READY.md (clarify focus)
- Add override usage examples
- Update Makefile help text

### Task 5: Update Build Scripts (NOT STARTED)
Depends on: Tasks 2-4, Architectural Decision

**Work Items**:
- Verify build scripts use only `docker-compose.openclaw.yml` (not override)
- Check CI/CD workflows (GitHub Actions, etc.)
- Document production build process
- Add pre-commit validation for compose files

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

## Questions for User/Team

Before proceeding with remaining tasks:

1. Do you agree with **Option B** (clean up test file references)?
2. What is the `bunny` image? (Is it a public image or internal tool?)
3. Should override file always be used in dev, or is it optional?
4. Are there GitHub Actions or CI/CD workflows that need updating?
5. What is the exact production build process? (Which scripts/tools use docker-compose?)
