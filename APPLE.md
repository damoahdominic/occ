# macOS Code Signing & Notarization Setup

## What's already done
- [x] Developer ID Application certificate exported and stored as `~/Documents/developer-id.p12`
- [x] GitHub secret `APPLE_CERTIFICATE_P12_BASE64` set
- [x] GitHub secret `APPLE_CERTIFICATE_PASSWORD` set
- [x] GitHub secret `APPLE_TEAM_ID` set (`SQZ9VHYXJ3`)
- [x] GitHub secret `APPLE_ID` set (`team@hitl.sh`)
- [x] GitHub Actions workflow written at `.github/workflows/build-macos.yml`

---

## What's left — App Store Connect API Key

### Step 1 — Log in
Go to: https://appstoreconnect.apple.com/access/integrations/api

Sign in with `team@hitl.sh` (2FA code will be sent to your phone ending in 27).

### Step 2 — Generate a key
1. Click the **"Team Keys"** tab
2. Click **"+"**
3. Fill in:
   - **Name**: `occode-notarize`
   - **Access**: `Developer`
4. Click **Generate**

### Step 3 — Collect the values

You'll see a table with your new key:

| Name | Key ID | Issuer ID |
|------|--------|-----------|
| occode-notarize | `XXXXXXXXXX` | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |

Note down:
- **Key ID** → this is `APPLE_API_KEY_ID`
- **Issuer ID** (shown at the top of the page, shared across all keys) → this is `APPLE_API_KEY_ISSUER`

### Step 4 — Download the .p8 key file
Click **"Download API Key"** next to your new key.

> ⚠️ Apple only lets you download this once. Don't skip it.

It saves as something like `AuthKey_XXXXXXXXXX.p8` in your Downloads folder.

### Step 5 — Set the 3 remaining GitHub secrets

Open Terminal and run these one at a time, replacing the placeholders:

```bash
# Set the Key ID
gh secret set APPLE_API_KEY_ID --body "PASTE_KEY_ID_HERE" --repo damoahdominic/occ

# Set the Issuer ID
gh secret set APPLE_API_KEY_ISSUER --body "PASTE_ISSUER_ID_HERE" --repo damoahdominic/occ

# Set the .p8 file contents
gh secret set APPLE_API_KEY_P8 < ~/Downloads/AuthKey_XXXXXXXXXX.p8 --repo damoahdominic/occ
```

> Replace `AuthKey_XXXXXXXXXX.p8` with the actual filename from your Downloads folder.

### Step 6 — Verify all secrets are set

```bash
gh secret list --repo damoahdominic/occ
```

You should see all 7 secrets:
- `APPLE_CERTIFICATE_P12_BASE64`
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_TEAM_ID`
- `APPLE_ID`
- `APPLE_API_KEY_ID`
- `APPLE_API_KEY_ISSUER`
- `APPLE_API_KEY_P8`

---

## Triggering a build

### On a git tag (automatic)
```bash
git tag v1.0.0
git push origin v1.0.0
```
The workflow triggers automatically and creates a GitHub Release with the signed `.zip`.

### Manually
Go to: https://github.com/damoahdominic/occ/actions/workflows/build-macos.yml

Click **"Run workflow"** → **"Run workflow"**.

---

## Verifying the signed app locally

After downloading the artifact, run:
```bash
unzip OCcode-darwin-arm64-signed.zip
codesign -dv --deep --verbose=4 OCcode.app
spctl -a -vvv -t install OCcode.app
```

Both should pass with no errors and show `Developer ID Application: HITL, Inc (SQZ9VHYXJ3)`.
