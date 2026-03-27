# PRD: Ticket 007 - Backend Auth & JWT Issuance

## 1. Problem Statement

The OCC backend at `https://occ.mba.sh` must handle user sign-up, authentication, and JWT issuance. Users create an account (email/password or OAuth) and receive a signed JWT with 7-day expiry, along with an initial $5.00 credit. After sign-up, the backend redirects to `occ-editor://auth?token=<jwt>&balance=<usd>` to return the user to the editor.

## 2. Proposed Solution

Implement authentication endpoints using Node.js (Fastify) + Drizzle ORM + PostgreSQL:

- `POST /api/v1/auth/signup`: Create user, grant $5 credit, issue JWT, return redirect URL (or directly redirect)
- `POST /api/v1/auth/refresh`: Refresh expiring token (optional, can use longer expiry)
- `GET /api/v1/me`: Validate token, return `{ email, balance }`

The JWT should include user ID and email; sign with HS256 using `JWT_SECRET`. Use bcrypt to hash passwords for email accounts. For OAuth (Google, GitHub), use Passport.js strategies and create/link user records.

After successful sign-up, respond with `302` redirect to `occ-editor://auth?token=<jwt>&balance=5.00`.

## 3. Acceptance Criteria

- Sign-up with email/password creates a new user record with hashed password and `provider='email'`
- On sign-up, a corresponding row in `credits` table is created with `balance_usd=5.00` and `lifetime_usd=5.00`
- JWT is signed, includes `sub=userId`, `email`, and `exp` 7 days in future
- Sign-up responds with `302` redirect to `occ-editor://auth?token=...&balance=5.00`
- `/api/v1/me` with valid JWT returns `{ email, balance }`
- Refresh endpoint (if implemented) issues new JWT with fresh expiry
- Invalid/missing token returns `401 Unauthorized`
- OAuth flows produce same outcome (user + credits) without password

## 4. Technical Considerations

- **Database:** Use Drizzle to create `users` and `credits` tables; foreign key `user_id` references `users.id`
- **JWT library:** `jsonwebtoken`; store secret in `JWT_SECRET` env var (64 random chars)
- **Password hashing:** `bcrypt` with cost factor 10
- **OAuth:** `passport` with strategies; session store not needed if using JWT directly; store `provider` and `provider_id` in `users`
- **Security:**
  - Validate email format and uniqueness
  - Rate limit sign-up per IP (e.g., 5/hour) to prevent abuse
  - Set `Content-Security-Policy` and use HTTPS only
- **Testing:** Use Supertest to hit endpoints; mock DB with in-memory SQLite for unit tests, but integration tests should hit real Postgres
- **Environment:** `BASE_URL` should be `https://occ.mba.sh`; `EDITOR_CALLBACK_SCHEME=occ-editor`
- **Docker:** Provide `Dockerfile` and `docker-compose.yml` for local dev with Postgres

## 5. Dependencies

- None (backend foundation independent)

## 6. Subtask Checklist

- [ ] Task 1: Set up project skeleton
  - **Problem:** Need Fastify + TS + Drizzle project
  - **Test:** `npm init` with proper deps; `src/index.ts` starts server
  - **Subtasks:**
    - [ ] Subtask 1.1: Initialize Node.js project, install `fastify`, `@fastify/cors`, `@fastify/helmet`, `drizzle-orm`, `drizzle-kit`, `pg`, `jsonwebtoken`, `bcrypt`, `passport`, `passport-google-oauth20`, `passport-github2`
    - [ ] Subtask 1.2: Set up TypeScript config (`tsconfig.json`) with `module: "NodeNext"` and `target: "ES2022"`
    - [ ] Subtask 1.3: Create Fastify server with CORS + helmet + JSON body parser
    - [ ] Subtask 1.4: Configure environment variable loading (`zod` + `dotenv`)

- [ ] Task 2: Define database schema and migrations
  - **Problem:** Need `users` and `credits` tables
  - **Test:** `drizzle-kit migrate` creates tables correctly in Postgres
  - **Subtasks:**
    - [ ] Subtask 2.1: Write Drizzle schema in `src/db/schema.ts` with `users` and `credits` tables as per backend.md
    - [ ] Subtask 2.2: Generate migrations: `drizzle-kit generate:pg`
    - [ ] Subtask 2.3: Apply migrations to dev DB; verify with `psql`
    - [ ] Subtask 2.4: Add Drizzle connection in `src/db/index.ts` (connect on startup, disconnect on SIGTERM)

