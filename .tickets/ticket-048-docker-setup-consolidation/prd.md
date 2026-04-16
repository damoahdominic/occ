# Ticket 048 — Docker Setup Consolidation & Clarification

## 2.1 Problem Statement

The project has multiple Docker Compose files scattered across the codebase with unclear purpose and usage patterns. This creates confusion about:

1. **Which file to use for what**: Developers and documentation don't clearly distinguish between:
   - **Root `docker-compose.yml`** (editor + web dev services)
   - **`docker/docker-compose.openclaw.yml`** (production-like OpenClaw gateway setup)
   - **`docker/docker-compose.openclaw.override.yml`** (dev overrides with `bunny` image)
   - **`docker/docker-compose.playwright.yml`** (test/automation with Playwright display)
   - **`docker-compose.windows.yml`** (Windows VM for cross-platform testing)
   - **`docker-compose.test.yml`** (mentioned in docs but not verified to exist)

2. **Conflicting patterns**: Some files build from Dockerfile, others use pre-built images; some use `command`, others use `entrypoint`; unclear naming and location strategy.

3. **Documentation gaps**: DOCKER_SETUP.md, AGENTS.md, and DOCKER_COMPOSE_READY.md reference these files inconsistently. Override file purpose and relationship to base config is undefined.

4. **Build ambiguity**: Scripts and CI/CD may not be using the correct base config file for reproducible builds; dev overrides may leak into production contexts.

5. **Naming inconsistency**: `docker-compose.openclaw.yml` vs root `docker-compose.yml` breaks mental model. Two different conventions in use.

## 2.2 Proposed Solution

Establish a **single, clear source of truth** for production/base configuration with explicit dev overrides:

### Architecture

```
docker/
├── docker-compose.openclaw.yml          # Base: production-like (postgres, redis, gateway)
├── docker-compose.openclaw.override.yml # Dev: overrides for local dev (image, mounts, etc.)
├── docker-compose.playwright.yml        # Test/CI: Playwright + display for automation
├── Dockerfile.openclaw                  # Build image for gateway service
└── .env.openclaw                        # Configuration for openclaw services

(Root level — keep separate for legacy editor/web dev services)
docker-compose.yml                       # Dev: editor + web services (VSCode fork)
docker-compose.windows.yml               # Specialized: Windows VM testing (keep separate)
docker-compose.test.yml                  # Test/CI: Node version detection (keep separate)
```

### Key Principles

1. **Single base config**: `docker/docker-compose.openclaw.yml` is the **only** config for OpenClaw services. No environment-specific logic.
2. **Override pattern**: `docker-compose.openclaw.override.yml` applies only in dev via `docker compose -f A.yml -f B.yml up`. Never used in CI/build.
3. **Separation of concerns**:
   - **OpenClaw services** (gateway, postgres, redis) → `docker/docker-compose.openclaw.yml`
   - **Editor/Web dev** (OCC forked VSCode) → Root `docker-compose.yml`
   - **Test/CI specialized** → Separate explicit files (playwright, windows, test)
4. **Build uses base only**: Production builds and CI use only `docker-compose.openclaw.yml`, never override.
5. **Dev uses both**: Developers use `docker compose -f docker/docker-compose.openclaw.yml -f docker/docker-compose.openclaw.override.yml up`.

## 2.3 Acceptance Criteria

- [ ] **Single source of truth**: `docker/docker-compose.openclaw.yml` contains all production-ready OpenClaw config with no dev-specific logic.
- [ ] **Clear dev separation**: `docker/docker-compose.openclaw.override.yml` is documented as dev-only and never included in build/CI.
- [ ] **No ambiguity on usage**:
  - Production/build: `docker compose -f docker/docker-compose.openclaw.yml build`
  - Dev: `docker compose -f docker/docker-compose.openclaw.yml -f docker/docker-compose.openclaw.override.yml up -d`
  - Tests: Explicit test configs with clear filenames and purpose.
- [ ] **Documentation complete**:
  - `DOCKER.md` created (or existing doc updated) with clear section per file.
  - Each file has a comment block explaining its purpose and when to use it.
  - README/docs updated to reference new structure.
- [ ] **Scripts/CI updated**: All build scripts, GitHub Actions, Makefile targets use only base config (never override).
- [ ] **No breaking changes**: Existing workflows (AGENTS.md, DOCKER_COMPOSE_READY.md) continue to work; update commands where needed.

## 2.4 Current State Assessment

### Files Discovered

