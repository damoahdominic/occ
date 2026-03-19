# Core Extension Refactor Plan

## Current State (`extensions/openclaw/`)

The OpenClaw extension is currently a **monolithic single-host manager**:

| File | Lines | Responsibility |
|---|---|---|
| `extension.ts` | 806 | Activation, balance bar, JWT sync, backend polling |
| `panels/home.ts` | 4,502 | Install wizard, gateway management, full home panel webview |
| `panels/config.ts` | 589 | Config proxy for gateway dashboard |
| `panels/setup.ts` | 687 | Channel manager / control center panel |
| `panels/status.ts` | 937 | Status panel webview |
| `panels/onboarding.ts` | 340 | Onboarding flow |
| `panels/config-path.ts` | 43 | Config path resolution |
| **Total** | **~7,900** | |

### Hard-Coded Local Assumptions (must be abstracted)

```typescript
// extension.ts — hardcoded localhost
const r = await fetch('https://occ.mba.sh/api/v1/me', ...);  // ← backend polling, keep as-is (account-level)
function isWebServerReachable(): Promise<boolean> {
  const url = `http://localhost:${port}/`;  // ← must use activeHost.getGatewayUrl()
}

// home.ts — hardcoded local CLI
cp.spawn('openclaw', ['gateway', 'start'], ...);  // ← must use activeHost.exec('openclaw', ['gateway', 'start'])
fs.readFileSync(configPath, 'utf-8');              // ← must use activeHost.readTextFile(configPath)
cp.exec('which openclaw', ...);                    // ← must use activeHost.exec('which', ['openclaw'])

// config.ts — hardcoded localhost proxy
http.request({ hostname: '127.0.0.1', port: targetPort, ... });  // ← must use activeHost gateway URL

// setup.ts — hardcoded local config
fs.readFileSync(configPath, "utf-8");              // ← must use activeHost.readTextFile()
```

## Refactor Plan

### Phase 1: Extract Host Abstraction Layer

Create new files in `extensions/openclaw/src/`:

```
src/
├── hosts/
│   ├── types.ts              # HostAdapter, HostConnection, HostEntry interfaces
│   ├── registry.ts           # HostRegistry class — manages ~/.occ/hosts.json
│   ├── manager.ts            # HostManager — active host state, adapter registration
│   └── cache.ts              # Host cache read/write
├── api/
│   └── exports.ts            # OpenClawCoreAPI implementation (exported to other extensions)
├── ui/
│   ├── hostPicker.ts         # Status bar host picker + Quick Pick
│   ├── hostTree.ts           # Sidebar TreeDataProvider for host list
│   └── addHostWizard.ts      # Multi-step input wizard for adding hosts
├── panels/                   # (existing, to be refactored)
│   ├── home.ts               # Refactored to use activeHost instead of local calls
│   ├── config.ts
│   ├── setup.ts
│   ├── status.ts
│   └── onboarding.ts
└── extension.ts              # Refactored activation
```

### Phase 2: New — `HostRegistry` Class

```typescript
// src/hosts/registry.ts
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const OCC_DIR = path.join(os.homedir(), '.occ');
const HOSTS_FILE = path.join(OCC_DIR, 'hosts.json');

export class HostRegistry {
  private hosts: Map<string, HostEntry> = new Map();
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;
  
  constructor() {
    this.load();
    // Watch for external changes to hosts.json
    this.startFileWatcher();
  }
  
  load(): void {
    if (!fs.existsSync(HOSTS_FILE)) {
      this.initializeDefaults();
      return;
    }
    const data = JSON.parse(fs.readFileSync(HOSTS_FILE, 'utf-8'));
    this.hosts.clear();
    for (const entry of data.hosts) {
      this.hosts.set(entry.id, entry);
    }
  }
  
  private initializeDefaults(): void {
    // Create ~/.occ/ and seed with local-default host
    fs.mkdirSync(OCC_DIR, { recursive: true });
    const defaultHost: HostEntry = {
      id: 'local-default',
      type: 'local',
      label: 'This Machine',
      connection: { type: 'local' },
      default: true,
      createdAt: new Date().toISOString(),
    };
    this.hosts.set(defaultHost.id, defaultHost);
    this.save();
  }
  
  save(): void {
    const data = {
      version: 1,
      activeHostId: this.getActiveHostId(),
      hosts: Array.from(this.hosts.values()),
    };
    fs.mkdirSync(OCC_DIR, { recursive: true });
    fs.writeFileSync(HOSTS_FILE, JSON.stringify(data, null, 2), 'utf-8');
  }
  
  addHost(entry: HostEntry): void { ... }
  removeHost(id: string): void { ... }
  updateHost(id: string, updates: Partial<HostEntry>): void { ... }
  getHost(id: string): HostEntry | undefined { ... }
  getAllHosts(): HostEntry[] { ... }
  getActiveHostId(): string { ... }
  setActiveHostId(id: string): void { ... }
}
```

### Phase 3: New — `HostManager` Class

```typescript
// src/hosts/manager.ts
export class HostManager implements vscode.Disposable {
  private adapters: Map<string, HostAdapter> = new Map();
  private connections: Map<string, HostConnection> = new Map();
  private activeHostId: string | undefined;
  
