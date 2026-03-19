# Local Host Adapter — `openclaw-local`

## Purpose

The simplest adapter — manages an OpenClaw installation on the same machine running OCCode. This is where 90% of the existing `home.ts` code lands after the refactor.

## Ships Bundled

This extension **always ships with OCCode**. It's the default experience. Users who never touch Docker or SSH will only ever interact with this adapter.

## Implementation

### `LocalHostAdapter`

```typescript
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export class LocalHostAdapter implements HostAdapter {
  readonly type = 'local';
  readonly displayName = 'Local Machine';
  readonly icon = new vscode.ThemeIcon('device-desktop');
  
  async discover(): Promise<DiscoveredHost[]> {
    // Check if OpenClaw is installed locally
    const installed = await this.isOpenClawInstalled();
    if (!installed) return [];
    
    return [{
      suggestedId: 'local-default',
      suggestedLabel: os.hostname(),
      connection: { type: 'local' },
      metadata: {
        os: process.platform === 'darwin' ? 'macOS' : process.platform === 'win32' ? 'Windows' : 'Linux',
        hostname: os.hostname(),
      },
    }];
  }
  
  async connect(config: LocalConnection): Promise<HostConnection> {
    return new LocalHostConnection(config);
  }
  
  async testConnection(config: LocalConnection): Promise<TestResult> {
    const installed = await this.isOpenClawInstalled();
    if (!installed) {
      return { success: false, message: 'OpenClaw CLI not found in PATH', details: { openclawInstalled: false } };
    }
    const version = await this.getVersion();
    const gatewayRunning = await this.isGatewayRunning();
    return {
      success: true,
      message: `OpenClaw ${version} installed${gatewayRunning ? ', gateway running' : ''}`,
      details: {
        openclawInstalled: true,
        openclawVersion: version,
        gatewayRunning,
        os: process.platform === 'darwin' ? 'macOS' : process.platform === 'win32' ? 'Windows' : 'Linux',
      },
    };
  }
  
  getConfigFields(): ConfigField[] {
    return [
      {
        id: 'configPath',
        label: 'Config Path',
        type: 'text',
        placeholder: '~/.openclaw/openclaw.json',
        defaultValue: path.join(os.homedir(), '.openclaw', 'openclaw.json'),
        required: false,
        helpText: 'Override the default OpenClaw config location',
        group: 'Advanced',
      },
    ];
  }
  
  validateConfig(config: LocalConnection): ConfigValidationResult {
    return { valid: true, errors: [] };  // Local always valid
  }
  
  private async isOpenClawInstalled(): Promise<boolean> {
    return new Promise(resolve => {
      const cmd = process.platform === 'win32' ? 'where' : 'which';
      cp.exec(`${cmd} openclaw`, { timeout: 5000 }, err => resolve(!err));
    });
  }
  
  private async getVersion(): Promise<string> {
    return new Promise(resolve => {
      cp.exec('openclaw --version', { timeout: 5000 }, (err, stdout) => {
        resolve(err ? 'unknown' : stdout.trim());
      });
    });
  }
  
  private async isGatewayRunning(): Promise<boolean> {
    return new Promise(resolve => {
      const port = this.getConfiguredPort();
      const req = require('http').get(`http://localhost:${port}/`, { timeout: 3000 }, (res: any) => {
        res.resume();
        resolve(res.statusCode < 500);
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
    });
  }
  
  private getConfiguredPort(): number {
    try {
      const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
      const raw = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(raw);
      const p = config?.gateway?.port ?? config?.port ?? 18789;
      return typeof p === 'number' && p > 0 && p < 65536 ? p : 18789;
    } catch {
      return 18789;
    }
  }
}
```

### `LocalHostConnection`

```typescript
export class LocalHostConnection implements HostConnection {
  readonly hostId: string;
  readonly hostEntry: HostEntry;
  readonly adapter: HostAdapter;
  private _status: HostStatus = 'connected';
  
