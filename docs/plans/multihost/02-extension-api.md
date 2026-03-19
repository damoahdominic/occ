# Extension-to-Extension API

## Overview

The core `openclaw` extension exports a typed API surface that host adapter extensions consume. This follows the VS Code pattern used by GitHub Copilot, Remote SSH, and other multi-extension ecosystems.

## Core Extension Exports (`occ.openclaw`)

```typescript
// Returned from the core extension's activate() function
export interface OpenClawCoreAPI {
  readonly version: string;        // API version for compatibility checking
  
  // ── Host Registration ──
  registerHostAdapter(adapter: HostAdapter): vscode.Disposable;
  
  // ── Host State ──
  getActiveHost(): HostConnection | undefined;
  getHost(id: string): HostConnection | undefined;
  getAllHosts(): HostEntry[];
  setActiveHost(id: string): Promise<void>;
  
  // ── Events ──
  readonly onDidChangeActiveHost: vscode.Event<HostConnection | undefined>;
  readonly onDidChangeHostStatus: vscode.Event<{ hostId: string; status: HostStatus }>;
  readonly onDidAddHost: vscode.Event<HostEntry>;
  readonly onDidRemoveHost: vscode.Event<string>;  // host ID
  
  // ── Commands (for adapter extensions to invoke) ──
  showHostPicker(): Promise<string | undefined>;  // returns selected host ID
  showAddHostWizard(type?: string): Promise<HostEntry | undefined>;
  refreshHost(id: string): Promise<void>;
}
```

## Host Adapter Interface

Each adapter extension implements this interface and registers it with the core:

```typescript
interface HostAdapter {
  // ── Identity ──
  readonly type: string;           // "local" | "docker" | "ssh" | "cloud"
  readonly displayName: string;    // "Local Machine" | "Docker Container" | "SSH Remote" | "MoltPod Cloud"
  readonly icon: vscode.ThemeIcon; // Icon shown in picker and sidebar
  
  // ── Discovery ──
  // Find available hosts of this type (e.g., list Docker containers, scan SSH config)
  discover(): Promise<DiscoveredHost[]>;
  
  // ── Connection ──
  // Create a live connection to a host given its config
  connect(config: HostConnectionConfig): Promise<HostConnection>;
  
  // ── Test connection without fully connecting ──
  testConnection(config: HostConnectionConfig): Promise<TestResult>;
  
  // ── Configuration UI ──
  // Define what fields the "Add Host" wizard needs for this type
  getConfigFields(): ConfigField[];
  
  // ── Validation ──
  validateConfig(config: HostConnectionConfig): ConfigValidationResult;
}

interface DiscoveredHost {
  suggestedId: string;
  suggestedLabel: string;
  connection: HostConnectionConfig;
  metadata?: Record<string, string>;  // e.g., { containerImage: "openclaw/pod:latest" }
}

interface TestResult {
  success: boolean;
  message: string;
  details?: {
    openclawInstalled: boolean;
    openclawVersion?: string;
    gatewayRunning?: boolean;
    os?: string;
  };
}

interface ConfigField {
  id: string;
  label: string;
  type: "text" | "password" | "file" | "select" | "number" | "boolean";
  placeholder?: string;
  defaultValue?: string | number | boolean;
  required?: boolean;
  options?: { label: string; value: string }[];  // For "select" type
  validation?: {
    pattern?: string;      // Regex
    message?: string;      // Error message
    min?: number;          // For "number" type
    max?: number;
  };
  helpText?: string;       // Shown below the field
  group?: string;          // Group fields visually (e.g., "Authentication", "Advanced")
}

interface ConfigValidationResult {
  valid: boolean;
  errors: { fieldId: string; message: string }[];
}
```

## Host Connection Interface

The live connection object returned by `adapter.connect()`:

