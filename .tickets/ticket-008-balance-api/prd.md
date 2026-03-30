# PRD: Ticket 008 - Balance API

## 1. Problem Statement

The editor needs to fetch the current OCC Credits balance for the authenticated user to display in the status bar and settings panel. This requires a lightweight, secure endpoint that returns the user's remaining credit amount. The backend must provide `GET /api/v1/balance` that accepts an authenticated JWT and responds with `{ balance_usd: number, cap_usd: number }`. The editor will call this endpoint on startup and every ~60 seconds to keep the UI updated.

## 2. Proposed Solution

Add a new route in the Fastify backend:

```
GET /api/v1/balance
Headers: Authorization: Bearer <jwt>
Response: { balance_usd: number, cap_usd: number }
```

Implementation:

- Use the existing `authenticate` decorator to verify JWT (from ticket-007)
- Query the `credits` table for the user's current `balance_usd`
- Return JSON with `balance_usd` and `cap_usd` (read from env `CREDITS_CAP` or constant `5.00`)
- If user not found or no credits row, return 404 or 500 (shouldn't happen if signup creates it)

Error handling:
- 401 if invalid/missing token
- 404 if user has no credits row (should create on demand, but safer to 500 alert)
- 503 if database down

The endpoint should be fast (<50ms) and cacheable (but we want real-time so no caching).

## 3. Acceptance Criteria

- Authenticated request returns `{ "balance_usd": 4.25, "cap_usd": 5.00 }` with HTTP 200
- If balance is exactly 0, still returns 200 with `0.00`
- If token is missing or invalid, returns 401 with `{ "error": "Unauthorized" }`
- If user has no credit row, returns 500 with error log (should not happen)
- Response time < 50ms for typical query
- CORS allows requests from `vscode://` and `localhost` (or editor's origin)

## 4. Technical Considerations

- **Integration with session state:** The editor's `fetchBalance()` stub will call this endpoint when backend is live; during stub phase, returns `globalState` value
- **Security:** Only accessible with valid JWT; no additional rate limiting beyond auth
- **Monitoring:** Log each call with user ID and response time (info level)
- **Error messages:** Keep generic for security; don't reveal if user exists or not
- **Cap:** The cap (`5.00`) may be configurable per deployment; read from env `CREDITS_CAP` (default `5.00`) to allow changes without code deploy

## 5. Dependencies

- **ticket-007-backend-auth-jwt:** Must have `authenticate` decorator and credits table

## 6. Subtask Checklist

- [ ] Task 1: Implement `GET /api/v1/balance` handler
  - **Problem:** Create endpoint that returns balance
  - **Test:** `curl -H "Authorization: Bearer <valid>" http://localhost:3001/api/v1/balance` returns JSON with balance
  - **Subtasks:**
    - [ ] Subtask 1.1: Define route in `src/routes/balance.ts` (or inline)
    - [ ] Subtask 1.2: Use `authenticate` preHandler
    - [ ] Subtask 1.3: Query: `db.select({ balance: credits.balance_usd }).from(credits).where(eq(credits.user_id, request.userId))`
    - [ ] Subtask 1.4: If not found, return 500; else return `{ balance_usd, cap_usd: parseFloat(process.env.CREDITS_CAP || '5.00') }`

- [ ] Task 2: Add CORS allowance for editor origin
  - **Problem:** VS Code extension may be considered `vscode://` origin; need to allow it
  - **Test:** Preflight `OPTIONS /api/v1/balance` returns `Access-Control-Allow-Origin: *` (or specific)
  - **Subtasks:**
    - [ ] Subtask 2.1: Configure `@fastify/cors` to allow `vscode://`, `null`, and `localhost` (editor webview origin can be `null` or `vscode://` depending on platform)
    - [ ] Subtask 2.2: Allow headers `Authorization, Content-Type`

- [ ] Task 3: Write unit/integration tests
  - **Problem:** Ensure correctness and prevent regressions
  - **Test:** Automated tests cover happy path, 401, 404, 500
  - **Subtasks:**
    - [ ] Subtask 3.1: Set up test DB (SQLite in-memory for speed, or separate Postgres schema)
    - [ ] Subtask 3.2: Seed test user with credits `5.00`
    - [ ] Subtask 3.3: Test with valid JWT → 200 with correct balance
    - [ ] Subtask 3.4: Test with invalid token → 401
    - [ ] Subtask 3.5: Test with no credits row → 500 (or create-on-demand if design changes)

- [ ] Task 4: Add monitoring/logging
  - **Problem:** Need to track usage and spot issues
  - **Test:** Server logs each balance fetch with userId and duration
  - **Subtasks:**
    - [ ] Subtask 4.1: Add `fastify.log.info({ userId, durationMs })` in handler
    - [ ] Subtask 4.2: Configure log aggregation (stdout fine; later will add Loki/Datadog)

- [ ] Task 5: Documentation
  - **Problem:** Editor team needs to know how to call it
  - **Test:** API documented in README or OpenAPI spec
  - **Subtasks:**
    - [ ] Subtask 5.1: Add endpoint description to `README.md` with example request/response
    - [ ] Subtask 5.2: Include sample curl command
    - [ ] Subtask 5.3: Mention that editor should poll every ~60s

- [ ] Task 6: Deploy to staging
  - **Problem:** Verify in near-production environment
  - **Test:** Staging instance (`https://occ-staging.mba.sh`) returns balance for test user
  - **Subtasks:**
    - [ ] Subtask 6.1: Push to staging branch; deploy to Railway/Render
    - [ ] Subtask 6.2: Run smoke tests with test user
    - [ ] Subtask 6.3: Verify editor stub can hit endpoint and receives expected JSON

- [ ] Task 7: Enable in editor stub (real API toggle)
  - **Problem:** Editor currently uses stub balance; need to call real endpoint when ready
  - **Test:** When `globalState.useBackendBalance = true`, `fetchBalance()` makes real HTTP request to `/api/v1/balance`
  - **Subtasks:**
    - [ ] Subtask 7.1: Add feature flag in global settings "OCC: Use Backend Balance" (default false)
    - [ ] Subtask 7.2: In `fetchBalance()`, check flag; if true, `fetch('https://occ.mba.sh/api/v1/balance', { headers: { Authorization: `Bearer ${token}` } })`
    - [ ] Subtask 7.3: Parse response; handle 401 by showing "Session expired" and prompting re-auth
    - [ ] Subtask 7.4: On success, update `globalState` cached balance for fallback