- [ ] Task 3: Implement `POST /api/v1/auth/signup` (email/password)
  - **Problem:** Create user and grant credits
  - **Test:** POST `{ email, password }` returns `302` redirect; DB has user+credit row
  - **Subtasks:**
    - [ ] Subtask 3.1: Validate email format; check email uniqueness via `db.select().from(users).where(eq(users.email, email))`
    - [ ] Subtask 3.2: Hash password with `bcrypt.hash(password, 10)`
    - [ ] Subtask 3.3: Insert user row: `db.insert(users).values({ email, password: hash, provider: 'email' })`
    - [ ] Subtask 3.4: Insert credits row: `db.insert(credits).values({ user_id: newUser.id, balance_usd: 5.0, lifetime_usd: 5.0 })`
    - [ ] Subtask 3.5: Issue JWT: `jwt.sign({ sub: newUser.id, email }, JWT_SECRET, { expiresIn: '7d' })`
    - [ ] Subtask 3.6: Respond with `response.redirect(302, \`occ-editor://auth?token=${token}&balance=5.00\`)`

- [ ] Task 4: Implement `GET /api/v1/me` (protected)
  - **Problem:** Return authenticated user's profile and balance
  - **Test:** GET with valid `Authorization: Bearer <token>` returns `{ email, balance }`; invalid returns 401
  - **Subtasks:**
    - [ ] Subtask 4.1: Create Fastify `preHandler` decorator `authenticate` that verifies JWT via `jwt.verify(token, JWT_SECRET)`, attaches `decoded` to request
    - [ ] Subtask 4.2: In handler, `const user = await db.query.users.findFirst({ where: eq(users.id, decoded.sub) })`
    - [ ] Subtask 4.3: `const credit = await db.query.credits.findFirst({ where: eq(credits.user_id, user.id) })`
    - [ ] Subtask 4.4: Return `{ email: user.email, balance: credit.balance_usd }`

- [ ] Task 5: Implement OAuth routes (Google + GitHub)
  - **Problem:** Users should be able to sign up/login via OAuth
  - **Test:** `/auth/google` initiates OAuth flow; callback creates/link user and redirects to editor with JWT
  - **Subtasks:**
    - [ ] Subtask 5.1: Configure Passport with GoogleStrategy and GitHubStrategy using client IDs/secrets from env
    - [ ] Subtask 5.2: Create routes `/api/v1/auth/google` and `/auth/github` that call `passport.authenticate('google', { scope: ['profile','email'] })` and similar for GitHub
    - [ ] Subtask 5.3: Create callback routes `/api/v1/auth/google/callback` and `/github/callback` that verify profile, find or create user (provider+provider_id), ensure credits exist (create if missing), issue JWT, redirect to `occ-editor://auth?token=...&balance=...`
    - [ ] Subtask 5.4: Use same credit granting logic: if user has no credits row, insert `balance_usd=5.00, lifetime_usd=5.00`

- [ ] Task 6: Add optional refresh endpoint (if desired)
  - **Problem:** Tokens expire after 7 days; could offer refresh
  - **Test:** POST `/api/v1/auth/refresh` with valid token returns new token with fresh expiry
  - **Subtasks:**
    - [ ] Subtask 6.1: Define refresh handler that verifies current token, issues new token with same payload and new `exp`
    - [ ] Subtask 6.2: Respond `{ token: newToken, expires_in: 604800 }`

- [ ] Task 7: Security hardening and testing
  - **Problem:** Ensure endpoints are robust and secure
  - **Test:** Automated tests pass; manual curl tests succeed; penetration basics covered
  - **Subtasks:**
    - [ ] Subtask 7.1: Add rate limiting on signup (e.g., `fastify-rate-limit` 5 req/hour per IP)
    - [ ] Subtask 7.2: Validate all inputs with `zod` or `fastest-validator`
    - [ ] Subtask 7.3: Write integration tests using `supertest` and a separate test database
    - [ ] Subtask 7.4: Ensure HTTPS only in production (set `NODE_ENV=production` rejects HTTP)
    - [ ] Subtask 7.5: Verify JWT secret is at least 64 random chars; rotate script included

- [ ] Task 8: Documentation and deployment readiness
  - **Problem:** Developers and ops need to know how to run and deploy
  - **Test:** README includes env vars, database setup, run instructions; Dockerfile builds and runs
  - **Subtasks:**
    - [ ] Subtask 8.1: Add `README.md` with setup steps, API endpoints, env vars table
    - [ ] Subtask 8.2: Add `Dockerfile` using `node:20-alpine`, copy source, run `npm ci --only=production`, start `node dist/index.js`
    - [ ] Subtask 8.3: Add `docker-compose.yml` for local dev with Postgres service
    - [ ] Subtask 8.4: Configure Fly.io / Railway deployment scripts (if applicable)
