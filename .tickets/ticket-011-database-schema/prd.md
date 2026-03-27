# PRD: Ticket 011 - Database Schema

## 1. Problem Statement

The OCC backend requires a well-defined PostgreSQL database schema to store user accounts, credit balances, usage logs, and (optionally) transaction history. The schema must support:

- User profiles (email, password hash, OAuth provider info)
- Credit balances (current balance and lifetime grants)
- Inference usage logs (token counts, cost, model, timestamp)
- Optional: Stripe customer mapping and transaction history for auditing

The schema should be created and managed using Drizzle ORM migrations, with proper constraints, indexes, and relationships.

## 2. Proposed Solution

Define Drizzle schema files and generate SQL migrations:

**Tables:**

```sql
-- users
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  password      TEXT,                      -- null for OAuth-only users
  provider      TEXT DEFAULT 'email',      -- 'email' | 'google' | 'github'
  provider_id   TEXT,                      -- OAuth provider user ID
  stripe_customer_id TEXT,                 -- Stripe customer ID (nullable)
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- credits
CREATE TABLE credits (
  user_id        UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance_usd    NUMERIC(10,6) NOT NULL DEFAULT 5.000000,
  lifetime_usd   NUMERIC(10,6) NOT NULL DEFAULT 5.000000,
  updated_at     TIMESTAMPTZ DEFAULT now()
);

-- usage_log
CREATE TABLE usage_log (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES users(id),
  tokens_in     INT NOT NULL,
  tokens_out    INT NOT NULL,
  cost_usd      NUMERIC(10,6) NOT NULL,
  model         TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- optional: transactions (for Stripe top-ups)
CREATE TABLE transactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id),
  stripe_session_id TEXT UNIQUE NOT NULL,
  amount_usd        NUMERIC(10,2) NOT NULL,        -- amount charged (e.g., 10.00)
  credit_added_usd  NUMERIC(10,6) NOT NULL,       -- credit added (e.g., 5.00)
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- optional: stripe_events (idempotency for webhooks)
CREATE TABLE stripe_events (
  event_id   TEXT PRIMARY KEY,
  received_at TIMESTAMPTZ DEFAULT now()
);
```

Indexes:
- `CREATE INDEX idx_usage_log_user_created ON usage_log(user_id, created_at DESC);`
- `CREATE INDEX idx_users_email ON users(email);`
- `CREATE INDEX idx_users_stripe_customer ON users(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;`
- `CREATE INDEX idx_transactions_user ON transactions(user_id);`

## 3. Acceptance Criteria

- All tables exist in the PostgreSQL database with defined columns, types, and constraints
- Foreign key relationships enforce referential integrity
- Default values (`5.000000` for initial balance) work on insert without explicit values
- `gen_random_uuid()` generates version 4 UUIDs (requires pgcrypto extension)
- All indexes are present and used by queries (verify with `EXPLAIN`)
- Drizzle schema compiles and migrations apply without errors
- Test suite can seed a test database with sample data

## 4. Technical Considerations

- **Drizzle setup:** Install `drizzle-orm`, `drizzle-kit`, `pg`. Configure `drizzle.config.ts` with `schema` pointing to `src/db/schema.ts`, `out` to `drizzle`, and connection string from env `DATABASE_URL`.
- **Migrations:** Use `drizzle-kit generate:pg` to generate SQL files; review them; apply with `drizzle-kit migrate` or `psql`.
- **UUIDs:** Ensure `pgcrypto` extension is enabled: `CREATE EXTENSION IF NOT EXISTS "pgcrypto";` (can add to initial migration)
- **Numeric precision:** Use `NUMERIC(10,6)` for balances to support fractions of cents; display with `toFixed(2)`.
- **ON DELETE CASCADE:** When a user is deleted, their credits and usage logs should be removed automatically.
- **Partial index:** `users.stripe_customer_id` index only for non-null values to keep it small.
- **Test database:** Use separate DB or schema; run migrations on CI; seed with minimal data for tests.
- **Rollback strategy:** Drizzle does not auto-generate down migrations; write manual `DOWN` SQL or recreate DB from scratch in CI.

## 5. Dependencies

- None foundational; but will be used by tickets 007-010

## 6. Subtask Checklist

- [ ] Task 1: Write Drizzle schema definitions
  - **Problem:** Translate SQL tables to Drizzle `pgTable` definitions
  - **Test:** `npx drizzle-kit generate:pg` produces valid SQL
  - **Subtasks:**
    - [ ] Subtask 1.1: Create `src/db/schema.ts` with `users`, `credits`, `usage_log`, `transactions`, `stripe_events` tables
    - [ ] Subtask 1.2: Define columns with correct types: `uuid`, `text`, `numeric`, `timestamp`, `int`
    - [ ] Subtask 1.3: Add primary keys, foreign keys (`references`), defaults (`$defaultFn(() => gen_random_uuid())`, `$defaultNow`)
    - [ ] Subtask 1.4: Add `updatedAt` columns that automatically update on row change (using `$onUpdate` hook with `now()`)

