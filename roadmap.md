# OCC Roadmap — Billing & Onboarding

## Business Model
- **Apache 2.0** — free and open source
- **BYOK** — always free, no account, user supplies their own API key
- **OCC Credits** — sign up at MBA.sh, get $5 free, buy more at standard rates

---

## Track A — Frontend (no backend required)

Everything that can be built, shipped, and tested right now against mock/stub data.

### A1 · Onboarding copy update
**Files:** `extensions/openclaw/src/panels/home.ts`

- Free card: `$1 to start` → `$5 free credits`
- Free card sub: `Lasts about a week. No card needed.` → `Sign up at MBA.sh — $5 free on first account.`
- Free card CTA: `Start Free →` → `Create Account →`
- BYOK card: add `Always free. No account needed.` subtext
- Bottom note: `Free credit tracked locally. No account needed.` → remove entirely
- Step 3 (free setup log) header: update from MoltPilot copy to MBA.sh copy

### A2 · Onboarding flow — auth waiting state
**Files:** `extensions/openclaw/src/panels/home.ts`

- `chooseFree()` opens `https://mba.sh/signup?ref=occ-editor` in system browser
- Wizard transitions to a new **"Waiting for sign-in…"** step (spinner + cancel button)
- Register `occ-editor://auth` URI handler in extension activation
- On URI callback (`occ-editor://auth?token=<jwt>&balance=<usd>`):
  - Store JWT in `context.secrets` (not globalState — encrypted by VS Code)
  - Dismiss waiting state, proceed to gateway setup
- Cancel button returns user to step 0

### A3 · Session state (three modes)
**Files:** `extensions/openclaw/src/extension.ts`, new `extensions/openclaw/src/auth.ts`

Three states the extension must handle on every activation:

| State | Condition | Behaviour |
|-------|-----------|-----------|
| `unauthenticated` | No token, no BYOK config | Show onboarding |
| `authenticated` | Valid JWT in secrets | Show balance bar, block if $0 |
| `byok` | BYOK provider configured | Hide balance bar |

- On activation: read token from `context.secrets`
- Stub: if token present but MBA.sh unreachable → use last-known balance from `globalState` as display fallback (clearly labelled "cached")
- If token missing + no BYOK → open home panel automatically

### A4 · Status bar — stub mode
**Files:** `extensions/openclaw/src/extension.ts`

- Keep animated balance bar UI
- Change `BALANCE_CAP` from `1.00` → `5.00`
- Change all `$1` copy → `$5`
- Add a `fetchBalance()` stub that returns `globalState` value for now (backend will replace this)
- "Buy More Credits" → `https://mba.sh/billing`
- Status bar only visible when `authenticated` (not BYOK)

### A5 · Settings panel — OCC Credits card
**Files:** `src/vs/workbench/contrib/void/browser/react/src/void-settings-tsx/Settings.tsx`

- Card 1 "OCC Free Tier" → "OCC Credits"
- Sub text: `Use the built-in model. No API key needed — $1 of free inference included.`
  → `Powered by MBA.sh. $5 free on sign-up. Buy more at standard rates.`
- Card 2 "Bring Your Own Key":
  → Add `Always free. No account.` under the title
- When OCC Credits selected + not authenticated:
  → Show "Sign in to MBA.sh" button (opens browser) instead of endpoint/key fields
- When OCC Credits selected + authenticated:
  → Show account email, live balance (stubbed from globalState), "Buy More Credits", "Sign Out"

### A6 · Sign Out
**Files:** `extensions/openclaw/src/auth.ts`, `home.ts`

- `context.secrets.delete('occ.sessionToken')`
- Clear cached balance from `globalState`
- Reset extension state to `unauthenticated`
- Re-open home panel at step 0

---

## Track B — Backend (MBA.sh — separate private repo)

Everything that requires a running server. Built in parallel or after Track A.

### B1 · Auth — sign up & JWT issuance
- `POST /api/v1/auth/signup` — email/password or OAuth (Google, GitHub)
- On successful signup: grant $5.00 credit, issue signed JWT (7d expiry)
- Redirect to `occ-editor://auth?token=<jwt>&balance=5.00`
- `POST /api/v1/auth/refresh` — exchange expiring token for a new one
- `GET /api/v1/me` — validate token, return `{ email, balance }`

### B2 · Balance API
- `GET /api/v1/balance` — return `{ balance_usd: number, cap_usd: number }`
- Called by editor on activation + every 60s
- Editor replaces the `globalState` stub with this response

### B3 · Inference proxy
- `POST /v1/chat/completions` — OpenAI-compatible endpoint
- Validates JWT in `Authorization: Bearer <token>`
- Checks balance > 0, else returns `402 Payment Required`
- Forwards to upstream inference with real key (server-side only)
- On response: calculate token cost, deduct from balance, log to `usage_log`
- Streams response back to client

### B4 · Top-up (Stripe)
- `POST /api/v1/billing/checkout` — create Stripe checkout session
- Webhook: on `checkout.session.completed` → credit user account
- `GET /api/v1/billing/history` — usage + top-up history

### B5 · Database schema
```sql
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT UNIQUE NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE credits (
  user_id     UUID REFERENCES users(id) PRIMARY KEY,
  balance_usd NUMERIC(10,6) DEFAULT 5.000000,
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE usage_log (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID REFERENCES users(id),
  tokens_in   INT,
  tokens_out  INT,
  cost_usd    NUMERIC(10,6),
  model       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

---

## Integration point (where A meets B)

When backend is ready, two changes swap the stubs for real calls:

| Stub (Track A) | Real (Track B) |
|----------------|----------------|
| `globalState` balance | `GET /api/v1/balance` |
| `occ-editor://auth` opened manually / mocked | Real MBA.sh signup → redirect |
| Inference direct to upstream | Proxy via `POST https://mba.sh/v1/chat/completions` |
| `openclaw gateway --custom-base-url <upstream>` | `openclaw gateway --custom-base-url https://mba.sh/v1` |

---

## Current status

| Item | Status |
|------|--------|
| Apache 2.0 license | ✅ Done |
| Hardcoded credentials removed | ✅ Done |
| CONTRIBUTING / SECURITY / README | ✅ Done |
| Onboarding copy ($5, MBA.sh) | ⬜ A1 |
| Auth waiting state + URI handler | ⬜ A2 |
| Session state (3 modes) | ⬜ A3 |
| Status bar stub ($5 cap) | ⬜ A4 |
| Settings panel OCC Credits card | ⬜ A5 |
| Sign out | ⬜ A6 |
| MBA.sh auth + JWT | ⬜ B1 |
| Balance API | ⬜ B2 |
| Inference proxy | ⬜ B3 |
| Stripe top-up | ⬜ B4 |
