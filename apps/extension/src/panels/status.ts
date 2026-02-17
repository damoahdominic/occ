import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

type GatewayStatus = {
  installed: boolean;
  running: boolean;
  pid?: string;
  port?: string;
  uptime?: string;
  service?: string;
  dashboard?: string;
  probe?: string;
  logFile?: string;
  configPath?: string;
  issues?: string[];
  exitCode?: string;
  cliPath?: string;
  command?: string;
  stderr?: string;
  pathEnv?: string;
  raw: string;
  error?: string;
  updatedAt: string;
};

type RunResult = {
  stdout: string;
  stderr: string;
  code?: string;
  timedOut?: boolean;
  notFound?: boolean;
  error?: string;
  pathEnv?: string;
  command?: string;
  exitCode?: number | null;
};

export class StatusPanel {
  public static currentPanel: StatusPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel) {
    this._panel = panel;
    void this._update();
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage(msg => {
      if (msg.command === 'refresh') {
        void this._update();
      } else if (msg.command === 'gateway-start') {
        void this._runGateway('start');
      } else if (msg.command === 'gateway-stop') {
        void this._runGateway('stop');
      } else if (msg.command === 'gateway-restart') {
        void this._runGateway('restart');
      } else if (msg.command === 'install') {
        vscode.commands.executeCommand('openclaw.install');
      } else if (msg.command === 'configure') {
        vscode.commands.executeCommand('openclaw.configure');
      } else if (msg.command === 'open-dashboard' && msg.url) {
        vscode.env.openExternal(vscode.Uri.parse(msg.url));
      } else if (msg.command === 'open-logs' && msg.path) {
        let p = msg.path as string;
        if (process.platform === 'win32' && !/^[a-zA-Z]:/.test(p) && /^[\\/]/.test(p)) {
          const drive = process.env.SystemDrive || 'C:';
          p = `${drive}${p}`;
        }
        const uri = vscode.Uri.file(p);
        vscode.workspace.openTextDocument(uri).then(doc => vscode.window.showTextDocument(doc));
      }
    }, null, this._disposables);
  }

  public static createOrShow(extensionUri: vscode.Uri) {
    if (StatusPanel.currentPanel) {
      StatusPanel.currentPanel._panel.reveal();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'openclawStatus', 'OpenClaw Status', vscode.ViewColumn.One,
      { enableScripts: true }
    );
    StatusPanel.currentPanel = new StatusPanel(panel);
  }

  public dispose() {
    StatusPanel.currentPanel = undefined;
    this._panel.dispose();
    this._disposables.forEach(d => d.dispose());
  }

  private async _runGateway(action: string) {
    const { result } = await this._runOpenClaw(['gateway', action], 60000);
    if (result.timedOut) {
      vscode.window.showWarningMessage(`OpenClaw gateway ${action} is taking longer than expected.`);
    } else if (result.error) {
      const msg = result.stderr.trim() || result.error;
      vscode.window.showErrorMessage(`Failed to ${action} OpenClaw gateway. ${msg}`);
    } else {
      vscode.window.showInformationMessage(`OpenClaw gateway ${action} successful.`);
    }
    await this._update();
  }

  private async _update() {
    const status = await this._getStatus();
    this._panel.webview.html = this._getHtml(status);
  }

  private async _getStatus(): Promise<GatewayStatus> {
    const updatedAt = new Date().toLocaleTimeString();
    const { command, result, cliPath } = await this._runOpenClaw(['gateway', 'status'], 4000);
    const out = (result.stdout || result.stderr).trim();
    if (out.length > 0) {
      const parsed = this._parseStatus(out);
      const trimmedErr = result.stderr.trim();
      const genericFail = result.error && result.error.toLowerCase().startsWith('command failed');
      const error = trimmedErr || (!genericFail ? result.error : undefined);
      return {
        installed: parsed.installed || !result.notFound,
        running: parsed.running,
        pid: parsed.pid,
        port: parsed.port,
        uptime: parsed.uptime,
        service: parsed.service,
        dashboard: parsed.dashboard,
        probe: parsed.probe,
        logFile: parsed.logFile,
        configPath: parsed.configPath,
        issues: parsed.issues,
        exitCode: result.code,
        cliPath,
        command,
        stderr: trimmedErr || undefined,
        pathEnv: result.pathEnv,
        raw: out,
        error,
        updatedAt,
      };
    }

    if (result.notFound) {
      return {
        installed: false,
        running: false,
        exitCode: result.code,
        cliPath,
        command,
        stderr: result.stderr.trim() || undefined,
        pathEnv: result.pathEnv,
        raw: 'OpenClaw CLI not detected.',
        error: result.error,
        updatedAt,
      };
    }

    if (result.timedOut) {
      return {
        installed: !result.notFound,
        running: false,
        exitCode: result.code,
        cliPath,
        command,
        stderr: result.stderr.trim() || undefined,
        pathEnv: result.pathEnv,
        raw: 'Status command timed out.',
        error: result.error,
        updatedAt,
      };
    }

    return {
      installed: !result.notFound,
      running: false,
      exitCode: result.code,
      cliPath,
      command,
      stderr: result.stderr.trim() || undefined,
      pathEnv: result.pathEnv,
      raw: 'Failed to read gateway status.',
      error: result.error,
      updatedAt,
    };
  }

  private _runCommand(cmd: string, timeoutMs: number): Promise<RunResult> {
    const env = this._buildExecEnv();
    return new Promise(resolve => {
      cp.exec(
        cmd,
        {
          timeout: timeoutMs,
          windowsHide: true,
          maxBuffer: 1024 * 1024,
          env,
        },
        (error, stdout, stderr) => {
          const result: RunResult = {
            stdout: stdout?.toString() || '',
            stderr: stderr?.toString() || '',
            pathEnv: env.PATH,
            command: cmd,
          };
          if (error) {
            result.error = error.message || 'Command failed';
            const errCode = (error as any).code;
            result.code = errCode ? String(errCode) : undefined;
            result.timedOut = errCode === 'ETIMEDOUT';
            const text = `${result.stderr}\n${result.error}`.toLowerCase();
            result.notFound =
              errCode === 'ENOENT' ||
              text.includes('not recognized as an internal or external command') ||
              text.includes('command not found');
          }
          resolve(result);
        }
      );
    });
  }

  private _execFile(command: string, args: string[], timeoutMs: number): Promise<RunResult> {
    const env = this._buildExecEnv();
    return new Promise(resolve => {
      cp.execFile(
        command,
        args,
        {
          timeout: timeoutMs,
          windowsHide: true,
          maxBuffer: 1024 * 1024,
          env,
        },
        (error, stdout, stderr) => {
          const result: RunResult = {
            stdout: stdout?.toString() || '',
            stderr: stderr?.toString() || '',
            pathEnv: env.PATH,
            command: [command, ...args].join(' '),
          };
          if (error) {
            result.error = error.message || 'Command failed';
            const errCode = (error as any).code;
            result.code = errCode ? String(errCode) : undefined;
            result.timedOut = errCode === 'ETIMEDOUT';
            const text = `${result.stderr}\n${result.error}`.toLowerCase();
            result.notFound =
              errCode === 'ENOENT' ||
              text.includes('not recognized as an internal or external command') ||
              text.includes('command not found');
          }
          resolve(result);
        }
      );
    });
  }

  private async _runOpenClaw(args: string[], timeoutMs: number): Promise<{ result: RunResult; command: string; cliPath?: string }> {
    const cliPath = await this._findOpenClawPath();
    const invocation = this._buildOpenClawInvocation(cliPath, args);
    const result = await this._execFile(invocation.command, invocation.args, timeoutMs);
    // If .ps1 invocation failed, retry with .cmd sibling if available
    if (result.error && cliPath?.endsWith('.ps1')) {
      const cmdPath = cliPath.replace(/\.ps1$/i, '.cmd');
      if (fs.existsSync(cmdPath)) {
        const retryInvocation = this._buildOpenClawInvocation(cmdPath, args);
        const retryResult = await this._execFile(retryInvocation.command, retryInvocation.args, timeoutMs);
        return { result: retryResult, command: retryInvocation.display, cliPath: cmdPath };
      }
    }
    // If shim execution failed on Windows, try direct node invocation (bypasses .cmd shim entirely)
    if (result.error && process.platform === 'win32' && cliPath) {
      const directResult = await this._tryDirectNodeInvocation(cliPath, args, timeoutMs);
      if (directResult) return directResult;
    }
    return { result, command: invocation.display, cliPath };
  }

  /**
   * Bypass the npm .cmd/.ps1 shim and invoke the openclaw JS entry point directly with node.
   * This handles the case where node.exe isn't on PATH inside the VS Code extension host.
   */
  private async _tryDirectNodeInvocation(
    cliPath: string, args: string[], timeoutMs: number
  ): Promise<{ result: RunResult; command: string; cliPath?: string } | undefined> {
    // Resolve the JS entry point from the shim's directory
    const shimDir = path.dirname(cliPath);
    const jsEntryPoints = [
      path.join(shimDir, 'node_modules', 'openclaw', 'bin', 'openclaw.js'),
      path.join(shimDir, 'node_modules', 'openclaw', 'dist', 'cli.js'),
      path.join(shimDir, 'node_modules', 'openclaw', 'cli.js'),
      path.join(shimDir, 'node_modules', '@openclaw', 'cli', 'bin', 'openclaw.js'),
    ];
    let jsEntry: string | undefined;
    for (const candidate of jsEntryPoints) {
      if (fs.existsSync(candidate)) { jsEntry = candidate; break; }
    }
    // Also try reading the .cmd shim to extract the JS path
    if (!jsEntry) {
      const cmdPath = cliPath.replace(/\.(ps1|cmd|bat|exe)$/i, '.cmd');
      if (fs.existsSync(cmdPath)) {
        try {
          const shimContent = fs.readFileSync(cmdPath, 'utf8');
          // npm .cmd shims contain: "%~dp0\node_modules\openclaw\bin\openclaw.js"  %*
          const match = shimContent.match(/"([^"]*openclaw[^"]*\.js)"/i)
            || shimContent.match(/node[."'\s]+([^\s"']+\.js)/i);
          if (match) {
            // Resolve %~dp0 style paths relative to shim directory
            let resolved = match[1].replace(/%~dp0\\?/gi, '');
            resolved = path.resolve(shimDir, resolved);
            if (fs.existsSync(resolved)) jsEntry = resolved;
          }
        } catch {}
      }
    }
    if (!jsEntry) return undefined;

    // Find node.exe
    let nodeExe: string | undefined;
    // Check if node.exe is in the same dir as the shim (common with nvm-windows)
    if (fs.existsSync(path.join(shimDir, 'node.exe'))) {
      nodeExe = path.join(shimDir, 'node.exe');
    }
    if (!nodeExe) {
      const nodeDir = this._findNodeDir();
      if (nodeDir) nodeExe = path.join(nodeDir, 'node.exe');
    }
    // Try 'where node' as last resort
    if (!nodeExe) {
      try {
        const whereResult = cp.execSync('where node', { timeout: 3000, encoding: 'utf8', windowsHide: true });
        const firstLine = whereResult.trim().split(/\r?\n/)[0]?.trim();
        if (firstLine && fs.existsSync(firstLine)) nodeExe = firstLine;
      } catch {}
    }
    if (!nodeExe) return undefined;

    const nodeArgs = [jsEntry, ...args];
    const display = `${nodeExe} ${jsEntry} ${args.join(' ')}`.trim();
    
    // Use spawn with detached mode to avoid job object/console inheritance issues
    const result = await new Promise<RunResult>((resolve) => {
      const child = cp.spawn(
        nodeExe,
        nodeArgs,
        {
          timeout: timeoutMs,
          windowsHide: true,
          detached: true,
          stdio: ['ignore', 'pipe', 'pipe']
        }
      );
      
      let stdout = '';
      let stderr = '';
      
      child.stdout?.on('data', data => stdout += data);
      child.stderr?.on('data', data => stderr += data);
      
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
      }, timeoutMs);
      
      child.on('close', (code, signal) => {
        clearTimeout(timer);
        if (signal === 'SIGTERM' || code === null) {
          resolve({ error: 'Timed out', stdout, stderr, exitCode: null });
        } else if (code !== 0) {
          resolve({ error: stderr.trim() || `Exit ${code}`, stdout, stderr, exitCode: code ?? undefined });
        } else {
          resolve({ stdout, stderr, exitCode: 0 });
        }
      });
      
      child.on('error', err => {
        clearTimeout(timer);
        resolve({ error: err.message, stdout, stderr, exitCode: undefined });
      });
    });
    
    return { result, command: display, cliPath: jsEntry };
  }

  private _buildOpenClawInvocation(cliPath: string | undefined, args: string[]) {
    if (process.platform !== 'win32') {
      const command = cliPath || 'openclaw';
      return { command, args, display: [command, ...args].join(' ') };
    }

    const comspec = process.env.ComSpec || 'cmd.exe';
    if (!cliPath) {
      const appData = process.env.APPDATA;
      const shim = appData ? path.join(appData, 'npm', 'openclaw.cmd') : '';
      const cmdLine = shim && fs.existsSync(shim)
        ? `"${shim}" ${args.join(' ')}`
        : `openclaw ${args.join(' ')}`;
      return { command: comspec, args: ['/d', '/s', '/c', cmdLine], display: `${comspec} /d /s /c ${cmdLine}` };
    }

    const resolved = this._resolveWindowsCliPath(cliPath || 'openclaw');
    const ext = path.extname(resolved).toLowerCase();
    if (ext === '.cmd' || ext === '.bat') {
      const cmdLine = `"${resolved}" ${args.join(' ')}`.trim();
      return { command: comspec, args: ['/d', '/s', '/c', cmdLine], display: `${comspec} /d /s /c ${cmdLine}` };
    }
    if (ext === '.ps1') {
      // Prefer .cmd sibling over .ps1 — more reliable on Windows
      const cmdSibling = resolved.replace(/\.ps1$/i, '.cmd');
      if (fs.existsSync(cmdSibling)) {
        const cmdLine = `"${cmdSibling}" ${args.join(' ')}`.trim();
        return { command: comspec, args: ['/d', '/s', '/c', cmdLine], display: `${comspec} /d /s /c ${cmdLine}` };
      }
      // Fall through to PowerShell invocation
      const ps = 'powershell.exe';
      return {
        command: ps,
        args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', resolved, ...args],
        display: `${ps} -NoProfile -ExecutionPolicy Bypass -File "${resolved}" ${args.join(' ')}`.trim(),
      };
    }
    const command = resolved;
    return { command, args, display: [command, ...args].join(' ') };
  }

  private _buildExecEnv() {
    const env = { ...process.env };
    const basePath = env.PATH || (env as any).Path || '';
    const extra: string[] = [];
    if (process.platform === 'win32') {
      if (env.APPDATA) extra.push(path.join(env.APPDATA, 'npm'));
      if (env.ProgramFiles) extra.push(path.join(env.ProgramFiles, 'nodejs'));
      // Common Node.js install locations on Windows (nvm-windows, volta, fnm, scoop, etc.)
      const home = os.homedir();
      const localAppData = env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
      extra.push(path.join(localAppData, 'Volta', 'bin'));
      extra.push(path.join(localAppData, 'fnm', 'node-versions'));
      extra.push(path.join(env.APPDATA || '', 'nvm'));
      extra.push(path.join(home, 'scoop', 'shims'));
      // Try to find node.exe from the extension host's own process
      const nodeDir = this._findNodeDir();
      if (nodeDir) extra.push(nodeDir);
      const systemRoot = env.SystemRoot || (env as any).WINDIR;
      if (systemRoot) extra.push(path.join(systemRoot, 'System32'));
    } else {
      extra.push('/usr/local/bin', '/opt/homebrew/bin');
      extra.push(path.join(os.homedir(), '.local', 'bin'));
      extra.push(path.join(os.homedir(), '.npm-global', 'bin'));
    }
    const sep = process.platform === 'win32' ? ';' : ':';
    env.PATH = [...extra, basePath].filter(Boolean).join(sep);
    (env as any).Path = env.PATH;
    return env;
  }

  /** Find the directory containing node.exe by checking common locations */
  private _findNodeDir(): string | undefined {
    if (process.platform !== 'win32') return undefined;
    // 1. Check if node.exe is alongside npm in APPDATA
    const appData = process.env.APPDATA;
    if (appData) {
      const npmDir = path.join(appData, 'npm');
      // npm .cmd shims use %~dp0\node.exe or fall back to 'node' on PATH
      // Check the nodejs install dir referenced by the shim
    }
    // 2. Check common install paths
    const candidates = [
      process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'nodejs'),
      process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)']!, 'nodejs'),
      path.join(os.homedir(), '.nvm', 'versions'),
    ].filter(Boolean) as string[];
    for (const dir of candidates) {
      if (fs.existsSync(path.join(dir, 'node.exe'))) return dir;
    }
    // 3. Try to extract node location from NVM_HOME or NVM_SYMLINK
    const nvmSymlink = process.env.NVM_SYMLINK;
    if (nvmSymlink && fs.existsSync(path.join(nvmSymlink, 'node.exe'))) return nvmSymlink;
    const nvmHome = process.env.NVM_HOME;
    if (nvmHome && fs.existsSync(nvmHome)) {
      // nvm-windows creates a symlink or uses a current version dir
      try {
        const entries = fs.readdirSync(nvmHome).filter(e => /^v?\d/.test(e));
        for (const entry of entries) {
          const p = path.join(nvmHome, entry);
          if (fs.existsSync(path.join(p, 'node.exe'))) return p;
        }
      } catch {}
    }
    return undefined;
  }

  private async _findOpenClawPath(): Promise<string | undefined> {
    for (const candidate of this._getWorkspaceCliCandidates()) {
      if (fs.existsSync(candidate)) return candidate;
    }

    const envPath = process.env.OPENCLAW_CLI;
    if (envPath && fs.existsSync(envPath)) return envPath;

    if (process.platform === 'win32') {
      const appData = process.env.APPDATA;
      if (appData) {
        const p = path.join(appData, 'npm', 'openclaw.cmd');
        if (fs.existsSync(p)) return p;
      }
    }

    const cfgPath = vscode.workspace.getConfiguration('openclaw').get<string>('cliPath');
    if (cfgPath && fs.existsSync(cfgPath)) return cfgPath;

    let cmd = process.platform === 'win32' ? 'where openclaw' : 'which openclaw';
    if (process.platform === 'win32') {
      const systemRoot = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows';
      const whereExe = path.join(systemRoot, 'System32', 'where.exe');
      cmd = `"${whereExe}" openclaw`;
    }
    const result = await this._runCommand(cmd, 2000);
    if (!result.error && !result.notFound) {
      const out = (result.stdout || '').trim();
      if (out) {
        const candidates = out
          .split(/\r?\n/)
          .map(l => l.trim().replace(/^"+|"+$/g, ''))
          .filter(Boolean);
        for (const candidate of candidates) {
          const resolved = this._resolveWindowsCliPath(candidate);
          if (fs.existsSync(resolved)) return resolved;
        }
      }
    }

    if (process.platform === 'win32') {
      const psPath = await this._findOpenClawViaPowerShell();
      if (psPath && fs.existsSync(psPath)) return psPath;
    }

    const npmCandidates = await this._getNpmGlobalCliCandidates();
    for (const candidate of npmCandidates) {
      if (fs.existsSync(candidate)) return candidate;
    }

    const candidates = this._getCandidateCliPaths();
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate;
    }
    return undefined;
  }

  private _getWorkspaceCliCandidates(): string[] {
    const exts = process.platform === 'win32'
      ? ['openclaw.cmd', 'openclaw.exe', 'openclaw.ps1', 'openclaw.bat', 'openclaw']
      : ['openclaw'];
    const folders = vscode.workspace.workspaceFolders?.map(f => f.uri.fsPath) ?? [];
    const candidates: string[] = [];
    for (const root of folders) {
      for (const name of exts) {
        candidates.push(path.join(root, 'node_modules', '.bin', name));
      }
    }
    return candidates;
  }

  private async _findOpenClawViaPowerShell(): Promise<string | undefined> {
    const ps = 'powershell.exe';
    const cmd = [
      '-NoProfile',
      '-Command',
      '($c = Get-Command openclaw -ErrorAction SilentlyContinue | Select-Object -First 1); ' +
        'if ($c) { $c.Path; if (-not $c.Path) { $c.Source }; if (-not $c.Path -and -not $c.Source) { $c.Definition } }',
    ];
    const result = await this._execFile(ps, cmd, 2000);
    const out = (result.stdout || '').trim();
    if (!out) return undefined;
    return out.split(/\r?\n/)[0].trim();
  }

  private _getCandidateCliPaths(): string[] {
    const home = os.homedir();
    if (process.platform === 'win32') {
      const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
      const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
      const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
      return [
        path.join(appData, 'npm', 'openclaw.cmd'),
        path.join(appData, 'npm', 'openclaw.exe'),
        path.join(appData, 'npm', 'openclaw.ps1'),
        path.join(appData, 'npm', 'openclaw.bat'),
        path.join(localAppData, 'Programs', 'OpenClaw', 'openclaw.exe'),
        path.join(localAppData, 'OpenClaw', 'openclaw.exe'),
        path.join(programFiles, 'OpenClaw', 'openclaw.exe'),
        path.join(programFiles, 'OpenClaw', 'bin', 'openclaw.exe'),
        path.join(localAppData, 'Microsoft', 'WindowsApps', 'openclaw.exe'),
        path.join(home, '.openclaw', 'bin', 'openclaw.exe'),
      ];
    }
    return [
      '/usr/local/bin/openclaw',
      '/opt/homebrew/bin/openclaw',
      path.join(home, '.local', 'bin', 'openclaw'),
      path.join(home, '.npm-global', 'bin', 'openclaw'),
      path.join(home, '.openclaw', 'bin', 'openclaw'),
    ];
  }

  private async _getNpmGlobalCliCandidates(): Promise<string[]> {
    const result = await this._runCommand('npm config get prefix', 2000);
    const prefix = (result.stdout || '').trim();
    if (!prefix) return [];
    if (process.platform === 'win32') {
      const base = this._resolveWindowsCliPath(path.join(prefix, 'openclaw'));
      const withExts = [
        `${base}.cmd`,
        `${base}.exe`,
        `${base}.ps1`,
        `${base}.bat`,
        base,
      ];
      return withExts;
    }
    return [path.join(prefix, 'bin', 'openclaw')];
  }

  private _resolveWindowsCliPath(candidate: string) {
    if (process.platform !== 'win32') return candidate;
    const cleaned = candidate.replace(/^"+|"+$/g, '');
    if (fs.existsSync(cleaned)) return cleaned;
    if (path.extname(cleaned)) return cleaned;
    const exts = ['.cmd', '.exe', '.bat', '.ps1'];
    for (const ext of exts) {
      const withExt = `${cleaned}${ext}`;
      if (fs.existsSync(withExt)) return withExt;
    }
    return cleaned;
  }

  private _parseStatus(out: string) {
    const lower = out.toLowerCase();
    let running = /runtime:\s*running|gateway:\s*running/.test(lower) || /running|active|started/.test(lower);
    if (/not running|stopped|inactive|down|runtime:\s*stopped/.test(lower)) running = false;

    const pid = out.match(/pid[:\s]+(\d+)/i)?.[1];
    const port = out.match(/port[:=\s]+(\d+)/i)?.[1];
    const uptime = out.match(/uptime[:\s]+([^\n]+)/i)?.[1];
    const service = out.match(/service:\s*([^\n]+)/i)?.[1]?.trim();
    const dashboard = out.match(/dashboard:\s*(https?:\/\/[^\s]+)/i)?.[1];
    const probe = out.match(/probe target:\s*([^\n]+)/i)?.[1]?.trim();
    const logFile = out.match(/file logs:\s*([^\n]+)/i)?.[1]?.trim();
    const configPath = out.match(/config \(cli\):\s*([^\n]+)/i)?.[1]?.trim();
    const installed = /openclaw\s+\d{4}\./i.test(out) || /openclaw/gi.test(out);
    const issues = this._extractIssues(out);

    return { running, pid, port, uptime, service, dashboard, probe, logFile, configPath, installed, issues };
  }

  private _extractIssues(out: string): string[] {
    const lines = out.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const issues: string[] = [];
    for (const line of lines) {
      const lower = line.toLowerCase();
      if (lower.startsWith('fix:') || lower.startsWith('troubles:') || lower.startsWith('troubleshooting:')) {
        issues.push(line);
        continue;
      }
      if (lower.includes('missing') && lower.includes('config')) {
        issues.push(line);
        continue;
      }
      if (lower.startsWith('rpc probe:') || lower.startsWith('service is loaded but not running')) {
        issues.push(line);
        continue;
      }
      if (lower.startsWith('runtime:') && lower.includes('stopped')) {
        issues.push(line);
        continue;
      }
      if (lower.includes('requires explicit credentials') || lower.includes('pass --token') || lower.includes('pass --password')) {
        issues.push(line);
        continue;
      }
    }
    return issues;
  }

  private _escapeHtml(input: string) {
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private _getHtml(status: GatewayStatus): string {
    const {
      running,
      installed,
      raw,
      error,
      pid,
      port,
      uptime,
      service,
      dashboard,
      probe,
      logFile,
      configPath,
      issues,
      exitCode,
      cliPath,
      command,
      stderr,
      pathEnv,
      updatedAt,
    } = status;
    const safeRaw = this._escapeHtml(raw || '');
    const safeError = error ? this._escapeHtml(error) : '';
    const safeIssues = (issues || []).map(i => this._escapeHtml(i));
    const safeService = this._escapeHtml(service || '—');
    const safePid = this._escapeHtml(pid || '—');
    const safePort = this._escapeHtml(port || '—');
    const safeUptime = this._escapeHtml(uptime || '—');
    const safeDashboard = this._escapeHtml(dashboard || '—');
    const safeProbe = this._escapeHtml(probe || '—');
    const safeLogFile = this._escapeHtml(logFile || '—');
    const safeConfigPath = this._escapeHtml(configPath || '—');
    const safeCliPath = this._escapeHtml(cliPath || '—');
    const safeCommand = this._escapeHtml(command || '—');
    const safeStderr = this._escapeHtml(stderr || '');
    const safePathEnv = this._escapeHtml(pathEnv || '');
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family, sans-serif);
      background: radial-gradient(1200px 600px at -10% -10%, rgba(220,40,40,0.15), transparent),
                  radial-gradient(900px 400px at 110% 10%, rgba(220,40,40,0.12), transparent),
                  #141414;
      color: #e7e7e7;
      padding: 28px;
    }
    h2 { color: #dc2828; margin-bottom: 6px; letter-spacing: 0.2px; }
    .subtitle { color: #b2b2b2; font-size: 12px; margin-bottom: 18px; }
    .status-row {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 20px;
    }
    .indicator {
      width: 12px; height: 12px; border-radius: 50%;
    }
    .on { background: #4ade80; box-shadow: 0 0 8px rgba(74,222,128,0.4); }
    .off { background: #ef4444; box-shadow: 0 0 8px rgba(239,68,68,0.4); }
    .card {
      background: #1d1d1d;
      border: 1px solid #2a2a2a;
      border-radius: 10px;
      padding: 14px;
      margin-bottom: 16px;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px 16px;
    }
    .kv {
      display: flex;
      justify-content: space-between;
      font-size: 13px;
      color: #c8c8c8;
    }
    .kv span:first-child { color: #8c8c8c; }
    pre {
      background: #111;
      padding: 12px;
      border-radius: 8px;
      margin-bottom: 14px;
      overflow-x: auto;
      font-size: 12px;
      color: #c0c0c0;
    }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; }
    button {
      padding: 8px 18px;
      border-radius: 6px;
      border: none;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-start { background: #4ade80; color: #1a1a1a; }
    .btn-stop { background: #ef4444; color: #fff; }
    .btn-restart { background: #f59e0b; color: #141414; }
    .btn-refresh { background: #222; color: #bdbdbd; border: 1px solid #3a3a3a; }
    .btn-install { background: #dc2828; color: #fff; }
    .btn-config { background: #444; color: #e2e2e2; border: 1px solid #5a5a5a; }
    .btn-link { background: #1f2937; color: #dbeafe; border: 1px solid #374151; }
    .error {
      color: #fca5a5;
      font-size: 12px;
      margin-top: 8px;
      white-space: pre-wrap;
    }
    .issues {
      margin-top: 8px;
      font-size: 12px;
      color: #fef3c7;
    }
    .issue-item {
      padding: 6px 8px;
      border: 1px solid #4b2e12;
      background: #2a1e12;
      border-radius: 6px;
      margin-bottom: 6px;
    }
    .muted { color: #9a9a9a; font-size: 12px; }
  </style>
</head>
<body>
  <h2>OpenClaw Gateway Status</h2>
  <div class="subtitle">Last updated: ${updatedAt}</div>
  <div class="status-row">
    <span class="indicator ${running ? 'on' : 'off'}"></span>
    <span>${running ? 'Running' : installed ? 'Not Running' : 'Not Installed'}</span>
  </div>
  <div class="card">
    <div class="grid">
      <div class="kv"><span>Status</span><span>${running ? 'Running' : installed ? 'Stopped' : 'Missing'}</span></div>
      <div class="kv"><span>Service</span><span>${safeService}</span></div>
      <div class="kv"><span>PID</span><span>${safePid}</span></div>
      <div class="kv"><span>Port</span><span>${safePort}</span></div>
      <div class="kv"><span>Uptime</span><span>${safeUptime}</span></div>
    </div>
  </div>
  <div class="card">
    <div class="grid">
      <div class="kv"><span>Dashboard</span><span>${safeDashboard}</span></div>
      <div class="kv"><span>Probe</span><span>${safeProbe}</span></div>
      <div class="kv"><span>Logs</span><span>${safeLogFile}</span></div>
      <div class="kv"><span>Config</span><span>${safeConfigPath}</span></div>
      <div class="kv"><span>CLI</span><span>${safeCliPath}</span></div>
    </div>
  </div>
  ${safeIssues.length
    ? `<div class="card">
        <div class="issues">
          ${safeIssues.map(i => `<div class="issue-item">${i}</div>`).join('')}
        </div>
      </div>`
    : ''}
  <pre>${safeRaw}</pre>
  ${error ? `<div class="error">${safeError}</div>` : `<div class="muted">Command: openclaw gateway status</div>`}
  ${exitCode ? `<div class="muted">Exit code: ${exitCode}</div>` : ''}
  <div class="card">
    <div class="muted">Diagnostics</div>
    <pre>Command: ${safeCommand}</pre>
    ${safeStderr ? `<pre>Stderr: ${safeStderr}</pre>` : '<div class="muted">Stderr: (empty)</div>'}
    ${safePathEnv ? `<pre>PATH: ${safePathEnv}</pre>` : ''}
  </div>
  <div class="actions">
    ${installed
      ? (running
          ? '<button class="btn-stop" data-cmd="gateway-stop">Stop Gateway</button>'
          : '<button class="btn-start" data-cmd="gateway-start">Start Gateway</button>')
      : '<button class="btn-install" data-cmd="install">Install OpenClaw</button>'}
    ${installed ? '<button class="btn-restart" data-cmd="gateway-restart">Restart Gateway</button>' : ''}
    ${installed ? '<button class="btn-config" data-cmd="configure">Open Config</button>' : ''}
    ${dashboard ? '<button class="btn-link" data-cmd="open-dashboard">Open Dashboard</button>' : ''}
    ${logFile ? '<button class="btn-link" data-cmd="open-logs">Open Logs</button>' : ''}
    <button class="btn-refresh" data-cmd="refresh">Refresh</button>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const dashboardUrl = ${JSON.stringify(dashboard || '')};
    const logFilePath = ${JSON.stringify(logFile || '')};
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-cmd]');
      if (!btn) return;
      const cmd = btn.getAttribute('data-cmd');
      if (cmd === 'open-dashboard') return vscode.postMessage({ command: cmd, url: dashboardUrl });
      if (cmd === 'open-logs') return vscode.postMessage({ command: cmd, path: logFilePath });
      vscode.postMessage({ command: cmd });
    });
    setInterval(() => vscode.postMessage({ command: 'refresh' }), 5000);
  </script>
</body>
</html>`;
  }
}
