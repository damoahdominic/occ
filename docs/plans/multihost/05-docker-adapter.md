# Docker Host Adapter — `openclaw-docker`

## Purpose

Manage OpenClaw installations running inside Docker containers. Supports:
- Standalone containers (`docker run`)
- Docker Compose services
- Container discovery (find OpenClaw containers automatically)
- Port mapping for gateway access

## Prerequisites

- Docker CLI installed on the user's machine
- Docker daemon running
- Container must have `openclaw` CLI installed inside it

## Container Discovery

```typescript
export class DockerHostAdapter implements HostAdapter {
  readonly type = 'docker';
  readonly displayName = 'Docker Container';
  readonly icon = new vscode.ThemeIcon('package');  // container icon
  
  async discover(): Promise<DiscoveredHost[]> {
    const hosts: DiscoveredHost[] = [];
    
    // Method 1: Find containers with openclaw label
    const labeled = await this.exec('docker', [
      'ps', '--filter', 'label=com.openclaw', '--format', '{{json .}}'
    ]);
    
    // Method 2: Find containers with "openclaw" in the image name
    const byImage = await this.exec('docker', [
      'ps', '--filter', 'ancestor=*openclaw*', '--format', '{{json .}}'
    ]);
    
    // Method 3: Find containers that have openclaw binary
    // (slower — runs `docker exec` on each running container)
    const allContainers = await this.exec('docker', [
      'ps', '--format', '{{.ID}} {{.Names}} {{.Image}}'
    ]);
    
    for (const line of allContainers.stdout.trim().split('\n')) {
      if (!line.trim()) continue;
      const [id, name, image] = line.split(/\s+/);
      
      // Quick check: does openclaw exist in the container?
      const check = await this.exec('docker', ['exec', id, 'which', 'openclaw']);
      if (check.exitCode !== 0) continue;
      
      // Get version
      const version = await this.exec('docker', ['exec', id, 'openclaw', '--version']);
      
      // Get port mapping
      const ports = await this.exec('docker', [
        'port', id, '18789'
      ]);
      
      hosts.push({
        suggestedId: `docker-${name}`,
        suggestedLabel: `${name} (${image})`,
        connection: {
          type: 'docker',
          containerId: id,
          containerName: name,
        },
        metadata: {
          image,
          openclawVersion: version.stdout.trim(),
          portMapping: ports.stdout.trim(),
        },
      });
    }
    
    return hosts;
  }
  
  getConfigFields(): ConfigField[] {
    return [
      {
        id: 'containerId',
        label: 'Container ID or Name',
        type: 'text',
        placeholder: 'openclaw-pod-1',
        required: true,
        helpText: 'The Docker container ID or name. Use "Discover" to find containers automatically.',
      },
      {
        id: 'composeService',
        label: 'Docker Compose Service',
        type: 'text',
        placeholder: 'openclaw',
        required: false,
        helpText: 'If using Docker Compose, specify the service name instead of container ID',
        group: 'Docker Compose',
      },
      {
        id: 'composeFile',
        label: 'Compose File Path',
        type: 'file',
        placeholder: './docker-compose.yml',
        required: false,
        helpText: 'Path to docker-compose.yml (default: ./docker-compose.yml)',
        group: 'Docker Compose',
      },
      {
        id: 'dockerHost',
        label: 'Docker Host',
        type: 'text',
        placeholder: 'unix:///var/run/docker.sock',
        required: false,
        helpText: 'Override DOCKER_HOST (e.g., tcp://remote:2376 or ssh://user@host)',
        group: 'Advanced',
      },
      {
        id: 'shell',
        label: 'Shell',
        type: 'select',
        defaultValue: '/bin/sh',
        options: [
          { label: '/bin/sh', value: '/bin/sh' },
          { label: '/bin/bash', value: '/bin/bash' },
          { label: '/bin/zsh', value: '/bin/zsh' },
        ],
        required: false,
        group: 'Advanced',
      },
      {
        id: 'configPath',
        label: 'Config Path (inside container)',
        type: 'text',
        placeholder: '/root/.openclaw/openclaw.json',
        defaultValue: '/root/.openclaw/openclaw.json',
        required: false,
        group: 'Advanced',
      },
      {
        id: 'gatewayPort',
        label: 'Gateway Port (host-side)',
        type: 'number',
        placeholder: '18789',
        required: false,
        helpText: 'The host port mapped to the container gateway. Auto-detected from docker port.',
        group: 'Advanced',
        validation: { min: 1, max: 65535 },
      },
    ];
  }
}
```

