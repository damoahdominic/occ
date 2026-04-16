# AGENTS.md - OpenClaw Code (OCC) Ticket Management

> **OpenClaw Compatibility**: This framework is designed for OpenClaw agents working on the OCC project. Follow these guidelines for ticket-based task execution.

---

## ⚠️ CRITICAL WORKFLOW COMPLIANCE WARNING ⚠️

**STRICT TICKET ORDERING MUST BE FOLLOWED RELIGIOUSLY!**

- ✅ Work MUST proceed in ascending numerical order: ticket-001 → ticket-002 → ticket-003 → ... → ticket-020
- ✅ Within each ticket, tasks MUST be completed in document order: Task 1 → Task 2 → Task 3
- ❌ DEVIATIONS ARE A SERIOUS OFFENSE WITH SEVERE CONSEQUENCES
- ❌ SKIPPING, REORDERING, OR WORKING OUT OF SEQUENCE IS STRICTLY FORBIDDEN

---

# Part 1: Ticket Management Framework

## 1. Ticket Structure & Naming Convention

Each ticket lives in `.tickets/ticket-XXX-name/` with:

- `prd.md` — specification document (required)
- `agent-history.md` — logs of agent work (created when task begins)
- Optional: `diagrams/`, `research/`, `test-results/`
- **Formatting**: All `prd.md` specifications must be written in Gherkin BDD format (Given-When-Then).

### Ignoring Tickets

Add `<!-- ignore -->` as first line of `prd.md` to skip. Agents MUST NOT work on ignored tickets.

---

## 2. PRD.md Content Structure

Each `prd.md` must include:

### 2.1 Problem Statement
What is the issue/feature? Why does it matter?

### 2.2 Proposed Solution
High-level approach and architecture.

### 2.3 Acceptance Criteria
Measurable requirements for completion.
All acceptance criteria will be written as Gherkin BDD specifications (Given-When-Then).

### 2.4 Technical Considerations
Constraints, performance, security, integration points.

### 2.5 Dependencies
Related tickets (by number) that must be complete first.

**Cross-Ticket Dependencies:**
```markdown
### Dependencies
- **Depends on ticket-007**: Auth must be complete before balance API
```
Dependent tickets MUST have all tasks `[x]` before starting.

---

## 3. Task & Subtask Specification

### 3.1 Main Task Structure

```markdown
- [ ] Task 1: <Main objective>
  - **Problem**: <Issue description>
  - **Test**: <How to verify>
  - **Depends on**: <None or prerequisite tasks>
  - **Subtasks**:
    - [ ] Subtask 1.1: <Implementation step>
      - **Objective**: <Specific goal>
      - **Test**: <Verification method>
      - **Depends on**: <None or prerequisite subtasks>
    - [ ] Subtask 1.2: <Next step>
      - **Objective**: ...
      - **Test**: ...
      - **Depends on**: Subtask 1.1

- [ ] Task 2: <Next objective>
  - ...
```

Use nested subtasks (1.1.1) for complex breakdowns.

### 3.2 Status Markers

- `[ ]` — pending (not started)
- `[-]` — in progress (actively working)
- `[x]` — completed (verified)

### 3.3 Workflow Rules

1. Find tasks via `find_next_ticket.sh`
2. Set status to `[-]` when starting
3. Complete all subtasks and verification
4. Set status to `[x]` only after successful test
5. Never skip status transitions

---

## 4. Task & Subtask Refinement

Agents are ENCOURAGED to add missing subtasks before/during work:

- If review reveals gaps, add new subtasks with `Objective` and `Test`
- Place them logically within the parent task
- Mark new subtasks as `[ ]` before starting
- You MAY NOT modify existing task descriptions, but CAN add new subtasks

**Breakdown Guidelines:**

- Each subtask should be a single focused effort (2-3 hours max)
- If a subtask is too large, break it down further
- Include testing as separate subtask when appropriate
- Declare dependencies to enable parallelism

---

## 5. Graph Theory for Parallelization

Tasks form a **Directed Acyclic Graph (DAG)**. Maximize parallelism:

### 5.1 Concurrency Limits

- **Direct agent work**: up to 3 parallel subtasks
- **With subagents**: up to 6 concurrent subagents

### 5.2 Level-Based Execution

- **Level 0**: Subtasks with `Depends on: None` — run all in parallel
- **Level 1**: Depends only on Level 0 — run after Level 0 finishes
- **Level N**: Depends on Level N-1 — run after that level

