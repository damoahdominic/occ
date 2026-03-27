# PRD: Ticket 020 - Developer Quickstart

## 1. Problem Statement

New contributors to OCCode face a steep learning curve when setting up the development environment. The project has multiple workspaces (editor, web, control-center), specific Node version requirements (exact 20.18.2), and several manual steps before they can start hacking. To lower the barrier to entry and accelerate onboarding, we need a developer-friendly quickstart guide and automation that gets a new dev from `git clone` to "hello world" in under 15 minutes.

## 2. Proposed Solution

Create a comprehensive `DEVELOPERS.md` guide and supporting scripts:

- `DEVELOPERS.md` at repo root covering:
  - Prerequisites (Node 20.18.2 via nvm, Git, possibly Docker for Postgres)
  - One-command environment reset: `./scripts/setup-dev.sh` (Linux/macOS) and `scripts\setup-dev.ps1` (Windows) that:
    - Checks Node version, installs correct version via nvm if missing
    - Installs dependencies at root (`npm ci`)
    - Installs editor dependencies (`npm --prefix apps/editor ci`)
    - Sets up local PostgreSQL (Docker compose or local install) and runs migrations
    - Seeds test data (initial user with $5)
    - Builds the editor and extension
    - Starts the backend API (or provides command)
    - Launches the editor in dev mode
  - Explanation of the monorepo structure
  - How to run each part: `npm --prefix apps/web run dev` for marketing site, `npm --prefix apps/editor run watch` for editor compile/watch, etc.
  - How to run tests: unit, integration, E2E
  - How to debug, common pitfalls (Node version mismatch, port conflicts, etc.)
  - Links to additional documentation (backend spec, AGENTS.md, etc.)

Additionally:

- Provide a `docker-compose.dev.yml` that spins up PostgreSQL, maybe the backend, and any other services (Redis if needed) with one command `docker compose -f docker-compose.dev.yml up -d`
- Add a `makefile` or `justfile` with common shortcuts (`make dev`, `make test`, `make build`, `make db-migrate`)
- Ensure `nvm` use is automatic: a `.nvmrc` file exists at repo root with `20.18.2` and optionally a `.bashrc` snippet that auto-runs `nvm use` when entering the repo (can be documented)

The goal is to make setup as turnkey as possible, with clear error messages if something is missing.

## 3. Acceptance Criteria

- A new contributor can follow `DEVELOPERS.md` from scratch on a clean machine (Linux/macOS/Windows) and end up with a running editor connected to a local backend
- The `setup-dev.sh` script runs without user interaction (or prompts only for necessary inputs like Postgres password) and completes within 10 minutes on decent hardware
- All tests (unit + integration) pass in the fresh dev environment
- The script is idempotent: running it a second time does not break anything
- The guide explicitly states Node version requirement and provides `nvm` instructions; if wrong Node version is used, the script fails early with a clear message
- The guide includes a troubleshooting section with solutions to common errors (e.g., "npm install fails", "can't connect to Postgres", "editor won't launch")
- Docker is optional: if user doesn't have Docker, they can still set up Postgres manually; instructions provided

## 4. Technical Considerations

- **OS support:** Provide separate instructions for Windows (PowerShell) and Unix-like (bash). The script can be two versions or a cross-platform Node script.
- **Node version enforcement:** Use `engines` field in root `package.json` and also check in setup script: `node -v | grep -q 'v20.18.2' || { echo "Please install Node 20.18.2 via nvm"; exit 1; }`
- **nvm integration:** The script can call `nvm install` and `nvm use` automatically if nvm is present; if not, instruct user to install nvm first.
- **Database:** For local dev, provide a Docker Compose file that runs PostgreSQL 16 with default credentials (`postgres:postgres`). The backend should read `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/occ` when `NODE_ENV=development`. The script can run `docker compose -f docker-compose.dev.yml up -d` and wait for DB to be ready (`pg_isready`).
- **Migrations:** After DB is up, script runs `npx drizzle-kit migrate` to apply schema.
- **Seeding:** Provide `src/db/seed.ts` that creates a demo user with known password and $5 balance. Script runs `node dist/db/seed.js` or `ts-node src/db/seed.ts`.
- **Backend start:** `npm --prefix apps/backend run dev` or similar (need to define script). The guide should explain how to start backend and editor separately, possibly concurrently with `npm-run-all` or `concurrently`.
- **Editor build:** Editor needs to compile (`npm --prefix apps/editor run compile`). The watch mode (`npm --prefix apps/editor run watch`) is useful for live editing.
- **Web app:** The marketing site (`apps/web`) is Next.js; dev: `npm --prefix apps/web run dev`.
- **Error handling:** Scripts should check each step and exit on failure with a helpful message. Use `set -e` in bash; in PowerShell, `$ErrorActionPreference = 'Stop'`.
- **Environment variables:** Document which are needed (`STRIPE_SECRET_KEY` not needed for dev if using mocks; but `JWT_SECRET` needed). Provide a `.env.example` that developers copy to `.env`.

