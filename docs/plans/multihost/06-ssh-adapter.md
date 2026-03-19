# SSH Host Adapter — `openclaw-ssh`

## Purpose

Manage OpenClaw installations on remote servers via SSH. This is the power-user adapter for VPS, cloud instances, and remote dev machines.

## Strategy: Leverage `open-remote-ssh`

OCCode already ships the full Remote SSH extension (`apps/editor/extensions/open-remote-ssh/`). Rather than reimplanting SSH connection logic, this adapter:

1. Uses `ssh2` library for lightweight operations (exec, file read/write, health checks)
2. Delegates to `open-remote-ssh` for heavy operations (open explorer, full remote development)

This gives us the best of both worlds:
- **Fast command execution** without opening a full remote window
- **Full VS Code Remote experience** when the user wants to browse files or edit code

## SSH Connection Management

```typescript
import { Client as SSHClient, ConnectConfig } from 'ssh2';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export class SSHHostAdapter implements HostAdapter {
  readonly type = 'ssh';
  readonly displayName = 'SSH Remote';
  readonly icon = new vscode.ThemeIcon('remote');
  
  async discover(): Promise<DiscoveredHost[]> {
    const hosts: DiscoveredHost[] = [];
    
    // Parse ~/.ssh/config for known hosts
    const sshConfigPath = path.join(os.homedir(), '.ssh', 'config');
    if (!fs.existsSync(sshConfigPath)) return hosts;
    
    const configText = fs.readFileSync(sshConfigPath, 'utf-8');
    const hostBlocks = this.parseSSHConfig(configText);
    
    for (const block of hostBlocks) {
      // Skip wildcards and generic patterns
      if (block.host.includes('*') || block.host === '*') continue;
      
      hosts.push({
        suggestedId: `ssh-${block.host}`,
        suggestedLabel: block.host,
        connection: {
          type: 'ssh',
          host: block.hostname || block.host,
          port: block.port ? parseInt(block.port) : 22,
          user: block.user || os.userInfo().username,
          authMethod: 'agent',  // Default to agent, will fall back
          sshConfigHost: block.host,
        },
        metadata: {
          sshConfigHost: block.host,
          hostname: block.hostname || block.host,
        },
      });
    }
    
    return hosts;
  }
  
  async testConnection(config: SSHConnection): Promise<TestResult> {
    const conn = new SSHClient();
    
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        conn.end();
        resolve({ success: false, message: 'Connection timed out after 15s' });
      }, 15000);
      
      conn.on('ready', async () => {
        clearTimeout(timeout);
        
        // Check if OpenClaw is installed
        const ocCheck = await this.remoteExec(conn, 'which openclaw');
        const installed = ocCheck.exitCode === 0;
        
        let version: string | undefined;
        let gatewayRunning = false;
        let osName: string | undefined;
        
        if (installed) {
          const versionResult = await this.remoteExec(conn, 'openclaw --version');
          version = versionResult.stdout.trim();
          
          const statusResult = await this.remoteExec(conn, `curl -s -o /dev/null -w "%{http_code}" http://localhost:${config.gatewayPort || 18789}/`);
          gatewayRunning = statusResult.stdout.trim() !== '000';
        }
        
        const osResult = await this.remoteExec(conn, 'uname -s');
        osName = osResult.stdout.trim();
        
        conn.end();
        resolve({
          success: true,
          message: installed
            ? `Connected. OpenClaw ${version}${gatewayRunning ? ', gateway running' : ''}`
            : 'Connected but OpenClaw not installed',
          details: { openclawInstalled: installed, openclawVersion: version, gatewayRunning, os: osName },
        });
      });
      
      conn.on('error', (err) => {
        clearTimeout(timeout);
        resolve({ success: false, message: `SSH error: ${err.message}` });
      });
      
      conn.connect(this.buildConnectConfig(config));
    });
  }
  
  getConfigFields(): ConfigField[] {
    return [
      // ── Basic ──
      {
        id: 'sshConfigHost',
        label: 'SSH Config Host',
        type: 'text',
        placeholder: 'my-vps',
        required: false,
        helpText: 'Name from ~/.ssh/config. If set, overrides host/port/user/key below.',
      },
      {
        id: 'host',
        label: 'Hostname / IP',
        type: 'text',
        placeholder: '192.168.1.50 or myserver.com',
        required: true,
      },
      {
        id: 'port',
        label: 'Port',
        type: 'number',
        defaultValue: 22,
        required: false,
        validation: { min: 1, max: 65535 },
      },
      {
        id: 'user',
        label: 'Username',
        type: 'text',
        placeholder: 'debian',
        required: true,
      },
      // ── Authentication ──
      {
        id: 'authMethod',
        label: 'Auth Method',
        type: 'select',
        defaultValue: 'key',
        options: [
          { label: 'SSH Key', value: 'key' },
          { label: 'SSH Agent', value: 'agent' },
          { label: 'Password', value: 'password' },
        ],
        required: true,
        group: 'Authentication',
      },
      {
        id: 'keyPath',
        label: 'Private Key Path',
        type: 'file',
        placeholder: '~/.ssh/id_ed25519',
        required: false,
        helpText: 'Path to SSH private key. Only used with "SSH Key" auth method.',
        group: 'Authentication',
      },
      // ── Advanced ──
      {
        id: 'jumpHost',
        label: 'Jump Host (Bastion)',
        type: 'text',
        placeholder: 'user@bastion.example.com',
        required: false,
        helpText: 'ProxyJump through a bastion host',
        group: 'Advanced',
      },
      {
        id: 'gatewayPort',
        label: 'Gateway Port',
        type: 'number',
        defaultValue: 18789,
        required: false,
        helpText: 'OpenClaw gateway port on the remote host',
        group: 'Advanced',
        validation: { min: 1, max: 65535 },
      },
      {
        id: 'configPath',
        label: 'Config Path',
        type: 'text',
        placeholder: '~/.openclaw/openclaw.json',
        required: false,
        group: 'Advanced',
      },
    ];
  }
  
  validateConfig(config: SSHConnection): ConfigValidationResult {
    const errors: { fieldId: string; message: string }[] = [];
    if (!config.sshConfigHost && !config.host) {
      errors.push({ fieldId: 'host', message: 'Either SSH Config Host or Hostname is required' });
    }
    if (!config.sshConfigHost && !config.user) {
      errors.push({ fieldId: 'user', message: 'Username is required when not using SSH Config' });
    }
    if (config.authMethod === 'key' && config.keyPath && !fs.existsSync(config.keyPath.replace('~', os.homedir()))) {
      errors.push({ fieldId: 'keyPath', message: 'Key file not found' });
    }
    return { valid: errors.length === 0, errors };
  }
  
  async connect(config: SSHConnection): Promise<HostConnection> {
    return new SSHHostConnection(config, this);
  }
  
  private buildConnectConfig(config: SSHConnection): ConnectConfig {
    const connectConfig: ConnectConfig = {
      host: config.host,
      port: config.port || 22,
      username: config.user,
      readyTimeout: 15000,
      keepaliveInterval: 10000,
    };
    
    if (config.authMethod === 'key' && config.keyPath) {
      const keyPath = config.keyPath.replace('~', os.homedir());
      connectConfig.privateKey = fs.readFileSync(keyPath);
    } else if (config.authMethod === 'agent') {
      connectConfig.agent = process.env.SSH_AUTH_SOCK;
    }
    // Password auth handled via interactive prompt
    
    return connectConfig;
  }
  
  private async remoteExec(conn: SSHClient, command: string): Promise<ExecResult> {
    return new Promise((resolve) => {
      conn.exec(command, (err, stream) => {
        if (err) { resolve({ exitCode: 1, stdout: '', stderr: err.message }); return; }
        let stdout = '', stderr = '';
        stream.on('data', (d: Buffer) => stdout += d.toString());
        stream.stderr.on('data', (d: Buffer) => stderr += d.toString());
        stream.on('close', (code: number) => resolve({ exitCode: code, stdout, stderr }));
      });
    });
  }
  
  private parseSSHConfig(text: string): Array<{ host: string; hostname?: string; port?: string; user?: string }> {
    const blocks: Array<{ host: string; hostname?: string; port?: string; user?: string }> = [];
    let current: any = null;
    
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      
      const match = trimmed.match(/^(\w+)\s+(.+)$/);
      if (!match) continue;
      
      const [, key, value] = match;
      if (key.toLowerCase() === 'host') {
        if (current) blocks.push(current);
        current = { host: value };
      } else if (current) {
        current[key.toLowerCase()] = value;
      }
    }
    if (current) blocks.push(current);
    return blocks;
  }
}
```

## SSH Host Connection

```typescript
export class SSHHostConnection implements HostConnection {
  private conn: SSHClient | undefined;
  private _status: HostStatus = 'disconnected';
  private reconnectTimer: NodeJS.Timeout | undefined;
  