| File | Purpose | Usage | Issues |
|------|---------|-------|--------|
| `docker-compose.yml` | Editor + Web dev | Root level; referenced in AGENTS.md | Separate concern from OpenClaw |
| `docker/docker-compose.openclaw.yml` | OpenClaw services (gateway, postgres, redis) | Production-like setup | Base config; sometimes mixed with override |
| `docker/docker-compose.openclaw.override.yml` | Dev overrides (bunny image, mounts) | Manual append to base | Unclear if mandatory or optional; broken syntax in current version |
| `docker/docker-compose.playwright.yml` | Playwright display + Chrome | Test/automation setup | Clear purpose; separate concern |
| `docker-compose.windows.yml` | Windows VM for testing | Cross-platform testing | Specialized; keep separate |
| `docker-compose.test.yml` | Node.js version detection tests | Referenced in docs | May not exist; confirm/consolidate |

### Current Confusions

1. **Override file is broken**: Current `docker-compose.openclaw.override.yml` has syntax errors (missing service name for volumes).
2. **Usage instructions scattered**: AGENTS.md, DOCKER_SETUP.md, DOCKER_COMPOSE_READY.md have conflicting or incomplete commands.
3. **Build context unclear**: `Dockerfile.build-linux` for editor, `Dockerfile.openclaw` for gateway—different contexts, no clear naming scheme.
4. **Environment variables**: `.env`, `.env.openclaw`, `.env.openclaw.example` scattered—which is canonical?
5. **Test files**: `docker-compose.test.yml` for Node detection tests mentioned in docs but verification needed.

## 2.5 Technical Considerations

- **Docker Compose version**: Use `version: "3.9"` consistently (current files vary).
- **Networks**: `docker-compose.openclaw.yml` defines `occ-network`; ensure override doesn't redefine.
- **Volume persistence**: Base config defines `occ-postgres-data`, `occ-redis-data`; override should mount dev-local paths without redefining volumes.
- **Override syntax**: Use service-level overrides only (e.g., image, ports, environment); avoid redefining entire service.
- **Environment variable handling**: Use `.env.openclaw` as canonical; `.env.openclaw.example` as template.
- **Image naming**: Base uses `openclaw/pod:latest` (production); override might use `bunny:latest` for dev. Ensure clarity on image source.

## 2.6 Dependencies

- None — this is a cleanup ticket. May unblock deployment/CI pipeline clarity.

---

---

## Status & Progress

**Branch**: ticket-047-md-audit-and-bdd-specs  
**Created**: 2026-04-11  
**Last Updated**: 2026-04-11 19:52 UTC  

### Completed Work

- ✅ **Critical Fix**: Fixed YAML syntax error in `docker-compose.openclaw.override.yml`
  - Moved volumes section from root level into `occ-gateway` service
  - Removed duplicate docker.sock mount
  - Validated with `docker-compose config`
  - Commit: 0400799

- ✅ **Audit Findings**: Comprehensive audit completed in AUDIT_FINDINGS.md
  - All 5 docker-compose files documented
  - 3 Dockerfiles identified
  - 3 environment files catalogued
  - Usage patterns traced in docs, Makefile, scripts
  - Confusion matrix created showing clarity gaps

### Critical Issues Found

1. **Override file YAML syntax** ✅ FIXED
   - Volumes improperly nested; now corrected

2. **Missing docker-compose.test.yml** (UNRESOLVED)
   - Referenced in docs (DOCKER_SETUP.md, DOCKER_COMPOSE_READY.md)
   - Makefile targets expect it: `make docker-test`, `make docker-test-fnm`, etc.
   - File does not exist; needs investigation
   - Dockerfile.test variants also missing but referenced in docs

3. **Override file purpose undocumented** (TODO)
   - Uses `bunny:latest` image instead of `openclaw/pod:latest`
   - When is it used? Always in dev, or optional?
   - Why is it separate from base config?

---

## Tasks

### Task 1: Audit All Docker Compose Files & Dockerfiles

**Objective**: Document exact state, syntax, and current usage of all Docker-related files.

**Status**: ✅ COMPLETED (See AUDIT_FINDINGS.md)

**Acceptance Criteria**:
- [x] All docker-compose files audited and documented in a spreadsheet or table
- [x] Dockerfile purposes and build contexts identified
- [x] Environment file relationships documented
- [x] Current usage patterns (commands, scripts, CI) identified for each file
- [x] Syntax errors noted (e.g., override file broken)

**Subtasks**:
- [ ] Subtask 1.1: Verify all `docker-compose*.yml` files exist and are parseable
  - Validate YAML syntax with `docker-compose config`
  - Note any errors or warnings
- [ ] Subtask 1.2: Document service definitions in each file
  - Services defined (name, image/build, ports, volumes, networks)
  - Dependencies and healthchecks
  - Environment variables