## 5. Dependencies

- Backend must have basic structure (ticket-007) with migrations and seed script
- Database schema ready (ticket-011)
- Editor build scripts exist

## 6. Subtask Checklist

- [ ] Task 1: Write `DEVELOPERS.md` guide
  - **Problem:** Authoritative onboarding doc
  - **Test:** New contributor reads it and can set up environment
  - **Subtasks:**
    - [ ] Subtask 1.1: Introduction: what OCCode is, monorepo structure overview (diagram)
    - [ ] Subtask 1.2: Prerequisites: Node 20.18.2 (with nvm), Git, Docker (optional), PostgreSQL (if not using Docker)
    - [ ] Subtask 1.3: Step-by-step setup:
      - `git clone ... && cd occ`
      - `nvm install` (reads `.nvmrc`) and `nvm use`
      - `./scripts/setup-dev.sh` (or manual steps)
    - [ ] Subtask 1.4: Manual steps alternative if script not used: install deps, start DB, run migrations, seed, build editor, start backend, launch editor
    - [ ] Subtask 1.5: Running dev: separate terminals for backend, editor watch, web
    - [ ] Subtask 1.6: Testing: `npm test`, `npm run test:e2e`
    - [ ] Subtask 1.7: Troubleshooting: common errors (Node version mismatch, port 3001 in use, Postgres not running, VS Code extension host errors)
    - [ ] Subtask 1.8: Links to other docs: `AGENTS.md`, `backend.md`, `roadmap.md`

- [ ] Task 2: Create `scripts/setup-dev.sh` (bash) and `setup-dev.ps1` (PowerShell)
  - **Problem:** Automate the setup
  - **Test:** On fresh Ubuntu VM, run script; it completes without manual intervention (except maybe sudo for Docker)
  - **Subtasks:**
    - [ ] Subtask 2.1: Check Node version: `node -v` should be `v20.18.2`; if not, try `nvm use` if `.nvmrc` exists; if fails, print "Please run `nvm install` then `nvm use` and re-run script"
    - [ ] Subtask 2.2: `npm ci` at root
    - [ ] Subtask 2.3: `npm --prefix apps/editor ci`
    - [ ] Subtask 2.4: Start Postgres via Docker Compose: `docker compose -f docker-compose.dev.yml up -d`
    - [ ] Subtask 2.5: Wait for DB: loop `docker exec occ-db pg_isready` or `nc -z localhost 5432`
    - [ ] Subtask 2.6: Run migrations: `npx drizzle-kit migrate`
    - [ ] Subtask 2.7: Run seed: `npx ts-node src/db/seed.ts` (or compiled dist)
    - [ ] Subtask 2.8: Build editor: `npm --prefix apps/editor run compile`
    - [ ] Subtask 2.9: Print next steps: "Now run: npm --prefix apps/backend run dev (in one terminal) and npm --prefix apps/editor run watch (in another), then launch editor from out/ or via npm script"
    - [ ] Subtask 2.10: If any command fails, exit with non-zero and print helpful error

- [ ] Task 3: Create `docker-compose.dev.yml`
  - **Problem:** Provide disposable Postgres service
  - **Test:** `docker compose -f docker-compose.dev.yml up -d` starts Postgres on port 5432 with default credentials
  - **Subtasks:**
    - [ ] Subtask 3.1: Compose file with service `postgres` using `postgres:16-alpine`
    - [ ] Subtask 3.2: Environment: `POSTGRES_PASSWORD=postgres`, `POSTGRES_DB=occ`
    - [ ] Subtask 3.3: Volumes: `postgres_data:/var/lib/postgresql/data` (named volume)
    - [ ] Subtask 3.4: Ports: `"5432:5432"`
    - [ ] Subtask 3.5: Healthcheck: `pg_isready`
    - [ ] Subtask 3.6: `docker-compose.dev.yml` also optionally include `backend` service if we want to run full stack in Docker; but simpler to keep only DB

- [ ] Task 4: Add `Makefile` or `Justfile`
  - **Problem:** Shortcuts for common dev tasks
  - **Test:** `make dev` starts everything; `make test` runs tests
  - **Subtasks:**
    - [ ] Subtask 4.1: If using Makefile:
      - `install`: `npm ci && npm --prefix apps/editor ci`
      - `db-up`: `docker compose -f docker-compose.dev.yml up -d`
      - `db-down`: `docker compose -f docker-compose.dev.yml down`
      - `migrate`: `npx drizzle-kit migrate`
      - `seed`: `npx ts-node src/db/seed.ts`
      - `build-editor`: `npm --prefix apps/editor run compile`
      - `dev-backend`: `npm --prefix apps/backend run dev` (assuming backend in `apps/backend`; currently backend is at root `apps/backend`? Actually backend might be separate repo; but we can adapt)
      - `dev-editor`: `npm --prefix apps/editor run watch`
      - `dev-web`: `npm --prefix apps/web run dev`
      - `test`: `npm test`
      - `test-e2e`: `npm run test:e2e`
      - `clean`: `rm -rf node_modules apps/editor/node_modules apps/web/node_modules && docker volume rm occ_postgres_data`
    - [ ] Subtask 4.2: Document these make targets in DEVELOPERS.md

