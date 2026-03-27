# PRD: Ticket 018 - Backend Monitoring & Logging

## 1. Problem Statement

Once the OCC backend is deployed, we need visibility into its health, performance, and usage patterns. Without proper monitoring and logging, issues like downtime, slow inference, or abnormal usage will go undetected until users complain. We need to instrument the backend to emit structured logs, expose metrics endpoints, and optionally integrate with an external observability platform (e.g., Grafana Loki, Datadog, or even simple file-based logging with rotation). The solution should be lightweight and suitable for small-scale deployment (e.g., a single Railway/Render service), yet scalable.

## 2. Proposed Solution

Implement structured JSON logging and Prometheus-style metrics exposition:

- **Logging:** Use `pino` or `winston` for JSON logs. Every request should be logged with:
  - `timestamp`, `level`, `message`
  - `method`, `path`, `statusCode`, `responseTimeMs`
  - `userId` (if authenticated)
  - `error` details (if error)
- Logs should be written to stdout (so hosting platform captures them) and optionally to rotating files if needed.
- **Metrics:** Expose `/metrics` endpoint (text format for Prometheus) with counters and histograms:
  - `http_requests_total{method, path, status}`
  - `http_request_duration_seconds{path}` bucket histogram
  - `balance_fetches_total`, `inference_requests_total`, `inference_cost_usd_total`, `stripe_webhooks_total`
  - `user_balance{user_id}` (maybe not for prom, but internal)
- **Health check:** Existing `/health` endpoint should return `{ status: 'ok', db: 'connected', timestamp }` or degrade gracefully
- **Dashboard (optional):** Set up Grafana Cloud or Datadog to ingest logs and metrics; create basic dashboards for request rate, error rate, latency, balance distribution, top users
- **Alerting:** Configure alerts for error rate > 5% or response time > 1s or downtime (service down). Notify via Telegram/Discord to OCCThings.

## 3. Acceptance Criteria

- All requests produce a structured log line in JSON to stdout
- `/metrics` endpoint returns Prometheus text exposition format; includes request count and duration metrics
- `/health` endpoint returns 200 with `{ "status": "ok" }` when DB is reachable; returns 503 otherwise
- Logs include request ID correlation (generate `requestId` per incoming request, pass through all logs)
- Metrics can be scraped by Prometheus (if deployed) or at least viewable via `curl http://localhost:3001/metrics`
- Alerts fire on defined conditions (error rate spike, downtime)
- Log retention is at least 7 days (depending on hosting provider)
- No sensitive data (JWT, passwords, API keys) appear in logs

## 4. Technical Considerations

- **Logging library:** `pino` is fast, produces JSON, works well with Node. Use `pino-http` for request logging middleware. Or `winston` with `winston-daily-rotate-file` if file logs needed.
- **Request ID:** Generate `uuidv4()` at request start via Fastify `onRequest` hook, store in `req.id`, and use `req.log` with child logger `req.log.child({ requestId: req.id })`. Include in all subsequent logs.
- **Sensitive data redaction:** Ensure `Authorization` headers are masked; never log full JWT. Use `pino` serializers to omit sensitive fields.
- **Metrics library:** Use `prom-client` to register metrics. Collect histogram for latency, counter for requests, gauge for active connections maybe.
- **Performance:** Structured logging and metrics add overhead; ensure they are non-blocking. `pino` is async; `prom-client` aggregates in memory. Keep heavy operations out of hot path.
- **Deployment:** Most hosts (Railway, Render) capture stdout logs automatically and provide log viewer. May need to configure log rotation if writing to files (not recommended). For metrics, either run Prometheus separately or just use logs-based monitoring (Gravatar) if metrics endpoint is too complex; but having `/metrics` is still useful.
- **Cost:** If using SaaS monitoring (Datadog, Grafana Cloud), may have costs; consider self-hosted Grafana + Prometheus on cheap VPS if budget constrained. However, for early stage, simple logs + health checks may suffice; implement metrics later.

## 5. Dependencies

- Backend must have basic structure (ticket-007) to integrate logging/monitoring

## 6. Subtask Checklist

- [ ] Task 1: Install and configure structured logger
  - **Problem:** Replace `console.log` with proper JSON logging
  - **Test:** `curl http://localhost:3001/health` produces a JSON log line on stdout with `level: 'info'`
  - **Subtasks:**
    - [ ] Subtask 1.1: `npm install pino pino-http pino-pretty` (pretty for dev)
    - [ ] Subtask 1.2: Create `src/logger.ts`: `import pino from 'pino'; const logger = pino({ level: process.env.LOG_LEVEL || 'info', transport: process.env.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty' } }); export default logger;`
    - [ ] Subtask 1.3: In Fastify, use `fastify.use(require('pino-http')({ logger, genReqId: req => uuidv4() }))` or Fastify's built-in `requestId` and `logging` options
    - [ ] Subtask 1.4: Ensure all subsequent `fastify.log.info()` calls attach request context automatically (via `pino-http`)