- [ ] Subtask 1.3: Identify all Dockerfiles and their purposes
  - Dockerfile, Dockerfile.build-linux, Dockerfile.openclaw, etc.
  - Build contexts (root vs docker/)
  - Dependencies and installed packages
- [ ] Subtask 1.4: Document environment files
  - .env, .env.openclaw, .env.openclaw.example
  - Which are canonical, which are templates
  - Variable dependencies between files
- [ ] Subtask 1.5: Trace current usage in scripts and docs
  - Grep for `docker-compose`, `docker compose` in Makefile, scripts, *.md
  - Build a usage matrix (which files used where, by whom)

**Depends on**: None

---

### Task 2: Document Current Usage & Confusion Points

**Objective**: Create a detailed report of how Docker is currently used, gaps, and confusion.

**Acceptance Criteria**:
- [ ] A `DOCKER_ANALYSIS.md` file created documenting findings
- [ ] Clear explanation of each file's intended purpose
- [ ] List of confusion points and ambiguities
- [ ] Current gaps in documentation
- [ ] Recommendations for consolidation

**Subtasks**:
- [ ] Subtask 2.1: Analyze documentation (DOCKER_SETUP.md, AGENTS.md, DOCKER_COMPOSE_READY.md)
  - Extract Docker-related instructions
  - Note conflicting or incomplete guidance
  - Identify what developers are told vs. actual structure
- [ ] Subtask 2.2: Identify confusion points
  - When do developers use root `docker-compose.yml` vs `docker/docker-compose.openclaw.yml`?
  - Is override mandatory or optional?
  - How does Windows VM fit in workflow?
  - Are test configs separate or mixed?
- [ ] Subtask 2.3: Assess documentation gaps
  - Missing purpose explanations
  - Missing usage instructions
  - Missing troubleshooting guidance
- [ ] Subtask 2.4: Create usage matrix
  - Which files used for dev, test, build, CI?
  - Which scripts/tools invoke each?
  - Owner/maintainer for each concern area
- [ ] Subtask 2.5: Document environment variable flow
  - What variables are required, optional, overridden?
  - How do they flow through compose files?
  - Are examples complete and accurate?

**Depends on**: Task 1

---

### Task 3: Consolidate & Clarify Config Files

**Objective**: Fix syntax errors, consolidate files, and establish clean separation.

**Acceptance Criteria**:
- [ ] `docker/docker-compose.openclaw.yml` is valid, production-ready, with no dev-specific logic
- [ ] `docker/docker-compose.openclaw.override.yml` is valid and contains only dev overrides
- [ ] Root `docker-compose.yml` remains separate (editor/web services)
- [ ] Test/Windows/Playwright configs clearly named and documented
- [ ] No redundant or conflicting configurations
- [ ] All files pass `docker-compose config` validation

**Subtasks**:
- [ ] Subtask 3.1: Fix `docker/docker-compose.openclaw.override.yml` syntax
  - Current file has missing service name for volumes section
  - Reformat to properly override only specific service properties
  - Remove duplicate/conflicting definitions
- [ ] Subtask 3.2: Finalize `docker/docker-compose.openclaw.yml` as base config
  - Remove any dev-specific logic (e.g., local image overrides, debug mounts)
  - Ensure all services have healthchecks and restart policies
  - Document exposed ports and environment variables
  - Add comment block explaining purpose and usage
- [ ] Subtask 3.3: Consolidate/clarify test configs
  - Verify `docker-compose.test.yml` exists; if not, confirm docs are inaccurate
  - Document when/how to use `docker-compose.playwright.yml`
  - Clarify `docker-compose.windows.yml` scope (cross-platform testing only)
  - Ensure no confusion with base/override files
- [ ] Subtask 3.4: Standardize environment file setup
  - Use `.env.openclaw` as canonical; move other env files to `.env.openclaw.example` template
  - Document variable requirements and defaults
  - Ensure example is accurate and complete
- [ ] Subtask 3.5: Add file headers/comments
  - Each docker-compose file has a comment block explaining purpose
  - Usage instructions (which file for which scenario)
  - Environment variable requirements
  - Service descriptions

**Depends on**: Task 2

---

### Task 4: Update Documentation & Scripts

**Objective**: Update all references to Docker setup in docs and scripts to reflect new structure.

**Acceptance Criteria**:
- [ ] DOCKER.md (or updated DOCKER_SETUP.md) clearly documents file structure and usage
- [ ] AGENTS.md commands updated to match new file locations/names
- [ ] DOCKER_COMPOSE_READY.md references corrected or consolidated
- [ ] All scripts (docker-dev.sh, Makefile targets) use correct files
- [ ] README.md or main docs point to clear Docker setup guide
- [ ] Example commands provided for common scenarios (dev up, build, test, CI)

