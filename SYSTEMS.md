# External Systems — OCcode Monetisation Infrastructure

## Overview

```
User (OCcode app)
    │
    ├──► inference.mba.sh/v1        LiteLLM Proxy       (LIVE)
    ├──► inference.mba.sh/provision  Provisioning API    (TO BUILD)
    ├──► inference.mba.sh/checkout   Stripe Checkout     (TO BUILD)
    └──► inference.mba.sh/balance    Balance Check       (TO BUILD)
                │
                ├──► OpenRouter (upstream inference)
                ├──► SQLite (device → key mapping)
                └──► Stripe (payment processing)
```

---

## 1. LiteLLM Proxy

**Status**: LIVE at `https://inference.mba.sh/v1`
**Purpose**: Proxies inference requests from the app to OpenRouter. Holds real API key server-side. Tracks spend per virtual key.

### Key capabilities in use
- Virtual keys with per-key `max_budget`
- `x-litellm-response-cost` response header (cost per request)
- Budget enforcement — returns `429 BudgetExceededError` when limit hit
- Admin API for key generation and budget updates

### Admin endpoints needed
| Endpoint | Method | Purpose |
|---|---|---|
| `/key/generate` | POST | Create virtual key with $3 budget |
| `/key/update` | POST | Top up budget after Stripe payment |
| `/spend/logs` | GET | Audit / dashboard |

### Environment variables required
```
LITELLM_MASTER_KEY=sk-moltpilot-prod
OPENROUTER_API_KEY=sk-or-v1-...
```

---

## 2. Provisioning API

**Status**: TO BUILD
**Host**: `inference.mba.sh` (same server, different Express routes)
**Purpose**: Assigns each device a personal LiteLLM virtual key with a $3 budget. Idempotent — same device always gets same key.

### Endpoints

#### `POST /provision`
Called by the app on first AI use.

```json
Request:  { "device_id": "uuid-v4" }
Response: { "key": "sk-abc123...", "budget": 3.00, "spend": 0.00 }
```

**Logic:**
1. Check SQLite for existing `device_id → key` mapping
2. If exists → return existing key
3. If not → call LiteLLM `POST /key/generate` with `max_budget: 3.0`
4. Store `device_id → key` in SQLite
5. Return key to app

**Failure behaviour:**
App falls back to master key silently. Retries on next launch.

#### `GET /balance`
Called by app after Stripe payment to check if budget was topped up.

```json
Request:  ?key=sk-abc123...
Response: { "budget": 8.00, "spend": 3.00, "remaining": 5.00 }
```

### Database (SQLite)
```sql
CREATE TABLE devices (
  device_id   TEXT PRIMARY KEY,
  litellm_key TEXT NOT NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  plan        TEXT DEFAULT 'free'   -- 'free' | 'paid'
);
```

### Security
- Rate limit `/provision` to 1 request per device_id per hour
- Validate `device_id` is a valid UUID
- Never expose master key or OpenRouter key in responses

---

## 3. Stripe Integration

**Status**: TO BUILD
**Purpose**: Accept payment for inference top-ups. Webhook triggers budget increase in LiteLLM.

### Products to create in Stripe Dashboard

| Product | Price | LiteLLM budget added | Margin |
|---|---|---|---|
| Starter Top-Up | $5.00 | +$2.00 | ~60% |
| Standard Top-Up | $10.00 | +$5.00 | ~50% |
| Power Top-Up | $25.00 | +$15.00 | ~40% |

### Checkout flow

```
App shows upgrade modal
    → user clicks "Top Up $5"
    → opens browser:
      https://inference.mba.sh/checkout?device=xxx&plan=5
    → server creates Stripe Checkout Session
    → user completes payment on Stripe-hosted page
    → Stripe fires webhook to POST /stripe/webhook
    → server tops up LiteLLM key budget
    → redirects to success page: "Payment confirmed, return to OCcode"
    → app polls GET /balance every 5s for 60s
    → when remaining budget increases → modal closes, app unlocks
```

### Webhook endpoint: `POST /stripe/webhook`

**Events to handle:**
- `checkout.session.completed` → top up budget

**Logic:**
1. Verify Stripe webhook signature
2. Extract `device_id` from session metadata
3. Lookup `litellm_key` from SQLite
4. Determine budget increase from `amount_total`
5. Call LiteLLM `POST /key/update` with new `max_budget`
6. Log transaction

### Environment variables required
```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID_5=price_...
STRIPE_PRICE_ID_10=price_...
STRIPE_PRICE_ID_25=price_...
```

---

## 4. Checkout / Success Pages

**Status**: TO BUILD
**Host**: `inference.mba.sh`
**Purpose**: Bridge between app and Stripe. Simple server-rendered pages.

### Routes
| Route | Purpose |
|---|---|
| `GET /checkout?device=&plan=` | Creates Stripe Checkout Session, redirects |
| `GET /success?device=` | Post-payment confirmation page |
| `GET /cancel?device=` | User cancelled payment |

### Success page content
```
Payment confirmed.

Your OCcode balance has been topped up.
Return to OCcode and continue where you left off.

[Close this tab]
```

---

## 5. App-Side Changes (OCcode / extension.ts)

Not an external system but recorded here for completeness.

### globalState keys
```typescript
{
  deviceId: string           // uuid, generated once on first install
  personalKey: string | null // returned by /provision
  localSpend: number         // accumulated from x-litellm-response-cost headers
  provisionAttempted: boolean
}
```

### Behaviour
| State | Action |
|---|---|
| No personalKey, first launch | Call /provision (3s timeout), store key |
| /provision fails | Use master key, set provisionAttempted=true, retry next launch |
| personalKey exists | Use personalKey for all ocFreeModel requests |
| localSpend >= 3.00 | Show upgrade modal |
| 429 from LiteLLM | Show upgrade modal |
| After payment | Poll /balance every 5s, unlock when remaining > 0 |

---

## Build Order

```
Phase 1 — Backend foundation
  [ ] Set up Express server routes on inference.mba.sh
  [ ] SQLite schema + device→key persistence
  [ ] POST /provision → LiteLLM key generation
  [ ] GET /balance

Phase 2 — App integration
  [ ] Generate + store deviceId in globalState
  [ ] Call /provision on first AI use
  [ ] Read x-litellm-response-cost, accumulate localSpend
  [ ] Trigger upgrade modal at $3 localSpend or on 429

Phase 3 — Stripe
  [ ] Create products in Stripe dashboard
  [ ] GET /checkout route (create session)
  [ ] POST /stripe/webhook (verify + top up)
  [ ] Success / cancel pages
  [ ] App: poll /balance after payment, unlock on success

Phase 4 — Hardening
  [ ] Rate limiting on /provision
  [ ] Logging + error alerting
  [ ] Admin dashboard (spend per device, total revenue)
  [ ] Retry logic for failed webhook deliveries
```

---

## Open Questions

- [ ] Do we show remaining balance anywhere in the UI?
- [ ] Do free users get a warning at $2.50 before hitting the wall?
- [ ] Do paid users get a receipt email? (Stripe handles this automatically if enabled)
- [ ] What happens when a paid user runs out again — same flow?
- [ ] Do we want annual plans eventually?
