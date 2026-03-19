# Testing Strategy

## Test Pyramid

```
         ╱ ╲
        ╱ E2E ╲           2-3 per adapter (real hosts)
       ╱───────╲
      ╱ Integr. ╲         5-10 per adapter (mock hosts)
     ╱───────────╲
    ╱  Unit Tests  ╲       20-30 per module
   ╱─────────────────╲
```

## Unit Tests

### Core Extension

```typescript
// tests/hosts/registry.test.ts
describe('HostRegistry', () => {
  it('creates ~/.occ/ and seeds hosts.json on first launch', () => { ... });
  it('reads existing hosts.json', () => { ... });
  it('adds a host and saves', () => { ... });
  it('removes a host and saves', () => { ... });
  it('handles corrupted hosts.json gracefully', () => { ... });
  it('handles missing ~/.occ/ directory', () => { ... });
  it('sets file permissions to 0600', () => { ... });
  it('fires onDidChange when hosts.json changes externally', () => { ... });
  it('migrates from v1 to v2 schema', () => { ... });
});

// tests/hosts/manager.test.ts
describe('HostManager', () => {
  it('registers an adapter', () => { ... });
  it('prevents duplicate adapter registration', () => { ... });
  it('connects to active host on startup', () => { ... });
  it('switches active host', () => { ... });
  it('disconnects previous host when switching', () => { ... });
  it('fires onDidChangeActiveHost', () => { ... });
  it('prompts to install adapter for unknown host type', () => { ... });
  it('handles adapter connection failure', () => { ... });
  it('returns undefined when no host is active', () => { ... });
});

// tests/hosts/cache.test.ts
describe('HostCache', () => {
  it('reads cache from disk', () => { ... });
  it('writes cache to disk', () => { ... });
  it('returns empty state when cache missing', () => { ... });
  it('handles corrupted cache file', () => { ... });
});
```

### Local Adapter

```typescript
// tests/local/adapter.test.ts
describe('LocalHostAdapter', () => {
  it('discovers local OpenClaw installation', () => { ... });
  it('returns empty when OpenClaw not installed', () => { ... });
  it('test connection succeeds with OpenClaw installed', () => { ... });
  it('test connection reports gateway status', () => { ... });
  it('returns minimal config fields', () => { ... });
});

// tests/local/connection.test.ts
describe('LocalHostConnection', () => {
  it('exec runs command via child_process', () => { ... });
  it('exec handles timeout', () => { ... });
  it('exec captures stdout and stderr', () => { ... });
  it('readTextFile reads from local filesystem', () => { ... });
  it('writeTextFile creates parent directories', () => { ... });
  it('stat returns file info', () => { ... });
  it('stat returns null for missing file', () => { ... });
  it('readDirectory lists directory contents', () => { ... });
  it('readConfig parses openclaw.json', () => { ... });
  it('getGatewayUrl returns localhost with configured port', () => { ... });
  it('gatewayHealthCheck detects running gateway', () => { ... });
  it('gatewayHealthCheck detects stopped gateway', () => { ... });
  it('expandPath handles tilde', () => { ... });
});
```

### Docker Adapter

```typescript
// tests/docker/adapter.test.ts
describe('DockerHostAdapter', () => {
  it('discovers containers with openclaw label', () => { ... });
  it('discovers containers with openclaw binary', () => { ... });
  it('returns empty when no Docker containers running', () => { ... });
  it('returns empty when Docker not installed', () => { ... });
  it('test connection checks OpenClaw inside container', () => { ... });
  it('returns Docker-specific config fields', () => { ... });
});

// tests/docker/connection.test.ts
describe('DockerHostConnection', () => {
  it('exec routes through docker exec', () => { ... });
  it('exec with cwd sets -w flag', () => { ... });
  it('exec with env sets -e flags', () => { ... });
  it('readTextFile uses docker exec cat', () => { ... });
  it('writeTextFile uses docker exec tee', () => { ... });
  it('readFile uses docker cp for binary', () => { ... });
  it('writeFile uses docker cp', () => { ... });
  it('openTerminal creates docker exec -it terminal', () => { ... });
  it('compose mode routes through docker compose exec', () => { ... });
  it('getGatewayUrl uses port mapping', () => { ... });
});
```

### SSH Adapter

```typescript
// tests/ssh/adapter.test.ts
describe('SSHHostAdapter', () => {
  it('parses ~/.ssh/config for host entries', () => { ... });
  it('skips wildcard hosts in config', () => { ... });
  it('returns SSH-specific config fields', () => { ... });
  it('validates config — requires host or sshConfigHost', () => { ... });
  it('validates config — checks key file exists', () => { ... });
});

// tests/ssh/connection.test.ts (uses mock ssh2)
describe('SSHHostConnection', () => {
  it('connects with key auth', () => { ... });
  it('connects with agent auth', () => { ... });
  it('exec runs command over SSH', () => { ... });
  it('exec escapes arguments properly', () => { ... });
  it('exec handles command timeout', () => { ... });
  it('readTextFile uses SSH exec cat', () => { ... });
  it('writeTextFile uses SFTP', () => { ... });
  it('readFile uses SFTP stream', () => { ... });
  it('forwardGatewayPort creates SSH tunnel', () => { ... });
  it('reconnects on connection drop', () => { ... });
  it('dispose cleans up forwarded ports', () => { ... });
});

// tests/ssh/config-parser.test.ts
describe('SSHConfigParser', () => {
  it('parses basic Host block', () => { ... });
  it('parses Host with HostName override', () => { ... });
  it('handles comments', () => { ... });
  it('handles multiple Host blocks', () => { ... });
  it('handles Host with Port and User', () => { ... });
  it('handles indented and non-indented styles', () => { ... });
});
```

