# Cloud Host Adapter — `openclaw-cloud` (MoltPod)

## Purpose

Manage OpenClaw pods hosted on MoltPod's infrastructure via REST API. No SSH keys, no Docker CLI — just authenticate with your MoltPod account and manage pods from the desktop.

This is the **zero-friction** adapter: sign in, see your pods, manage them.

## Architecture

```
OCCode Desktop
    │
    ├── openclaw-cloud extension
    │       │
    │       ├── Auth: OAuth2 / API token → MoltPod
    │       ├── Pods: GET /api/v1/pods → list user's pods
    │       ├── Exec: POST /api/v1/pods/{id}/exec → run commands
    │       ├── Files: GET/PUT /api/v1/pods/{id}/files → file operations
    │       └── Gateway: GET /api/v1/pods/{id}/gateway → proxied gateway access
    │
    └── MoltPod API (api.moltpod.com)
            │
            ├── Pod 1 (OpenClaw instance)
            ├── Pod 2 (OpenClaw instance)
            └── Pod 3 (OpenClaw instance)
```

## MoltPod API Surface (Required)

These endpoints need to exist on the MoltPod backend for the adapter to work:

### Pod Management

```
GET    /api/v1/pods                    # List user's pods
GET    /api/v1/pods/{id}               # Get pod details
POST   /api/v1/pods                    # Create a new pod
DELETE /api/v1/pods/{id}               # Delete a pod
PATCH  /api/v1/pods/{id}               # Update pod config (name, plan, etc.)
POST   /api/v1/pods/{id}/start         # Start a stopped pod
POST   /api/v1/pods/{id}/stop          # Stop a running pod
POST   /api/v1/pods/{id}/restart       # Restart a pod
```

### Command Execution

```
POST   /api/v1/pods/{id}/exec          # Execute a command
  Body: { "command": "openclaw", "args": ["gateway", "start"], "timeout": 30 }
  Response: { "exitCode": 0, "stdout": "...", "stderr": "..." }

POST   /api/v1/pods/{id}/exec/stream   # WebSocket: streamed exec
  → Send: { "command": "openclaw", "args": ["logs", "--follow"] }
  ← Receive: { "type": "stdout", "data": "..." } / { "type": "exit", "code": 0 }
```

### File Operations

```
GET    /api/v1/pods/{id}/files?path=/root/.openclaw/openclaw.json
  Response: { "content": "...", "encoding": "utf-8", "size": 1234, "mtime": "..." }

PUT    /api/v1/pods/{id}/files?path=/root/.openclaw/openclaw.json
  Body: { "content": "...", "encoding": "utf-8" }

GET    /api/v1/pods/{id}/files/list?path=/root/.openclaw/
  Response: { "entries": [{ "name": "openclaw.json", "type": "file", "size": 1234 }, ...] }

GET    /api/v1/pods/{id}/files/stat?path=/root/.openclaw/openclaw.json
  Response: { "type": "file", "size": 1234, "mtime": "...", "ctime": "..." }

DELETE /api/v1/pods/{id}/files?path=/root/tmp/old-file.txt

POST   /api/v1/pods/{id}/files/mkdir?path=/root/.openclaw/workspace
```

### Gateway Proxy

```
GET    /api/v1/pods/{id}/gateway/status
  Response: { "running": true, "version": "2026.3.19", "port": 18789, "proxyUrl": "https://pod-abc.gateway.moltpod.com" }

# The proxy URL allows the desktop client to access the gateway dashboard
# without SSH port forwarding — MoltPod handles the tunnel
```

### Pod Info

```
GET    /api/v1/pods/{id}/info
  Response: {
    "id": "pod-abc123",
    "name": "My Agent Pod",
    "status": "running",
    "plan": "starter",
    "region": "us-east",
    "os": "Linux",
    "openclawVersion": "2026.3.19",
    "ip": "10.0.0.5",
    "createdAt": "2026-01-15T00:00:00Z",
    "resources": {
      "cpu": "2 vCPU",
      "memory": "4 GB",
      "disk": "40 GB",
      "diskUsed": "12 GB"
    },
    "agents": ["main", "cody"],
    "channels": ["whatsapp", "telegram"],
    "gatewayUrl": "https://pod-abc.gateway.moltpod.com"
  }
```

