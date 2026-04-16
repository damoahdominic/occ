# Stream 3b: ProxyUrl E2E Validation Plan

**Objective:** Validate that the proxyUrl feature works correctly with the strengthened E2E test suite

**Status:** Ready for testing

---

## Test Scenarios

### Scenario 1: Default Behavior (No ProxyUrl)
**Setup:**
- `GATEWAY_PROXY_URL` not set or empty
- `GATEWAY_PORT=18789`
- `GATEWAY_BIND_HOST=127.0.0.1`

**Expected:**
- Dashboard opens at `http://127.0.0.1:18789/`
- Token appended as hash fragment: `http://127.0.0.1:18789/#token=xyz`
- E2E tests pass without modification

**Test Files:**
- `gateway-management.spec.ts` - Start/stop gateway, verify status
- `openclaw-installation.spec.ts` - Installation flow, verify gateway accessible
- `home-panel.spec.ts` - Home panel renders correctly
- `smoke.spec.ts` - Basic server/workbench smoke tests

---

### Scenario 2: Custom ProxyUrl (HTTPS External)
**Setup:**
- `GATEWAY_PROXY_URL=https://gateway.example.com/`
- `GATEWAY_PORT=18789` (internal container port, ignored)
- `GATEWAY_BIND_HOST=127.0.0.1` (ignored)

**Expected:**
- Dashboard opens at `https://gateway.example.com/`
- Token appended: `https://gateway.example.com/#token=xyz`
- Extension uses proxyUrl instead of port mapping
- E2E tests verify gateway status via proxy URL

**Test Files:**
- `gateway-management.spec.ts` - Verify gateway reachable through proxy
- `balance-polling.spec.ts` - Balance displayed from proxy endpoint
- `onboarding-auth.spec.ts` - Auth flow works through proxy

---

### Scenario 3: ProxyUrl with Base Path
**Setup:**
- `GATEWAY_PROXY_URL=http://localhost:8443/gateway/`
- Container port: 18789
- Host port: 18789 (via reverse proxy)

**Expected:**
- Dashboard opens at `http://localhost:8443/gateway/`
- Path merging: `/gateway/` + `/dashboard/index.html` = `/gateway/dashboard/index.html`
- Token: `http://localhost:8443/gateway/#token=xyz`
- No double slashes in final URL

**Test Files:**
- `docker-setup.spec.ts` - Config flow with custom proxy URL
- `docker-to-ide-flow.spec.ts` - Full flow through proxy with base path
- `gateway-proxy-paths.spec.ts` - Specific path merging scenarios

---

### Scenario 4: ProxyUrl Precedence Over Port Mapping
**Setup:**
- `GATEWAY_PROXY_URL=https://gateway.example.com/`
- `GATEWAY_PORT=18790` (host port, ignored)
- Container internal port: 18789

**Expected:**
- Dashboard uses proxyUrl: `https://gateway.example.com/`
- NOT `http://127.0.0.1:18790/` (port mapping ignored)
- proxyUrl takes precedence

**Test Files:**
- `docker-setup.spec.ts` - Verify proxy URL takes precedence
- `gateway-management.spec.ts` - Status check uses correct endpoint
- `balance-polling.spec.ts` - Balance polling hits correct URL

---

### Scenario 5: Token Preservation
**Setup:**
- `GATEWAY_PROXY_URL=https://gateway.example.com/`
- Container returns token in response

**Expected:**
- Token extracted from container response
- Token appended to proxyUrl as hash: `https://gateway.example.com/#token=abc123`
- Token not lost during URL rewriting
- Dashboard opens with authentication maintained

**Test Files:**
- `onboarding-auth.spec.ts` - Auth token preserved through proxy
- `balance-polling.spec.ts` - User balance accessible with token
- `settings-occ-credits.spec.ts` - Settings accessible with authenticated token

---

### Scenario 6: Trailing Slash Handling
**Test Cases:**

**Case A: ProxyUrl with trailing slash**
- Input: `GATEWAY_PROXY_URL=https://gateway.example.com/`
- Dashboard path: `/dashboard/index.html`
- Expected: `https://gateway.example.com/dashboard/index.html` (no double slash)

**Case B: ProxyUrl without trailing slash**
- Input: `GATEWAY_PROXY_URL=https://gateway.example.com`
- Dashboard path: `/dashboard/index.html`
- Expected: `https://gateway.example.com/dashboard/index.html`