  // Port forwarding state
  private forwardedPorts: Map<number, net.Server> = new Map();
  
  constructor(
    private config: SSHConnection,
    public readonly adapter: SSHHostAdapter,
  ) {}
  
  async connect(): Promise<void> {
    this._status = 'connecting';
    this.conn = new SSHClient();
    
    return new Promise((resolve, reject) => {
      this.conn!.on('ready', () => {
        this._status = 'connected';
        this.setupKeepalive();
        resolve();
      });
      
      this.conn!.on('error', (err) => {
        this._status = 'error';
        this.scheduleReconnect();
        reject(err);
      });
      
      this.conn!.on('close', () => {
        this._status = 'disconnected';
        this.scheduleReconnect();
      });
      
      this.conn!.connect(this.adapter.buildConnectConfig(this.config));
    });
  }
  
  // ── Command Execution ──
  async exec(command: string, args: string[] = [], options: ExecOptions = {}): Promise<ExecResult> {
    if (!this.conn) await this.connect();
    
    const fullCommand = args.length
      ? `${command} ${args.map(a => `'${a.replace(/'/g, "'\\''")}'`).join(' ')}`
      : command;
    
    const cmdWithCwd = options.cwd
      ? `cd '${options.cwd}' && ${fullCommand}`
      : fullCommand;
    
    const cmdWithEnv = options.env
      ? Object.entries(options.env).map(([k, v]) => `${k}='${v}'`).join(' ') + ' ' + cmdWithCwd
      : cmdWithCwd;
    
    return new Promise((resolve) => {
      const timeout = options.timeout
        ? setTimeout(() => resolve({ exitCode: 124, stdout: '', stderr: 'Command timed out', timedOut: true }), options.timeout)
        : null;
      
      this.conn!.exec(cmdWithEnv, (err, stream) => {
        if (err) {
          if (timeout) clearTimeout(timeout);
          resolve({ exitCode: 1, stdout: '', stderr: err.message });
          return;
        }
        
        let stdout = '', stderr = '';
        stream.on('data', (d: Buffer) => stdout += d.toString());
        stream.stderr.on('data', (d: Buffer) => stderr += d.toString());
        
        if (options.stdin) {
          stream.write(options.stdin);
          stream.end();
        }
        
        stream.on('close', (code: number) => {
          if (timeout) clearTimeout(timeout);
          resolve({ exitCode: code, stdout, stderr });
        });
      });
    });
  }
  
  // ── File Operations ──
  async readTextFile(remotePath: string): Promise<string> {
    const result = await this.exec('cat', [remotePath]);
    if (result.exitCode !== 0) throw new Error(`Failed to read ${remotePath}: ${result.stderr}`);
    return result.stdout;
  }
  
  async writeTextFile(remotePath: string, content: string): Promise<void> {
    // Use SFTP for reliable file writes
    if (!this.conn) await this.connect();
    
    return new Promise((resolve, reject) => {
      this.conn!.sftp((err, sftp) => {
        if (err) { reject(err); return; }
        const stream = sftp.createWriteStream(remotePath);
        stream.on('close', () => { sftp.end(); resolve(); });
        stream.on('error', (e: Error) => { sftp.end(); reject(e); });
        stream.write(content);
        stream.end();
      });
    });
  }
  
  async readFile(remotePath: string): Promise<Uint8Array> {
    if (!this.conn) await this.connect();
    
    return new Promise((resolve, reject) => {
      this.conn!.sftp((err, sftp) => {
        if (err) { reject(err); return; }
        const chunks: Buffer[] = [];
        const stream = sftp.createReadStream(remotePath);
        stream.on('data', (d: Buffer) => chunks.push(d));
        stream.on('end', () => { sftp.end(); resolve(Buffer.concat(chunks)); });
        stream.on('error', (e: Error) => { sftp.end(); reject(e); });
      });
    });
  }
  
  async writeFile(remotePath: string, content: Uint8Array): Promise<void> {
    if (!this.conn) await this.connect();
    
    return new Promise((resolve, reject) => {
      this.conn!.sftp((err, sftp) => {
        if (err) { reject(err); return; }
        const stream = sftp.createWriteStream(remotePath);
        stream.on('close', () => { sftp.end(); resolve(); });
        stream.on('error', (e: Error) => { sftp.end(); reject(e); });
        stream.write(Buffer.from(content));
        stream.end();
      });
    });
  }
  
  // ── Port Forwarding ──
  async forwardGatewayPort(): Promise<number> {
    const remotePort = this.config.gatewayPort || 18789;
    const localPort = await findFreePort();
    
    if (!this.conn) await this.connect();
    
    const server = net.createServer((localSocket) => {
      this.conn!.forwardOut('127.0.0.1', localPort, '127.0.0.1', remotePort, (err, stream) => {
        if (err) { localSocket.end(); return; }
        localSocket.pipe(stream);
        stream.pipe(localSocket);
      });
    });
    
    await new Promise<void>((resolve) => server.listen(localPort, '127.0.0.1', resolve));
    this.forwardedPorts.set(localPort, server);
    
    return localPort;
  }
  
  getGatewayUrl(): string {
    // If we have a forwarded port, use it
    for (const [port] of this.forwardedPorts) {
      return `http://localhost:${port}`;
    }
    // Otherwise return the remote URL (may not be accessible directly)
    return `http://${this.config.host}:${this.config.gatewayPort || 18789}`;
  }
  
  // ── VS Code Integration ──
  async openExplorer(p?: string): Promise<void> {
    // Delegate to the built-in Remote SSH extension
    const sshHost = this.config.sshConfigHost || `${this.config.user}@${this.config.host}`;
    await vscode.commands.executeCommand('openssh.openEmptyWindow', { host: sshHost });
  }
  
  async openTerminal(name?: string): Promise<vscode.Terminal> {
    const sshHost = this.config.sshConfigHost || `${this.config.user}@${this.config.host}`;
    const sshArgs = [sshHost];
    if (this.config.keyPath) sshArgs.unshift('-i', this.config.keyPath.replace('~', os.homedir()));
    if (this.config.port && this.config.port !== 22) sshArgs.unshift('-p', String(this.config.port));
    
    const terminal = vscode.window.createTerminal({
      name: name || `SSH: ${this.hostEntry.label}`,
      shellPath: 'ssh',
      shellArgs: sshArgs,
    });
    terminal.show();
    return terminal;
  }
  
  // ── Lifecycle ──
  private setupKeepalive(): void {
    // ssh2 handles keepalive via connectConfig.keepaliveInterval
  }
  
  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = undefined;
      try { await this.connect(); } catch { /* will retry on next operation */ }
    }, 5000);
  }
  
  dispose(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    for (const [, server] of this.forwardedPorts) server.close();
    this.forwardedPorts.clear();
    this.conn?.end();
  }
}
```

## Security Considerations

- **Private keys**: Never copied or read into memory beyond what ssh2 needs. Path referenced, not stored in hosts.json.
- **Passwords**: Prompted via VS Code input box with `password: true`, never stored.
- **Passphrases**: Same — prompted when needed, stored in VS Code SecretStorage if user opts in.
- **Known hosts**: Verified against `~/.ssh/known_hosts`. Unknown hosts trigger a fingerprint confirmation dialog.
- **Agent forwarding**: Disabled by default. Can be enabled per-host in config.

## Package.json

```json
{
  "name": "openclaw-ssh",
  "displayName": "OpenClaw SSH",
  "description": "Manage OpenClaw installations on remote servers via SSH",
  "version": "1.0.0",
  "publisher": "occ",
  "engines": { "vscode": "^1.85.0" },
  "extensionDependencies": ["occ.openclaw"],
  "categories": ["Other"],
  "activationEvents": [
    "onCommand:occ.ssh.discover",
    "onStartupFinished"
  ],
  "main": "./dist/extension.js",
  "contributes": {
    "commands": [
      { "command": "occ.ssh.discover", "title": "OCC SSH: Discover Hosts from SSH Config" },
      { "command": "occ.ssh.connect", "title": "OCC SSH: Connect to Host" },
      { "command": "occ.ssh.forwardGateway", "title": "OCC SSH: Forward Gateway Port" }
    ]
  },
  "dependencies": {
    "ssh2": "^1.15.0"
  }
}
```