- [ ] Task 2: Add request ID and context propagation
  - **Problem:** Correlate logs across a single request
  - **Test:** All log lines for a request contain same `requestId` field
  - **Subtasks:**
    - [ ] Subtask 2.1: In Fastify, enable `requestId: true` (or custom generator)
    - [ ] Subtask 2.2: Verify `fastify.log` includes `requestId` in each log call
    - [ ] Subtask 2.3: For async operations that span outside request (e.g., background deduction after streaming), pass `requestId` manually and create child logger `logger.child({ requestId })`

- [ ] Task 3: Instrument request logging middleware
  - **Problem:** Automatically log each HTTP request with method, path, status, response time
  - **Test:** For every request, a log line like `{"method":"GET","path":"/api/v1/balance","statusCode":200,"responseTime":12}` appears
  - **Subtasks:**
    - [ ] Subtask 3.1: Use `fastify-pino-http` or `pino-http` as middleware; configure to log response time and status
    - [ ] Subtask 3.2: Ensure error responses (4xx/5xx) log at `error` level
    - [ ] Subtask 3.3: Sensitive headers: configure `pino-http` to redact `authorization`, `cookie` by using serializers: `headers: { filter: (hdrs) => hdrs.authorization ? '[REDACTED]' : hdrs.authorization }`

- [ ] Task 4: Add detailed logs in key business logic
  - **Problem:** Need context for auth, balance changes, webhook processing
  - **Test:** When deduction occurs, a log line `deducted X USD from user Y, new balance Z` appears at info level
  - **Subtasks:**
    - [ ] Subtask 4.1: In balance deduction (ticket-009), after DB update: `logger.info({ userId, cost, newBalance }, 'Balance deducted')`
    - [ ] Subtask 4.2: In Stripe webhook (ticket-010): `logger.info({ eventId, userId, creditAdded }, 'Stripe webhook processed')`
    - [ ] Subtask 4.3: In auth sign-up: `logger.info({ email }, 'New user signup')`
    - [ ] Subtask 4.4: On errors: `logger.error({ err, userId }, 'Operation failed')`

- [ ] Task 5: Implement health check endpoint
  - **Problem:** Load balancers and monitoring need a simple OK/fail signal
  - **Test:** `curl http://localhost:3001/health` returns `{ "status": "ok", "db": "connected", "timestamp": "..." }` with 200; if DB down, returns 503
  - **Subtasks:**
    - [ ] Subtask 5.1: Add `fastify.get('/health', async (req, reply) => { try { await db.$query`SELECT 1`; return { status: 'ok', db: 'connected', timestamp: new Date().toISOString() }; } catch (e) { reply.code(503); return { status: 'error', db: 'disconnected', error: e.message }; } })`
    - [ ] Subtask 5.2: Ensure endpoint does not require authentication
    - [ ] Subtask 5.3: Return proper `Content-Type: application/json`
    - [ ] Subtask 5.4: Consider caching headers: `Cache-Control: no-cache`

- [ ] Task 6: Expose Prometheus metrics endpoint
  - **Problem:** Metrics needed for monitoring
  - **Test:** `curl http://localhost:3001/metrics` returns text lines like `# TYPE http_requests_total counter\nhttp_requests_total{method="GET",path="/health",status="200"} 42\n...`
  - **Subtasks:**
    - [ ] Subtask 6.1: Install `prom-client`
    - [ ] Subtask 6.2: Create `src/metrics.ts`: register counters, histograms
      - `new client.Counter({ name: 'http_requests_total', help: 'Total HTTP requests', labelNames: ['method','path','status'] })`
      - `new client.Histogram({ name: 'http_request_duration_seconds', help: 'Duration of HTTP requests in seconds', labelNames: ['path'], buckets: [0.05,0.1,0.25,0.5,1,2.5,5] })`
      - `new client.Counter({ name: 'inference_requests_total', help: 'Total inference requests', labelNames: ['model'] })`
      - `new client.Counter({ name: 'stripe_webhooks_total', help: 'Total Stripe webhooks processed', labelNames: ['type'] })`
    - [ ] Subtask 6.3: In Fastify, `register(require('fastify-metrics')({ routeMetrics: { enabled: true }, endpoint: '/metrics' }))` or custom handler: `fastify.get('/metrics', async (req, reply) => { reply.type('text/plain'); return client.register.metrics(); })`
    - [ ] Subtask 6.4: Instrument route handlers: increment `http_requests_total` counter automatically via Fastify plugin; time duration via histogram automatically if using `fastify-metrics`; verify with `curl`
    - [ ] Subtask 6.5: Manually increment `inference_requests_total` in proxy handler (ticket-009)
    - [ ] Subtask 6.6: Manually increment `stripe_webhooks_total` in webhook handler (ticket-010)