  private _onDidChangeStatus = new vscode.EventEmitter<HostStatus>();
  readonly onDidChangeStatus = this._onDidChangeStatus.event;
  
  get status(): HostStatus { return this._status; }
  
  constructor(private config: LocalConnection, hostEntry: HostEntry, adapter: HostAdapter) {
    this.hostId = hostEntry.id;
    this.hostEntry = hostEntry;
    this.adapter = adapter;
  }
  
  // ── Command Execution ──
  async exec(command: string, args: string[] = [], options: ExecOptions = {}): Promise<ExecResult> {
    return new Promise((resolve) => {
      const child = cp.spawn(command, args, {
        cwd: options.cwd,
        env: { ...process.env, ...options.env },
        shell: options.shell ?? true,
        timeout: options.timeout,
        windowsHide: true,
      });
      
      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', (d) => stdout += d.toString());
      child.stderr?.on('data', (d) => stderr += d.toString());
      
      if (options.stdin) {
        child.stdin?.write(options.stdin);
        child.stdin?.end();
      }
      
      child.on('close', (code) => {
        resolve({ exitCode: code ?? 1, stdout, stderr });
      });
      
      child.on('error', (err) => {
        resolve({ exitCode: 1, stdout, stderr: stderr + '\n' + err.message });
      });
    });
  }
  