## Cloud Host Adapter

```typescript
export class CloudHostAdapter implements HostAdapter {
  readonly type = 'cloud';
  readonly displayName = 'MoltPod Cloud';
  readonly icon = new vscode.ThemeIcon('cloud');
  
  private apiClient: MoltPodAPIClient | undefined;
  
  async discover(): Promise<DiscoveredHost[]> {
    const client = await this.getAuthenticatedClient();
    if (!client) return [];
    
    const pods = await client.listPods();
    return pods.map(pod => ({
      suggestedId: `cloud-${pod.id}`,
      suggestedLabel: `${pod.name} (${pod.region})`,
      connection: {
        type: 'cloud',
        provider: 'moltpod',
        podId: pod.id,
        apiEndpoint: client.baseUrl,
      },
      metadata: {
        plan: pod.plan,
        status: pod.status,
        region: pod.region,
        openclawVersion: pod.openclawVersion,
      },
    }));
  }
  
  async connect(config: CloudConnection): Promise<HostConnection> {
    const client = await this.getAuthenticatedClient();
    if (!client) throw new Error('Not authenticated. Please sign in to MoltPod.');
    return new CloudHostConnection(config, client, this);
  }
  
  async testConnection(config: CloudConnection): Promise<TestResult> {
    const client = await this.getAuthenticatedClient();
    if (!client) return { success: false, message: 'Not authenticated' };
    
    try {
      const info = await client.getPodInfo(config.podId);
      return {
        success: true,
        message: `Connected to ${info.name} (${info.status})`,
        details: {
          openclawInstalled: true,
          openclawVersion: info.openclawVersion,
          gatewayRunning: info.status === 'running',
          os: info.os,
        },
      };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }
  
  getConfigFields(): ConfigField[] {
    return [
      {
        id: 'podId',
        label: 'Pod',
        type: 'select',
        required: true,
        helpText: 'Select a MoltPod pod to manage. Use "Discover" to refresh the list.',
        options: [],  // Populated dynamically via discover()
      },
      {
        id: 'apiEndpoint',
        label: 'API Endpoint',
        type: 'text',
        defaultValue: 'https://api.moltpod.com',
        required: false,
        helpText: 'Override for self-hosted MoltPod installations',
        group: 'Advanced',
      },
    ];
  }
  
  private async getAuthenticatedClient(): Promise<MoltPodAPIClient | undefined> {
    if (this.apiClient) return this.apiClient;
    
    // Try to get stored token from VS Code SecretStorage
    const token = await vscode.authentication.getSession('moltpod', ['pods:manage'], { createIfNone: false });
    if (token) {
      this.apiClient = new MoltPodAPIClient(token.accessToken);
      return this.apiClient;
    }
    
    // No token — prompt user to sign in
    const session = await vscode.authentication.getSession('moltpod', ['pods:manage'], { createIfNone: true });
    if (session) {
      this.apiClient = new MoltPodAPIClient(session.accessToken);
      return this.apiClient;
    }
    
    return undefined;
  }
}
```

## Cloud Host Connection

