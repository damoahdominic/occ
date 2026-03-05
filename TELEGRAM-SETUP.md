# Setting Up Telegram with OpenClaw
## Step-by-step guide using the Gateway UI

---

## Before You Start

You need:
- OCcode installed and open
- OpenClaw installed (via the Home panel Install button)
- A Telegram account on your phone

---

## Step 1 — Create Your Telegram Bot

You must create a bot via Telegram's official BotFather before anything else.

1. Open Telegram on your phone or desktop
2. Search for **@BotFather** and open the chat
3. Send the command:
   ```
   /newbot
   ```
4. BotFather will ask for a **name** — this is the display name (e.g. `My OpenClaw Bot`)
5. BotFather will then ask for a **username** — must end in `bot` (e.g. `myopenclawbot`)
6. BotFather will reply with your **Bot Token** — it looks like:
   ```
   8328341297:AAESucIDOoHTt3Wers28iqKERjjyRmAt6_k
   ```
   **Copy this — you will need it in the next step.**

---

## Step 2 — Open the Gateway UI

1. Open **OCcode** (the editor)
2. The **OpenClaw Home panel** opens automatically on the right
3. Make sure the status shows **Gateway: Running**
   - If not, click **Start Gateway**
   - Wait for the green status indicator
4. Click the **Configure OpenClaw** button
5. The **Gateway Control UI** opens inside the editor

---

## Step 3 — Log In to the Gateway

The first time you open the Gateway UI you will be asked to authenticate.

1. When prompted, enter the **gateway token** from your config:
   - Run this in Terminal to find it:
     ```bash
     cat ~/.openclaw/openclaw.json | grep token
     ```
   - It looks like: `70048f4f333c4ef75e7408144f6cdc1f1da5d60dd149ed35`
2. Paste the token into the Gateway UI login screen
3. Click **Connect**

> **Tip:** The token is saved in your browser's local storage so you only need to do this once per machine.

---

## Step 4 — Go to the Channels Tab

Once logged in to the Gateway UI:

1. Click **Channels** in the left navigation
2. You will see cards for all supported messaging platforms:
   - Telegram, WhatsApp, Discord, Slack, Signal, iMessage, and more
3. Find the **Telegram** card

---

## Step 5 — Enter Your Bot Token

In the **Telegram card**:

1. You will see a config form with a **Bot Token** field
2. Paste the bot token you copied from BotFather in Step 1
3. Click **Save**

The Telegram card will update to show:
- **Configured: Yes**
- **Running: Yes**
- **Mode:** polling or webhook

---

## Step 6 — Probe and Verify

After saving:

1. Click the **Probe** button in the Telegram card
2. The card will show a probe result:
   - ✅ `Probe ok` — your bot token is valid and Telegram is reachable
   - ❌ `Probe failed` — check the bot token and try again
3. If probe is ok, your bot's **@username** will appear in the card header

---

## Step 7 — Configure an Agent

Now connect an AI agent to your Telegram bot:

1. Click **Agents** in the left navigation
2. Click **New Agent** (or use an existing one)
3. Give your agent a name and select a model (e.g. OCC Legacy Model for free, or your API key model)
4. Save the agent

---

## Step 8 — Set Up Routing (Bind Agent → Telegram)

1. Click **Bindings** in the left navigation (under the Agents or Channels section)
2. Click **Add Binding**
3. Select:
   - **Agent**: the agent you created in Step 7
   - **Channel**: Telegram
4. Set your **DM Policy** — how the bot responds to direct messages:
   - `pairing` — only responds to paired users (recommended for workshops)
   - `allowlist` — only responds to users on a specific list
   - `open` — responds to anyone
5. Save the binding

---

## Step 9 — Test It

1. Open Telegram on your phone
2. Search for your bot by the username you gave it (e.g. `@myopenclawbot`)
3. Send `/start` or any message
4. Your OpenClaw agent should respond

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Gateway not running | Click "Start Gateway" on the OCcode home panel |
| Probe failed | Double-check the bot token — no extra spaces |
| Bot not responding | Check Bindings — agent must be bound to Telegram |
| Token expired | BotFather → `/mybots` → select bot → API Token → Revoke and re-issue |
| Gateway UI won't load | Restart gateway from home panel, wait 5s, click Configure again |
| Can't log in to Gateway | Run `cat ~/.openclaw/openclaw.json` and copy the `token` value |

---

## Quick Reference

| What | Where |
|------|-------|
| Create bot | @BotFather on Telegram → `/newbot` |
| Enter bot token | Gateway UI → Channels → Telegram card → Bot Token field |
| Test connection | Gateway UI → Channels → Telegram → Probe button |
| Connect AI | Gateway UI → Bindings → Add Binding |
| Find gateway token | `cat ~/.openclaw/openclaw.json \| grep token` |
| Restart gateway | OCcode Home panel → Restart Gateway button |