## Docker Host Connection

```typescript
export class DockerHostConnection implements HostConnection {
  private containerId: string;
  private composePrefix: string[] = [];
  
  constructor(
    private config: DockerConnection,
    public readonly hostEntry: HostEntry,
    public readonly adapter: HostAdapter,
  ) {
    // Resolve container ID
    if (config.composeService && config.composeFile) {
      this.composePrefix = ['docker', 'compose', '-f', config.composeFile];
      this.containerId = config.composeService;
    } else {
      this.containerId = config.containerId || config.containerName || '';
    }
  }
  
  // ── Command Execution ──
  async exec(command: string, args: string[] = [], options: ExecOptions = {}): Promise<ExecResult> {
    const dockerArgs = this.buildDockerExecArgs(command, args, options);
    return this.localExec('docker', dockerArgs, options);
  }
  
  private buildDockerExecArgs(command: string, args: string[], options: ExecOptions): string[] {
    const execArgs = ['exec'];
    
    if (options.env) {
      for (const [key, value] of Object.entries(options.env)) {
        execArgs.push('-e', `${key}=${value}`);
      }
    }
    
    if (options.cwd) {
      execArgs.push('-w', options.cwd);
    }
    
    execArgs.push(this.containerId);
    
    if (options.shell) {
      const shell = this.config.shell || '/bin/sh';
      execArgs.push(shell, '-c', `${command} ${args.join(' ')}`);
    } else {
      execArgs.push(command, ...args);
    }
    
    return execArgs;
  }
  
  execStream(command: string, args: string[] = [], options: ExecOptions = {}): ExecStream {
    const dockerArgs = this.buildDockerExecArgs(command, args, { ...options, shell: true });
    
    // For Compose services
    if (this.composePrefix.length) {
      const composeArgs = [...this.composePrefix.slice(1), 'exec', '-T', this.containerId, command, ...args];
      return this.localExecStream(this.composePrefix[0], composeArgs);
    }
    
    return this.localExecStream('docker', dockerArgs);
  }
  
  // ── File Operations ──
  async readFile(remotePath: string): Promise<Uint8Array> {
    // Use docker cp for binary files
    const tmpFile = path.join(os.tmpdir(), `occ-docker-${Date.now()}`);
    await this.localExec('docker', ['cp', `${this.containerId}:${remotePath}`, tmpFile]);
    const content = await fs.promises.readFile(tmpFile);
    await fs.promises.unlink(tmpFile);
    return content;
  }
  
  async readTextFile(remotePath: string): Promise<string> {
    const result = await this.exec('cat', [remotePath], { shell: false });
    if (result.exitCode !== 0) {
      throw new Error(`Failed to read ${remotePath}: ${result.stderr}`);
    }
    return result.stdout;
  }
  
  async writeFile(remotePath: string, content: Uint8Array): Promise<void> {
    const tmpFile = path.join(os.tmpdir(), `occ-docker-${Date.now()}`);
    await fs.promises.writeFile(tmpFile, content);
    await this.localExec('docker', ['cp', tmpFile, `${this.containerId}:${remotePath}`]);
    await fs.promises.unlink(tmpFile);
  }
  
  async writeTextFile(remotePath: string, content: string): Promise<void> {
    // Use docker exec with stdin
    const result = await this.localExec('docker', [
      'exec', '-i', this.containerId, 'tee', remotePath
    ], { stdin: content });
    if (result.exitCode !== 0) {
      throw new Error(`Failed to write ${remotePath}: ${result.stderr}`);
    }
  }
  
  async stat(remotePath: string): Promise<FileStat | null> {
    const result = await this.exec('stat', ['-c', '%F %s %Y %Z', remotePath], { shell: false });
    if (result.exitCode !== 0) return null;
    const [type, size, mtime, ctime] = result.stdout.trim().split(' ');
    return {
      type: type === 'directory' ? 'directory' : type === 'symbolic link' ? 'symlink' : 'file',
      size: parseInt(size),
      mtime: parseInt(mtime) * 1000,
      ctime: parseInt(ctime) * 1000,
    };
  }
  
  async readDirectory(remotePath: string): Promise<DirectoryEntry[]> {
    const result = await this.exec('ls', ['-1F', remotePath], { shell: false });
    if (result.exitCode !== 0) return [];
    return result.stdout.trim().split('\n').filter(Boolean).map(entry => {
      const isDir = entry.endsWith('/');
      const isLink = entry.endsWith('@');
      const name = entry.replace(/[/@*]$/, '');
      return { name, type: isDir ? 'directory' : isLink ? 'symlink' : 'file' };
    });
  }
  
  async mkdir(remotePath: string, recursive = true): Promise<void> {
    await this.exec('mkdir', recursive ? ['-p', remotePath] : [remotePath], { shell: false });
  }
  
  async delete(remotePath: string, recursive = false): Promise<void> {
    const flags = recursive ? ['-rf'] : ['-f'];
    await this.exec('rm', [...flags, remotePath], { shell: false });
  }
  
  // ── OpenClaw Specific ──
  async readConfig(): Promise<any> {
    const configPath = this.config.configPath || '/root/.openclaw/openclaw.json';
    const raw = await this.readTextFile(configPath);
    return JSON.parse(raw);
  }
  
  async writeConfig(config: any): Promise<void> {
    const configPath = this.config.configPath || '/root/.openclaw/openclaw.json';
    await this.writeTextFile(configPath, JSON.stringify(config, null, 2));
  }
  
  getGatewayUrl(): string {
    // If port mapping is configured, use host-side port
    if (this.config.portMappings?.gateway) {
      return `http://localhost:${this.config.portMappings.gateway}`;
    }
    // Otherwise try to auto-detect from docker port
    return `http://localhost:18789`;
  }
  
  async gatewayHealthCheck(): Promise<GatewayHealth> {
    const result = await this.exec('openclaw', ['status', '--json']);
    if (result.exitCode === 0) {
      try { return { running: true, ...JSON.parse(result.stdout) }; } catch {}
    }
    return { running: false };
  }
  
  async gatewayStart(): Promise<ExecResult> { return this.exec('openclaw', ['gateway', 'start']); }
  async gatewayStop(): Promise<ExecResult> { return this.exec('openclaw', ['gateway', 'stop']); }
  async gatewayRestart(): Promise<ExecResult> { return this.exec('openclaw', ['gateway', 'restart']); }

  // See "Gateway Lifecycle" below — on the bundled OCC Docker adapter, the real
  // implementation shells to `docker compose -f docker/docker-compose.openclaw.yml`
  // against the user's workstation, not `openclaw` inside the container.
  
  // ── VS Code Integration ──
  async openExplorer(p?: string): Promise<void> {
    // Attach to container using Dev Containers pattern
    // This opens a new VS Code window connected to the container
    await vscode.commands.executeCommand(
      'remote-containers.attachToRunningContainer',
      this.containerId
    );
  }
  
  async openTerminal(name?: string): Promise<vscode.Terminal> {
    const terminal = vscode.window.createTerminal({
      name: name || `Docker: ${this.hostEntry.label}`,
      shellPath: 'docker',
      shellArgs: ['exec', '-it', this.containerId, this.config.shell || '/bin/sh'],
    });
    terminal.show();
    return terminal;
  }
  
  dispose(): void {}
  
  // ── Helpers ──
  private async localExec(cmd: string, args: string[], options: ExecOptions = {}): Promise<ExecResult> {
    return new Promise(resolve => {
      const env = { ...process.env };
      if (this.config.dockerHost) env.DOCKER_HOST = this.config.dockerHost;
      
      const child = cp.spawn(cmd, args, { env, timeout: options.timeout, windowsHide: true });
      let stdout = '', stderr = '';
      child.stdout?.on('data', d => stdout += d);
      child.stderr?.on('data', d => stderr += d);
      if (options.stdin) { child.stdin?.write(options.stdin); child.stdin?.end(); }
      child.on('close', code => resolve({ exitCode: code ?? 1, stdout, stderr }));
      child.on('error', err => resolve({ exitCode: 1, stdout, stderr: err.message }));
    });
  }
  
  private localExecStream(cmd: string, args: string[]): ExecStream {
    const env = { ...process.env };
    if (this.config.dockerHost) env.DOCKER_HOST = this.config.dockerHost;
    
    const child = cp.spawn(cmd, args, { env, windowsHide: true });
    const _stdout = new vscode.EventEmitter<string>();
    const _stderr = new vscode.EventEmitter<string>();
    const _exit = new vscode.EventEmitter<number>();
    child.stdout?.on('data', d => _stdout.fire(d.toString()));
    child.stderr?.on('data', d => _stderr.fire(d.toString()));
    child.on('close', code => _exit.fire(code ?? 1));
    return {
      stdout: _stdout.event,
      stderr: _stderr.event,
      onDidExit: _exit.event,
      write: d => child.stdin?.write(d),
      kill: s => child.kill(s as any),
    };
  }
}
```

## Gateway Lifecycle

`DockerHostConnection.gatewayStart / gatewayStop / gatewayRestart` are the
control-plane surface for the Status panel's Start / Stop / Restart buttons
(see `apps/editor/extensions/openclaw/src/panels/statusHtml.ts:1214-1219` and
ticket-053). On the bundled OCC setup — where the gateway is a Docker Compose
stack launched by the setup wizard — these methods shell out on the user's
workstation to the canonical compose file:

```
docker compose -f docker/docker-compose.openclaw.yml up -d        # gatewayStart
docker compose -f docker/docker-compose.openclaw.yml down         # gatewayStop
docker compose -f docker/docker-compose.openclaw.yml restart      # gatewayRestart
```

This file path is load-bearing: it is the single source of truth defined in the
root `AGENTS.md` § "OpenClaw Docker Gateway" and used by the setup wizard, the
Status panel controls, and any future CLI automation. The same compose file
path is re-used in the dev override invocation (`-f docker/docker-compose.openclaw.yml -f docker/docker-compose.openclaw.override.yml`)
but the Status panel's buttons intentionally use the production-parity form
without the override.

Requirements for the implementation:

- **Must not race with the setup wizard.** The setup wizard runs `up -d` against
  the same compose file while configuring the gateway. The Status panel's
  Start/Stop/Restart buttons are only rendered after the setup wizard has
  disposed (they live inside the Status panel, not the wizard), so in practice
  there is no overlap — but implementations must not leak a background
  long-running `docker compose` process that would clash with a later wizard run.
- **Must stream logs.** Use `execStream` / the adapter's `onLog` hook so the
  Status panel can surface build output when the user hits Start from the
  stopped / errored state.
- **Must respect `dockerHost` overrides** in the `DockerConnection` config (e.g.
  `DOCKER_HOST=ssh://user@remote`) — see the existing `localExec` helper at
  `05-docker-adapter.md` "Docker Host Connection" `localExec`.

