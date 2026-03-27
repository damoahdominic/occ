# PRD: Ticket 009 - Inference Proxy

## 1. Problem Statement

The OCC editor must be able to send chat completions requests to an inference endpoint while properly authenticating the user and deducting credits. The backend will provide an OpenAI-compatible streaming endpoint `POST /v1/chat/completions` that accepts a JWT in the `Authorization` header, checks the user's balance > 0, forwards the request to the upstream inference service (`https://inference.mba.sh/v1`), streams the response back to the client, and deducts the cost from the user's balance after completion (or incrementally if using streaming cost tracking).

## 2. Proposed Solution

Implement a proxy endpoint in the Fastify backend:

```
POST /v1/chat/completions
Headers: Authorization: Bearer <jwt>
Body: OpenAI chat completion payload (stream: true/false)
Response: Streamed or non-streamed OpenAI-compatible response
```

Flow:

1. Authenticate JWT via `authenticate` decorator
2. Fetch user's current balance from `credits` table
3. If `balance_usd <= 0`, immediately return `402 Payment Required` (or `429` with `error: "Insufficient credits"`)
4. Forward the request to upstream `INFERENCE_ENDPOINT` (e.g., `https://inference.mba.sh/v1/chat/completions`) using `fetch` with streaming
5. Pipe the upstream response back to the client **as it arrives** (stream passthrough)
6. Once the upstream response completes, calculate cost:
   - If using non-stream, read `x-litellm-response-cost` header from upstream response
   - If using stream, accumulate cost from stream headers as they arrive (requires parsing SSE stream for cost metadata if provided by upstream; alternatively estimate based on tokens in/out)
7. Deduct cost from user's balance: `UPDATE credits SET balance_usd = balance_usd - cost WHERE user_id = ?`
8. Log usage to `usage_log` table: `user_id, tokens_in, tokens_out, cost_usd, model, created_at`
9. If balance update fails, log error but do not roll back the stream (user may have already consumed response)

## 3. Acceptance Criteria

- Authenticated request with sufficient balance streams chat completion successfully
- If balance is $0 or negative, endpoint returns `402` with JSON `{ "error": "Insufficient credits" }` promptly (no upstream call)
- Upstream response headers (including `x-litellm-response-cost`) are preserved and visible to client
- Cost is deducted accurately and persisted to `credits.balance_usd`
- A usage record is inserted into `usage_log` with correct values
- The endpoint correctly handles both streaming (`stream: true`) and non-streaming requests
- Network errors from upstream result in appropriate `502` or `503` responses, no deduction
- The endpoint is performant: latency overhead < 200ms before first byte

## 4. Technical Considerations

- **Streaming passthrough:** Use `undici` or `node-fetch` with `response.body` pipe to `reply.stream()` in Fastify. Do not buffer entire response.
- **Cost extraction:** The upstream `inference.mba.sh` sets header `x-litellm-response-cost` on the final response. For streaming, it may send it in the last SSE `data:` event or as a trailing header. Implement both: capture final headers from upstream response and parse cost from there. If cost cannot be determined, log warning and skip deduction (or use a per-request estimated cost as fallback).
- **Race condition:** The stream may be long-running; the balance deduction should happen after the stream ends (client receives all data). Use `response.on('close')` or `finished` event to trigger deduction. Ensure idempotency: if deduction runs twice for same request, it should not double-charge. Could use a unique `request_id` logged in `usage_log` and check before deducting again.
- **Database update in streaming context:** Must not block the stream. Perform deduction in a `finally` block after upstream stream ends, using a new DB connection (pool). If DB fails, log but do not retry to avoid blocking.
- **Security:** Ensure JWT authentication is applied before checking balance (do not leak existence of user via timing differences). Balance check should be constant-time relative to valid/invalid token (difficult in DB, but avoid early returns that differ).
- **Rate limiting:** Consider per-user rate limiting to prevent abuse (e.g., max 100 requests/min). Could be added later.
- **Logging:** Log each request with `userId`, `model`, `tokens` (if available), `cost`, `durationMs`, `status`.
- **Testing:** Use `nock` to mock upstream responses, including streaming; test 402 response, 502 fallback, deduction accuracy.

## 5. Dependencies

- **ticket-007-backend-auth-jwt:** `authenticate` decorator
- **ticket-008-balance-api:** Balance fetching logic (can reuse)
- Upstream inference service (`https://inference.mba.sh/v1`) must be running and OpenAI-compatible

## 6. Subtask Checklist

- [ ] Task 1: Set up route handler skeleton
  - **Problem:** Create `/v1/chat/completions` endpoint
  - **Test:** `curl -H "Authorization: Bearer <jwt>" -H "Content-Type: application/json" -d '{"model":"gpt-4","messages":[{"role":"user","content":"Hello"}],"stream":false}' http://localhost:3001/v1/chat/completions` returns 200 with response body
  - **Subtasks:**
    - [ ] Subtask 1.1: Register route in Fastify: `fastify.post('/v1/chat/completions', { onRequest: [authenticate] }, handler)`
    - [ ] Subtask 1.2: Declare reply content type: `application/json` or `text/event-stream` based on `stream` param
    - [ ] Subtask 1.3: Set CORS headers for editor origin

