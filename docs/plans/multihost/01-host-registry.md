# Host Registry — `~/.occ/`

## Why `.occ/` Not `.openclaw/`

- `~/.openclaw/` is owned by the **OpenClaw runtime** (gateway, agents, config, sessions)
- `~/.occ/` is owned by the **OCCode desktop client** (host registry, cached state, app preferences)
- They coexist on the same machine but serve different purposes
- On a remote host, only `~/.openclaw/` exists. The user's laptop has both.

## Directory Structure

```
~/.occ/
├── hosts.json                    # Host registry — the source of truth
├── settings.json                 # App-level preferences (theme, default host, etc.)
├── hosts/
│   ├── local-default/
│   │   ├── cache.json            # Last-known gateway status, version, agent count
│   │   └── identity.json         # Cached host identity (hostname, OS, OpenClaw version)
│   ├── docker-mypod/
│   │   ├── cache.json
│   │   └── identity.json
│   └── ssh-vps-prod/
│       ├── cache.json
│       ├── identity.json
│       └── known_config.json     # Last-fetched openclaw.json snapshot (for offline viewing)
└── logs/
    └── occ-client.log            # Client-side diagnostic log
```

## `hosts.json` Schema

> **Note — ticket-053 (persist-host-choice-and-gateway-control).** `activeHostId`
> alone is **not sufficient** to infer "user has completed setup". The host
> registry seeds `activeHostId = "local"` on a fresh install (see `registry.ts`
> `makeEmptyHostsFile()`), and `getActiveHostId()` also falls back to the string
> `"local"` when `hosts.json` is missing. That makes the default `"local"`
> indistinguishable from an explicit local choice, and would strand a user on a
> Status page whenever the gateway happens to be down. ticket-053 introduces an
> explicit-choice marker (see that ticket's §2.4 Technical Considerations for
> the chosen mechanism — most likely a sibling `HostsFile.explicitChoice: boolean`
> or a per-host `HostEntry.setupCompletedAt`) that setup wizards flip on success,
> and that `HomePanel._update()` reads before deciding picker-vs-Status.

```typescript
interface HostsFile {
  version: 1;
  activeHostId: string;           // Currently selected host
  hosts: HostEntry[];
}

interface HostEntry {
  // ── Identity ──
  id: string;                     // Unique ID (slug format: "local-default", "ssh-my-vps")
  type: "local" | "docker" | "ssh" | "cloud";
  label: string;                  // User-friendly name shown in picker
  
  // ── Connection ──
  // Fields vary by type — see type-specific schemas below
  connection: LocalConnection | DockerConnection | SSHConnection | CloudConnection;
  
  // ── Preferences ──
  configPath?: string;            // Override path to openclaw.json on the host (default: ~/.openclaw/openclaw.json)
  default?: boolean;              // Auto-select on app launch
  color?: string;                 // Accent color for visual distinction in UI
  tags?: string[];                // User-defined tags for organization
  
  // ── Metadata (auto-populated) ──
  createdAt: string;              // ISO 8601
  lastConnectedAt?: string;       // ISO 8601
  lastStatus?: "online" | "offline" | "error";
  lastError?: string;
}
```

### Local Connection

```typescript
interface LocalConnection {
  type: "local";
  // No additional fields — uses the local filesystem and process directly
  // configPath defaults to ~/.openclaw/openclaw.json
}
```

### Docker Connection

```typescript
interface DockerConnection {
  type: "docker";
  containerId?: string;           // Container ID or name (e.g., "openclaw-pod-1")
  containerLabel?: string;        // Docker label filter (e.g., "com.openclaw=true")
  composeService?: string;        // Docker Compose service name
  composeFile?: string;           // Path to docker-compose.yml
  dockerHost?: string;            // DOCKER_HOST override (e.g., "ssh://user@remote")
  shell?: string;                 // Shell to use inside container (default: "/bin/sh")
  portMappings?: {
    gateway?: number;             // Host port mapped to container's gateway port
  };
}
```

### SSH Connection