```typescript
export class CloudHostConnection implements HostConnection {
  constructor(
    private config: CloudConnection,
    private client: MoltPodAPIClient,
    public readonly adapter: CloudHostAdapter,
  ) {}
  
  // ── Command Execution ──
  async exec(command: string, args: string[] = [], options: ExecOptions = {}): Promise<ExecResult> {
    return this.client.exec(this.config.podId, {
      command,
      args,
      cwd: options.cwd,
      env: options.env,
      timeout: options.timeout ? options.timeout / 1000 : 30,
    });
  }
  
  execStream(command: string, args: string[] = [], options: ExecOptions = {}): ExecStream {
    return this.client.execStream(this.config.podId, { command, args, cwd: options.cwd });
  }
  
  // ── File Operations ──
  async readTextFile(remotePath: string): Promise<string> {
    const response = await this.client.readFile(this.config.podId, remotePath);
    return response.content;
  }
  
  async writeTextFile(remotePath: string, content: string): Promise<void> {
    await this.client.writeFile(this.config.podId, remotePath, content);
  }
  
  async readFile(remotePath: string): Promise<Uint8Array> {
    const response = await this.client.readFile(this.config.podId, remotePath);
    if (response.encoding === 'base64') {
      return Buffer.from(response.content, 'base64');
    }
    return Buffer.from(response.content, 'utf-8');
  }
  
  async writeFile(remotePath: string, content: Uint8Array): Promise<void> {
    await this.client.writeFile(this.config.podId, remotePath, Buffer.from(content).toString('base64'), 'base64');
  }
  
  async stat(remotePath: string): Promise<FileStat | null> {
    try {
      return await this.client.stat(this.config.podId, remotePath);
    } catch { return null; }
  }
  
  async readDirectory(remotePath: string): Promise<DirectoryEntry[]> {
    return this.client.listFiles(this.config.podId, remotePath);
  }
  
  async mkdir(remotePath: string): Promise<void> {
    await this.client.mkdir(this.config.podId, remotePath);
  }
  
  async delete(remotePath: string, recursive = false): Promise<void> {
    await this.client.deleteFile(this.config.podId, remotePath, recursive);
  }
  
  // ── Gateway ──
  getGatewayUrl(): string {
    // MoltPod provides a proxy URL — no port forwarding needed
    return `https://pod-${this.config.podId}.gateway.moltpod.com`;
  }
  
  async gatewayHealthCheck(): Promise<GatewayHealth> {
    return this.client.getGatewayStatus(this.config.podId);
  }
  
  async gatewayStart(): Promise<ExecResult> { return this.exec('openclaw', ['gateway', 'start']); }
  async gatewayStop(): Promise<ExecResult> { return this.exec('openclaw', ['gateway', 'stop']); }
  async gatewayRestart(): Promise<ExecResult> { return this.exec('openclaw', ['gateway', 'restart']); }
  
  // ── VS Code Integration ──
  async openExplorer(): Promise<void> {
    // Register a FileSystemProvider for this pod
    // URI scheme: occ-cloud://pod-id/path/to/file
    const uri = vscode.Uri.parse(`occ-cloud://${this.config.podId}/root`);
    await vscode.commands.executeCommand('vscode.openFolder', uri);
  }
  
  async openTerminal(name?: string): Promise<vscode.Terminal> {
    // Use a pseudo-terminal backed by WebSocket exec
    const pty = new CloudPseudoTerminal(this.client, this.config.podId);
    const terminal = vscode.window.createTerminal({
      name: name || `Cloud: ${this.hostEntry.label}`,
      pty,
    });
    terminal.show();
    return terminal;
  }
  
  dispose(): void {}
}
```

## FileSystemProvider for Cloud Pods

```typescript
// Register occ-cloud:// URI scheme for browsing pod files in the explorer
export class CloudFileSystemProvider implements vscode.FileSystemProvider {
  private _onDidChangeFile = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  readonly onDidChangeFile = this._onDidChangeFile.event;
  
  constructor(private client: MoltPodAPIClient) {}
  
  // Parse URI: occ-cloud://pod-id/path/to/file
  private parse(uri: vscode.Uri): { podId: string; path: string } {
    return { podId: uri.authority, path: uri.path };
  }
  