- [ ] Task 2: Balance check and 402 response
  - **Problem:** Enforce credit requirement before upstream call
  - **Test:** User with balance 0 receives `402` immediately; no upstream call made
  - **Subtasks:**
    - [ ] Subtask 2.1: After auth, fetch user balance: `select balance_usd from credits where user_id = ?`
    - [ ] Subtask 2.2: If `balance_usd <= 0`, return `response.code(402).send({ error: 'Insufficient credits' })`
    - [ ] Subtask 2.3: Log balance check result (debug level)

- [ ] Task 3: Proxy non-streaming requests
  - **Problem:** Forward request body and return response body
  - **Test:** Non-stream request yields same response as upstream; `x-litellm-response-cost` present in response
  - **Subtasks:**
    - [ ] Subtask 3.1: Use `fetch(INFERENCE_ENDPOINT, { method: 'POST', headers: { ...incomingHeaders except host, 'Authorization': `Bearer ${INFERENCE_API_KEY}` }, body: JSON.stringify(payload) })`
    - [ ] Subtask 3.2: Wait for upstream response; get `upstreamRes.headers.get('x-litellm-response-cost')`
    - [ ] Subtask 3.3: Return upstream JSON body to client with same headers
    - [ ] Subtask 3.4: Trigger deduction with parsed cost

- [ ] Task 4: Proxy streaming requests
  - **Problem:** Pipe SSE stream from upstream to client without buffering
  - **Test:** Stream arrives line-by-line in client with minimal latency; cost captured from trailing headers
  - **Subtasks:**
    - [ ] Subtask 4.1: If payload has `stream: true`, set `reply.header('Content-Type', 'text/event-stream')`
    - [ ] Subtask 4.2: Create `upstreamRes.body.pipe(reply.raw)` to forward bytes directly
    - [ ] Subtask 4.3: Listen for `upstreamRes.on('close')` or `finished` event to trigger cost extraction and deduction
    - [ ] Subtask 4.4: Capture trailing headers; extract `x-litellm-response-cost` (may be in last chunk)
    - [ ] Subtask 4.5: If cost not found after 60s of stream end, log warning and skip deduction

- [ ] Task 5: Deduct balance and log usage
  - **Problem:** Update credits and record usage reliably
  - **Test:** After successful proxy, `credits.balance_usd` decreases by exact cost; `usage_log` has new row
  - **Subtasks:**
    - [ ] Subtask 5.1: `db.update(credits).set({ balance_usd: sql\`balance_usd - ${cost}\` }).where(eq(credits.user_id, userId))`
    - [ ] Subtask 5.2: `db.insert(usage_log).values({ user_id: userId, tokens_in: inputTokens, tokens_out: outputTokens, cost_usd: cost, model: payload.model, created_at: new Date() })`
    - [ ] Subtask 5.3: Wrap in `try/catch`; on error, log stack trace but do not roll back stream
    - [ ] Subtask 5.4: Emit metric event for monitoring

- [ ] Task 6: Error handling and resilience
  - **Problem:** Upstream failures should not break editor experience
  - **Test:** If upstream returns 500, proxy returns same 502/503; no deduction; user sees error
  - **Subtasks:**
    - [ ] Subtask 6.1: On fetch error (network), return `502 Bad Gateway` with `{ "error": "Upstream unavailable" }`
    - [ ] Subtask 6.2: On upstream 4xx/5xx, forward status and body as error response
    - [ ] Subtask 6.3: Ensure no deduction occurs unless upstream returned successful completion (status 200)
    - [ ] Subtask 6.4: Timeout handling: set `AbortController` with 5min timeout; on timeout, abort upstream and return `504 Gateway Timeout`

- [ ] Task 7: Rate limiting (optional but recommended)
  - **Problem:** Prevent single user from flooding upstream
  - **Test:** User exceeding 100 req/min receives `429 Too Many Requests`
  - **Subtasks:**
    - [ ] Subtask 7.1: Install `fastify-rate-limit`
    - [ ] Subtask 7.2: Apply to route with per-user key: `limit.max = 100`, `timeWindow: '1 minute'`, `keyGenerator: (req) => req.userId`
    - [ ] Subtask 7.3: On limit exceed, return `429` with `{ "error": "Rate limit exceeded" }`

- [ ] Task 8: Testing and performance validation
  - **Problem:** Ensure endpoint works and is fast
  - **Test:** Automated tests pass; manual `time` command shows <200ms overhead before first byte
  - **Subtasks:**
    - [ ] Subtask 8.1: Add unit tests with mocked upstream for both stream and non-stream
    - [ ] Subtask 8.2: Add integration test against real upstream (or recorded VCR) to measure latency
    - [ ] Subtask 8.3: Load test with `autocannon` to verify 100 RPS sustained without degradation