- [ ] Task 2: Generate initial migration
  - **Problem:** Create SQL that builds the schema
  - **Test:** Migration runs cleanly on fresh Postgres DB
  - **Subtasks:**
    - [ ] Subtask 2.1: Run `npx drizzle-kit generate:pg` to generate `drizzle/<timestamp>_initial.sql`
    - [ ] Subtask 2.2: Review generated SQL; manually add `CREATE EXTENSION IF NOT EXISTS "pgcrypto";` at top if needed
    - [ ] Subtask 2.3: Add index creation statements (Drizzle may auto-create PK indexes; need additional ones)
    - [ ] Subtask 2.4: Test migration on local dev DB: `psql $DATABASE_URL -f drizzle/<timestamp>_initial.sql`

- [ ] Task 3: Create additional migrations for future changes
  - **Problem:** Schema evolves; need versioned migrations
  - **Test:** New changes generate new migration files that apply cleanly on top of existing DB
  - **Subtasks:**
    - [ ] Subtask 3.1: After initial migration, record baseline version in DB (Drizzle stores a `drizzle_migrations` table automatically)
    - [ ] Subtask 3.2: When modifying schema (e.g., adding `stripe_customer_id`), run `drizzle-kit generate:pg` again to produce new migration
    - [ ] Subtask 3.3: Review and test the new migration on a DB that already has previous migrations applied

- [ ] Task 4: Write DB utility module
  - **Problem:** Provide convenient access to DB connection and queries
  - **Test:** `src/db/index.ts` exports `db` connection and query helpers
  - **Subtasks:**
    - [ ] Subtask 4.1: `src/db/index.ts`: `import { drizzle } from 'drizzle-orm/node-postgres'; import { Pool } from 'pg'; const pool = new Pool({ connectionString: process.env.DATABASE_URL }); export const db = drizzle(pool);`
    - [ ] Subtask 4.2: Export `schema` from `./schema`
    - [ ] Subtask 4.3: Add `pool.on('error', err => console.error('DB error', err))`
    - [ ] Subtask 4.4: Ensure graceful shutdown: `pool.end()` on SIGTERM

- [ ] Task 5: Integration tests with test database
  - **Problem:** Tests need a clean DB
  - **Test:** CI job migrates test DB and runs tests; tests pass
  - **Subtasks:**
    - [ ] Subtask 5.1: Set up separate `TEST_DATABASE_URL` (could be SQLite in-memory for speed, but Postgres is more accurate)
    - [ ] Subtask 5.2: In test setup, run `drizzle-kit migrate` against test DB
    - [ ] Subtask 5.3: Write a few integration tests: create user, insert credits, query back
    - [ ] Subtask 5.4: In test teardown, truncate all tables or drop DB

- [ ] Task 6: Documentation
  - **Problem:** Developers need to set up local DB
  - **Test:** README contains steps to provision Postgres, run migrations, seed dev data
  - **Subtasks:**
    - [ ] Subtask 6.1: Add `DATABASE_URL` env var instructions: `postgresql://user:pass@localhost:5432/occ`
    - [ ] Subtask 6.2: Document `npx drizzle-kit generate:pg` and `npx drizzle-kit migrate`
    - [ ] Subtask 6.3: Provide sample seed script (`src/db/seed.ts`) to create an initial admin user with $5 balance
    - [ ] Subtask 6.4: Note that `pgcrypto` extension must be enabled (include in migration)

- [ ] Task 7: Production deployment
  - **Problem:** Migrations must run on production DB before starting server
  - **Test:** Deploy script runs `drizzle-kit migrate` on production DB; no errors
  - **Subtasks:**
    - [ ] Subtask 7.1: Add "postdeploy" script in hosting (Railway/Render) that runs `npx drizzle-kit migrate`
    - [ ] Subtask 7.2: Ensure `DATABASE_URL` is set in production environment
    - [ ] Subtask 7.3: Verify production DB has all tables and indexes
    - [ ] Subtask 7.4: Add health check endpoint `/health` that does a cheap `SELECT 1` to ensure DB is reachable

- [ ] Task 8: Backup and disaster recovery plan
  - **Problem:** Need to restore data if something goes wrong
  - **Test:** Backup procedure documented and tested
  - **Subtasks:**
    - [ ] Subtask 8.1: Document how to take a PostgreSQL backup: `pg_dump -Fc -f occ.dump`
    - [ ] Subtask 8.2: Document restore procedure: `pg_restore -d occ < occ.dump`
    - [ ] Subtask 8.3: Recommend daily automated backups via hosting provider
    - [ ] Subtask 8.4: Note that usage_log can be large; plan for partitioning or archiving (future)