  async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
    const { podId, path } = this.parse(uri);
    const stat = await this.client.stat(podId, path);
    return {
      type: stat.type === 'directory' ? vscode.FileType.Directory : vscode.FileType.File,
      ctime: stat.ctime,
      mtime: stat.mtime,
      size: stat.size,
    };
  }
  
  async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
    const { podId, path } = this.parse(uri);
    const entries = await this.client.listFiles(podId, path);
    return entries.map(e => [
      e.name,
      e.type === 'directory' ? vscode.FileType.Directory : vscode.FileType.File
    ]);
  }
  
  async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    const { podId, path } = this.parse(uri);
    const response = await this.client.readFile(podId, path);
    return Buffer.from(response.content, response.encoding === 'base64' ? 'base64' : 'utf-8');
  }
  
  async writeFile(uri: vscode.Uri, content: Uint8Array): Promise<void> {
    const { podId, path } = this.parse(uri);
    await this.client.writeFile(podId, path, Buffer.from(content).toString('utf-8'));
    this._onDidChangeFile.fire([{ type: vscode.FileChangeType.Changed, uri }]);
  }
  
  async createDirectory(uri: vscode.Uri): Promise<void> {
    const { podId, path } = this.parse(uri);
    await this.client.mkdir(podId, path);
  }
  
  async delete(uri: vscode.Uri, options: { recursive: boolean }): Promise<void> {
    const { podId, path } = this.parse(uri);
    await this.client.deleteFile(podId, path, options.recursive);
  }
  
  async rename(oldUri: vscode.Uri, newUri: vscode.Uri): Promise<void> {
    const old = this.parse(oldUri);
    const newP = this.parse(newUri);
    await this.client.exec(old.podId, { command: 'mv', args: [old.path, newP.path] });
  }
  
  watch(): vscode.Disposable {
    // TODO: WebSocket-based file watching
    return new vscode.Disposable(() => {});
  }
}
```

## MoltPod Authentication Provider

```typescript
// Register as a VS Code authentication provider so users can sign in
export class MoltPodAuthProvider implements vscode.AuthenticationProvider {
  readonly id = 'moltpod';
  readonly label = 'MoltPod';
  
  private _onDidChangeSessions = new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();
  readonly onDidChangeSessions = this._onDidChangeSessions.event;
  
  async getSessions(): Promise<vscode.AuthenticationSession[]> {
    // Read token from SecretStorage
    const token = await this.secretStorage.get('moltpod-token');
    if (!token) return [];
    
    // Verify token is still valid
    const user = await this.fetchUser(token);
    if (!user) return [];
    
    return [{
      id: 'moltpod-session',
      accessToken: token,
      account: { id: user.email, label: user.name || user.email },
      scopes: ['pods:manage'],
    }];
  }
  
  async createSession(): Promise<vscode.AuthenticationSession> {
    // Open browser to MoltPod OAuth flow
    const callbackUri = await vscode.env.asExternalUri(vscode.Uri.parse('vscode://occ.openclaw-cloud/auth/callback'));
    
    await vscode.env.openExternal(
      vscode.Uri.parse(`https://moltpod.com/oauth/authorize?client_id=occ-desktop&redirect_uri=${encodeURIComponent(callbackUri.toString())}&scope=pods:manage`)
    );
    
    // Wait for callback with token
    return new Promise((resolve) => {
      // URI handler registered in extension activation
      this.pendingAuthResolve = resolve;
    });
  }
  
  async removeSession(): Promise<void> {
    await this.secretStorage.delete('moltpod-token');
    this._onDidChangeSessions.fire({ added: [], removed: ['moltpod-session'], changed: [] });
  }
}
```

## Why This Matters for MoltPod

This adapter is the **product integration layer** between MoltPod (the hosting business) and OCCode (the desktop client). It:

1. **Drives adoption** — users who install OCCode discover MoltPod as a one-click hosting option
2. **Reduces churn** — managing pods from the IDE is frictionless compared to SSH
3. **Enables upsell** — show resource usage, suggest plan upgrades, surface billing in the sidebar
4. **Creates lock-in** — the FileSystemProvider + pseudo-terminal make MoltPod pods feel native

## Package.json

```json
{
  "name": "openclaw-cloud",
  "displayName": "OpenClaw Cloud (MoltPod)",
  "description": "Manage MoltPod-hosted OpenClaw pods from your desktop",
  "version": "1.0.0",
  "publisher": "occ",
  "engines": { "vscode": "^1.85.0" },
  "extensionDependencies": ["occ.openclaw"],
  "categories": ["Other"],
  "activationEvents": [
    "onCommand:occ.cloud.signIn",
    "onFileSystem:occ-cloud",
    "onStartupFinished"
  ],
  "main": "./dist/extension.js",
  "contributes": {
    "authentication": [
      { "id": "moltpod", "label": "MoltPod" }
    ],
    "commands": [
      { "command": "occ.cloud.signIn", "title": "OCC Cloud: Sign In to MoltPod" },
      { "command": "occ.cloud.discover", "title": "OCC Cloud: List Pods" },
      { "command": "occ.cloud.createPod", "title": "OCC Cloud: Create New Pod" }
    ]
  }
}
```
