# PRD: Ticket 010 - Stripe Top-Up

## 1. Problem Statement

Users need to purchase additional OCC Credits when their balance runs low. The backend must integrate with Stripe Checkout to handle payments. The flow:

1. Editor calls `GET /api/v1/billing/checkout?amount=10` (or predefined price tiers)
2. Backend creates a Stripe Checkout Session for the user (using stored Stripe customer ID or creating one on the fly)
3. Backend returns `{ sessionUrl }` (Stripe-hosted page URL)
4. Editor opens the URL in browser
5. User completes payment on Stripe
6. Stripe sends webhook `checkout.session.completed` to backend
7. Backend credits the user's account: increase `credits.balance_usd` and `lifetime_usd` by the purchased amount (e.g., $10 → add $5 credit, respecting margin)
8. User redirected to `https://occ.mba.sh/success?session_id={CHECKOUT_SESSION_ID}`; editor polls `GET /api/v1/balance` to see updated balance

Pricing tiers (suggested):
- $10 → +$5 credits (50% margin)
- $25 → +$12.5 credits (50% margin)
- $50 → +$30 credits (40% margin)

## 2. Proposed Solution

Integrate Stripe Checkout:

- Create `POST /api/v1/billing/checkout` endpoint
  - Authenticated only (JWT)
  - Body: `{ amount: number }` (must match allowed tiers)
  - Lookup user's Stripe customer ID (store `stripe_customer_id` in `users` table)
  - If no customer, create one via `stripe.customers.create({ email: user.email, metadata: { userId } })` and save
  - Create Checkout Session: `stripe.checkout.sessions.create({ customer: stripeCustomerId, payment_method_types: ['card'], line_items: [{ price_data: { currency: 'usd', product_data: { name: 'OCC Credits' }, unit_amount: amount * 100, ... }, quantity: 1 }], mode: 'payment', success_url: `${BASE_URL}/success?session_id={CHECKOUT_SESSION_ID}`, cancel_url: `${BASE_URL}/cancel` })`
  - Return `{ sessionUrl: session.url }`
- Implement `POST /api/v1/stripe/webhook`
  - Verify signature using `STRIPE_WEBHOOK_SECRET`
  - On `checkout.session.completed` event:
    - Extract `session.customer` (Stripe customer ID) and `session.amount_total` (cents)
    - Lookup user by `stripe_customer_id`
    - Compute credit amount: map `amount_total` to tier (e.g., 1000 cents → $5 credit)
    - `UPDATE credits SET balance_usd = balance_usd + credit, lifetime_usd = lifetime_usd + credit WHERE user_id = userId`
    - Log transaction in new `transactions` table (optional)
- Add `GET /api/v1/billing/history` (optional) to show user their purchase history

## 3. Acceptance Criteria

- Authenticated user can request a checkout session via `POST /api/v1/billing/checkout` with a supported amount (10, 25, 50)
- Endpoint creates/uses a Stripe customer ID linked to the user
- Returns a valid `sessionUrl` that opens Stripe Checkout
- Stripe webhook receives event and credits user's account correctly
- After payment, when user is redirected to success page, editor's balance poll reflects increased balance
- If webhook fails, idempotency: duplicate events do not over-credit (use Stripe event `id` uniqueness check)
- Amount tiers and corresponding credit amounts are clearly documented

## 4. Technical Considerations

- **Stripe library:** Use official `stripe` Node SDK
- **Idempotency:** Protect against duplicate webhook deliveries: store processed `event.id` in a table; skip if already processed
- **Webhook security:** Verify signature using raw request body and `STRIPE_WEBHOOK_SECRET`; reject if verification fails
- **Tier mapping:** Use a constant mapping like `{ 1000: 5.00, 2500: 12.50, 5000: 30.00 }` (cents → USD credit). Document in code.
- **Currency:** All amounts in USD cents; convert carefully to avoid floating rounding errors; store balances as NUMERIC(10,6) in DB
- **Error handling:** If Stripe API errors, return 500 with `{ error: 'payment_setup_failed' }` and log details; do not expose Stripe errors to client
- **Testing:** Use Stripe test mode with test keys and test cards (`4242 4242 4242 4242`). Write tests that hit Stripe test API or mock with `stripe-mock`
- **Environment:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `BASE_URL` env vars
- **Database:** Optional `transactions` table: `id`, `user_id`, `stripe_session_id`, `amount_usd`, `credit_added_usd`, `created_at`

## 5. Dependencies

- Backend foundation (ticket-007: DB, auth, secrets)
- Stripe account with test keys

## 6. Subtask Checklist

- [ ] Task 1: Install and configure Stripe SDK
  - **Problem:** Need Stripe client with secret key
  - **Test:** `stripe.customers.list()` works with test key
  - **Subtasks:**
    - [ ] Subtask 1.1: `npm install stripe`
    - [ ] Subtask 1.2: `const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' })`
    - [ ] Subtask 1.3: Verify `stripe` object in health check route (optional)

