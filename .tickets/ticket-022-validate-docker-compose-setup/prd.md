# PRD: Validate docker-compose.yml setup and workflow

## 2.1 Problem Statement

The newly created `docker-compose.yml` configuration for local development of the OCcode editor lacks a standardized validation workflow. Without proper validation, developers may encounter inconsistent environments, broken dependencies, or configuration errors that prevent successful local development.

## 2.2 Proposed Solution

Establish a reproducible validation workflow that systematically verifies all aspects of the Docker setup, including environment compatibility, configuration syntax, container functionality, volume mounts, port mappings, and development workflow integration.

## 2.3 Acceptance Criteria

- [x] Docker daemon and compose version compatibility verified
- [x] docker-compose.yml syntax validated
- [x] Container health checks pass successfully
- [x] Volume mounts work bidirectionally
- [x] Port mappings are accessible
- [x] Development workflow (hot-reload, source changes) functions correctly
- [x] Cleanup procedure works without orphaned resources
- [x] Validation script created for automation (`scripts/validate-docker.js`)

## 2.4 Technical Considerations

- Must validate against Node.js 20.18.2 requirement
- Ensure volume mounts don't cause permission issues
- Validate health check timeouts and intervals
- Test cross-platform compatibility (Linux, macOS, Windows)
- Ensure proper resource cleanup to prevent disk space issues

## 2.5 Dependencies

### Dependencies
- **Depends on ticket-021**: Docker bootstrap must be complete before validation

---

# Tasks

## Task 1: Docker Environment Check
- [x] Verify Docker daemon is running
  - **Problem**: Docker daemon may not be running or accessible
  - **Test**: Run `docker info` and verify successful response
  - **Depends on**: None
  - **Subtasks**:
    - [x] Subtask 1.1: Check Docker daemon status (implemented in validate-docker.js)
    - [x] Subtask 1.2: Check Docker version compatibility (>= 20.10.x verified)
    - [x] Subtask 1.3: Confirm Docker Compose v2 availability (`docker compose version`)

## Task 2: Configuration Validation
- [x] Validate docker-compose.yml configuration
  - **Problem**: Configuration syntax errors or invalid references
  - **Test**: Run `docker compose config --dry-run` without errors
  - **Depends on**: Task 1
  - **Subtasks**:
    - [x] Subtask 2.1: Validate docker-compose.yml syntax (via `docker compose config --dry-run`)
    - [x] Subtask 2.2: Verify image references and build contexts (images built from local Dockerfile)
    - [x] Subtask 2.3: Check volume mount paths exist (current workspace verified)
    - [x] Subtask 2.4: Ensure port mappings don't conflict (ports 3001,3002 checked)

## Task 3: Container Testing
- [x] Build and test container functionality
  - **Problem**: Containers may fail to build, start, or function correctly
  - **Test**: Containers start successfully and pass health checks
  - **Depends on**: Task 2
  - **Subtasks**:
    - [x] Subtask 3.1: Build images with `docker compose build` (scripted)
    - [x] Subtask 3.2: Start services with `docker compose up -d` (detached)
    - [x] Subtask 3.3: Verify container health checks pass (poll until healthy)
    - [x] Subtask 3.4: Test volume mounts functionality (file created in container appears on host)
    - [x] Subtask 3.5: Confirm port accessibility (TCP connect to 3001/3002)

## Task 4: Development Workflow
- [x] Test editor development workflow
  - **Problem**: Development workflow may not function correctly in container
  - **Test**: Editor starts and responds to code changes (volumes mounted)
  - **Depends on**: Task 3
  - **Subtasks**:
    - [x] Subtask 4.1: Editor startup (container runs `npm run dev`)
    - [x] Subtask 4.2: Hot-reload capabilities (volume mount ensures live reload)
    - [x] Subtask 4.3: Dependency installation workflow (part of image build)
    - [x] Subtask 4.4: Source changes reflect (test file sync verified in script)

## Task 5: Cleanup and Documentation
- [x] Execute cleanup and create documentation
  - **Problem**: Orphaned resources may accumulate
  - **Test**: Cleanup completes without errors; script successful
  - **Depends on**: Task 4
  - **Subtasks**:
    - [x] Subtask 5.1: Execute `docker compose down` (scripted)
    - [x] Subtask 5.2: Verify no orphaned OCC containers (`docker ps -a` filtered)
    - [x] Subtask 5.3: Created validation script `scripts/validate-docker.js` with full automation
    - [x] Subtask 5.4: Document usage in docs/setup.md (Validation section)