For ad-hoc containers created via the Add Host wizard (rather than the bundled
compose stack), adapters MAY fall back to the in-container
`openclaw gateway start/stop/restart` form shown in the sketch above, but the
bundled OCC path is always the compose form.

## Docker Compose Support

When users configure a Compose service instead of a raw container, commands route through `docker compose`:

```typescript
// Instead of: docker exec <id> openclaw gateway start
// Uses:       docker compose -f compose.yml exec openclaw openclaw gateway start

// Container lifecycle (not available with raw containers):
async composeUp(): Promise<ExecResult> {
  return this.localExec('docker', ['compose', '-f', this.config.composeFile!, 'up', '-d', this.containerId]);
}

async composeDown(): Promise<ExecResult> {
  return this.localExec('docker', ['compose', '-f', this.config.composeFile!, 'down']);
}

async composeLogs(follow = false): Promise<ExecStream> {
  const args = ['compose', '-f', this.config.composeFile!, 'logs'];
  if (follow) args.push('-f');
  args.push(this.containerId);
  return this.localExecStream('docker', args);
}
```

## MoltPod Docker Integration

For MoltPod pods that are Docker-based, the Docker adapter gains special awareness:

```typescript
// Detect MoltPod containers by label
const MOLTPOD_LABEL = 'com.moltpod.pod-id';

async discoverMoltPodContainers(): Promise<DiscoveredHost[]> {
  const result = await this.localExec('docker', [
    'ps', '--filter', `label=${MOLTPOD_LABEL}`, '--format', '{{json .}}'
  ]);
  // Parse and return with MoltPod-specific metadata
}
```

## Package.json

```json
{
  "name": "openclaw-docker",
  "displayName": "OpenClaw Docker",
  "description": "Manage OpenClaw installations in Docker containers",
  "version": "1.0.0",
  "publisher": "occ",
  "engines": { "vscode": "^1.85.0" },
  "extensionDependencies": ["occ.openclaw"],
  "categories": ["Other"],
  "activationEvents": [
    "onCommand:occ.docker.discover",
    "onStartupFinished"
  ],
  "main": "./dist/extension.js",
  "contributes": {
    "commands": [
      { "command": "occ.docker.discover", "title": "OCC Docker: Discover Containers" },
      { "command": "occ.docker.attach", "title": "OCC Docker: Attach to Container" },
      { "command": "occ.docker.logs", "title": "OCC Docker: View Container Logs" }
    ]
  }
}
```