- [ ] Task 7: Configurable log level and output
  - **Problem:** Developers need verbose logs; production needs JSON only
  - **Test:** `LOG_LEVEL=debug npm start` includes debug logs; production uses `info`
  - **Subtasks:**
    - [ ] Subtask 7.1: Read `LOG_LEVEL` env var; default `info`; allow `debug`, `warn`, `error`
    - [ ] Subtask 7.2: In production, set `transport: undefined` so logs go to stdout as JSON only (no pretty)
    - [ ] Subtask 7.3: Optionally add log rotation via external tool (not in code)

- [ ] Task 8: Error tracking (optional but recommended)
  - **Problem:** Crash reporting and unhandled rejections need visibility
  - **Test:** Unhandled exception sends JSON log with `level: 'fatal'` and stack; optionally triggers alert
  - **Subtasks:**
    - [ ] Subtask 8.1: Add `process.on('unhandledRejection', (reason) => { logger.fatal({ reason }, 'Unhandled rejection'); process.exit(1); })`
    - [ ] Subtask 8.2: Add `process.on('uncaughtException', (err) => { logger.fatal({ err }, 'Uncaught exception'); process.exit(1); })`
    - [ ] Subtask 8.3: Consider sending these to Telegram/Discord alert via webhook (`fetch` to chat API)

- [ ] Task 9: Deploy and verify monitoring in staging
  - **Problem:** Ensure it works in real environment
  - **Test:** Staging deployment (`https://occ-staging.mba.sh`) has working `/health` and `/metrics`; logs appear in hosting logs viewer
  - **Subtasks:**
    - [ ] Subtask 9.1: Deploy to Railway/Render with env vars
    - [ ] Subtask 9.2: `curl https://occ-staging.mba.sh/health` → ok
    - [ ] Subtask 9.3: `curl https://occ-staging.mba.sh/metrics` → prom text
    - [ ] Subtask 9.4: Check hosting logs (e.g., Render logs) show JSON lines
    - [ ] Subtask 9.5: Trigger an error (e.g., malformed request) and verify it logs at error level

- [ ] Task 10: Alerting setup
  - **Problem:** We need to know when things break
  - **Test:** Simulate failure (stop backend) → alert arrives in OCCThings Telegram within 5 minutes
  - **Subtasks:**
    - [ ] Subtask 10.1: Choose alerting mechanism: UptimeRobot, healthchecks.io, or custom scheduler that pings `/health` and sends Telegram message on failure
    - [ ] Subtask 10.2: Set up simple poller (could be OpenClaw itself) that runs every 5 minutes: `curl -fsS https://occ.mba.sh/health || send_telegram("Backend down!")`
    - [ ] Subtask 10.3: Also monitor error rate: periodically fetch `/metrics` and parse `http_requests_total` vs 5xx counts; alert if >5%
    - [ ] Subtask 10.4: Document alerts and incident response

- [ ] Task 11: Documentation
  - **Problem:** Operations team needs to understand logs and metrics
  - **Test:** `docs/observability.md` explains log format, metrics names, how to debug
  - **Subtasks:**
    - [ ] Subtask 11.1: Create `docs/observability.md` with section "Logging": JSON fields, how to filter
    - [ ] Subtask 11.2: Section "Metrics": list all metric names and labels, what they mean
    - [ ] Subtask 11.3: Section "Health Check": endpoint and expected responses
    - [ ] Subtask 11.4: Section "Alerting": what alerts exist, how to acknowledge, who to contact

- [ ] Task 12: Performance baseline and tuning
  - **Problem:** Too much logging can degrade throughput
  - **Test:** With 100 RPS, CPU overhead of logging <5%
  - **Subtasks:**
    - [ ] Subtask 12.1: Benchmark: run `autocannon -c 100 -d 30 http://localhost:3001/health` while capturing logs; check CPU/latency
    - [ ] Subtask 12.2: If needed, reduce log level in production (avoid `debug`); sample high-volume routes if necessary
    - [ ] Subtask 12.3: Tune Prometheus histogram buckets based on actual latency distribution
