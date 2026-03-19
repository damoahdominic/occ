# Security — Credential & Access Management

## Threat Model

The MultiHost feature introduces new attack surfaces:

| Threat | Vector | Impact | Mitigation |
|---|---|---|---|
| Credential theft | `~/.occ/hosts.json` contains hostnames/IPs | Reconnaissance | File permissions `0600`, no passwords in JSON |
| SSH key exposure | Adapter reads private keys | Full host compromise | Never store key content — only paths. Keys stay in `~/.ssh/` |
| API token leak | MoltPod token in memory | Account takeover | Use VS Code `SecretStorage` (encrypted at rest) |
| MITM on SSH | First-connect trust | Command injection | Verify host fingerprint against `~/.ssh/known_hosts` |
| Container escape | Docker exec runs as root | Host compromise | Document risks, recommend rootless Docker |
| Malicious adapter | Third-party extension registers adapter | Arbitrary exec | Require `occ.openclaw` dependency, adapter sandboxing |
| Gateway proxy hijack | Forwarded port exposed | Data interception | Bind to `127.0.0.1` only, never `0.0.0.0` |

## Credential Storage Rules

### What Goes Where

| Credential | Storage | Why |
|---|---|---|
| SSH key **path** | `~/.occ/hosts.json` | Just a reference, not the key itself |
| SSH key **content** | `~/.ssh/` (user's own) | Never copied elsewhere |
| SSH passphrase | VS Code `SecretStorage` | Encrypted at rest by VS Code, optional "remember" |
| SSH password | **Never stored** | Prompted every time (password auth discouraged) |
| MoltPod API token | VS Code `SecretStorage` | Encrypted, managed via `AuthenticationProvider` |
| OCC account JWT | VS Code `SecretStorage` | Already handled by `occAuthProvider.ts` |
| Docker credentials | Docker's own config | We never handle Docker auth directly |

### `SecretStorage` Usage

```typescript
// Store a secret
await context.secrets.store('occ.ssh.passphrase.ssh-vps-prod', passphrase);

// Retrieve a secret
const passphrase = await context.secrets.get('occ.ssh.passphrase.ssh-vps-prod');

// Delete a secret
await context.secrets.delete('occ.ssh.passphrase.ssh-vps-prod');

// Key naming convention:
// occ.{adapter}.{type}.{hostId}
// Examples:
//   occ.ssh.passphrase.ssh-my-vps
//   occ.cloud.token.cloud-pod-abc
```

### What Never Leaves the Machine

- SSH private keys — read from disk into `ssh2` library's memory, never transmitted to any server
- Passphrases — prompted via VS Code input, optionally cached in `SecretStorage`, never logged
- MoltPod tokens — stored encrypted, sent only to `api.moltpod.com` over HTTPS

## SSH Security

### Host Key Verification

```typescript
async function verifyHostKey(host: string, key: Buffer, fingerprint: string): Promise<boolean> {
  // Check known_hosts first
  const knownHostsPath = path.join(os.homedir(), '.ssh', 'known_hosts');
  if (isKnownHost(knownHostsPath, host, fingerprint)) {
    return true;
  }
  
  // Unknown host — prompt user
  const choice = await vscode.window.showWarningMessage(
    `The authenticity of host '${host}' can't be established.\n` +
    `Key fingerprint is ${fingerprint}.\n` +
    `Are you sure you want to continue connecting?`,
    { modal: true },
    'Yes, add to known_hosts',
    'Yes, just this once',
    'No'
  );
  
  if (choice === 'Yes, add to known_hosts') {
    appendToKnownHosts(knownHostsPath, host, key);
    return true;
  }
  return choice === 'Yes, just this once';
}
```

### Key Authentication Order

```typescript
// Try authentication methods in order of security:
const authMethods = [
  // 1. SSH Agent (most secure — keys never leave the agent)
  tryAgentAuth,
  // 2. Key file (secure if key has passphrase)
  tryKeyAuth,
  // 3. Password (least secure — discouraged)
  tryPasswordAuth,
];
```

### Agent Forwarding

**Disabled by default.** Can be enabled per-host:

```json
{
  "id": "ssh-my-vps",
  "connection": {
    "type": "ssh",
    "host": "example.com",
    "agentForward": true  // ← explicit opt-in
  }
}
```

Warning when enabled:
```
⚠️ Agent forwarding is enabled for this host. This allows the remote server
to use your local SSH keys. Only enable this for trusted servers.
```

## Docker Security

### Container Exec Permissions

`docker exec` runs commands as the container's default user (often root). Document this:

```
⚠️ Commands run inside the container as the container's default user.
If the container runs as root, all file operations have root access
inside the container.
```

### Docker Socket Access

The adapter accesses Docker via the local socket (`/var/run/docker.sock`). This is equivalent to root access on the host machine. The adapter:

- Never exposes the Docker socket to remote connections
- Only executes commands the user explicitly triggers
- Never modifies container configuration (only `exec` and `cp`)

### Remote Docker Hosts

When `dockerHost` is set to a remote Docker daemon (`tcp://` or `ssh://`):