  private _onDidChangeActiveHost = new vscode.EventEmitter<HostConnection | undefined>();
  readonly onDidChangeActiveHost = this._onDidChangeActiveHost.event;
  
  constructor(
    private registry: HostRegistry,
    private context: vscode.ExtensionContext,
  ) {
    // Auto-connect to the default host on startup
    const activeId = registry.getActiveHostId();
    if (activeId) {
      void this.setActiveHost(activeId);
    }
  }
  
  registerAdapter(adapter: HostAdapter): vscode.Disposable {
    this.adapters.set(adapter.type, adapter);
    // Auto-connect any hosts of this type that were waiting
    for (const host of this.registry.getAllHosts()) {
      if (host.type === adapter.type && host.id === this.activeHostId) {
        void this.connectHost(host);
      }
    }
    return new vscode.Disposable(() => this.adapters.delete(adapter.type));
  }
  
  async setActiveHost(id: string): Promise<void> {
    const entry = this.registry.getHost(id);
    if (!entry) throw new Error(`Host not found: ${id}`);
    
    // Disconnect current
    const current = this.connections.get(this.activeHostId ?? '');
    if (current) { current.dispose(); }
    
    this.activeHostId = id;
    this.registry.setActiveHostId(id);
    
    await this.connectHost(entry);
    this._onDidChangeActiveHost.fire(this.getActiveConnection());
  }
  
  private async connectHost(entry: HostEntry): Promise<void> {
    const adapter = this.adapters.get(entry.type);
    if (!adapter) {
      // Adapter not installed — prompt user
      void vscode.window.showWarningMessage(
        `Install the OpenClaw ${entry.type} extension to connect to "${entry.label}"`,
        'Install'
      ).then(choice => {
        if (choice === 'Install') {
          vscode.commands.executeCommand('workbench.extensions.search', `occ.openclaw-${entry.type}`);
        }
      });
      return;
    }
    
    const connection = await adapter.connect(entry.connection);
    this.connections.set(entry.id, connection);
  }
  
  getActiveConnection(): HostConnection | undefined {
    return this.connections.get(this.activeHostId ?? '');
  }
}
```

### Phase 4: Refactor `home.ts`

The biggest file (4,502 lines). Key changes:

```typescript
// BEFORE (home.ts)
cp.spawn('openclaw', ['gateway', 'start'], { ... });

// AFTER
const host = this.hostManager.getActiveConnection();
if (host) {
  const result = await host.gatewayStart();
  // ... handle result
} else {
  // Show "no host connected" state
}
```

```typescript
// BEFORE
function isInstalled(): boolean {
  try { cp.execSync('which openclaw', ...); return true; } catch { return false; }
}

// AFTER
async function isInstalled(host: HostConnection): Promise<boolean> {
  const result = await host.exec('which', ['openclaw']);
  return result.exitCode === 0;
}
```

```typescript
// BEFORE  
const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
const raw = fs.readFileSync(configPath, 'utf-8');

// AFTER
const config = await host.readConfig();
```

### What Stays in Core (Does NOT Move to Adapters)

- **OCC account/auth** (`occAuthProvider.ts`, JWT management) — this is account-level, not host-level
- **Balance bar** — shows user's OCC balance, independent of which host is active
- **Onboarding flow** — account creation at occ.mba.sh
- **Model configuration** — BYOK settings, LLM provider config

### What Gets Abstracted (Host-Dependent)

- **Gateway start/stop/restart/status**
- **OpenClaw install/update/uninstall**
- **Config file read/write**
- **CLI command execution** (doctor, channels, etc.)
- **Log file reading**
- **File system operations** (workspace files, AGENTS.md, etc.)

## New Commands

```json
{
  "commands": [
    { "command": "occ.hosts.pick", "title": "OCC: Switch Host" },
    { "command": "occ.hosts.add", "title": "OCC: Add Host" },
    { "command": "occ.hosts.remove", "title": "OCC: Remove Host" },
    { "command": "occ.hosts.edit", "title": "OCC: Edit Host" },
    { "command": "occ.hosts.refresh", "title": "OCC: Refresh Host Status" },
    { "command": "occ.hosts.refreshAll", "title": "OCC: Refresh All Hosts" },
    { "command": "occ.hosts.openExplorer", "title": "OCC: Open Host in Explorer" },
    { "command": "occ.hosts.openTerminal", "title": "OCC: Open Host Terminal" },
    { "command": "occ.hosts.discover", "title": "OCC: Discover Available Hosts" }
  ]
}
```

## New Contribution Points

```json
{
  "viewsContainers": {
    "activitybar": [
      {
        "id": "occ-hosts",
        "title": "OpenClaw Hosts",
        "icon": "$(server)"
      }
    ]
  },
  "views": {
    "occ-hosts": [
      {
        "id": "occ.hostsView",
        "name": "Hosts",
        "icon": "$(server)",
        "contextualTitle": "OpenClaw Hosts"
      }
    ]
  }
}
```
