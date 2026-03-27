# PRD: Ticket 019 - Stripe Webhook Retry Logic

## 1. Problem Statement
Stripe webhook (`POST /api/v1/stripe/webhook`) must be resilient to failures and ensure idempotent credit adjustments. If the backend crashes or returns an error after Stripe sends a webhook, Stripe will retry for up to 3 days. We need to ensure that retries do not over-credit users and that all events are eventually processed exactly once. Additionally, we need alerting on repeated webhook failures and a manual replay tool for emergency recovery.

## 2. Proposed Solution
- **Idempotency:** Store processed Stripe event IDs in `stripe_events` table with unique constraint. Check before processing; if already exists, return 200 immediately.
- **Atomicity:** Process webhook inside a single database transaction: update `credits` balance and insert `stripe_events` record together. If either fails, rollback and return 5xx to trigger retry.
- **Error handling:** Catch all errors (signature, JSON, DB) and return appropriate non-2xx status to cause retry (except 400 for signature which Stripe won't retry).
- **Alerting:** After 3 consecutive failures, send alert to OCCThings Telegram. Include cooldown (1h) to avoid spam.
- **Metrics:** Increment `stripe_webhook_events_total{type,outcome}`.
- **Manual replay:** Provide `scripts/replay-stripe-event.js <event_id>` to force-reprocess an event from Stripe API.

## 3. Acceptance Criteria
- Same event processed twice results in single credit adjustment (idempotent)
- If DB error occurs, webhook returns 503 (or 500) and Stripe retries
- After 3 consecutive failures, Telegram alert is sent
- Prometheus metrics expose success/error counts
- A script exists to manually replay an event safely

## 4. Dependencies
- ticket-010-stripe-top-up (existing webhook)
- ticket-011-database-schema (stripe_events table)
- ticket-018-backend-monitoring-logging (metrics/logging)

## 5. Subtasks
- [ ] Implement atomic transaction with `stripe_events` insert (ON CONFLICT handling)
- [ ] Add retry-appropriate error responses and validation
- [ ] Add consecutive failure counter and Telegram alert
- [ ] Add Prometheus metrics
- [ ] Write manual replay script
- [ ] Tests: idempotency, DB failure, signature failure
- [ ] Deploy, verify Stripe webhook health, set up alerting
- [ ] Documentation in `docs/webhooks.md`
