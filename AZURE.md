# Azure Trusted Signing — Setup Guide

Windows code signing via Azure Trusted Signing ($9.99/month).
Gives instant SmartScreen trust. CI step is already wired — just needs secrets.

---

## Step 1 — Create Azure resources

Go to https://portal.azure.com

### 1a. Create a Trusted Signing Account
- Search "Trusted Signing" → Create
- **Region**: East US (endpoint will be `https://eus.codesigning.azure.net`)
- **Pricing tier**: Basic ($9.99/month)
- Note the **account name** you choose

### 1b. Create a Certificate Profile
- Inside the account → **Certificate Profiles** → New
- **Profile type**: Public Trust
- **Name**: `OCcode` (or anything you like)
- Note the **profile name** you choose

---

## Step 2 — Create a service principal for GitHub Actions

Run this in Azure CLI (or use Azure Cloud Shell in the portal):

```bash
az ad sp create-for-rbac \
  --name "occode-github-signing" \
  --role "Trusted Signing Certificate Profile Signer" \
  --scopes /subscriptions/<SUBSCRIPTION_ID>/resourceGroups/<RESOURCE_GROUP>/providers/Microsoft.CodeSigning/codeSigningAccounts/<ACCOUNT_NAME>
```

Replace `<SUBSCRIPTION_ID>`, `<RESOURCE_GROUP>`, `<ACCOUNT_NAME>` with your values.

Output will look like:
```json
{
  "appId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "password": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "tenant": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

Save these — you won't see the password again.

---

## Step 3 — Add secrets to GitHub

Go to: `https://github.com/damoahdominic/occ/settings/secrets/actions`

Add these 6 secrets:

| Secret name | Value |
|---|---|
| `AZURE_TENANT_ID` | `tenant` from Step 2 output |
| `AZURE_CLIENT_ID` | `appId` from Step 2 output |
| `AZURE_CLIENT_SECRET` | `password` from Step 2 output |
| `AZURE_SIGNING_ENDPOINT` | `https://eus.codesigning.azure.net` |
| `AZURE_SIGNING_ACCOUNT` | your account name from Step 1a |
| `AZURE_SIGNING_PROFILE` | your profile name from Step 1b |

---

## Step 4 — Identity verification

Microsoft will email you to verify HITL, Inc:
- Company registration document (Companies House / certificate of incorporation)
- Takes **3–5 business days**

You can complete Steps 1–3 now. Signing won't activate until verification passes.

---

## Step 5 — Test it

Once verified, push any tag:
```bash
git tag v3.x.x && git push origin main --tags
```

The Windows build will now sign both installers automatically.
Unsigned builds continue to work unchanged if secrets are ever missing.

---

## Notes

- The CI step skips silently if `AZURE_CLIENT_ID` secret is not set — nothing breaks
- Both `system-setup` and `user-setup` `.exe` files are signed
- Timestamp server: `http://timestamp.acs.microsoft.com` (Microsoft's own)
- Cost: ~$10/month, no per-signature fees on Basic tier