  execStream(command: string, args: string[] = [], options: ExecOptions = {}): ExecStream {
    const child = cp.spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      shell: options.shell ?? true,
      windowsHide: true,
    });
    
    const _stdout = new vscode.EventEmitter<string>();
    const _stderr = new vscode.EventEmitter<string>();
    const _onDidExit = new vscode.EventEmitter<number>();
    
    child.stdout?.on('data', (d) => _stdout.fire(d.toString()));
    child.stderr?.on('data', (d) => _stderr.fire(d.toString()));
    child.on('close', (code) => _onDidExit.fire(code ?? 1));
    
    return {
      stdout: _stdout.event,
      stderr: _stderr.event,
      onDidExit: _onDidExit.event,
      write: (data) => child.stdin?.write(data),
      kill: (signal) => child.kill(signal as any),
    };
  }
  
  // ── File Operations ──
  async readFile(remotePath: string): Promise<Uint8Array> {
    return fs.promises.readFile(this.expandPath(remotePath));
  }
  
  async readTextFile(remotePath: string, encoding = 'utf-8'): Promise<string> {
    return fs.promises.readFile(this.expandPath(remotePath), encoding as BufferEncoding);
  }
  
  async writeFile(remotePath: string, content: Uint8Array): Promise<void> {
    const p = this.expandPath(remotePath);
    await fs.promises.mkdir(path.dirname(p), { recursive: true });
    await fs.promises.writeFile(p, content);
  }
  
  async writeTextFile(remotePath: string, content: string): Promise<void> {
    const p = this.expandPath(remotePath);
    await fs.promises.mkdir(path.dirname(p), { recursive: true });
    await fs.promises.writeFile(p, content, 'utf-8');
  }
  
  async stat(remotePath: string): Promise<FileStat | null> {
    try {
      const s = await fs.promises.stat(this.expandPath(remotePath));
      return {
        type: s.isDirectory() ? 'directory' : s.isSymbolicLink() ? 'symlink' : 'file',
        size: s.size,
        mtime: s.mtimeMs,
        ctime: s.ctimeMs,
      };
    } catch { return null; }
  }
  
  async readDirectory(remotePath: string): Promise<DirectoryEntry[]> {
    const entries = await fs.promises.readdir(this.expandPath(remotePath), { withFileTypes: true });
    return entries.map(e => ({
      name: e.name,
      type: e.isDirectory() ? 'directory' : e.isSymbolicLink() ? 'symlink' : 'file',
    }));
  }
  
  async mkdir(remotePath: string, recursive = true): Promise<void> {
    await fs.promises.mkdir(this.expandPath(remotePath), { recursive });
  }
  
  async delete(remotePath: string, recursive = false): Promise<void> {
    await fs.promises.rm(this.expandPath(remotePath), { recursive, force: true });
  }
  
  // ── OpenClaw Specific ──
  async readConfig(): Promise<any> {
    const configPath = this.hostEntry.configPath || path.join(os.homedir(), '.openclaw', 'openclaw.json');
    const raw = await this.readTextFile(configPath);
    return JSON.parse(raw);
  }
  
  async writeConfig(config: any): Promise<void> {
    const configPath = this.hostEntry.configPath || path.join(os.homedir(), '.openclaw', 'openclaw.json');
    await this.writeTextFile(configPath, JSON.stringify(config, null, 2));
  }
  
  getGatewayUrl(): string {
    const port = 18789; // TODO: read from config
    return `http://localhost:${port}`;
  }
  
  async gatewayHealthCheck(): Promise<GatewayHealth> {
    // Existing isWebServerReachable() logic
    // Plus: openclaw status --json for detailed info
    const result = await this.exec('openclaw', ['status', '--json']);
    if (result.exitCode === 0) {
      try {
        const status = JSON.parse(result.stdout);
        return { running: true, version: status.version, ...status };
      } catch { return { running: true }; }
    }
    return { running: false };
  }
  
  async gatewayStart(): Promise<ExecResult> {
    return this.exec('openclaw', ['gateway', 'start']);
  }
  
  async gatewayStop(): Promise<ExecResult> {
    return this.exec('openclaw', ['gateway', 'stop']);
  }
  
  async gatewayRestart(): Promise<ExecResult> {
    return this.exec('openclaw', ['gateway', 'restart']);
  }
  
  // ── VS Code Integration ──
  async openExplorer(p?: string): Promise<void> {
    const folderPath = p || this.hostEntry.configPath 
      ? path.dirname(this.hostEntry.configPath!)
      : path.join(os.homedir(), '.openclaw');
    await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(folderPath));
  }
  
  async openTerminal(name?: string): Promise<vscode.Terminal> {
    const terminal = vscode.window.createTerminal(name || `Local: ${this.hostEntry.label}`);
    terminal.show();
    return terminal;
  }
  
  dispose(): void {
    this._onDidChangeStatus.dispose();
  }
  
  private expandPath(p: string): string {
    return p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p;
  }
}
```

## What Moves From `home.ts` Into This Adapter

| Current `home.ts` Function | New Location |
|---|---|
| `cp.spawn('openclaw', ...)` calls | `LocalHostConnection.exec()` |
| `fs.readFileSync(configPath)` | `LocalHostConnection.readTextFile()` |
| `isWebServerReachable()` | `LocalHostConnection.gatewayHealthCheck()` |
| `_runSilentInstall()` | Keep in home.ts but call through `activeHost.exec('npm', ['install', '-g', 'openclaw'])` |
| `getConfiguredGatewayPort()` | `LocalHostConnection.getGatewayUrl()` |
| `getOpenClawWorkspaceDir()` | `LocalHostConnection.readConfig()` → extract workspace |

## Package.json

```json
{
  "name": "openclaw-local",
  "displayName": "OpenClaw Local",
  "description": "Manage OpenClaw installations on your local machine",
  "version": "1.0.0",
  "publisher": "occ",
  "engines": { "vscode": "^1.85.0" },
  "extensionDependencies": ["occ.openclaw"],
  "categories": ["Other"],
  "activationEvents": ["onStartupFinished"],
  "main": "./dist/extension.js",
  "contributes": {
    "commands": [
      { "command": "occ.local.install", "title": "OCC Local: Install OpenClaw" },
      { "command": "occ.local.uninstall", "title": "OCC Local: Uninstall OpenClaw" }
    ]
  }
}
```
