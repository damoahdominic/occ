# OCC Account & Free Tier Proxy

## Problem

The OCC Free Tier currently embeds a shared inference API key (`OCC_INFERENCE_API_KEY`) directly
in the compiled binary. Anyone who downloads the app can extract it and use the inference endpoint
on our bill, with no rate limiting or accountability.

## Solution: authenticated proxy

Replace the hardcoded key with a user session token. The real key lives only on the server.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  OCC Editor (client — distributed binary)                        │
│                                                                  │
│  1. User clicks "OCC Free Tier"                                  │
│  2. Editor opens browser → user signs up / logs in               │
│  3. Backend returns a short-lived JWT session token              │
│  4. Editor stores token in VS Code secret storage (encrypted)    │
│  5. All inference calls go to YOUR proxy with the JWT            │
└───────────────────────┬─────────────────────────────────────────┘
                        │  POST /v1/chat/completions
                        │  Authorization: Bearer <jwt>
                        │  (no inference key — just the user's token)
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│  OCC Proxy  (api.openclaw.ai — closed source, stays private)    │
│                                                                  │
│  1. Validate JWT (is it real? not expired?)                      │
│  2. Look up user → check quota (has $1 credit remaining?)        │
│  3. If ok → forward request to upstream inference endpoint       │
│     with the REAL key (stored only server-side in .env)          │
│  4. Stream response back to editor                               │
│  5. Record tokens used → deduct from user's quota               │
└───────────────────────┬─────────────────────────────────────────┘
                        │  POST /v1/chat/completions
                        │  Authorization: Bearer sk-...  (real key)
                        ▼
                  inference.mba.sh  (upstream LLM)
```

### Repo structure

```
apps/
  editor/           ← open source (MIT) — no secrets
  web/              ← open source — marketing site

api/                ← CLOSED SOURCE — separate private repo
  src/
    proxy.ts        ← request forwarding + auth header swap
    auth.ts         ← JWT sign/verify, OAuth (Google, GitHub)
    billing.ts      ← quota tracking, Stripe for paid plans
    db/             ← users table, usage table
  .env              ← INFERENCE_API_KEY=... (server only, never committed)
```

---

## Implementation plan

### 1. Proxy server (`api/src/proxy.ts`)

```ts
import express from 'express'
import { createProxyMiddleware } from 'http-proxy-middleware'
import { verifyJwt } from './auth'
import { checkAndDeductQuota } from './billing'

const app = express()

app.use('/v1', async (req, res, next) => {
  // Validate user session token
  const token = req.headers.authorization?.replace('Bearer ', '')
  const user = await verifyJwt(token)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  // Check quota
  const allowed = await checkAndDeductQuota(user.id, req)
  if (!allowed) return res.status(402).json({
    error: 'Free tier quota exhausted. Add a payment method.'
  })

  // Swap auth header — real key never leaves the server
  req.headers.authorization = `Bearer ${process.env.INFERENCE_API_KEY}`
  req.headers['x-user-id'] = user.id

  next()
}, createProxyMiddleware({
  target: process.env.INFERENCE_ENDPOINT,
  changeOrigin: true,
}))

app.listen(3001)
```

### 2. Auth flow in the editor (`apps/editor/extensions/openclaw/src/panels/home.ts`)

```ts
const token = await context.secrets.get('occ.sessionToken')

if (!token) {
  // Open browser to sign up / log in
  const loginUrl = 'https://openclaw.ai/auth/editor?callback=occ-editor'
  vscode.env.openExternal(vscode.Uri.parse(loginUrl))

  // Wait for the callback via registered URI handler (occ-editor:// scheme)
  const newToken = await waitForAuthCallback()
  await context.secrets.store('occ.sessionToken', newToken)
}

// Launch gateway with session token — no hardcoded key
const providerFlags = {
  free: [
    '--auth-choice', 'custom-api-key',
    '--custom-base-url', 'https://api.openclaw.ai/v1',  // proxy URL
    '--custom-api-key', token,                           // user JWT
    '--custom-model-id', 'moltpilot',
    '--custom-compatibility', 'openai',
  ],
  // BYOK providers unchanged ...
}
```

Token expiry: if the proxy returns 401, re-open the login flow and refresh the token.

### 3. URI handler (register `occ-editor://` scheme)

```ts
// extension activation
vscode.window.registerUriHandler({
  handleUri(uri: vscode.Uri) {
    if (uri.path === '/auth') {
      const token = new URLSearchParams(uri.query).get('token')
      if (token) {
        context.secrets.store('occ.sessionToken', token)
        resolveAuthCallback(token)  // resolves waitForAuthCallback()
      }
    }
  }
})
```

The web sign-up page redirects to `occ-editor://auth?token=<jwt>` after login, which VS Code
intercepts and passes to this handler.

### 4. Database schema

```sql
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT UNIQUE NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE quota (
  user_id     UUID REFERENCES users(id),
  credits_usd NUMERIC(10,6) DEFAULT 1.000000,  -- $1 free tier
  updated_at  TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id)
);

CREATE TABLE usage_log (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID REFERENCES users(id),
  tokens_in   INT,
  tokens_out  INT,
  cost_usd    NUMERIC(10,6),
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

---

## Build order

1. **Auth endpoint** — `/auth/editor` → OAuth (Google / GitHub) → redirect to `occ-editor://auth?token=<jwt>`
2. **Proxy endpoint** — validate JWT → check quota → forward to upstream
3. **Editor URI handler** — register `occ-editor://` scheme, capture token, store in `context.secrets`
4. **Quota table** — decrement on each proxied request, return 402 when exhausted
5. **Sign-up page** — simple form or "Continue with Google / GitHub" on `openclaw.ai/auth/editor`
6. **Paid tier** — Stripe checkout to top up credits beyond the free $1

## Security properties after this change

| Property | Before | After |
|----------|--------|-------|
| Inference key in binary | Yes | No |
| Inference key in source | Yes (removed) | No |
| Key extractable from binary | Yes | No — key never sent to client |
| Per-user rate limiting | No | Yes |
| Abuse accountability | No | Yes — tied to account |
| Key rotation without app update | No | Yes — change server .env |
