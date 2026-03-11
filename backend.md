# OCC Backend — Build Spec for occ.mba.sh

## Overview

You are building the backend API and inference proxy for OCC (OpenClaw Code), an open-source AI
code editor. The backend lives at `https://occ.mba.sh` and is responsible for:

1. User accounts and authentication (JWT)
2. Credit balance management ($5 free on sign-up, buy more via Stripe)
3. Proxying AI inference requests (validating auth, deducting credits, forwarding to upstream)

The editor (OCC) is a VS Code fork. It communicates with this backend over standard HTTP/JSON and
a streaming OpenAI-compatible inference endpoint. You do not need to touch the editor source —
just build the API it expects.

---

## Tech Stack (recommended)

| Layer | Choice | Notes |
|-------|--------|-------|
| Runtime | Node.js 20 (TypeScript) | Match editor Node version |
| Framework | Fastify | Fast, low overhead, good streaming support |
| Database | PostgreSQL 16 | Managed via Supabase or Railway |
| ORM | Drizzle ORM | Lightweight, type-safe |
| Auth | JWT (jsonwebtoken) + bcrypt | No third-party auth service needed |
| OAuth | Passport.js (Google, GitHub strategies) | Optional but recommended |
| Payments | Stripe | Checkout Sessions + webhooks |
| Proxy | http-proxy-middleware or manual fetch stream | Must support SSE streaming |
| Deployment | Railway / Render / Fly.io | Dockerfile provided below |
| Secrets | Environment variables | Never committed |

---

## Environment Variables

```env
# Server
PORT=3001
NODE_ENV=production
BASE_URL=https://occ.mba.sh

# Database
DATABASE_URL=postgresql://user:pass@host:5432/occ

# JWT
JWT_SECRET=<random 64-char secret>
JWT_EXPIRES_IN=7d

# Upstream inference
INFERENCE_ENDPOINT=https://inference.mba.sh/v1
INFERENCE_API_KEY=<your inference key — never exposed to clients>

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID_10=price_...   # $10 top-up product
STRIPE_PRICE_ID_25=price_...   # $25 top-up product
STRIPE_PRICE_ID_50=price_...   # $50 top-up product

# OAuth (optional)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# Editor callback scheme
EDITOR_CALLBACK_SCHEME=occ-editor
```

---

## Database Schema

Run these migrations in order.

```sql
-- 001_users.sql
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT UNIQUE NOT NULL,
  password    TEXT,                        -- null for OAuth-only users
  provider    TEXT DEFAULT 'email',        -- 'email' | 'google' | 'github'
  provider_id TEXT,                        -- OAuth provider user ID
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- 002_credits.sql
CREATE TABLE credits (
  user_id      UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance_usd  NUMERIC(10,6) NOT NULL DEFAULT 5.000000,
  lifetime_usd NUMERIC(10,6) NOT NULL DEFAULT 5.000000,  -- total ever granted
  updated_at   TIMESTAMPTZ DEFAULT now()
);

-- 003_usage_log.sql
CREATE TABLE usage_log (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id),
  tokens_in   INT NOT NULL DEFAULT 0,
  tokens_out  INT NOT NULL DEFAULT 0,
  cost_usd    NUMERIC(10,6) NOT NULL DEFAULT 0,
  model       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX usage_log_user_idx ON usage_log(user_id, created_at DESC);

-- 004_topups.sql
CREATE TABLE topups (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id),
  stripe_session_id   TEXT UNIQUE NOT NULL,
  amount_usd          NUMERIC(10,2) NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'completed' | 'refunded'
  created_at          TIMESTAMPTZ DEFAULT now(),
  completed_at        TIMESTAMPTZ
);

-- 005_refresh_tokens.sql
CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT UNIQUE NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

---

## API Endpoints

### Base URL: `https://occ.mba.sh`

All JSON endpoints use `Content-Type: application/json`.
All authenticated endpoints require `Authorization: Bearer <jwt>`.

---

### Auth

#### `POST /api/v1/auth/signup`
Create a new account and grant $5 free credit.

**Request:**
```json
{ "email": "user@example.com", "password": "min8chars" }
```

**Response `201`:**
```json
{
  "token": "<jwt>",
  "refresh_token": "<opaque>",
  "user": { "id": "uuid", "email": "user@example.com" },
  "balance_usd": 5.00
}
```