### 5.3 Critical Path

The longest dependency chain is the critical path. Prioritize these tasks as they determine overall completion time.

### 5.4 Algorithm

1. Build DAG from dependencies
2. Compute level = max(dep_levels) + 1
3. Execute by level (all Level 0, then all Level 1, etc.)
4. Identify critical path to focus resources

---

## 6. AI Agent Workflow

### 6.1 Task Processing

1. **Discover**: Run `scripts/find_next_ticket.sh` to get next pending task
2. **Analyze**: Review problem statement, acceptance criteria, dependencies
3. **Breakdown**: Ensure all needed subtasks exist; add if missing
4. **Implement**: Complete subtask objectives
5. **Test**: Execute verification tests
6. **Validate**: Confirm acceptance criteria satisfied
7. **Update**: Mark subtask `[x]`, then parent Task `[x]`, then acceptance criteria `[x]`
8. **Commit**: Create atomic commit referencing ticket and task number
9. **Report**: Log completion and proceed to next task

### 6.2 Completion & Exit

When no pending `[ ]` tasks exist across all tickets, agents MUST terminate gracefully. Log a completion message and exit.

### 6.3 CRITICAL RULES

**Ordering:**
- Tickets in ascending numerical order ONLY
- Tasks within a ticket in document order ONLY
- Violations = immediate termination

**Dependencies:**
- All dependencies MUST be `[x]` before starting
- Verify by reading dependent ticket's task statuses

**Status Transitions:**
- Sequence: `[ ]` → `[-]` → `[x]` only
- Skipping is PROHIBITED

**Closeout Procedure (NEW):**
After completing all subtasks in a Task:
1. Verify ticket's acceptance criteria are satisfied
2. Mark parent Task checkbox `[x]`
3. Mark any newly fulfilled acceptance criteria checkboxes `[x]`
4. THEN commit and report

---

## 7. Git Commit Process

### 7.1 Timing

✅ **Commit IMMEDIATELY after tests pass** — this is the official completion record.

❌ Never batch multiple tasks
❌ Never delay commits
✅ Each task = one atomic commit

### 7.2 Format

```
<type>(<scope>): <description>
```

Types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`

Example: `feat(ticket-007): implement JWT authentication middleware`

Always include ticket number.

---

## 8. Verification & Testing

- Each subtask must have defined **Test** criteria written in Gherkin BDD format (Given-When-Then) written in Gherkin BDD format (Given-When-Then)
- Follow TDD: write tests before or alongside implementation
- Include unit, edge case, and integration tests
- Verify acceptance criteria before marking `[x]`

---

## 9. Code Quality Standards

- Follow existing code conventions
- Maintain consistent style
- Include error handling
- Add meaningful comments
- Self-review before completion

---

## 10. Subagent Execution Framework

### When to Use Subagents

Spawn subagents when:
- A task has multiple independent subtasks (parallel work)
- Volume of work exceeds single-agent efficiency
- Need to coordinate parallel execution

### Limits

- Max **6 concurrent subagents** per main agent
- Poll all subagents every **2 minutes**
- If a subagent fails or stalls, respawn immediately

### Subagent Requirements

- **Naming**: `sub-agent-histories/agent-history-ticket-001-task-1.2-subtask-name.md`
- **Creation**: Must create agent-history file at START
- **Scope**: Only work on assigned task/subtask
- **Compliance**: Follow all AGENTS.md policies
- **Reporting**: Create git commit, update prd.md, report back to main agent

### Main Agent Responsibilities

- **Spawn**: Use Task tool with specific assignment
- **Monitor**: Poll every 2 mins (read agent-history)
- **Respawn**: On failure/stall, create replacement
- **Coordinate**: Avoid file/resource conflicts
- **Merge**: Integrate completed work and update ticket

### Agent-History File Structure

```markdown
# Subagent History

**Agent ID:** <unique id>
**Ticket:** ticket-001
**Task:** Task 1.2 - Implement login validation
**Started:** <timestamp>
**Status:** in_progress | completed | failed
**Completed:** <timestamp>

## Work Log

### <timestamp> - Start
- Assigned task
- Reviewed requirements

### <timestamp> - Implementation
- Code changes
- Decisions made

### <timestamp> - Testing
- Ran tests
- Verified acceptance criteria