### Cloud Adapter

```typescript
// tests/cloud/adapter.test.ts
describe('CloudHostAdapter', () => {
  it('discovers pods when authenticated', () => { ... });
  it('returns empty when not authenticated', () => { ... });
  it('prompts sign-in when no token', () => { ... });
});

// tests/cloud/connection.test.ts (uses mock API)
describe('CloudHostConnection', () => {
  it('exec calls /pods/{id}/exec API', () => { ... });
  it('readTextFile calls /pods/{id}/files API', () => { ... });
  it('writeTextFile calls PUT /pods/{id}/files API', () => { ... });
  it('getGatewayUrl returns MoltPod proxy URL', () => { ... });
  it('handles 401 and triggers re-auth', () => { ... });
});

// tests/cloud/filesystem.test.ts
describe('CloudFileSystemProvider', () => {
  it('stat returns file info from API', () => { ... });
  it('readDirectory returns entries from API', () => { ... });
  it('readFile returns content from API', () => { ... });
  it('writeFile calls PUT API', () => { ... });
  it('fires onDidChangeFile after write', () => { ... });
});
```

## Integration Tests

### Mock Host Server

Create a lightweight mock server for integration tests:

```typescript
// test-utils/mock-host.ts
export class MockHost {
  private files: Map<string, string> = new Map();
  private gateway: { running: boolean; version: string } = { running: true, version: '2026.3.19' };
  
  constructor() {
    // Seed with default OpenClaw config
    this.files.set('/root/.openclaw/openclaw.json', JSON.stringify({
      agents: { list: [{ id: 'main' }] },
      channels: { whatsapp: { enabled: true } },
      gateway: { port: 18789 },
    }));
  }
  
  async exec(command: string, args: string[]): Promise<ExecResult> {
    if (command === 'openclaw' && args[0] === 'status' && args[1] === '--json') {
      return { exitCode: 0, stdout: JSON.stringify(this.gateway), stderr: '' };
    }
    if (command === 'openclaw' && args[0] === 'gateway' && args[1] === 'start') {
      this.gateway.running = true;
      return { exitCode: 0, stdout: 'Gateway started', stderr: '' };
    }
    if (command === 'which' && args[0] === 'openclaw') {
      return { exitCode: 0, stdout: '/usr/local/bin/openclaw', stderr: '' };
    }
    return { exitCode: 127, stdout: '', stderr: `Command not found: ${command}` };
  }
  
  async readFile(path: string): Promise<string> {
    const content = this.files.get(path);
    if (!content) throw new Error(`ENOENT: ${path}`);
    return content;
  }
  
  async writeFile(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }
}
```

### Docker Integration Test Setup

```dockerfile
# test-utils/Dockerfile.test-host
FROM node:20-slim
RUN npm install -g openclaw@latest
RUN openclaw doctor --non-interactive || true
EXPOSE 18789
CMD ["sleep", "infinity"]
```

```bash
# Run Docker integration tests
docker build -t occ-test-host -f test-utils/Dockerfile.test-host .
docker run -d --name occ-test-host -p 28789:18789 occ-test-host

npx jest tests/docker/integration.test.ts

docker rm -f occ-test-host
```

### SSH Integration Test Setup

```bash
# Use Docker to create an SSH-accessible test host
docker run -d --name occ-test-ssh -p 2222:22 \
  -e SSH_ENABLE_ROOT=true \
  -e SSH_ENABLE_ROOT_PASSWORD_AUTH=true \
  -e ROOT_PASSWORD=testpass \
  linuxserver/openssh-server

# Install OpenClaw inside
docker exec occ-test-ssh bash -c "curl -fsSL https://install.openclaw.ai | bash"

# Run SSH integration tests
SSH_TEST_HOST=localhost SSH_TEST_PORT=2222 SSH_TEST_USER=root SSH_TEST_PASS=testpass \
  npx jest tests/ssh/integration.test.ts

docker rm -f occ-test-ssh
```

## End-to-End Tests

These test the full flow through the VS Code extension host:

```typescript
// e2e/multihost.test.ts
describe('MultiHost E2E', () => {
  it('fresh install creates ~/.occ/ with local-default', async () => {
    // Launch VS Code with clean profile
    // Verify ~/.occ/hosts.json exists with local-default
    // Verify no host picker visible (only 1 host)
  });
  
  it('adding a second host shows the host picker', async () => {
    // Add a Docker host via command palette
    // Verify host picker appears in status bar
    // Verify sidebar tree shows both hosts
  });
  
  it('switching hosts updates the control center', async () => {
    // Select host A → verify control center shows host A config
    // Switch to host B → verify control center shows host B config
  });
  
  it('gateway start/stop works on non-local host', async () => {
    // Connect to Docker host
    // Start gateway → verify health check passes
    // Stop gateway → verify health check fails
  });
});
```

## CI Pipeline

```yaml
# .github/workflows/test.yml
name: MultiHost Tests
on: [push, pull_request]

jobs:
  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm test -- --coverage

  integration-docker:
    runs-on: ubuntu-latest
    services:
      test-host:
        image: occ-test-host
        ports: ['28789:18789']
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npx jest tests/docker/integration.test.ts

  integration-ssh:
    runs-on: ubuntu-latest
    services:
      ssh-host:
        image: linuxserver/openssh-server
        ports: ['2222:22']
        env:
          SSH_ENABLE_ROOT: true
          ROOT_PASSWORD: testpass
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: |
          SSH_TEST_HOST=localhost SSH_TEST_PORT=2222 \
          npx jest tests/ssh/integration.test.ts
```