**Case C: ProxyUrl with base path, trailing slash**
- Input: `GATEWAY_PROXY_URL=https://gateway.example.com/api/`
- Dashboard path: `/gateway/dashboard/index.html`
- Expected: `https://gateway.example.com/api/gateway/dashboard/index.html`

**Test Files:**
- `gateway-proxy-paths.spec.ts` - Specific trailing slash scenarios

---

## Validation Steps

### Step 1: Verify Docker Configuration
- [ ] Check docker-compose.openclaw.override.yml has GATEWAY_PROXY_URL environment variable
- [ ] Verify .env.openclaw.example documents proxyUrl with examples
- [ ] Confirm DOCKER.md section 3b explains proxy URL configuration

### Step 2: Run E2E Tests with Default Config (No ProxyUrl)
```bash
npm run test:e2e
```
- [ ] All 14 test files pass
- [ ] Gateway reachable at http://127.0.0.1:18789/
- [ ] No proxy URL path merging issues

### Step 3: Run E2E Tests with ProxyUrl Configured
```bash
export GATEWAY_PROXY_URL=http://localhost:8443/
docker-compose -f docker/docker-compose.openclaw.yml \
  -f docker/docker-compose.openclaw.override.yml up -d
npm run test:e2e
```
- [ ] Tests pass with custom proxy URL
- [ ] Gateway accessible through proxy
- [ ] Token preserved in URL
- [ ] Path merging works correctly

### Step 4: Test Hostname Variations
- [ ] ProxyUrl with external domain: `https://gateway.example.com/`
- [ ] ProxyUrl with localhost: `http://localhost:8443/`
- [ ] ProxyUrl with IP: `http://192.168.1.100:18789/`
- [ ] ProxyUrl with base path: `https://api.example.com/gateway/`

### Step 5: Verify Path Merging
- [ ] No double slashes in final URL
- [ ] Base path preserved: `/api/` + `/dashboard/` = `/api/dashboard/`
- [ ] Trailing slashes normalized
- [ ] Query parameters preserved (if any)

### Step 6: Verify Token Preservation
- [ ] Token extracted from container response
- [ ] Token appended as hash fragment: `#token=xyz`
- [ ] Token not duplicated or corrupted
- [ ] Authentication works through proxy

---

## E2E Test Files Ready for Validation

| File | Tests | ProxyUrl Scenarios |
|------|-------|-------------------|
| gateway-management.spec.ts | 3 | Start/stop through proxy, status verification |
| openclaw-installation.spec.ts | 3 | Installation, gateway reachable through proxy |
| onboarding-auth.spec.ts | 9 | Auth flow, token preservation through proxy |
| balance-polling.spec.ts | 5 | Balance polling through custom endpoint |
| settings-occ-credits.spec.ts | 5 | Settings accessible with proxy auth |
| docker-setup.spec.ts | 7 | Config flow with proxy URL settings |
| docker-to-ide-flow.spec.ts | 9 | Full flow through proxy with path merging |
| gateway-proxy-paths.spec.ts | 10 | Path operations, trailing slashes, URL merging |
| home-panel.spec.ts | 4 | Panel renders with proxy-configured gateway |
| smoke.spec.ts | 3 | Server reachable through proxy setup |
| ci-integration.spec.ts | 8 | CI tests with proxy configuration |
| navigation.spec.ts | 3 | Navigation with proxy setup |
| snapshots.spec.ts | 3 | Visual regression with proxy endpoint |
| test-docker-config.spec.ts | 9 | Docker config flow validation |

**Total: 14 files, 60+ scenarios, all ready for proxyUrl validation**

---

## Success Criteria

✅ All 14 E2E test files pass with default config (no proxyUrl)
✅ All 14 E2E test files pass with GATEWAY_PROXY_URL configured
✅ Token preserved in URL through proxy
✅ Path merging works without double slashes
✅ ProxyUrl takes precedence over port mapping
✅ Trailing slash variations handled correctly
✅ Multiple hostname formats (domain, localhost, IP) work
✅ Base path scenarios work correctly
✅ Authentication maintains through proxy
✅ No errors in extension logs regarding URL construction

---

## Next Actions

1. Start Docker with proxyUrl configuration
2. Run full E2E test suite
3. Document findings
4. Fix any issues discovered
5. Create validation report