### <timestamp> - Completion
- Created git commit: feat(ticket-001): ...
- Updated prd.md status
- Reported to main agent

## Errors/Issues Encountered
- None (or details)

## Files Modified
- file1.ts
- file2.ts
```

### Lifecycle

1. Main agent spawns subagent (Task tool)
2. Subagent creates agent-history with header
3. Work proceeds, logging chronologically
4. On completion: verify, commit, update prd, report
5. On failure: mark status failed, document reason, report
6. Main agent respawns if needed

---

# Part 2: Project-Specific Configuration ⚙️

## OCC Project Settings

### Technology Stack

- **Editor**: Void editor fork (VS Code base)
- **Backend**: Node.js + Fastify + Drizzle ORM + Postgres
- **Frontend**: React/TypeScript (extension webviews)
- **Auth**: JWT + OAuth (Google/GitHub)
- **Payments**: Stripe Checkout
- **Inference**: OpenAI-compatible proxy to `https://inference.mba.sh/v1`

### Development Commands

```bash
# Install dependencies
npm ci
npm --prefix apps/editor ci

# Build editor
npm --prefix apps/editor run compile

# Run backend (when ready)
npm --prefix apps/backend run dev  # or appropriate

# Watch editor (dev)
npm --prefix apps/editor run watch

# Package extension
npm --prefix apps/extension run ext:package
```

### Environment

- Required Node version: **20.18.2** (enforced by editor)
- Backend port: `3001` (default)
- Database: PostgreSQL (use Docker for dev)

### Docker Dev Setup

```bash
docker compose -f docker-compose.dev.yml up -d
npx drizzle-kit migrate
npx ts-node src/db/seed.ts
```

### Key Paths

- Editor source: `apps/editor/`
- Extension source: `apps/extension/`
- Backend source: `apps/backend/` or root `apps/`
- Tickets: `.tickets/`
- AGENTS.md: repo root and `.tickets/`

---

## Available Scripts

Run these from repository root:

```bash
# Verify ticket statuses (count pending/in-progress per ticket)
bash .tickets/scripts/verify_tickets.sh

# Find the next ticket with pending work
bash .tickets/scripts/find_next_ticket.sh

# List tickets and backlog task counts
bash .tickets/scripts/list_backlog_tasks.sh

# List tickets with completed tasks (all done)
bash .tickets/scripts/list_completed_tasks.sh
```

---

## Permission Management

If Docker permissions cause issues:

```bash
docker run --rm -v /path/to/worktree:/workspace --user root alpine chown -R 1000:1000 /workspace
```

---

## Commit Verification

```bash
# Check last commit matches current task
git log -1 --oneline | grep -q "$(grep -A5 -B5 '\[-]' .tickets/*/prd.md | grep -E 'Task [0-9]+:' | tail -1 | sed 's/.*Task \([0-9]\+\):.*/ticket-\1/')"

# Uncommitted changes count
git status --porcelain | wc -l
```

---

# Part 3: Parallel Execution Policy

## Conflict Prevention

- **File ownership**: Parallel tasks must work on distinct files/directories
- **Pre-flight scan**: Check for overlapping targets before spawning parallel work
- **Shared state**: Avoid mutable shared state; each task uses its own scratch space
- **Database schema changes**: Only one task at a time may modify schema (sequential)
- **If conflict arises**: Pause tasks, refactor for independence, or enforce dependency

## Enforcement

- **Parallelism is default** — maximize concurrency
- **Sequential only when dependencies block parallelism** — document why
- **Commit messages** should note parallel work: `feat(ticket-XXX): implement A and B in parallel (tasks 1.1, 1.2)`
- **Monitor progress** — ensure no task stalls
- **Subagent parallelism**: Up to 6 concurrent subagents; main agent polls every 2 min

---

## OCC-Specific Notes

- The extension uses `context.secrets` for JWT storage — never log tokens
- Backend balance updates must be atomic with usage logging
- Stripe webhook processing must be idempotent (use `stripe_events` table)
- All network calls should have error handling and retry logic
- Logging: use structured JSON (pino) with request IDs
- Status bar balance only visible in `authenticated` state (not BYOK)
- Deep-link URI handler: `occ-editor://auth?token=...&balance=...`

---

*This AGENTS.md adapts the KitchenBookApp framework for OCC. Refer to `docs/` for additional technical specifications.*