**Subtasks**:
- [ ] Subtask 4.1: Create/update DOCKER.md with comprehensive guide
  - Structure section explaining file organization
  - Purpose section (one subsection per file)
  - Usage section with scenarios and exact commands
  - Troubleshooting section
  - Environment variables reference
- [ ] Subtask 4.2: Update AGENTS.md
  - Correct docker-compose file paths/names
  - Update example commands to use correct files
  - Remove contradictions or outdated guidance
- [ ] Subtask 4.3: Review and consolidate DOCKER_SETUP.md and DOCKER_COMPOSE_READY.md
  - Decide: keep separate docs or consolidate into DOCKER.md?
  - If keeping: ensure they cross-reference and don't contradict
  - If consolidating: merge content into single authoritative guide
- [ ] Subtask 4.4: Update Makefile targets
  - `make docker-up`, `make docker-down` should use correct files
  - Test targets (docker-test-*) use correct compose file
  - Build targets use only base config
- [ ] Subtask 4.5: Update scripts (docker-dev.sh, etc.)
  - Ensure they reference correct docker-compose files
  - Add helpful comments
  - Add error handling for missing files/configs

**Depends on**: Task 3

---

### Task 5: Verify Build & CI Usage

**Objective**: Ensure build pipeline and CI/CD use only base config, never override.

**Acceptance Criteria**:
- [ ] All build scripts use `docker-compose.openclaw.yml` only (no override)
- [ ] CI/CD workflows (.github/workflows) use base config
- [ ] Docker image builds produce consistent, reproducible artifacts
- [ ] No dev-specific logic (bunny image, local mounts) in production builds
- [ ] Build documentation updated

**Subtasks**:
- [ ] Subtask 5.1: Audit build scripts and GitHub Actions
  - Find all `docker build`, `docker-compose build`, `docker compose` invocations
  - Verify they use only base config or explicit test configs
  - Check for any references to override file in build context
- [ ] Subtask 5.2: Update build scripts to be explicit
  - Use full paths (`docker/docker-compose.openclaw.yml`) to avoid ambiguity
  - Add comments explaining why base is used, not override
  - Ensure variables (.env files) are sourced correctly
- [ ] Subtask 5.3: Update CI/CD workflows
  - GitHub Actions or other CI should use base config only
  - Add step to validate config (`docker-compose config`)
  - Test that build output is reproducible
- [ ] Subtask 5.4: Create build checklist
  - Document steps to build production image
  - Verify no dev dependencies leak in
  - Verify image runs correctly with base config

**Depends on**: Task 3, Task 4

---

## 2.7 Rollout Plan

### Phase 1: Analysis & Documentation (Tasks 1–2)
- Audit current state
- Document confusion points
- Get team consensus on desired state
- No changes to code yet

### Phase 2: Consolidation (Task 3)
- Fix syntax errors
- Finalize config files
- Test locally
- PR for review

### Phase 3: Documentation Update (Task 4)
- Update docs and scripts
- Verify examples work
- Get team sign-off on usage patterns

### Phase 4: Verification (Task 5)
- Verify build pipeline uses base config
- Run CI/CD validation
- Smoke test production build

## 2.8 Estimated Effort

- Task 1: 4–6 hours (audit, documentation)
- Task 2: 3–4 hours (analysis, report)
- Task 3: 4–6 hours (fixes, consolidation, testing)
- Task 4: 4–6 hours (docs, scripts, examples)
- Task 5: 3–4 hours (build verification, CI review)

**Total: 18–26 hours (~1–2 dev weeks)**

---

## 2.9 Success Metrics

1. **No ambiguity**: Developer asks "which docker-compose file do I use?" and can find answer in < 1 minute.
2. **Single command**: To start OpenClaw services in dev, one clear command: `docker compose -f docker/docker-compose.openclaw.yml -f docker/docker-compose.openclaw.override.yml up -d`
3. **Build confidence**: CI/CD and builds use only base config; developers can reproduce build locally.
4. **Documentation**: No conflicting instructions across DOCKER.md, AGENTS.md, DOCKER_SETUP.md.
5. **Adoption**: All new scripts/workflows reference consolidated structure; no new files with conflicting purposes.

---

## 2.10 Future Considerations

- Consider tool to validate docker-compose schema on commit (pre-commit hook).
- Consider environment variable schema/validation to catch missing vars at startup.
- Consider docker-compose.prod.yml for explicit production overrides (healthcheck timeouts, restart policies, etc.) if needed.
- Monitor for drift: periodically audit that build/CI uses only base config.