After responding, redirect the user's browser to:
```
occ-editor://auth?token=<jwt>&balance=5.00
```
This URI is intercepted by the OCC editor (registered URI handler) to complete sign-in.

**Errors:**
- `409` — email already registered
- `422` — validation failure

---

#### `POST /api/v1/auth/login`
**Request:** `{ "email": "...", "password": "..." }`

**Response `200`:** same shape as signup (minus the $5 grant)

---

#### `POST /api/v1/auth/refresh`
Exchange a refresh token for a new JWT.

**Request:** `{ "refresh_token": "<opaque>" }`

**Response `200`:** `{ "token": "<new jwt>", "refresh_token": "<new opaque>" }`

Invalidate the old refresh token on use (rotation).

---

#### `POST /api/v1/auth/logout`
Invalidate the current refresh token.

**Auth:** required

**Response `204`:** no body

---

#### `GET /api/v1/auth/google` _(optional)_
Initiate Google OAuth flow. Redirect to Google.

#### `GET /api/v1/auth/google/callback`
Handle Google callback. On success, issue JWT and redirect to:
```
occ-editor://auth?token=<jwt>&balance=<usd>
```

#### `GET /api/v1/auth/github` _(optional)_
#### `GET /api/v1/auth/github/callback`
Same pattern as Google.

---

### User

#### `GET /api/v1/me`
Return current user info. Used by editor on startup to validate the stored token.

**Auth:** required

**Response `200`:**
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "balance_usd": 4.8821,
  "lifetime_usd": 5.00,
  "created_at": "2026-03-11T00:00:00Z"
}
```

**Errors:**
- `401` — invalid or expired token

---

### Balance

#### `GET /api/v1/balance`
Lightweight balance check. Called by editor every 60s and after each inference call.

**Auth:** required

**Response `200`:**
```json
{
  "balance_usd": 4.8821,
  "cap_usd": 5.00,
  "currency": "usd"
}
```

---

#### `GET /api/v1/usage`
Paginated usage history.

**Auth:** required

**Query params:** `?page=1&limit=50`

**Response `200`:**
```json
{
  "items": [
    {
      "id": 1,
      "tokens_in": 120,
      "tokens_out": 340,
      "cost_usd": 0.0012,
      "model": "moltpilot",
      "created_at": "2026-03-11T10:00:00Z"
    }
  ],
  "total": 142,
  "page": 1,
  "limit": 50
}
```

---

### Billing (Stripe)

#### `POST /api/v1/billing/checkout`
Create a Stripe Checkout Session for a credit top-up.

**Auth:** required

**Request:**
```json
{ "amount_usd": 10 }
```
Valid amounts: `10`, `25`, `50` (map to Stripe Price IDs in env).

**Response `200`:**
```json
{ "checkout_url": "https://checkout.stripe.com/..." }
```

Editor or web app opens this URL in the browser. On success Stripe redirects to
`https://occ.mba.sh/billing/success?session_id=...`

---

#### `POST /api/v1/billing/webhook`
Stripe webhook receiver. **Do not require auth header — verify `Stripe-Signature` instead.**

Handle `checkout.session.completed`:
1. Look up `topups` row by `stripe_session_id`
2. Add `amount_usd` to `credits.balance_usd` and `credits.lifetime_usd`
3. Set `topups.status = 'completed'`, `topups.completed_at = now()`

Return `200` immediately. Idempotent — ignore already-completed sessions.

---

#### `GET /api/v1/billing/history`
Top-up history.

**Auth:** required

**Response `200`:**
```json
{
  "items": [
    {
      "id": "uuid",
      "amount_usd": 10.00,
      "status": "completed",
      "created_at": "2026-03-11T00:00:00Z"
    }
  ]
}
```

---

### Inference Proxy

#### `POST /v1/chat/completions`
OpenAI-compatible inference endpoint. The OCC editor sends all AI requests here.

**Auth:** required (JWT in `Authorization: Bearer`)

**Flow:**
1. Validate JWT → get `user_id`
2. Fetch `credits.balance_usd` for user — if `<= 0`, return `402`
3. Swap `Authorization` header: replace JWT with `INFERENCE_API_KEY`
4. Forward full request body to `INFERENCE_ENDPOINT/chat/completions`
5. Stream response back to client (preserve SSE chunking)
6. After stream ends: parse `usage` field from final chunk, calculate cost, deduct from balance, insert `usage_log` row