- [ ] Task 5: Ensure backend seed script exists and is robust
  - **Problem:** Developers need sample data to test auth and balance
  - **Test:** Running `npx ts-node src/db/seed.ts` creates a user `dev@example.com` with password `devpass` and $5 balance; prints credentials to console
  - **Subtasks:**
    - [ ] Subtask 5.1: Write `src/db/seed.ts` using Drizzle to upsert a demo user (`email: 'dev@example.com'`, hashed password with bcrypt, provider: 'email')
    - [ ] Subtask 5.2: Ensure corresponding `credits` row exists with `balance_usd: 5.00`
    - [ ] Subtask 5.3: Log the created user's ID and password (or a known default) so developer can use it to sign in during manual testing
    - [ ] Subtask 5.4: Make script idempotent: if user exists, update password and ensure credits exist

- [ ] Task 6: Add `.nvmrc` and `.node-version` at repo root
  - **Problem:** Enforce Node version
  - **Test:** `cat .nvmrc` outputs `20.18.2`; `nvm use` auto-switches when entering repo (if configured in shell)
  - **Subtasks:**
    - [ ] Subtask 6.1: `echo "20.18.2" > .nvmrc`
    - [ ] Subtask 6.2: Optionally add `.node-version` for tools like `asdf`
    - [ ] Subtask 6.3: In `DEVELOPERS.md`, mention "nvm will automatically use the correct version if you have it installed; run `nvm install` to set up"

- [ ] Task 7: Provide a `.env.example` and explain `.env`
  - **Problem:** Backend expects certain environment variables
  - **Test:** Developer copies `.env.example` to `.env` and fills in minimal values; backend starts
  - **Subtasks:**
    - [ ] Subtask 7.1: Create `.env.example` with:
      ```
      NODE_ENV=development
      PORT=3001
      DATABASE_URL=postgresql://postgres:postgres@localhost:5432/occ
      JWT_SECRET=dev-secret-change-me-64-characters-long-random-string
      INFERENCE_ENDPOINT=http://localhost:4000/v1 (or mock)
      ```
    - [ ] Subtask 7.2: Document: "Copy `.env.example` to `.env` and adjust JWT_SECRET to a random 64-char string"
    - [ ] Subtask 7.3: For development, Stripe keys not needed unless testing payments; can leave empty or use test keys

- [ ] Task 8: Update `package.json` root scripts for convenience
  - **Problem:** Need single commands for common tasks
  - **Test:** `npm run dev` starts backend + editor watch? maybe `concurrently` scripts
  - **Subtasks:**
    - [ ] Subtask 8.1: Add `setup` script that runs `./scripts/setup-dev.sh` (or fails on Windows) and prints "Setup complete!"
    - [ ] Subtask 8.2: Add `dev` script that runs `concurrently "npm --prefix apps/backend run dev" "npm --prefix apps/editor run watch"` (if backend in apps/backend)
    - [ ] Subtask 8.3: Add `build` script that builds editor and extension: `npm --prefix apps/editor run compile && npm --prefix apps/extension run ext:package`
    - [ ] Subtask 8.4: Add `test` script that runs all tests: `npm test --workspaces` (if using workspaces)

- [ ] Task 9: Document the development workflow
  - **Problem:** Beyond setup, need to know how to work day-to-day
  - **Test:** Guide includes "typical day": start DB, start backend, start editor watch, open editor, make changes, see hot reload, run tests, commit
  - **Subtasks:**
    - [ ] Subtask 9.1: "Typical dev workflow" section: terminal tabs: 1) `docker compose -f docker-compose.dev.yml up -d` (if not already), 2) `npm --prefix apps/backend run dev`, 3) `npm --prefix apps/editor run watch`, 4) `npm --prefix apps/web run dev` (optional)
    - [ ] Subtask 9.2: How to debug: `Debug: Open Chrome and navigate to chrome://inspect` to attach debugger to editor process
    - [ ] Subtask 9.3: How to run a single test: `npx playwright test --grep "Install OpenClaw"`
    - [ ] Subtask 9.4: Code style: use Prettier, ESLint; `npm run lint` and `npm run format`

- [ ] Task 10: Review and iterate with fresh eyes
  - **Problem:** Avoid assumptions; ensure clarity
  - **Test:** Give `DEVELOPERS.md` to a colleague not familiar with project; they can set up without asking questions
  - **Subtasks:**
    - [ ] Subtask 10.1: Perform a dry run on a clean VM or container
    - [ ] Subtask 10.2: Fix any ambiguous instructions or missing steps
    - [ ] Subtask 10.3: Update setup scripts based on failures observed during dry run
    - [ ] Subtask 10.4: Add FAQ at bottom of guide: "What if I don't have Docker?" "Can I use Windows Subsystem for Linux?" "How do I update dependencies?"
