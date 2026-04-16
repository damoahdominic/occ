# OpenClaw Extension Testing Guide

## Testing Without the Full Editor

Yes! You can test the extension **without running the full VS Code editor**. Here's how:

### Unit Tests (Standalone - No Editor Required)

**Path handling utilities:**
```bash
# Run proxy URL path tests
node -r tsx src/test/proxy-paths.test.ts

# Or if using npm test script:
npm test proxy-paths
```

**What it tests:**
- ✅ Adding paths to proxy URLs (+)
- ✅ Removing trailing slashes (-)
- ✅ Path normalization
- ✅ Merging dashboard URLs with proxy config
- ✅ Port rewriting (container:18789 → host:18790)
- ✅ Proxy URL precedence over port mapping

**Run time:** ~100ms (instantaneous)

**No dependencies needed:**
- No VS Code editor
- No Docker running
- No gateway service
- Pure Node.js tests

---

## Integration Tests (Require Editor)

These tests require the full editor to be running:

### Docker Tests (`src/test/docker.test.ts`)
Tests Docker environment detection caching. Requires VS Code extension context.

**Run:**
```bash
# In VS Code terminal (with extension running):
npm test docker
```

---

## E2E Tests (BDD Specs - Require Full Setup)

These tests verify the full flow with browser automation:

**Location:** `tests/e2e/gateway-proxy-paths.spec.ts`

**Requirements:**
- VS Code editor running
- OpenClaw gateway running in Docker
- Playwright test harness
- Network access to gateway

**Run:**
```bash
# From project root:
npm run test:e2e gateway-proxy-paths
```

---

## Test Hierarchy

```
Unit Tests (Standalone)
├─ proxy-paths.test.ts ← START HERE (no dependencies)
├─ Run: node -r tsx src/test/proxy-paths.test.ts
└─ Tests: URL operations, path merging, port rewriting

Integration Tests (Require Extension Context)
├─ docker.test.ts
├─ Run: npm test docker (in VS Code)
└─ Tests: Docker detection, caching

E2E Tests (Full System)
├─ gateway-proxy-paths.spec.ts
├─ Run: npm run test:e2e
└─ Tests: Full UI flow, browser integration
```

---

## What Gets Tested at Each Level

### Unit Tests (Standalone)
✅ **Can test:**
- URL construction logic
- Path addition/removal
- Port rewriting algorithms
- Edge cases and error handling
- Performance characteristics

❌ **Cannot test:**
- VS Code API integration
- Extension activation
- UI panels and webviews
- Docker daemon interaction

### Integration Tests
✅ **Can test:**
- Extension command registration
- Configuration reading
- Docker environment detection
- Webview panel creation

❌ **Cannot test:**
- Full user workflows
- Real gateway connectivity
- Browser navigation

### E2E Tests
✅ **Can test:**
- Complete workflows
- User interactions (clicks, typing)
- Real gateway connectivity
- Dashboard rendering
- Authentication flows

---

## Development Workflow

### Quick feedback (seconds)
```bash
# Test your URL logic changes fast:
node -r tsx apps/editor/extensions/openclaw/src/test/proxy-paths.test.ts
```

### Verify in editor (minutes)
```bash
# Start editor and run docker tests:
npm run watch &
# (in VS Code terminal)
npm test docker
```

### Full validation (minutes)
```bash
# Run all E2E tests with real gateway:
docker compose -f docker/docker-compose.openclaw.yml -f docker/docker-compose.openclaw.override.yml up -d
npm run test:e2e
```

---

## Adding New Tests

### For URL logic (no editor needed)
1. Add test case to `src/test/proxy-paths.test.ts`
2. Test utility function in `src/utils/proxyUrl.ts`
3. Run: `node -r tsx src/test/proxy-paths.test.ts`

### For extension behavior
1. Add test to `src/test/docker.test.ts`
2. Requires VS Code extension context
3. Run in VS Code or via extension test harness

### For full workflows
1. Add scenario to `tests/e2e/gateway-proxy-paths.spec.ts`
2. Requires running editor + gateway
3. Run: `npm run test:e2e`

---

## Debugging Tests

### Debug standalone tests
```bash
# Add console.log or use Node debugger:
node --inspect-brk -r tsx src/test/proxy-paths.test.ts
# Then open chrome://inspect
```

### Debug in VS Code
```bash
# Set breakpoints in test file
# Run test from VS Code debugger
```

### Debug E2E tests
```bash
# Playwright inspector:
PWDEBUG=1 npm run test:e2e gateway-proxy-paths
```

---

## Test Coverage

| Module | Type | Status | Coverage |
|--------|------|--------|----------|
| `utils/proxyUrl.ts` | Unit | ✅ Complete | addPathToUrl, removeTrailingSlash, normalizePath, mergeDashboardWithProxy |
| `extension.ts` | Integration | ⚠️ Partial | Docker configure flow |
| `panels/config.ts` | Integration | ⚠️ Partial | Dashboard URL construction |
| Full workflows | E2E | 🔶 Spec'd | 10 scenarios documented |

---

## CI/CD Integration

For GitHub Actions or CI pipeline:

```yaml
# Unit tests (fast, always run)
- name: Run unit tests
  run: node -r tsx apps/editor/extensions/openclaw/src/test/proxy-paths.test.ts

# E2E tests (requires docker, optional on main)
- name: Run E2E tests
  if: github.event_name == 'pull_request'
  run: |
    docker compose -f docker/docker-compose.openclaw.yml up -d
    npm run test:e2e
```

---

## Common Issues

### Test times out
- Check if gateway is running: `docker ps | grep openclaw`
- Verify port is accessible: `curl http://localhost:18789`
- Increase timeout in test: `timeout: 60000`

### URL assertion fails
- Check path joining logic in `mergeDashboardWithProxy()`
- Verify container/host port mapping is correct
- Print actual vs expected URLs for comparison

### E2E tests hang on webview
- Wait for frame to load: `await page.waitForTimeout(2000)`
- Use correct iframe selector: `page.frameLocator('iframe.webview')`
- Check VS Code is not in readonly mode