**Cost calculation** (adjust to your model's pricing):
```
cost_usd = (tokens_in * 0.0000005) + (tokens_out * 0.0000015)
```

**Responses:**
- `200` — streamed SSE (pass through from upstream)
- `401` — invalid/expired token
- `402` — balance depleted:
  ```json
  { "error": { "message": "OCC credit balance depleted. Top up at https://occ.mba.sh/billing", "type": "insufficient_credits" } }
  ```
- `502` — upstream inference error

**Important:** Must support streaming (`Transfer-Encoding: chunked` / SSE). Do not buffer the full
response before forwarding — pipe the upstream stream directly to the client response.

---

#### `GET /v1/models`
Passthrough — forward to upstream and return the model list.

**Auth:** required

---

## Sign-up Web Page

At `GET https://occ.mba.sh/signup`:

- Simple form: email + password (+ optional OAuth buttons)
- On submit → `POST /api/v1/auth/signup`
- On success → close the browser tab and display:
  > "You're in! Return to OCC — your $5 credit has been applied."
- The JWT is sent to the editor via the `occ-editor://auth` redirect automatically

Minimal HTML is fine. No need for a full React app — a single server-rendered page works.

---

## Security Requirements

- All endpoints HTTPS only — redirect HTTP to HTTPS
- JWT signed with HS256, secret minimum 64 chars, stored in env only
- Passwords hashed with bcrypt (cost factor 12)
- `INFERENCE_API_KEY` never returned in any response — server-side only
- Rate limit all auth endpoints: 10 requests / minute / IP (use `@fastify/rate-limit`)
- Rate limit inference: 60 requests / minute / user
- Stripe webhook signature verified on every webhook call
- CORS: allow `null` origin (VS Code webviews send `null`) and `https://occ.mba.sh`

---

## Dockerfile

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json .
EXPOSE 3001
CMD ["node", "dist/index.js"]
```

---

## Project Structure

```
occ-backend/
├── src/
│   ├── index.ts              # Fastify app entry, register plugins
│   ├── db/
│   │   ├── client.ts         # Drizzle + pg connection
│   │   └── schema.ts         # Drizzle table definitions
│   ├── routes/
│   │   ├── auth.ts           # /api/v1/auth/*
│   │   ├── user.ts           # /api/v1/me
│   │   ├── balance.ts        # /api/v1/balance, /api/v1/usage
│   │   ├── billing.ts        # /api/v1/billing/*
│   │   └── proxy.ts          # /v1/* inference proxy
│   ├── middleware/
│   │   ├── authenticate.ts   # JWT validation hook
│   │   └── rateLimit.ts      # Rate limit config
│   └── lib/
│       ├── jwt.ts            # sign / verify helpers
│       ├── credits.ts        # deduct, refund helpers
│       └── cost.ts           # token cost calculation
├── migrations/               # SQL migration files
├── .env.example
├── Dockerfile
├── package.json
└── tsconfig.json
```

---

## Editor Integration (read-only — do not modify)

The OCC editor expects:

| What | Value |
|------|-------|
| Inference base URL | `https://occ.mba.sh/v1` |
| Inference auth | `Authorization: Bearer <jwt>` |
| Balance URL | `GET https://occ.mba.sh/api/v1/balance` |
| Sign-up URL | `https://occ.mba.sh/signup?ref=occ-editor` |
| Auth callback | `occ-editor://auth?token=<jwt>&balance=<usd>` |
| Token storage | VS Code `context.secrets` (editor handles this) |

The editor is OpenAI-compatible — it sends standard `POST /v1/chat/completions` with streaming.

---

## Acceptance Criteria

- [ ] `POST /api/v1/auth/signup` creates user, grants $5, returns JWT, redirects to `occ-editor://auth`
- [ ] `GET /api/v1/me` returns 401 for expired token, 200 with user data for valid token
- [ ] `GET /api/v1/balance` returns live balance
- [ ] `POST /v1/chat/completions` streams inference, deducts cost, returns 402 when balance = 0
- [ ] Stripe webhook credits account on successful payment
- [ ] Inference key never appears in any HTTP response or log
- [ ] All auth endpoints rate limited
- [ ] Deployed and reachable at `https://occ.mba.sh`