```typescript
interface HostConnection extends vscode.Disposable {
  // ── Identity ──
  readonly hostId: string;
  readonly hostEntry: HostEntry;
  readonly adapter: HostAdapter;
  
  // ── Status ──
  readonly status: HostStatus;
  readonly onDidChangeStatus: vscode.Event<HostStatus>;
  
  // ── Command Execution ──
  // Run a command on the host (equivalent of child_process.spawn)
  exec(command: string, args?: string[], options?: ExecOptions): Promise<ExecResult>;
  
  // Run a command and stream output (for long-running operations)
  execStream(command: string, args?: string[], options?: ExecOptions): ExecStream;
  
  // ── File Operations ──
  readFile(remotePath: string): Promise<Uint8Array>;
  readTextFile(remotePath: string, encoding?: string): Promise<string>;
  writeFile(remotePath: string, content: Uint8Array): Promise<void>;
  writeTextFile(remotePath: string, content: string, encoding?: string): Promise<void>;
  stat(remotePath: string): Promise<FileStat | null>;
  readDirectory(remotePath: string): Promise<DirectoryEntry[]>;
  mkdir(remotePath: string, recursive?: boolean): Promise<void>;
  delete(remotePath: string, recursive?: boolean): Promise<void>;
  
  // ── OpenClaw Specific ──
  // Read the host's openclaw.json
  readConfig(): Promise<OpenClawConfig>;
  writeConfig(config: OpenClawConfig): Promise<void>;
  
  // Gateway operations
  getGatewayUrl(): string;
  gatewayHealthCheck(): Promise<GatewayHealth>;
  gatewayStart(): Promise<ExecResult>;
  gatewayStop(): Promise<ExecResult>;
  gatewayRestart(): Promise<ExecResult>;
  
  // ── VS Code Integration ──
  // Open the host's filesystem in the VS Code explorer
  // For SSH: triggers Remote SSH connection
  // For Docker: triggers container attach
  // For Local: opens folder
  // For Cloud: registers FileSystemProvider
  openExplorer(path?: string): Promise<void>;
  
  // Open a terminal connected to the host
  openTerminal(name?: string): Promise<vscode.Terminal>;
}

type HostStatus = "connected" | "connecting" | "disconnected" | "error";

interface ExecOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;         // ms
  stdin?: string;
  shell?: boolean;          // Run through shell (default: true)
}

interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
}

interface ExecStream {
  readonly stdout: vscode.Event<string>;
  readonly stderr: vscode.Event<string>;
  readonly onDidExit: vscode.Event<number>;
  write(data: string): void;   // Write to stdin
  kill(signal?: string): void;
}

interface GatewayHealth {
  running: boolean;
  version?: string;
  uptime?: string;
  port?: number;
  url?: string;
  agents?: number;
  channels?: number;
}

interface FileStat {
  type: "file" | "directory" | "symlink";
  size: number;
  mtime: number;
  ctime: number;
}

interface DirectoryEntry {
  name: string;
  type: "file" | "directory" | "symlink";
}
```

## Registration Flow

### Extension Activation Order

1. **Core (`occ.openclaw`)** activates first (uses `*` activation event or `onStartupFinished`)
   - Reads `~/.occ/hosts.json`
   - Sets up host picker, sidebar, commands
   - Exports the `OpenClawCoreAPI`

2. **Adapter extensions** activate on:
   - `onCommand:occ.addHost.{type}` — when user picks this type in Add Host wizard
   - `onStartupFinished` — if the user has hosts of this type in their registry
   - Extension dependency on `occ.openclaw` in `package.json`:
     ```json
     {
       "extensionDependencies": ["occ.openclaw"]
     }
     ```

3. **Each adapter** calls `registerHostAdapter()` in its `activate()`:
   ```typescript
   export async function activate(context: vscode.ExtensionContext) {
     const core = vscode.extensions.getExtension<OpenClawCoreAPI>('occ.openclaw');
     if (!core) { return; }
     
     const api = core.isActive ? core.exports : await core.activate();
     
     const disposable = api.registerHostAdapter(new DockerHostAdapter());
     context.subscriptions.push(disposable);
   }
   ```

### Error Handling Between Extensions

```typescript
// Core wraps all adapter calls with timeout and error handling
async function safeAdapterCall<T>(
  adapter: HostAdapter,
  method: string,
  fn: () => Promise<T>,
  timeoutMs = 30000
): Promise<T> {
  try {
    return await Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`${adapter.type} adapter timed out on ${method}`)), timeoutMs)
      ),
    ]);
  } catch (err) {
    vscode.window.showErrorMessage(
      `${adapter.displayName}: ${err instanceof Error ? err.message : 'Unknown error'}`
    );
    throw err;
  }
}
```

## Version Compatibility

The API includes a version field for forward compatibility:

```typescript
// Core checks adapter compatibility
function isCompatible(adapterApiVersion: string, coreApiVersion: string): boolean {
  const [adapterMajor] = adapterApiVersion.split('.');
  const [coreMajor] = coreApiVersion.split('.');
  return adapterMajor === coreMajor;  // Same major version = compatible
}
```

Adapters should declare the API version they target:
```json
{
  "engines": {
    "occ-core": "^1.0.0"
  }
}
```