- [ ] Task 2: Create `POST /api/v1/billing/checkout`
  - **Problem:** Generate Stripe Checkout Session
  - **Test:** Authenticated POST returns `{ sessionUrl }` that loads Stripe Checkout
  - **Subtasks:**
    - [ ] Subtask 2.1: Validate amount against allowed tiers (10,25,50); else return 400
    - [ ] Subtask 2.2: Get user (from `request.userId`) and ensure has email
    - [ ] Subtask 2.3: Check if `users.stripe_customer_id` exists; if not, `stripe.customers.create({ email, metadata: { userId } })` and save
    - [ ] Subtask 2.4: Map amount to credit amount using tier mapping
    - [ ] Subtask 2.5: `stripe.checkout.sessions.create({ customer: stripeCustomerId, line_items: [{ price_data: { currency: 'usd', product_data: { name: 'OCC Credits' }, unit_amount: amount*100, ... }, quantity: 1 }], mode: 'payment', success_url: `${BASE_URL}/success?session_id={CHECKOUT_SESSION_ID}`, cancel_url: `${BASE_URL}/cancel` })`
    - [ ] Subtask 2.6: Return `{ sessionUrl: session.url }`

- [ ] Task 3: Implement Stripe webhook endpoint
  - **Problem:** Receive payment confirmation and credit account
  - **Test:** Send test webhook from Stripe CLI; user's balance updates
  - **Subtasks:**
    - [ ] Subtask 3.1: Create `POST /api/v1/stripe/webhook` with raw body access (`fastify.addContentTypeParser('application/json', ...)` to get raw)
    - [ ] Subtask 3.2: Get signature from `Stripe-Signature` header; `stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET)`
    - [ ] Subtask 3.3: If event type `checkout.session.completed`:
      - Extract `session.customer` and `session.amount_total` (cents)
      - Lookup user by `stripe_customer_id = session.customer`
      - Map amount to credit using tiers
      - Begin transaction: `UPDATE credits SET balance_usd = balance_usd + credit WHERE user_id = userId`
      - Optional insert `transactions` row: `stripe_session_id=session.id, amount_usd=session.amount_total/100, credit_added_usd=credit`
      - Commit transaction
    - [ ] Subtask 3.4: Respond `200 OK` to Stripe quickly (within seconds)
    - [ ] Subtask 3.5: Log webhook processing (info)

- [ ] Task 4: Idempotency and error handling
  - **Problem:** Stripe may retry delivery; must not double-credit
  - **Test:** Resend same webhook event; balance increases only once
  - **Subtasks:**
    - [ ] Subtask 4.1: Create `stripe_events` table: `event_id TEXT PRIMARY KEY`, `received_at TIMESTAMPTZ`
    - [ ] Subtask 4.2: Before processing, check if `event.id` exists; if exists, respond 200 and skip
    - [ ] Subtask 4.3: On processing success, insert `event.id` with `received_at`
    - [ ] Subtask 4.4: If any DB/Stripe error, return 5xx to trigger Stripe retry (but ensure no partial updates)

- [ ] Task 5: Tier mapping validation and documentation
  - **Problem:** Be explicit about what each amount buys
  - **Test:** Code clearly maps 10 → 5.00, 25 → 12.50, 50 → 30.00
  - **Subtasks:**
    - [ ] Subtask 5.1: Create constant `TIER_MAP_CENTS_TO_CREDIT = new Map([[1000,5.00],[2500,12.50],[5000,30.00]])`
    - [ ] Subtask 5.2: Document in code comment and README
    - [ ] Subtask 5.3: Ensure any mismatch returns 400 before calling Stripe

- [ ] Task 6: Testing (unit + integration)
  - **Problem:** Confidence that flow works end-to-end
  - **Test:** Automated tests cover checkout creation and webhook processing with mocked Stripe
  - **Subtasks:**
    - [ ] Subtask 6.1: Use `stripe-mock` or Jest mocks for Stripe SDK
    - [ ] Subtask 6.2: Test `/billing/checkout` returns valid sessionUrl and creates customer if needed
    - [ ] Subtask 6.3: Test webhook handler with sample event payload; verify balance update and idempotency
    - [ ] Subtask 6.4: Add integration test that goes through real Stripe test mode (optional but valuable)

- [ ] Task 7: Editor integration (frontend ticket)
  - **Problem:** The editor needs to call this endpoint and open browser
  - **Note:** Covered in frontend tickets (status bar "Buy More Credits" already opens `https://mba.sh/billing`; eventually should use backend to create session). Defer to frontend when backend is ready.
  - **Verification:** This ticket only covers backend; frontend will call it later

- [ ] Task 8: Deployment and monitoring
  - **Problem:** Stripe keys must be present; webhook endpoint must be reachable
  - **Test:** Production deployment has webhook URL configured in Stripe dashboard (`https://occ.mba.sh/api/v1/stripe/webhook`); logs show successful events
  - **Subtasks:**
    - [ ] Subtask 8.1: Set environment variables in hosting: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
    - [ ] Subtask 8.2: Register webhook endpoint in Stripe Dashboard for `checkout.session.completed` event (pointing to production URL)
    - [ ] Subtask 8.3: Add monitoring: alert on webhook failures (non-2xx responses)
    - [ ] Subtask 8.4: Add dashboard query to see recent top-ups and balances