```typescript
if (config.dockerHost && config.dockerHost.startsWith('tcp://')) {
  const useTLS = config.dockerHost.includes(':2376');
  if (!useTLS) {
    vscode.window.showWarningMessage(
      'Connecting to a remote Docker daemon over unencrypted TCP. ' +
      'This is insecure. Consider using ssh:// or enabling TLS.'
    );
  }
}
```

## Cloud (MoltPod) Security

### OAuth Flow

```
1. User clicks "Sign in to MoltPod"
2. OCCode opens browser: https://moltpod.com/oauth/authorize?...
3. User authenticates on moltpod.com (we never see the password)
4. MoltPod redirects to vscode://occ.openclaw-cloud/auth/callback?code=...
5. Extension exchanges code for access token
6. Token stored in SecretStorage
```

### API Token Scope

Request minimal scopes:
- `pods:read` — list and view pods
- `pods:manage` — start, stop, exec, file access
- NOT `pods:delete` — require explicit re-auth for destructive actions
- NOT `billing:*` — billing managed via web dashboard

### Token Refresh

```typescript
class MoltPodAPIClient {
  private async request(path: string, options?: RequestInit): Promise<Response> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });
    
    if (response.status === 401) {
      // Token expired — trigger re-auth
      await this.refreshToken();
      // Retry once
      return fetch(`${this.baseUrl}${path}`, {
        ...options,
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          ...options?.headers,
        },
      });
    }
    
    return response;
  }
}
```

## File Permission Hardening

```typescript
// On first launch and after any write to ~/.occ/
function hardenPermissions(): void {
  const occDir = path.join(os.homedir(), '.occ');
  
  if (process.platform !== 'win32') {
    // Directory: owner-only
    fs.chmodSync(occDir, 0o700);
    
    // hosts.json: owner-only (contains hostnames/IPs)
    const hostsFile = path.join(occDir, 'hosts.json');
    if (fs.existsSync(hostsFile)) {
      fs.chmodSync(hostsFile, 0o600);
    }
    
    // Cache files: owner-only (may contain agent names, channel info)
    const hostsDir = path.join(occDir, 'hosts');
    if (fs.existsSync(hostsDir)) {
      for (const dir of fs.readdirSync(hostsDir)) {
        const cachePath = path.join(hostsDir, dir, 'cache.json');
        if (fs.existsSync(cachePath)) {
          fs.chmodSync(cachePath, 0o600);
        }
      }
    }
  }
}
```

## Adapter Trust Model

Third-party extensions can register as host adapters. Security controls:

1. **Extension dependency required** — must declare `"extensionDependencies": ["occ.openclaw"]`
2. **User consent** — VS Code shows a trust dialog when an extension wants to register as an adapter
3. **Sandboxed registration** — adapters can only:
   - Register themselves as a host type
   - Respond to connect/discover/test calls
   - They cannot access other adapters' connections or the host registry directly
4. **Audit logging** — all adapter registrations logged to `~/.occ/logs/`

```typescript
registerHostAdapter(adapter: HostAdapter): vscode.Disposable {
  // Log the registration
  this.log(`Adapter registered: ${adapter.type} (${adapter.displayName}) from extension ${callerId}`);
  
  // Validate adapter implements the full interface
  if (!adapter.type || !adapter.connect || !adapter.discover) {
    throw new Error('Invalid adapter: missing required methods');
  }
  
  // Prevent duplicate type registration
  if (this.adapters.has(adapter.type)) {
    throw new Error(`Adapter type "${adapter.type}" is already registered`);
  }
  
  this.adapters.set(adapter.type, adapter);
  return new vscode.Disposable(() => this.adapters.delete(adapter.type));
}
```

## Logging & Audit

### What Gets Logged

```
~/.occ/logs/occ-client.log
```

```
[2026-03-19T10:15:00Z] Host connected: ssh-vps-prod (SSH)
[2026-03-19T10:15:01Z] Gateway health check: running (v2026.3.19)
[2026-03-19T10:20:00Z] Command executed: openclaw gateway restart (exit: 0)
[2026-03-19T10:25:00Z] Host disconnected: ssh-vps-prod (connection lost)
[2026-03-19T10:25:05Z] Reconnect attempt: ssh-vps-prod
[2026-03-19T10:25:06Z] Host connected: ssh-vps-prod (SSH)
```

### What Never Gets Logged

- Passwords, passphrases, or tokens
- File contents
- Command output (only exit codes)
- SSH key paths or fingerprints