```typescript
interface SSHConnection {
  type: "ssh";
  host: string;                   // Hostname or IP
  port?: number;                  // SSH port (default: 22)
  user: string;                   // SSH username
  authMethod: "key" | "agent" | "password";
  keyPath?: string;               // Path to private key (for authMethod: "key")
  passphrase?: boolean;           // Whether key has a passphrase (triggers prompt)
  jumpHost?: string;              // ProxyJump / bastion host
  gatewayPort?: number;           // OpenClaw gateway port on remote (default: 18789)
  sshConfigHost?: string;         // Reference to ~/.ssh/config Host entry (overrides all above)
}
```

### Cloud (MoltPod) Connection

```typescript
interface CloudConnection {
  type: "cloud";
  provider: "moltpod";           // Extensible for future providers
  podId: string;                  // MoltPod pod ID
  apiEndpoint?: string;           // API base URL (default: https://api.moltpod.com)
  // Auth token stored in VS Code SecretStorage, not in this file
}
```

## Host Lifecycle

### Adding a Host

```
User clicks "Add Host" in sidebar
    → Quick Pick: "Local | Docker | SSH | Cloud"
    → Adapter's getConfigFields() returns the form fields
    → User fills in connection details
    → Core calls adapter.testConnection(config)
    → On success: write to hosts.json, create ~/.occ/hosts/{id}/
    → On failure: show error, offer to save anyway (offline-first)
```

### Connecting to a Host

```
User selects host from picker
    → Core reads hosts.json for the entry
    → Core finds the registered adapter for entry.type
    → Core calls adapter.connect(entry.connection)
    → Adapter returns a HostConnection
    → Core sets activeHostId, fires onDidChangeActiveHost
    → Control center, home panel, sidebar all re-render against new host
    → For SSH/Docker: adapter may trigger VS Code Remote window
```

### Health Check Loop

```
Every 30 seconds for the active host:
    → activeHost.healthCheck()
    → Returns: { gateway: boolean, version: string, agents: number, uptime: string }
    → Update ~/.occ/hosts/{id}/cache.json
    → Update sidebar status indicator
    → If status changed: fire onDidChangeHostStatus event

Every 5 minutes for inactive hosts:
    → Lightweight ping only (is the host reachable?)
    → Update cache.json with reachability
```

### Removing a Host

```
User right-clicks host in sidebar → "Remove Host"
    → Confirmation dialog
    → Disconnect if active
    → Remove from hosts.json
    → Delete ~/.occ/hosts/{id}/ directory
    → If it was the active host, switch to local-default
```

## Cache Schema (`cache.json`)

```typescript
interface HostCache {
  lastCheckedAt: string;           // ISO 8601
  gateway: {
    running: boolean;
    version?: string;
    uptime?: string;
    port?: number;
  };
  agents: {
    count: number;
    names: string[];
    defaultAgent?: string;
  };
  channels: {
    count: number;
    connected: string[];           // Channel names that are connected
  };
  system: {
    os?: string;                   // "macOS" | "Linux" | "Windows"
    hostname?: string;
    openclawVersion?: string;
    nodeVersion?: string;
  };
}
```

## Settings Schema (`settings.json`)

```typescript
interface OccSettings {
  version: 1;
  defaultHostId?: string;          // Host to auto-select on launch
  healthCheckIntervalMs?: number;  // Default: 30000
  backgroundCheckIntervalMs?: number; // Default: 300000
  showOfflineHosts?: boolean;      // Show unreachable hosts in picker (default: true)
  theme?: {
    hostColors?: boolean;          // Use per-host accent colors (default: true)
  };
}
```

## File Permissions

- `~/.occ/hosts.json` — `0600` (contains connection details, may include hostnames/IPs)
- `~/.occ/settings.json` — `0644` (no sensitive data)
- `~/.occ/hosts/*/cache.json` — `0600` (may contain agent names, channel info)
- SSH keys are **never** stored in `~/.occ/` — always reference paths to `~/.ssh/`
- Cloud API tokens are stored in **VS Code SecretStorage** (encrypted), not in JSON files
