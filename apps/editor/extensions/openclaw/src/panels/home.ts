import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as os from 'os';
import * as path from 'path';

type GatewayStatus = 'checking' | 'running' | 'stopped' | 'starting' | 'stopping' | 'restarting' | 'errored' | 'ai-fixing';

/**
 * Resolves the directory where OpenClaw stores its workspace files
 * (AGENTS.md, IDENTITY.md, USER.md, TOOLS.md, MEMORY.md).
 *
 * Reads the `workspace` field from ~/.openclaw/openclaw.json if present.
 * Falls back to ~/.openclaw/workspace/ if the field is absent or unreadable.
 * Expands a leading ~ to the home directory.
 */
function getOpenClawWorkspaceDir(): string {
  const fallback = path.join(os.homedir(), '.openclaw', 'workspace');
  try {
    const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
    const raw = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(raw) as Record<string, unknown>;
    const ws = config['workspace'];
    if (typeof ws === 'string' && ws.trim()) {
      return ws.startsWith('~')
        ? path.join(os.homedir(), ws.slice(1))
        : ws;
    }
  } catch {
    // openclaw.json missing or unreadable — use fallback
  }
  return fallback;
}

export class HomePanel {
  public static currentPanel: HomePanel | undefined;
  private static _installTerminal: vscode.Terminal | undefined;
  /** Resolves with the password (or undefined on cancel) when the webview modal submits. */
  private static _pendingPasswordResolve: ((pwd: string | undefined) => void) | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];
  private _commandAction: 'start' | 'stop' | 'restart' | null = null;
  private _sidebarOpen = false; // tracks chat sidebar open state across webview reloads
  private _pollingTimer: ReturnType<typeof setInterval> | undefined;
  private readonly _outputChannel: vscode.OutputChannel;
  private _lastInstalledState: boolean | undefined;
  private _pollTick = 0;

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._outputChannel = vscode.window.createOutputChannel('OpenClaw Gateway');
    const iconUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'icon.png')
    );
    this._panel.webview.html = this._getLoadingHtml(iconUri.toString());
    void this._update();
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    // Re-check installation whenever the panel becomes visible again.
    this._panel.onDidChangeViewState(e => {
      if (e.webviewPanel.visible) { void this._update(); }
    }, null, this._disposables);
    // Watch ~/.openclaw/openclaw.json for when OpenClaw first initialises.
    const configWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(vscode.Uri.file(path.join(os.homedir(), '.openclaw')), 'openclaw.json'),
      false, true, false,
    );
    configWatcher.onDidCreate(() => void this._update(), null, this._disposables);
    configWatcher.onDidDelete(() => void this._update(), null, this._disposables);
    this._disposables.push(configWatcher);
    // Also watch home dir for ~/.openclaw itself being created (npm install done).
    const homeWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(vscode.Uri.file(os.homedir()), '.openclaw'),
      false, true, false,
    );
    homeWatcher.onDidCreate(() => void this._update(), null, this._disposables);
    homeWatcher.onDidDelete(() => void this._update(), null, this._disposables);
    this._disposables.push(homeWatcher);
    this._panel.webview.onDidReceiveMessage(msg => {
      if (msg.command === 'gatewayAction') {
        void this._handleGatewayAction(msg.action as 'start' | 'stop' | 'restart');
      } else if (msg.command === 'checkVersion') {
        void this._checkLatestVersion();
      } else if (msg.command === 'runSetup') {
        void this._runSetup(msg as { command: string; provider: string; apiKey: string; port: string });
      } else if (msg.command === 'sudoPassword') {
        // Password modal submitted or cancelled from the webview.
        HomePanel._pendingPasswordResolve?.(msg.password as string | undefined);
        HomePanel._pendingPasswordResolve = undefined;
      } else if (msg.command === 'toggleChat') {
        const cmd = this._sidebarOpen ? 'void.sidebar.close' : 'void.sidebar.open';
        void vscode.commands.executeCommand(cmd).then(async () => {
          // Let the sidebar finish opening/closing, then read real state.
          await new Promise(r => setTimeout(r, 150));
          this._sidebarOpen = await vscode.commands.executeCommand<boolean>('void.sidebar.isVisible').then(v => !!v, () => this._sidebarOpen);
          try { this._panel.webview.postMessage({ type: 'chatState', open: this._sidebarOpen }); } catch {}
        });
      } else if (msg.command === 'openWorkspaceFile') {
        const allowed = new Set(['AGENTS.md', 'IDENTITY.md', 'USER.md', 'TOOLS.md', 'MEMORY.md']);
        const file = msg.file as string;
        if (!allowed.has(file)) return;
        const workspaceDir = getOpenClawWorkspaceDir();
        const filePath = path.join(workspaceDir, file);
        if (!fs.existsSync(filePath)) {
          if (file === 'MEMORY.md') {
            // Auto-create MEMORY.md with a scaffolded long-term agent memory template
            const scaffold = [
              '# Agent Long-Term Memory',
              '',
              'This file is the persistent long-term memory for the AI agent embedded in OCcode.',
              'The agent reads this file at the start of every session to recall important context,',
              'preferences, and decisions made in previous conversations.',
              '',
              '---',
              '',
              '## About This File',
              '',
              '- **Purpose**: Stores facts, decisions, and context that should persist across agent sessions.',
              '- **Owner**: You — edit freely to add, update, or remove entries.',
              '- **Format**: Plain Markdown. Keep entries concise and well-organised.',
              '',
              '## User Preferences',
              '',
              '<!-- Add preferences the agent should always follow, e.g.:',
              '- Prefer TypeScript over JavaScript',
              '- Always use tabs for indentation',
              '-->',
              '',
              '## Project Context',
              '',
              '<!-- Record important architectural decisions, repo layout notes, or recurring patterns. -->',
              '',
              '## Recurring Solutions',
              '',
              '<!-- Document fixes for problems that come up repeatedly. -->',
              '',
              '## Notes',
              '',
              '<!-- Anything else the agent should remember long-term. -->',
            ].join('\n');
            fs.mkdirSync(workspaceDir, { recursive: true });
            fs.writeFileSync(filePath, scaffold, 'utf8');
          } else {
            vscode.window.showWarningMessage(
              `${file} not found in ${workspaceDir}. OpenClaw may not have initialised its workspace yet.`
            );
            return;
          }
        }
        vscode.commands.executeCommand('vscode.open', vscode.Uri.file(filePath));
      } else if (msg.command) {
        vscode.commands.executeCommand(msg.command);
      }
    }, null, this._disposables);
  }

  public static createOrShow(extensionUri: vscode.Uri) {
    if (HomePanel.currentPanel) {
      HomePanel.currentPanel._panel.reveal();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'openclawHome', 'OpenClaw Home', vscode.ViewColumn.One,
      { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')] }
    );
    HomePanel.currentPanel = new HomePanel(panel, extensionUri);
  }

  /** Re-run CLI detection and redraw — called after install completes. */
  public static refresh(): void {
    if (HomePanel.currentPanel) {
      void HomePanel.currentPanel._update();
    }
  }

  /**
   * Fully silent install — no terminal is ever opened.
   * Output is streamed line-by-line to the home panel webview.
   * If sudo is needed, a VS Code password dialog is shown.
   * On any failure the AI is invoked immediately with full context.
   */
  public static async runInstall(
    extensionUri: vscode.Uri,
    platform: string,
    arch: string,
    shell: string,
  ): Promise<void> {
    HomePanel.createOrShow(extensionUri);
    const panel = HomePanel.currentPanel;
    if (!panel) return;

    const post = (msg: object) => { try { panel._panel.webview.postMessage(msg); } catch {} };
    let fullLog = '';
    const tee = (text: string) => { fullLog += text; post({ type: 'installLog', text }); };

    post({ type: 'installState', state: 'running' });

    const env = panel._buildExecEnv();
    const isPermError = (s: string) => /EACCES|permission denied|EPERM|not permitted/i.test(s);

    // Spawn a command silently and stream output to the panel.
    const runCaptured = (cmd: string, args: string[], opts: cp.SpawnOptions = {}): Promise<{ code: number }> =>
      new Promise(resolve => {
        const child = cp.spawn(cmd, args, { env, stdio: ['ignore', 'pipe', 'pipe'], ...opts });
        child.stdout?.on('data', (d: Buffer) => tee(d.toString()));
        child.stderr?.on('data', (d: Buffer) => tee(d.toString()));
        child.on('close', code => resolve({ code: code ?? 1 }));
        child.on('error', err => { tee(`\nError: ${err.message}\n`); resolve({ code: 1 }); });
      });

    // Ask for sudo password via in-webview modal, cache with `sudo -S -v`, return success.
    const cacheSudo = async (_prompt: string): Promise<boolean> => {
      const password = await new Promise<string | undefined>(resolve => {
        HomePanel._pendingPasswordResolve = resolve;
        post({ type: 'requestPassword' });
      });
      if (!password) return false;
      tee('Verifying credentials...\n');
      return new Promise(resolve => {
        const child = cp.spawn('sudo', ['-S', '-v'], { env, stdio: ['pipe', 'pipe', 'pipe'] });
        child.stdin?.write(password + '\n');
        child.stdin?.end();
        child.on('close', code => resolve(code === 0));
        child.on('error', () => resolve(false));
      });
    };

    const fail = async () => {
      post({ type: 'installState', state: 'failed' });
      const platformDesc = platform === 'darwin' ? 'macOS' : platform === 'win32' ? 'Windows' : `Linux (${arch})`;
      await vscode.commands.executeCommand('void.openChatWithMessage', [
        `OpenClaw installation failed on **${platformDesc}**.`,
        ``, `**System info:**`,
        `- Node.js: \`${process.version}\``,
        `- Shell: \`${shell || 'unknown'}\``,
        ``, `**Full output:**`, `\`\`\``, fullLog.trim(), `\`\`\``, ``,
        `Please diagnose what went wrong and provide exact steps to fix it on this platform.`,
        `If Node.js or npm is missing, explain how to install them first.`,
      ].join('\n'));
      void vscode.commands.executeCommand('openclaw.balance.spend');
    };

    // ── Step 1: try npm install -g openclaw ───────────────────────────────────
    tee('Checking for npm...\n');
    const npmOk = await new Promise<boolean>(resolve =>
      cp.exec('npm --version', { env, timeout: 5000, windowsHide: true }, err => resolve(!err))
    );

    if (npmOk) {
      tee('npm found — installing openclaw...\n');
      const spawnOpts: cp.SpawnOptions = platform === 'win32' ? { shell: true, windowsHide: true } : {};
      const r1 = await runCaptured('npm', ['install', '-g', 'openclaw'], spawnOpts);
      if (r1.code === 0) {
        tee('\n✅  Installed successfully!\n');
        post({ type: 'installState', state: 'done' });
        setTimeout(() => {
          HomePanel.refresh();
          vscode.commands.executeCommand('openclaw.openWorkspace');
        }, 1500);
        return;
      }
      // Permission error on Unix → ask for sudo, then retry
      if (platform !== 'win32' && isPermError(fullLog)) {
        tee('\nPermission error — elevated access required.\n');
        const ok = await cacheSudo('Enter your system password to install OpenClaw');
        if (!ok) { tee('Incorrect password or cancelled.\n'); await fail(); return; }
        tee('Retrying with elevated permissions...\n');
        const r2 = await runCaptured('sudo', ['-E', 'npm', 'install', '-g', 'openclaw']);
        if (r2.code === 0) {
          tee('\n✅  Installed successfully!\n');
          post({ type: 'installState', state: 'done' });
          setTimeout(() => {
          HomePanel.refresh();
          vscode.commands.executeCommand('openclaw.openWorkspace');
        }, 1500);
          return;
        }
      }
      tee('\nnpm install did not succeed — trying full installer script...\n');
    } else {
      tee('npm not found — running full installer script...\n');
    }

    // ── Step 2: full install script, captured (no terminal) ───────────────────
    if (platform === 'win32') {
      tee('Running PowerShell installer...\n');
      const psArgs = [
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
        `$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; ` +
        `Invoke-WebRequest -UseBasicParsing https://openclaw.ai/install.ps1 | Invoke-Expression`,
      ];
      const r = await runCaptured('powershell', psArgs, { windowsHide: true } as cp.SpawnOptions);
      if (r.code === 0) {
        tee('\n✅  Installed successfully!\n');
        post({ type: 'installState', state: 'done' });
        setTimeout(() => {
          HomePanel.refresh();
          vscode.commands.executeCommand('openclaw.openWorkspace');
        }, 1500);
        return;
      }
    } else {
      tee('Running install script...\n');
      const r1 = await runCaptured('bash', ['-c', 'curl -fsSL https://openclaw.ai/install.sh | bash']);
      if (r1.code === 0) {
        tee('\n✅  Installed successfully!\n');
        post({ type: 'installState', state: 'done' });
        setTimeout(() => {
          HomePanel.refresh();
          vscode.commands.executeCommand('openclaw.openWorkspace');
        }, 1500);
        return;
      }
      // Permission error → sudo cache → retry
      if (isPermError(fullLog)) {
        tee('\nPermission error in installer — elevated access required.\n');
        const ok = await cacheSudo('Enter your system password to complete installation');
        if (ok) {
          tee('Retrying with cached credentials...\n');
          const r2 = await runCaptured('bash', ['-c', 'curl -fsSL https://openclaw.ai/install.sh | bash']);
          if (r2.code === 0) {
            tee('\n✅  Installed successfully!\n');
            post({ type: 'installState', state: 'done' });
            setTimeout(() => {
          HomePanel.refresh();
          vscode.commands.executeCommand('openclaw.openWorkspace');
        }, 1500);
            return;
          }
        }
      }
    }

    await fail();
  }

  public dispose() {
    HomePanel.currentPanel = undefined;
    this._stopPolling();
    this._outputChannel.dispose();
    this._panel.dispose();
    this._disposables.forEach(d => d.dispose());
  }

  private async _update() {
    const openclawDir = path.join(os.homedir(), '.openclaw');
    const dirExists = fs.existsSync(openclawDir);
    const cliCheck = await this._testOpenClawCli();
    const configFile = path.join(os.homedir(), '.openclaw', 'openclaw.json');
    const isConfigured = fs.existsSync(configFile);
    const isInstalled = cliCheck.ok || isConfigured;
    this._lastInstalledState = isInstalled;
    const iconUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'icon.png')
    );

    // Show setup wizard when CLI is present but not yet configured.
    if (isInstalled && !isConfigured) {
      this._panel.webview.html = this._getWizardHtml(iconUri.toString());
    } else {
      this._panel.webview.html = this._getHtml(isInstalled, dirExists, cliCheck, iconUri.toString());
    }
    // Kick off gateway status polling now that the webview is ready.
    this._startPolling();
  }

  // ── Gateway status helpers ─────────────────────────────────────────────────

  /** Raw HTTP probe — no _commandAction guard. Used by the polling loop. */
  private _checkGatewayStatusRaw(): Promise<GatewayStatus> {
    return new Promise(resolve => {
      const req = http.get('http://localhost:18789/', { timeout: 2000 }, res => {
        res.resume();
        resolve(res.statusCode !== undefined && res.statusCode < 500 ? 'running' : 'errored');
      });
      req.on('error', (err: NodeJS.ErrnoException) => {
        resolve(err.code === 'ECONNREFUSED' ? 'stopped' : 'errored');
      });
      req.on('timeout', () => { req.destroy(); resolve('stopped'); });
    });
  }

  private async _checkGatewayStatus(): Promise<GatewayStatus> {
    if (this._commandAction) {
      return this._commandAction === 'start' ? 'starting'
           : this._commandAction === 'stop'  ? 'stopping'
           : 'restarting';
    }
    return this._checkGatewayStatusRaw();
  }

  /**
   * Fast synchronous check — ~/.openclaw/openclaw.json is the single
   * definitive signal that OpenClaw is installed and initialised.
   */
  private _quickInstallCheck(): boolean {
    // True if openclaw.json exists, OR if the binary is on PATH (npm install done).
    if (fs.existsSync(path.join(os.homedir(), '.openclaw', 'openclaw.json'))) return true;
    // Fast synchronous binary check — look for openclaw in npm global bin.
    try {
      const npmGlobalBin = require('child_process')
        .execSync('npm bin -g 2>/dev/null || npm prefix -g', { timeout: 2000, windowsHide: true })
        .toString().trim().split('\n')[0].trim();
      const binName = process.platform === 'win32' ? 'openclaw.cmd' : 'openclaw';
      return fs.existsSync(require('path').join(npmGlobalBin, binName));
    } catch {
      return false;
    }
  }

  private _startPolling(): void {
    this._stopPolling();
    this._pollTick = 0;
    const tick = async () => {
      if (!HomePanel.currentPanel) return;
      this._pollTick++;

      // Every 5 ticks (~10s): quick existsSync check on known binary paths.
      // No process spawn — just cheap stat calls. If the result differs from
      // the last known state, do a full _update() to confirm and re-render.
      if (this._pollTick % 5 === 0) {
        const nowInstalled = this._quickInstallCheck();
        if (nowInstalled !== this._lastInstalledState) {
          void this._update();
          return;
        }
      }

      const [status, aiRunning, sidebarVisible] = await Promise.all([
        this._checkGatewayStatus(),
        vscode.commands.executeCommand<boolean>('void.getIsRunning').then(v => !!v, () => false),
        vscode.commands.executeCommand<boolean>('void.sidebar.isVisible').then(v => !!v, () => this._sidebarOpen),
      ]);
      this._sidebarOpen = sidebarVisible;
      // Don't overwrite the intermediary status while a gateway command is in progress.
      if (!this._commandAction) {
        try { this._panel.webview.postMessage({ type: 'gatewayStatus', status }); } catch {}
      }
      try { this._panel.webview.postMessage({ type: 'aiRunning', running: aiRunning }); } catch {}
      try { this._panel.webview.postMessage({ type: 'chatState', open: this._sidebarOpen }); } catch {}
    };
    void tick();
    this._pollingTimer = setInterval(tick, 2000);
  }

  private _stopPolling(): void {
    if (this._pollingTimer !== undefined) {
      clearInterval(this._pollingTimer);
      this._pollingTimer = undefined;
    }
  }

  /**
   * Polls the actual gateway HTTP status until the expected state is reached
   * or the timeout expires. Streams live status updates to the webview while
   * waiting so the UI stays accurate (still "Starting…" etc.).
   */
  private async _handleGatewayAction(action: 'start' | 'stop' | 'restart'): Promise<void> {
    const intermediary: GatewayStatus =
      action === 'start' ? 'starting' : action === 'stop' ? 'stopping' : 'restarting';
    const expectedState: GatewayStatus = action === 'stop' ? 'stopped' : 'running';

    this._commandAction = action;
    try { this._panel.webview.postMessage({ type: 'gatewayStatus', status: intermediary }); } catch {}

    // Hand off to AI — it will run the command and handle any errors
    const verb = action === 'restart' ? 'restart' : action;
    const osInfo = `${process.platform} ${os.release()} (${process.arch})`;
    const aiMessage = [
      `Please ${verb} the OpenClaw gateway.`,
      '',
      `Run the following command in your terminal:`,
      '```',
      `openclaw gateway ${action}`,
      '```',
      '',
      `Environment: ${osInfo}`,
      '',
      `Once the gateway is ${expectedState === 'running' ? 'running' : 'stopped'}, confirm it.`,
      `If the command fails or the gateway does not reach the expected state, diagnose and fix the issue.`,
    ].join('\n');

    await vscode.commands.executeCommand('void.openChatWithMessage', aiMessage, 'agent');
    void vscode.commands.executeCommand('openclaw.balance.spend');

    // Poll in the background until gateway reaches expected state
    this._pollUntilState(expectedState, intermediary);
  }

  private _pollUntilState(expected: GatewayStatus, intermediary: GatewayStatus, maxWaitMs = 180000): void {
    const deadline = Date.now() + maxWaitMs;
    const tick = async () => {
      if (Date.now() > deadline) {
        this._commandAction = null;
        try { this._panel.webview.postMessage({ type: 'gatewayStatus', status: await this._checkGatewayStatus() }); } catch {}
        return;
      }
      // Use raw status check, bypassing _commandAction guard
      const status = await this._checkGatewayStatusRaw();
      if (status === expected) {
        this._commandAction = null;
        try { this._panel.webview.postMessage({ type: 'gatewayStatus', status }); } catch {}
      } else {
        try { this._panel.webview.postMessage({ type: 'gatewayStatus', status: intermediary }); } catch {}
        setTimeout(tick, 4000);
      }
    };
    setTimeout(tick, 4000);
  }

  // ── Version check ──────────────────────────────────────────────────────────

  /** Fetches the latest openclaw version from the npm registry. */
  private _fetchLatestVersion(): Promise<string | null> {
    return new Promise(resolve => {
      // Try npm registry first — openclaw is published there.
      const req = https.get(
        { hostname: 'registry.npmjs.org', path: '/openclaw/latest', headers: { Accept: 'application/json' } },
        res => {
          let data = '';
          res.on('data', (c: Buffer) => (data += c));
          res.on('end', () => {
            try { resolve(JSON.parse(data).version ?? null); } catch { resolve(null); }
          });
        },
      );
      req.setTimeout(6000, () => { req.destroy(); resolve(null); });
      req.on('error', () => resolve(null));
    });
  }

  private async _checkLatestVersion(): Promise<void> {
    const post = (html: string) => {
      try { this._panel.webview.postMessage({ type: 'versionResult', html }); } catch {}
    };

    const [cliCheck, latest] = await Promise.all([
      this._testOpenClawCli(),
      this._fetchLatestVersion(),
    ]);

    if (!latest) {
      post(`<span style="color:#888">Could not reach version server — check your connection.</span>`);
      return;
    }

    const installed = cliCheck.ok ? (cliCheck.output ?? '').trim() : null;

    if (!installed) {
      post(`<span style="color:#60a5fa">Latest: <strong>${latest}</strong> — OpenClaw CLI not detected locally.</span>`);
      return;
    }

    // Normalise versions for comparison (strip leading 'v', build metadata, etc.)
    const norm = (v: string) => v.replace(/^v/i, '').split(/[-+]/)[0];
    if (norm(installed) === norm(latest)) {
      post(`<span style="color:#4ade80">✓ Up to date &mdash; <strong>${installed}</strong></span>`);
    } else {
      post(
        `<span style="color:#fbbf24">Update available: <strong>${latest}</strong> ` +
        `&mdash; you have <strong>${installed}</strong>. ` +
        `Run <code style="background:rgba(255,255,255,0.08);padding:1px 4px;border-radius:3px">openclaw update</code> to upgrade.</span>`,
      );
    }
  }

  private _getLoadingHtml(iconUri: string): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    html { font-size: 16px; }
    body {
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
      background: #1a1a1a;
      color: #e0e0e0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: clamp(16px, 5vw, 48px) clamp(12px, 4vw, 32px);
      text-align: center;
    }
    .logo {
      width: clamp(56px, 14vw, 96px);
      height: clamp(56px, 14vw, 96px);
      margin-bottom: clamp(14px, 3vw, 24px);
      filter: drop-shadow(0 4px 12px rgba(220, 40, 40, 0.3));
      animation: pulse 2s ease-in-out infinite;
      flex-shrink: 0;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; filter: drop-shadow(0 4px 12px rgba(220, 40, 40, 0.3)); }
      50% { opacity: 0.75; filter: drop-shadow(0 4px 20px rgba(220, 40, 40, 0.6)); }
    }
    h1 {
      font-size: clamp(16px, 4.5vw, 28px);
      font-weight: 700;
      margin-bottom: clamp(4px, 1vw, 8px);
      color: #fff;
      line-height: 1.2;
      word-break: break-word;
    }
    h1 .accent { color: #dc2828; }
    .tagline {
      color: #888;
      font-size: clamp(11px, 2.5vw, 14px);
      margin-bottom: clamp(24px, 6vw, 40px);
      max-width: 40ch;
      line-height: 1.5;
    }
    .spinner-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: clamp(10px, 2.5vw, 16px);
    }
    .spinner {
      width: clamp(24px, 6vw, 36px);
      height: clamp(24px, 6vw, 36px);
      border: 3px solid rgba(220, 40, 40, 0.15);
      border-top-color: #dc2828;
      border-radius: 50%;
      animation: spin 0.75s linear infinite;
      flex-shrink: 0;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .loading-text {
      font-size: clamp(11px, 2.5vw, 13px);
      color: #666;
      letter-spacing: 0.02em;
    }
    .loading-dots::after {
      content: '';
      animation: dots 1.5s steps(4, end) infinite;
    }
    @keyframes dots {
      0%   { content: ''; }
      25%  { content: '.'; }
      50%  { content: '..'; }
      75%  { content: '...'; }
      100% { content: ''; }
    }
  </style>
</head>
<body>
  <img class="logo" src="${iconUri}" alt="OpenClaw" />
  <h1>Welcome to <span class="accent">OpenClaw</span> Code</h1>
  <p class="tagline">AI Powered Local Harness for OpenClaw</p>
  <div class="spinner-wrap">
    <div class="spinner"></div>
    <span class="loading-text">Checking environment<span class="loading-dots"></span></span>
  </div>
</body>
</html>`;
  }

  // ── Setup wizard ───────────────────────────────────────────────────────────

  private async _runSetup(data: { provider: string; apiKey: string; port: string }): Promise<void> {
    const post = (msg: object) => { try { this._panel.webview.postMessage(msg); } catch {} };
    const env = this._buildExecEnv();
    const cliPath = await this._findOpenClawPath() ?? 'openclaw';
    const port = data.port && /^\d+$/.test(data.port) ? data.port : '18789';
    const isFree = data.provider === 'free';

    // Map provider choice to openclaw flags.
    const providerFlags: Record<string, string[]> = {
      free: [
        '--auth-choice', 'custom-api-key',
        '--custom-base-url', 'https://inference.mba.sh/v1',
        '--custom-api-key', 'sk-moltpilot-prod',
        '--custom-model-id', 'moltpilot',
        '--custom-compatibility', 'openai',
      ],
      anthropic:   ['--auth-choice', 'apiKey',             '--anthropic-api-key',   data.apiKey],
      openai:      ['--auth-choice', 'openai-api-key',     '--openai-api-key',      data.apiKey],
      openrouter:  ['--auth-choice', 'openrouter-api-key', '--openrouter-api-key', data.apiKey],
      gemini:      ['--auth-choice', 'gemini-api-key',     '--gemini-api-key',      data.apiKey],
    };
    const flags = providerFlags[data.provider];
    if (!flags) {
      post({ type: 'wizardLog', text: 'Unknown provider selected.\n', done: true, ok: false });
      return;
    }

    const args = [
      'onboard',
      '--non-interactive', '--accept-risk',
      '--flow', 'quickstart',
      '--gateway-auth', 'token',
      '--gateway-port', port,
      '--skip-channels', '--skip-skills', '--skip-health',
      ...flags,
    ];

    post({ type: 'wizardLog', text: isFree ? 'Setting up free MoltPilot access...\n' : 'Starting OpenClaw setup...\n', done: false, ok: false });

    await new Promise<void>(resolve => {
      const child = cp.spawn(cliPath, args, {
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        ...(process.platform === 'win32' ? { shell: true, windowsHide: true } : {}),
      });
      child.stdout?.on('data', (d: Buffer) => post({ type: 'wizardLog', text: d.toString(), done: false, ok: false }));
      child.stderr?.on('data', (d: Buffer) => post({ type: 'wizardLog', text: d.toString(), done: false, ok: false }));
      child.on('close', code => {
        const ok = code === 0;
        post({ type: 'wizardLog', text: ok ? '\n✅ Setup complete!\n' : `\nSetup exited with code ${code}.\n`, done: true, ok });
        if (ok) {
          if (isFree) {
            // Write local free-tier marker (no remote enforcement).
            try {
              const occDir = path.join(os.homedir(), '.occ');
              if (!fs.existsSync(occDir)) fs.mkdirSync(occDir, { recursive: true });
              fs.writeFileSync(
                path.join(occDir, 'moltpilot-tier.json'),
                JSON.stringify({ tier: 'free', grantedAt: new Date().toISOString(), limitUsd: 1.00 }),
              );
            } catch { /* non-fatal */ }
          }
          setTimeout(() => {
            HomePanel.refresh();
            if (isFree) {
              // Open chat immediately — moltpilot is already configured in OCcode.
              vscode.commands.executeCommand('void.sidebar.open');
            } else {
              vscode.commands.executeCommand('openclaw.openWorkspace');
            }
          }, 1500);
        }
        resolve();
      });
      child.on('error', err => {
        post({ type: 'wizardLog', text: `Error: ${err.message}\n`, done: true, ok: false });
        resolve();
      });
    });
  }

  private _getWizardHtml(iconUri: string): string {
    const providers = [
      { id: 'anthropic',  label: 'Anthropic Claude', hint: 'console.anthropic.com/settings/keys', placeholder: 'sk-ant-...' },
      { id: 'openai',     label: 'OpenAI',           hint: 'platform.openai.com/api-keys',        placeholder: 'sk-...' },
      { id: 'openrouter', label: 'OpenRouter',       hint: 'openrouter.ai/settings/keys',         placeholder: 'sk-or-...' },
      { id: 'gemini',     label: 'Google Gemini',    hint: 'aistudio.google.com/apikey',          placeholder: 'AIza...' },
    ];

    const providerCards = providers.map(p =>
      `<button class="prov-card" data-id="${p.id}" data-placeholder="${p.placeholder}" data-hint="${p.hint}" onclick="pickProvider(this)">
        <span class="prov-label">${p.label}</span>
        <span class="prov-hint">${p.hint}</span>
      </button>`
    ).join('\n      ');

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
      background: #1a1a1a; color: #e0e0e0;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      min-height: 100vh; padding: 32px 20px; text-align: center;
    }
    .logo { width: 64px; height: 64px; margin-bottom: 16px; filter: drop-shadow(0 4px 12px rgba(220,40,40,0.3)); }
    h1 { font-size: 22px; font-weight: 700; color: #fff; margin-bottom: 4px; }
    h1 .accent { color: #dc2828; }
    .subtitle { color: #888; font-size: 13px; margin-bottom: 32px; }
    .step { width: min(520px, 96vw); }
    .step-label { font-size: 11px; color: #555; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 12px; }
    h2 { font-size: 16px; font-weight: 600; color: #fff; margin-bottom: 8px; }
    .step-desc { font-size: 12px; color: #888; margin-bottom: 24px; line-height: 1.5; }
    /* Step 0 — tier choice */
    .tier-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 8px; }
    .tier-card {
      background: rgba(255,255,255,0.03); border: 1px solid #2b2b2b;
      border-radius: 10px; padding: 18px 16px 16px; cursor: pointer;
      text-align: left; transition: border-color 0.15s, background 0.15s;
      display: flex; flex-direction: column;
    }
    .tier-card:hover { border-color: #444; background: rgba(255,255,255,0.05); }
    .tier-card.free-card { border-color: #2a3d2a; }
    .tier-card.free-card:hover { border-color: #3d6b3d; background: rgba(40,160,80,0.06); }
    .tier-price { font-size: 22px; font-weight: 800; color: #fff; margin-bottom: 3px; }
    .tier-price .tier-unit { font-size: 12px; font-weight: 400; color: #777; }
    .tier-sub { font-size: 11px; color: #555; margin-bottom: 14px; line-height: 1.5; }
    .provider-logos { display: flex; gap: 8px; align-items: center; margin-bottom: 14px; flex-wrap: wrap; }
    .prov-icon {
      width: 28px; height: 28px; border-radius: 6px;
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; font-weight: 700; flex-shrink: 0;
    }
    .tier-cta {
      margin-top: auto; padding: 8px 14px; border-radius: 7px;
      font-size: 12px; font-weight: 600; border: none; cursor: pointer;
      width: 100%; text-align: center;
    }
    .tier-cta.green { background: #16a34a; color: #fff; }
    .tier-cta.green:hover { background: #15803d; }
    .tier-cta.red { background: #dc2828; color: #fff; }
    .tier-cta.red:hover { background: #b91c1c; }
    .tier-note { font-size: 11px; color: #444; margin-top: 8px; text-align: center; }
    /* Provider cards */
    .prov-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 24px; }
    .prov-card {
      background: rgba(255,255,255,0.03); border: 1px solid #2b2b2b;
      border-radius: 8px; padding: 14px 12px; cursor: pointer;
      text-align: left; transition: border-color 0.15s, background 0.15s;
      display: flex; flex-direction: column; gap: 4px;
    }
    .prov-card:hover { border-color: #444; background: rgba(255,255,255,0.05); }
    .prov-card.selected { border-color: #dc2828; background: rgba(220,40,40,0.08); }
    .prov-label { font-size: 13px; font-weight: 600; color: #e0e0e0; }
    .prov-hint { font-size: 11px; color: #666; }
    /* API key input */
    .field-label { font-size: 11px; color: #888; text-align: left; margin-bottom: 5px; }
    .key-input {
      width: 100%; background: #111; border: 1px solid #2b2b2b; border-radius: 6px;
      color: #e0e0e0; font-size: 13px; padding: 9px 12px; outline: none;
      margin-bottom: 6px; box-sizing: border-box; font-family: monospace;
    }
    .key-input:focus { border-color: #dc2828; }
    .key-hint { font-size: 11px; color: #555; text-align: left; margin-bottom: 20px; }
    .port-row { display: flex; align-items: center; gap: 10px; margin-bottom: 24px; }
    .port-label { font-size: 12px; color: #888; white-space: nowrap; }
    .port-input {
      width: 90px; background: #111; border: 1px solid #2b2b2b; border-radius: 6px;
      color: #e0e0e0; font-size: 13px; padding: 7px 10px; outline: none;
      box-sizing: border-box;
    }
    .port-input:focus { border-color: #dc2828; }
    /* Buttons */
    .btn-row { display: flex; gap: 10px; justify-content: flex-end; }
    .btn-back {
      background: transparent; border: 1px solid #333; color: #888;
      font-size: 13px; padding: 8px 18px; border-radius: 6px; cursor: pointer;
    }
    .btn-back:hover { background: rgba(255,255,255,0.05); }
    .btn-primary {
      background: #dc2828; border: none; color: #fff;
      font-size: 13px; font-weight: 600; padding: 8px 22px; border-radius: 6px;
      cursor: pointer; display: flex; align-items: center; gap: 7px;
    }
    .btn-primary:hover { background: #b91c1c; }
    .btn-primary:disabled { background: #7a1515; cursor: not-allowed; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .spin {
      display: inline-block; width: 13px; height: 13px;
      border: 2px solid rgba(255,255,255,0.2); border-top-color: #fff;
      border-radius: 50%; animation: spin 0.65s linear infinite; flex-shrink: 0;
    }
    /* Running step */
    .run-status {
      font-size: 12px; color: #555; margin-top: 16px;
      max-width: 280px; text-align: center; line-height: 1.5;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .run-status.done { color: #4ade80; white-space: normal; }
    .run-status.failed { color: #f87171; white-space: normal; }
    /* Progress dots */
    @keyframes dots { 0%,100%{content:''} 33%{content:'.'} 66%{content:'..'} 100%{content:'...'} }
    .dots::after { content: ''; animation: dots 1.2s steps(1) infinite; }
  </style>
</head>
<body>
  <img class="logo" src="${iconUri}" alt="OpenClaw" />
  <h1>Welcome to <span class="accent">OpenClaw</span> Code</h1>
  <p class="subtitle">OpenClaw is installed. Let's get you connected to an AI.</p>

  <!-- Step 0: Free vs BYOK -->
  <div id="step0" class="step">
    <h2>Get started</h2>
    <p class="step-desc">How would you like to connect?</p>
    <div class="tier-grid">
      <!-- Free card -->
      <div class="tier-card free-card">
        <div class="tier-price">$1<span class="tier-unit"> to start</span></div>
        <div class="tier-sub">We rent you our AI model.<br>Lasts about a week. No card needed.</div>
        <button class="tier-cta green" onclick="chooseFree()">Start Free →</button>
      </div>
      <!-- BYOK card -->
      <div class="tier-card">
        <div class="provider-logos">
          <!-- Anthropic -->
          <div class="prov-icon" style="background:#c9b49a;color:#1a1008" title="Anthropic">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M13.827 3.279L20.75 20.5h-3.06l-1.523-4.01H7.833L6.31 20.5H3.25l6.923-17.221zm-.662 4.02l-2.43 6.4h4.86z"/></svg>
          </div>
          <!-- OpenAI -->
          <div class="prov-icon" style="background:#fff;color:#000" title="OpenAI">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M22.28 9.28a5.998 5.998 0 0 0-.52-4.93 6.17 6.17 0 0 0-6.6-2.96A6.004 6.004 0 0 0 10.64 0a6.17 6.17 0 0 0-5.88 4.27 5.999 5.999 0 0 0-4 2.91 6.17 6.17 0 0 0 .76 7.22 6 6 0 0 0 .52 4.93 6.17 6.17 0 0 0 6.6 2.96 6 6 0 0 0 4.52 2.39 6.17 6.17 0 0 0 5.89-4.28 5.999 5.999 0 0 0 3.99-2.91 6.17 6.17 0 0 0-.76-7.21zm-9.28 12.98a4.57 4.57 0 0 1-2.93-1.06l.14-.08 4.87-2.81a.8.8 0 0 0 .4-.69v-6.87l2.06 1.19a.07.07 0 0 1 .04.06v5.69a4.6 4.6 0 0 1-4.58 4.57zm-9.87-4.2a4.57 4.57 0 0 1-.55-3.07l.15.09 4.86 2.81a.8.8 0 0 0 .79 0l5.94-3.43v2.38a.07.07 0 0 1-.03.06l-4.92 2.84a4.6 4.6 0 0 1-6.24-1.68zm-1.28-10.7a4.56 4.56 0 0 1 2.38-2l-.01.17v5.62a.8.8 0 0 0 .4.69l5.94 3.43-2.06 1.19a.07.07 0 0 1-.07 0L3.53 13.2a4.6 4.6 0 0 1-.68-6.84zm16.9 3.95l-5.94-3.43 2.06-1.19a.07.07 0 0 1 .07 0l4.92 2.84a4.59 4.59 0 0 1-.71 8.29v-5.79a.8.8 0 0 0-.4-.72zm2.05-3.08l-.15-.09-4.86-2.8a.8.8 0 0 0-.79 0L9.16 9.29V6.91a.07.07 0 0 1 .03-.06l4.92-2.84a4.59 4.59 0 0 1 6.84 4.76v.01zm-12.84 4.22L5.9 10.26a.07.07 0 0 1-.04-.06V4.51a4.59 4.59 0 0 1 7.53-3.52l-.14.08-4.87 2.81a.8.8 0 0 0-.4.69v6.87l-2.05-1.18zm1.11-2.41l2.65-1.53 2.65 1.53v3.05l-2.65 1.53-2.65-1.53V9.84z"/></svg>
          </div>
          <!-- OpenRouter -->
          <div class="prov-icon" style="background:#6366f1;color:#fff" title="OpenRouter">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="2"/><circle cx="6" cy="12" r="2"/><circle cx="18" cy="19" r="2"/><path d="M8 11.5l8-5M8 12.5l8 5"/></svg>
          </div>
          <!-- Gemini -->
          <div class="prov-icon" style="background:linear-gradient(135deg,#4285f4,#9b59b6);color:#fff" title="Google Gemini">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C9.91 6.55 6.55 9.91 2 12c4.55 2.09 7.91 5.45 10 10 2.09-4.55 5.45-7.91 10-10C17.45 9.91 14.09 6.55 12 2z"/></svg>
          </div>
        </div>
        <div class="tier-sub" style="margin-bottom:14px">Use your own API key</div>
        <button class="tier-cta red" onclick="chooseBYOK()">Use My Key →</button>
      </div>
    </div>
    <p class="tier-note">Free credit tracked locally. No account needed.</p>
  </div>

  <!-- Step 1: Choose provider (BYOK only) -->
  <div id="step1" class="step" style="display:none">
    <p class="step-label">Step 1 of 2</p>
    <h2>Choose your AI Provider</h2>
    <p class="step-desc">OpenClaw uses an AI provider to power agent conversations.<br>You can change this later with <code>openclaw configure</code>.</p>
    <div class="prov-grid">
      ${providerCards}
    </div>
    <div class="btn-row">
      <button class="btn-back" onclick="goStep0()">← Back</button>
      <button class="btn-primary" id="btn-next1" onclick="goStep2()" disabled>Continue →</button>
    </div>
  </div>

  <!-- Step 2: API key + port (BYOK only) -->
  <div id="step2" class="step" style="display:none">
    <p class="step-label">Step 2 of 2</p>
    <h2 id="step2-title">Enter your API Key</h2>
    <p class="step-desc" id="step2-desc">Your API key is stored locally in <code>~/.openclaw/openclaw.json</code>.</p>
    <p class="field-label">API Key</p>
    <input id="api-key" class="key-input" type="password" placeholder="sk-..." autocomplete="off" oninput="validateStep2()" />
    <p class="key-hint" id="key-hint">Get your key at <span id="key-link"></span></p>
    <div class="port-row">
      <span class="port-label">Gateway port</span>
      <input id="gw-port" class="port-input" type="text" value="18789" placeholder="18789" />
    </div>
    <div class="btn-row">
      <button class="btn-back" onclick="goStep1()">← Back</button>
      <button class="btn-primary" id="btn-run" onclick="runSetup()" disabled>Set Up OpenClaw</button>
    </div>
  </div>

  <!-- Step 3: Running -->
  <div id="step3" class="step" style="display:none">
    <h2><span class="dots">Setting up OpenClaw</span></h2>
    <p class="run-status" id="run-status"></p>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let selectedProvider = null;

    function goStep0() {
      document.getElementById('step1').style.display = 'none';
      document.getElementById('step0').style.display = '';
    }

    function chooseFree() {
      document.getElementById('step0').style.display = 'none';
      document.getElementById('step3').style.display = '';
      vscode.postMessage({ command: 'runSetup', provider: 'free', apiKey: '', port: '18789' });
    }

    function chooseBYOK() {
      document.getElementById('step0').style.display = 'none';
      document.getElementById('step1').style.display = '';
    }

    function pickProvider(btn) {
      document.querySelectorAll('.prov-card').forEach(c => c.classList.remove('selected'));
      btn.classList.add('selected');
      selectedProvider = btn.dataset.id;
      document.getElementById('btn-next1').disabled = false;
    }

    function goStep2() {
      if (!selectedProvider) return;
      const card = document.querySelector('.prov-card.selected');
      document.getElementById('step2-title').textContent = card.querySelector('.prov-label').textContent + ' API Key';
      document.getElementById('api-key').placeholder = card.dataset.placeholder;
      document.getElementById('key-link').textContent = card.dataset.hint;
      document.getElementById('step1').style.display = 'none';
      document.getElementById('step2').style.display = '';
      document.getElementById('api-key').focus();
    }

    function goStep1() {
      document.getElementById('step2').style.display = 'none';
      document.getElementById('step1').style.display = '';
    }

    function validateStep2() {
      const key = document.getElementById('api-key').value.trim();
      document.getElementById('btn-run').disabled = key.length < 8;
    }

    function runSetup() {
      const apiKey = document.getElementById('api-key').value.trim();
      const port = document.getElementById('gw-port').value.trim() || '18789';
      if (!apiKey || !selectedProvider) return;
      document.getElementById('step2').style.display = 'none';
      document.getElementById('step3').style.display = '';
      vscode.postMessage({ command: 'runSetup', provider: selectedProvider, apiKey, port });
    }

    const statusEl = document.getElementById('run-status');

    window.addEventListener('message', e => {
      if (e.data.type === 'wizardLog') {
        if (e.data.done) {
          statusEl.className = 'run-status ' + (e.data.ok ? 'done' : 'failed');
          statusEl.textContent = e.data.ok ? "You're all set." : 'Something went wrong. The AI will help fix it.';
        } else {
          // Show the last meaningful line as live muted status
          const line = (e.data.text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean).pop();
          if (line) { statusEl.className = 'run-status'; statusEl.textContent = line; }
        }
      }
    });
  </script>
</body>
</html>`;
  }

  private _getHtml(
    isInstalled: boolean,
    dirExists: boolean,
    cliCheck: { ok: boolean; output?: string; error?: string; command: string },
    iconUri: string
  ): string {
    const statusIcon = isInstalled ? '✅' : '⚠️';
    const statusText = isInstalled ? 'OpenClaw detected' : 'OpenClaw not found';
    const statusClass = isInstalled ? 'detected' : 'not-found';
    const buttonLabel = isInstalled ? 'Configure OpenClaw' : 'Install OpenClaw';
    const buttonCommand = isInstalled ? 'openclaw.configure' : 'openclaw.install';
    const dirText = dirExists ? 'found' : 'missing';
    const dirClass = dirExists ? 'ok' : 'warn';
    const cliText = cliCheck.ok ? (cliCheck.output || 'ok') : (cliCheck.output || cliCheck.error || 'not found');
    const cliClass = cliCheck.ok ? 'ok' : 'warn';
    const cliHint = cliCheck.ok ? '' : ` (tried: ${cliCheck.command})`;

    // ── Lucide icons (inline SVG, no CDN needed) ──────────────────────────────
    const ic = (d: string, size = 13, opacity = '0.55') =>
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;opacity:${opacity}">${d}</svg>`;
    const icFolder   = ic('<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>');
    const icTerminal = ic('<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>');
    const icServer   = ic('<rect width="20" height="8" x="2" y="2" rx="2"/><rect width="20" height="8" x="2" y="14" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>');
    const icBot      = ic('<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>');
    // Button icons — slightly larger, full opacity
    const icSettings = ic('<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>', 15, '0.9');
    const icDownload = ic('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>', 15, '0.9');
    const icRefreshCw = ic('<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>', 14, '0.85');
    const icTerminalBtn = ic('<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>', 15, '0.9');
    const icBtnPrimary = isInstalled ? icSettings : icDownload;

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    html { font-size: 16px; }
    body {
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
      background: #1a1a1a;
      color: #e0e0e0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      min-height: 100vh;
      padding: 16px clamp(12px, 4vw, 24px) 20px;
      text-align: center;
    }

    /* ── Hero ──────────────────────────────────────────────────── */
    .logo {
      width: 96px;
      height: 96px;
      margin-bottom: 8px;
      filter: drop-shadow(0 4px 12px rgba(220, 40, 40, 0.3));
      flex-shrink: 0;
    }
    h1 {
      font-size: clamp(14px, 4vw, 22px);
      font-weight: 700;
      margin-bottom: 2px;
      color: #fff;
      line-height: 1.2;
      word-break: break-word;
    }
    h1 .accent { color: #dc2828; }
    .tagline {
      color: #666;
      font-size: clamp(10px, 2vw, 11px);
      margin-bottom: 12px;
      line-height: 1.4;
    }

    /* ── Status badge ──────────────────────────────────────────── */
    .status {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: clamp(10px, 2vw, 12px);
      margin-bottom: 10px;
      padding: 4px 10px;
      border-radius: 5px;
      background: rgba(255,255,255,0.04);
      max-width: 95vw;
    }
    .status.detected { color: #4ade80; }
    .status.not-found { color: #facc15; }

    /* ── Checks card ───────────────────────────────────────────── */
    .checks {
      width: min(520px, 96vw);
      background: rgba(255,255,255,0.03);
      border: 1px solid #2b2b2b;
      border-radius: 8px;
      padding: 6px clamp(10px, 3vw, 16px);
      margin-bottom: 10px;
      font-size: clamp(11px, 2.5vw, 12px);
    }
    .check-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      padding: 4px 0;
      border-bottom: 1px solid #2b2b2b;
    }
    .check-row:last-child { border-bottom: none; }
    .check-row .row-icon {
      display: flex;
      align-items: center;
      flex-shrink: 0;
      color: #9a9a9a;
    }
    .check-row .label {
      color: #9a9a9a;
      text-align: left;
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .check-row .value {
      flex: 0 0 auto;
      text-align: right;
      white-space: nowrap;
    }
    .check-row .value.ok { color: #4ade80; }
    .check-row .value.warn { color: #facc15; }

    /* ── Gateway status row ─────────────────────────────────────── */
    .gw-cell {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }
    .gw-spinner {
      width: 11px;
      height: 11px;
      border: 2px solid rgba(96,165,250,0.2);
      border-top-color: #60a5fa;
      border-radius: 50%;
      animation: gw-spin 0.7s linear infinite;
      display: none;
      flex-shrink: 0;
    }
    .gw-spinner.ai {
      border-color: rgba(167,139,250,0.2);
      border-top-color: #a78bfa;
    }

    /* ── MoltPilot row ──────────────────────────────────────────── */
    .molt-cell {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }
    @keyframes molt-pulse {
      0%, 100% { opacity: 1; }
      50%       { opacity: 0.4; }
    }
    @keyframes molt-sparkle {
      0%   { opacity: 0; transform: scale(0.6) rotate(-15deg); }
      30%  { opacity: 1; transform: scale(1.2) rotate(10deg); }
      60%  { opacity: 0.7; transform: scale(0.9) rotate(-5deg); }
      100% { opacity: 0; transform: scale(0.6) rotate(20deg); }
    }
    .molt-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #666;
      flex-shrink: 0;
      display: inline-block;
    }
    .molt-dot.working {
      background: #a78bfa;
      animation: molt-pulse 1.2s ease-in-out infinite;
    }
    #molt-sparkle {
      display: none;
      font-size: 13px;
      line-height: 1;
      animation: molt-sparkle 1.4s ease-in-out infinite;
    }
    #molt-sparkle.visible { display: inline-block; }
    #molt-text { max-width: none; overflow: visible; }
    .molt-chat-btn {
      display: inline-flex; align-items: center; gap: 3px;
      background: transparent; border: none; cursor: pointer;
      color: #555; padding: 2px 5px; border-radius: 4px;
      font-size: 10px; font-family: inherit; line-height: 1;
      transition: color 0.15s, background 0.15s;
      vertical-align: middle; margin-left: 4px; white-space: nowrap;
    }
    .molt-chat-btn:hover { color: #ccc; background: rgba(255,255,255,0.07); }
    .molt-chat-btn.open { color: #bbb; }
    .molt-chat-btn.open:hover { color: #ddd; background: rgba(255,255,255,0.06); }
    .gw-btn {
      font-size: clamp(10px, 2vw, 11px);
      padding: 2px 9px;
      border-radius: 4px;
      border: 1px solid currentColor;
      cursor: pointer;
      background: transparent;
      line-height: 1.5;
      transition: background 0.12s;
      display: none;
    }
    .gw-btn:disabled { opacity: 0.35; cursor: not-allowed; }
    .gw-stop    { color: #f87171; }
    .gw-stop:not(:disabled):hover    { background: rgba(248,113,113,0.15); }
    .gw-start   { color: #4ade80; }
    .gw-start:not(:disabled):hover   { background: rgba(74,222,128,0.15); }
    .gw-restart { color: #fbbf24; }
    .gw-restart:not(:disabled):hover { background: rgba(251,191,36,0.15); }

    /* ── Buttons ───────────────────────────────────────────────── */
    .btn-group {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      width: min(320px, 96vw);
      margin-top: 12px;
    }
    .btn-primary {
      background: #dc2828;
      color: #fff;
      border: none;
      padding: 9px 22px;
      border-radius: 8px;
      font-size: clamp(12px, 3vw, 14px);
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s, transform 0.1s;
      width: fit-content;
      white-space: nowrap;
      display: inline-flex;
      align-items: center;
      gap: 7px;
    }
    .btn-primary svg { flex-shrink: 0; }
    .btn-primary:hover { background: #b91c1c; }
    .btn-primary:active { transform: scale(0.98); }
    .btn-primary:disabled { background: #7a1515; cursor: not-allowed; transform: none; }
    @keyframes btn-spin { to { transform: rotate(360deg); } }
    .btn-spin {
      display: inline-block;
      width: 13px; height: 13px;
      border: 2px solid rgba(255,255,255,0.25);
      border-top-color: #fff;
      border-radius: 50%;
      animation: btn-spin 0.65s linear infinite;
      flex-shrink: 0;
    }
    .btn-secondary {
      background: transparent;
      color: #aaa;
      border: 1px solid #444;
      padding: 7px 16px;
      border-radius: 8px;
      font-size: clamp(11px, 2.5vw, 12px);
      cursor: pointer;
      transition: border-color 0.15s, color 0.15s, transform 0.1s;
      width: fit-content;
      white-space: nowrap;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .btn-secondary svg { flex-shrink: 0; }
    .btn-secondary:hover { border-color: #888; color: #ddd; }
    .btn-secondary:active { transform: scale(0.98); }

    /* ── Workspace file pills ──────────────────────────────────── */
    .pills-row {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 5px;
      margin-top: 8px;
    }
    .pill {
      font-size: clamp(9px, 2vw, 11px);
      font-family: var(--vscode-editor-font-family, monospace);
      padding: 3px 10px;
      border-radius: 999px;
      border: 1px solid rgba(220,40,40,0.35);
      color: #dc2828;
      background: rgba(220,40,40,0.08);
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.12s, border-color 0.12s;
      user-select: none;
    }
    .pill:hover {
      background: rgba(220,40,40,0.18);
      border-color: rgba(220,40,40,0.7);
    }

    /* ── More Options menu ──────────────────────────────────────── */
    .more-menu-wrap {
      position: fixed;
      top: 12px;
      right: 12px;
      z-index: 200;
    }
    .more-menu-btn {
      display: flex;
      align-items: center;
      gap: 5px;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      color: #aaa;
      font-size: 12px;
      font-weight: 500;
      padding: 5px 11px;
      border-radius: 6px;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s, color 0.15s;
    }
    .more-menu-btn:hover {
      background: rgba(255,255,255,0.1);
      border-color: rgba(255,255,255,0.2);
      color: #fff;
    }
    .more-menu-dropdown {
      display: none;
      position: absolute;
      top: calc(100% + 6px);
      right: 0;
      background: #252525;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 8px;
      min-width: 190px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.55);
      overflow: hidden;
    }
    .more-menu-dropdown.open { display: block; }
    .more-menu-section {
      padding: 5px 0;
    }
    .more-menu-section + .more-menu-section {
      border-top: 1px solid rgba(255,255,255,0.07);
    }
    .more-menu-section-label {
      padding: 5px 13px 3px;
      font-size: 10px;
      color: #555;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      font-weight: 600;
    }
    .more-menu-item {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 7px 13px;
      background: none;
      border: none;
      color: #bbb;
      font-size: 12.5px;
      font-family: inherit;
      text-align: left;
      cursor: pointer;
      transition: background 0.1s, color 0.1s;
    }
    .more-menu-item:hover {
      background: rgba(255,255,255,0.06);
      color: #fff;
    }

    /* ── Narrow panel adjustments (< 300px) ────────────────────── */
    @media (max-width: 299px) {
      .check-row {
        flex-direction: column;
        align-items: flex-start;
        gap: 2px;
      }
      .check-row .label,
      .check-row .value {
        max-width: 100%;
        white-space: normal;
        overflow: visible;
        text-overflow: clip;
      }
    }

    /* ── Password modal ─────────────────────────────────────────── */
    .pwd-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.72);
      z-index: 100;
      align-items: center;
      justify-content: center;
    }
    .pwd-overlay.visible { display: flex; }
    .pwd-card {
      background: #242424;
      border: 1px solid #383838;
      border-radius: 12px;
      padding: 28px 28px 24px;
      width: min(380px, 92vw);
      text-align: left;
      box-shadow: 0 24px 64px rgba(0,0,0,0.7);
    }
    .pwd-card h2 {
      font-size: 15px;
      font-weight: 600;
      color: #fff;
      margin-bottom: 6px;
    }
    .pwd-card p {
      font-size: 12px;
      color: #888;
      margin-bottom: 18px;
      line-height: 1.5;
    }
    .pwd-input {
      width: 100%;
      background: #1a1a1a;
      border: 1px solid #3a3a3a;
      border-radius: 6px;
      color: #e0e0e0;
      font-size: 14px;
      padding: 9px 12px;
      outline: none;
      margin-bottom: 18px;
      letter-spacing: 0.1em;
      box-sizing: border-box;
    }
    .pwd-input:focus { border-color: #dc2828; }
    .pwd-actions {
      display: flex;
      gap: 10px;
      justify-content: flex-end;
    }
    .pwd-cancel {
      background: transparent;
      border: 1px solid #444;
      color: #aaa;
      font-size: 13px;
      padding: 7px 18px;
      border-radius: 6px;
      cursor: pointer;
    }
    .pwd-cancel:hover { background: rgba(255,255,255,0.06); }
    .pwd-submit {
      background: #dc2828;
      border: none;
      color: #fff;
      font-size: 13px;
      font-weight: 600;
      padding: 7px 20px;
      border-radius: 6px;
      cursor: pointer;
    }
    .pwd-submit:hover { background: #b91c1c; }
  </style>
</head>
<body>
  <!-- More Options menu (fixed top-right) -->
  ${isInstalled ? `<div class="more-menu-wrap" id="more-menu-wrap">
    <button class="more-menu-btn" onclick="toggleMoreMenu(event)" aria-haspopup="true" aria-expanded="false">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
      More Options
    </button>
    <div class="more-menu-dropdown" id="more-menu-dropdown" role="menu">
      <div class="more-menu-section">
        <div class="more-menu-section-label">TUI</div>
        <button class="more-menu-item" role="menuitem" onclick="cmd('openclaw.configureTUI');closeMoreMenu()">${icTerminalBtn}Configure</button>
      </div>
    </div>
  </div>` : ''}

  <!-- Password modal (shown on sudo permission error) -->
  <div id="pwd-overlay" class="pwd-overlay">
    <div class="pwd-card">
      <h2>🔐 Administrator Password Required</h2>
      <p>OpenClaw needs elevated permissions to install globally.<br>Your password is used once and never stored.</p>
      <input id="pwd-input" class="pwd-input" type="password" placeholder="Enter your system password" autocomplete="current-password" />
      <div class="pwd-actions">
        <button class="pwd-cancel" onclick="cancelPwd()">Cancel</button>
        <button class="pwd-submit" onclick="submitPwd()">Continue</button>
      </div>
    </div>
  </div>
  <img class="logo" src="${iconUri}" alt="OpenClaw" />
  <h1>Welcome to <span class="accent">OpenClaw</span> Code</h1>
  <p class="tagline">AI Powered Local Harness for OpenClaw</p>
  <div class="status ${statusClass}">${statusIcon} ${statusText}</div>
  ${isInstalled ? `<div class="checks">
    <div class="check-row">
      <span class="row-icon">${icFolder}</span>
      <span class="label">Config (~/.openclaw/openclaw.json)</span>
      <span class="value ${dirClass}">${dirText}</span>
    </div>
    <div class="check-row">
      <span class="row-icon">${icTerminal}</span>
      <span class="label">CLI (openclaw --version)</span>
      <span class="value ${cliClass}">${cliText}${cliHint}</span>
    </div>
    <div class="check-row">
      <span class="row-icon">${icServer}</span>
      <span class="label">Gateway</span>
      <span class="gw-cell">
        <span id="gw-spinner" class="gw-spinner"></span>
        <span id="gw-text" class="value" style="color:#666">Checking…</span>
        <button id="gw-btn" class="gw-btn" disabled></button>
      </span>
    </div>
    <div class="check-row">
      <span class="row-icon">${icBot}</span>
      <span class="label">MoltPilot</span>
      <span class="molt-cell">
        <span id="molt-sparkle">✨</span>
        <span id="molt-dot" class="molt-dot"></span>
        <span id="molt-text" class="value" style="color:#666">Idle</span>
        <button id="molt-chat-btn" class="molt-chat-btn" title="Open AI chat" onclick="toggleChat()">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <span class="btn-lbl">Open chat</span>
        </button>
      </span>
    </div>
  </div>` : ''}
  ${isInstalled ? `<div class="pills-row">
    ${['AGENTS.md','IDENTITY.md','USER.md','TOOLS.md','MEMORY.md'].map(f =>
      `<span class="pill" onclick="openFile('${f}')">${f}</span>`
    ).join('\n    ')}
  </div>` : ''}
  <div class="btn-group">
    <button id="btn-primary" class="btn-primary" onclick="cmd('${buttonCommand}')">${icBtnPrimary}${buttonLabel}</button>
    <div id="install-status" style="display:none;font-size:11px;color:#666;margin-top:1px;text-align:center;max-width:min(320px,94vw);line-height:1.4;"></div>
    ${isInstalled ? `<button class="btn-secondary" id="btn-version" onclick="checkVersion()">${icRefreshCw}Check for Updates with OpenClaw</button>
    <div id="version-result" style="display:none;font-size:clamp(10px,2vw,12px);margin-top:2px;line-height:1.5;max-width:min(320px,94vw);text-align:center;"></div>` : ''}
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    function cmd(c) {
      if (c === 'openclaw.install') {
        const btn = document.getElementById('btn-primary');
        if (btn && !btn.disabled) {
          btn.disabled = true;
          btn.innerHTML = '<span class="btn-spin"></span>Installing…';
        }
      }
      vscode.postMessage({ command: c });
    }
    function openFile(name) { vscode.postMessage({ command: 'openWorkspaceFile', file: name }); }

    // ── More Options menu ─────────────────────────────────────────
    function toggleMoreMenu(e) {
      e.stopPropagation();
      const dd = document.getElementById('more-menu-dropdown');
      const btn = e.currentTarget;
      if (!dd) return;
      const isOpen = dd.classList.toggle('open');
      btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    }
    function closeMoreMenu() {
      const dd = document.getElementById('more-menu-dropdown');
      const btn = document.querySelector('.more-menu-btn');
      if (dd) dd.classList.remove('open');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    }
    document.addEventListener('click', closeMoreMenu);

    // ── Gateway status ────────────────────────────────────────────
    const GW = {
      running:    { label: 'Running',              color: '#4ade80', btnLabel: 'Stop',    btnClass: 'gw-stop',    action: 'stop',    spin: false, aiSpin: false },
      stopped:    { label: 'Stopped',              color: '#facc15', btnLabel: 'Start',   btnClass: 'gw-start',   action: 'start',   spin: false, aiSpin: false },
      errored:    { label: 'Errored',              color: '#f87171', btnLabel: 'Restart', btnClass: 'gw-restart', action: 'restart', spin: false, aiSpin: false },
      starting:   { label: 'Starting…',           color: '#60a5fa', btnLabel: null,      btnClass: '',           action: null,      spin: true,  aiSpin: false },
      stopping:   { label: 'Stopping…',           color: '#60a5fa', btnLabel: null,      btnClass: '',           action: null,      spin: true,  aiSpin: false },
      restarting: { label: 'Restarting…',         color: '#60a5fa', btnLabel: null,      btnClass: '',           action: null,      spin: true,  aiSpin: false },
      checking:   { label: 'Checking…',           color: '#666',    btnLabel: null,      btnClass: '',           action: null,      spin: true,  aiSpin: false },
      'ai-fixing':{ label: 'AI Copilot fixing…',  color: '#a78bfa', btnLabel: null,      btnClass: '',           action: null,      spin: true,  aiSpin: true  },
    };

    const gwSpinner = document.getElementById('gw-spinner');
    const gwText    = document.getElementById('gw-text');
    const gwBtn     = document.getElementById('gw-btn');

    // Show spinner while checking on load (only if gateway row is in DOM).
    if (gwSpinner) gwSpinner.style.display = 'inline-block';


    function updateGateway(status) {
      if (!gwSpinner || !gwText || !gwBtn) return;
      const cfg = GW[status] || GW.checking;
      gwSpinner.style.display = cfg.spin ? 'inline-block' : 'none';
      gwSpinner.classList.toggle('ai', !!cfg.aiSpin);
      gwText.textContent  = cfg.label;
      gwText.style.color  = cfg.color;
      if (cfg.btnLabel) {
        gwBtn.textContent    = cfg.btnLabel;
        gwBtn.dataset.action = cfg.action;
        gwBtn.className      = 'gw-btn ' + cfg.btnClass;
        gwBtn.disabled       = false;
        gwBtn.style.display  = 'inline-flex';
      } else {
        gwBtn.disabled      = true;
        gwBtn.style.display = 'none';
      }
    }

    if (gwBtn) {
      gwBtn.addEventListener('click', () => {
        const action = gwBtn.dataset.action;
        if (!action) return;
        gwBtn.disabled = true;
        vscode.postMessage({ command: 'gatewayAction', action });
      });
    }

    // ── MoltPilot status ──────────────────────────────────────────
    const moltDot     = document.getElementById('molt-dot');
    const moltText    = document.getElementById('molt-text');
    const moltSparkle = document.getElementById('molt-sparkle');
    const moltChatBtn = document.getElementById('molt-chat-btn');
    let _moltRunning  = false;

    function updateMoltPilot(running) {
      if (!moltDot || !moltText || !moltSparkle) return;
      if (_moltRunning === running) return;
      _moltRunning = running;
      moltDot.classList.toggle('working', running);
      moltSparkle.classList.toggle('visible', running);
      moltText.textContent = running ? 'Running' : 'Idle';
      moltText.style.color = running ? '#a78bfa' : '#666';
    }

    function applyChatState(open) {
      if (!moltChatBtn) return;
      moltChatBtn.classList.toggle('open', open);
      const lbl = moltChatBtn.querySelector('.btn-lbl');
      if (lbl) lbl.textContent = open ? 'Close chat' : 'Open chat';
      moltChatBtn.title = open ? 'Close AI chat' : 'Open AI chat';
    }

    function toggleChat() {
      vscode.postMessage({ command: 'toggleChat' });
    }

    // ── Version check ─────────────────────────────────────────────
    function checkVersion() {
      const btn = document.getElementById('btn-version');
      const res = document.getElementById('version-result');
      if (btn) { btn.disabled = true; btn.textContent = 'Checking…'; }
      if (res) { res.style.display = 'none'; res.innerHTML = ''; }
      vscode.postMessage({ command: 'checkVersion' });
    }

    // ── Password modal ────────────────────────────────────────────
    const pwdOverlay = document.getElementById('pwd-overlay');
    const pwdInput   = document.getElementById('pwd-input');

    function showPwd() {
      pwdInput.value = '';
      pwdOverlay.classList.add('visible');
      setTimeout(() => pwdInput.focus(), 50);
    }
    function cancelPwd() {
      pwdOverlay.classList.remove('visible');
      vscode.postMessage({ command: 'sudoPassword', password: undefined });
    }
    function submitPwd() {
      const pwd = pwdInput.value;
      pwdOverlay.classList.remove('visible');
      vscode.postMessage({ command: 'sudoPassword', password: pwd || undefined });
    }
    // Allow Enter key to submit, Escape to cancel.
    pwdInput.addEventListener('keydown', e => {
      if (e.key === 'Enter')  { e.preventDefault(); submitPwd(); }
      if (e.key === 'Escape') { e.preventDefault(); cancelPwd(); }
    });

    const installStatus = document.getElementById('install-status');

    window.addEventListener('message', e => {
      if (e.data.type === 'requestPassword') {
        showPwd();
      } else if (e.data.type === 'installLog' && installStatus) {
        // Show the latest non-empty line of install output as muted status text.
        const lines = (e.data.text || '').split('\\n').map(l => l.trim()).filter(Boolean);
        if (lines.length) {
          installStatus.textContent = lines[lines.length - 1];
          installStatus.style.display = 'block';
        }
      } else if (e.data.type === 'installState' && installStatus) {
        if (e.data.state === 'done') {
          installStatus.style.display = 'none';
        } else if (e.data.state === 'failed') {
          installStatus.textContent = 'Installation failed — see AI chat for details.';
          installStatus.style.color = '#f87171';
          installStatus.style.display = 'block';
        }
      } else if (e.data.type === 'gatewayStatus') {
        updateGateway(e.data.status);
        if (e.data.status === 'ai-fixing') {
          updateMoltPilot(true);
        }
      } else if (e.data.type === 'aiRunning') {
        updateMoltPilot(e.data.running);
      } else if (e.data.type === 'chatState') {
        applyChatState(e.data.open);
      } else if (e.data.type === 'versionResult') {
        const btn = document.getElementById('btn-version');
        const res = document.getElementById('version-result');
        if (btn) { btn.disabled = false; btn.innerHTML = '${icRefreshCw}Check for Updates with OpenClaw'; }
        if (res) { res.innerHTML = e.data.html; res.style.display = 'block'; }
      }
    });
  </script>
</body>
</html>`;
  }

  private async _testOpenClawCli(): Promise<{ ok: boolean; output?: string; error?: string; command: string }> {
    if (process.platform === 'win32') {
      // ── 1. Find openclaw.mjs (checks npm prefix + version-manager paths) ──────
      const mjs = await this._findWindowsOpenClawMjs();
      if (mjs) {
        // ── 2. Find node.exe (PATH-first, then nvm/Volta/scoop, then hardcoded) ──
        const nodeExe = await this._findWindowsNodeExe();
        if (nodeExe) {
          return this._spawnNodeMjs(nodeExe, mjs, `"${nodeExe}" "${mjs}" --version`);
        }
      }

      // ── 3. .cmd / .exe shim fallback (npm prefix + scoop shims) ──────────────
      const cmdPath = await this._findWindowsOpenClawCmd();
      if (cmdPath) {
        return new Promise(resolve => {
          cp.execFile(
            'cmd.exe', ['/c', cmdPath, '--version'],
            { timeout: 30000, windowsHide: true, maxBuffer: 1024 * 1024 },
            (error, stdout, stderr) => {
              if (error) {
                const timedOut = (error as any).signal === 'SIGTERM' || error.code == null;
                resolve({
                  ok: false,
                  error: timedOut ? 'Timed out' : (stderr?.toString().trim() || `Exit ${error.code}`),
                  command: `${cmdPath} --version`,
                });
              } else {
                resolve({ ok: true, output: (stdout || stderr || '').toString().trim(), command: `${cmdPath} --version` });
              }
            }
          );
        });
      }

      return { ok: false, error: 'openclaw not found', command: 'openclaw --version' };
    }

    // ── Mac / Linux ──────────────────────────────────────────────────────────────
    const cliPath = await this._findOpenClawPath();
    if (!cliPath) {
      return { ok: false, error: 'openclaw not found', command: 'openclaw --version' };
    }
    return new Promise(resolve => {
      cp.execFile(
        cliPath, ['--version'],
        { timeout: 30000, maxBuffer: 1024 * 1024, env: this._buildExecEnv() },
        (error, stdout, stderr) => {
          if (error) {
            resolve({ ok: false, error: stderr?.toString().trim() || error.message || `Exit ${(error as any).code}`, command: `${cliPath} --version` });
          } else {
            resolve({ ok: true, output: (stdout || stderr || '').toString().trim(), command: `${cliPath} --version` });
          }
        }
      );
    });
  }

  /**
   * Finds openclaw.mjs in the npm global prefix (dynamic) and common
   * version-manager install paths so any Node setup is covered.
   */
  private async _findWindowsOpenClawMjs(): Promise<string | undefined> {
    const home = os.homedir();
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');

    // Ask npm where its global prefix lives — covers custom prefixes / nvm / fnm
    const prefixResult = await this._runCommand('npm config get prefix', 3000);
    const npmPrefix = (prefixResult.stdout || '').trim().replace(/['"]/g, '');

    const candidates = [
      npmPrefix ? path.join(npmPrefix, 'node_modules', 'openclaw', 'openclaw.mjs') : '',
      path.join(appData, 'npm', 'node_modules', 'openclaw', 'openclaw.mjs'),
      // scoop (nodejs / nodejs-lts)
      path.join(home, 'scoop', 'apps', 'nodejs', 'current', 'node_modules', 'openclaw', 'openclaw.mjs'),
      path.join(home, 'scoop', 'apps', 'nodejs-lts', 'current', 'node_modules', 'openclaw', 'openclaw.mjs'),
      // Volta
      path.join(localAppData, 'Volta', 'tools', 'image', 'packages', 'openclaw', 'lib', 'node_modules', 'openclaw', 'openclaw.mjs'),
    ].filter(Boolean);

    return candidates.find(p => fs.existsSync(p));
  }

  /**
   * Finds the real node.exe for Windows.
   * Strategy: PATH lookup first (handles nvm-windows, fnm, Volta shims, winget,
   * and standard installs), then version-manager directories, then hardcoded paths.
   */
  private async _findWindowsNodeExe(): Promise<string | undefined> {
    const home = os.homedir();
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
    const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');

    // 1. PATH lookup — most reliable; works for nvm-windows, fnm, Volta shims,
    //    winget, and standard installers without any special-casing.
    try {
      const found = await new Promise<string>((resolve, reject) =>
        cp.exec('where node.exe', { timeout: 3000, windowsHide: true }, (err, stdout) =>
          err ? reject(err) : resolve(stdout.trim().split(/\r?\n/)[0]?.trim() || '')
        )
      );
      // Skip if the path belongs to VSCodium / VS Code / Electron (wrong node)
      if (found && fs.existsSync(found) && !/vscodium|vscode|electron/i.test(found)) {
        return found;
      }
    } catch {}

    // 2. nvm-windows — %NVM_HOME%\<version>\node.exe
    const nvmHome = process.env.NVM_HOME;
    if (nvmHome && fs.existsSync(nvmHome)) {
      try {
        const versions = fs.readdirSync(nvmHome)
          .filter(e => /^\d+\.\d+\.\d+$/.test(e))
          .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
        for (const v of versions.slice(0, 5)) {
          const p = path.join(nvmHome, v, 'node.exe');
          if (fs.existsSync(p)) return p;
        }
      } catch {}
    }

    // 3. Volta — %LOCALAPPDATA%\Volta\tools\image\node\<version>\node.exe
    const voltaNodeDir = path.join(localAppData, 'Volta', 'tools', 'image', 'node');
    if (fs.existsSync(voltaNodeDir)) {
      try {
        const versions = fs.readdirSync(voltaNodeDir)
          .filter(e => /^\d+\.\d+\.\d+$/.test(e))
          .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
        for (const v of versions.slice(0, 5)) {
          const p = path.join(voltaNodeDir, v, 'node.exe');
          if (fs.existsSync(p)) return p;
        }
      } catch {}
    }

    // 4. scoop (nodejs / nodejs-lts)
    for (const app of ['nodejs', 'nodejs-lts']) {
      const p = path.join(home, 'scoop', 'apps', app, 'current', 'node.exe');
      if (fs.existsSync(p)) return p;
    }

    // 5. Standard installer, chocolatey, winget fallbacks
    const hardcoded = [
      path.join(programFiles, 'nodejs', 'node.exe'),
      'C:\\Program Files\\nodejs\\node.exe',
      'C:\\Program Files (x86)\\nodejs\\node.exe',
      path.join(localAppData, 'Programs', 'nodejs', 'node.exe'),
      'C:\\ProgramData\\chocolatey\\bin\\node.exe',
      'C:\\tools\\nodejs\\node.exe',
    ];
    return hardcoded.find(p => fs.existsSync(p));
  }

  /**
   * Finds openclaw.cmd / .exe shim using the npm global prefix (dynamic)
   * and common fallback locations including scoop shims.
   */
  private async _findWindowsOpenClawCmd(): Promise<string | undefined> {
    const home = os.homedir();
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');

    const prefixResult = await this._runCommand('npm config get prefix', 3000);
    const npmPrefix = (prefixResult.stdout || '').trim().replace(/['"]/g, '');

    const candidates = [
      npmPrefix ? path.join(npmPrefix, 'openclaw.cmd') : '',
      npmPrefix ? path.join(npmPrefix, 'openclaw.exe') : '',
      path.join(appData, 'npm', 'openclaw.cmd'),
      path.join(appData, 'npm', 'openclaw.exe'),
      // scoop shims
      path.join(home, 'scoop', 'shims', 'openclaw.cmd'),
      path.join(home, 'scoop', 'shims', 'openclaw.exe'),
    ].filter(Boolean);

    return candidates.find(p => fs.existsSync(p));
  }

  /** Spawns `<nodeExe> <mjs> --version` and resolves with the result. */
  private _spawnNodeMjs(
    nodeExe: string,
    mjs: string,
    display: string
  ): Promise<{ ok: boolean; output?: string; error?: string; command: string }> {
    return new Promise(resolve => {
      const child = cp.spawn(nodeExe, [mjs, '--version'], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', d => (stdout += d));
      child.stderr?.on('data', d => (stderr += d));
      const timer = setTimeout(() => child.kill('SIGTERM'), 30000);
      child.on('close', (code, signal) => {
        clearTimeout(timer);
        if (signal === 'SIGTERM' || code === null) {
          resolve({ ok: false, error: 'Timed out after 30s', command: display });
        } else if (code !== 0) {
          resolve({ ok: false, error: stderr.trim() || `Exit ${code}`, command: display });
        } else {
          resolve({ ok: true, output: (stdout || stderr).trim(), command: display });
        }
      });
      child.on('error', err => {
        clearTimeout(timer);
        resolve({ ok: false, error: err.message, command: display });
      });
    });
  }

  private async _findOpenClawPath(): Promise<string | undefined> {
    const cfgPath = vscode.workspace.getConfiguration('openclaw').get<string>('cliPath');
    if (cfgPath && fs.existsSync(cfgPath)) return cfgPath;

    const envPath = process.env.OPENCLAW_CLI;
    if (envPath && fs.existsSync(envPath)) return envPath;

    if (process.platform === 'win32') {
      const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
      const candidates = [
        path.join(appData, 'npm', 'openclaw.cmd'),
        path.join(appData, 'npm', 'openclaw.exe'),
        path.join(appData, 'npm', 'openclaw.bat'),
        path.join(appData, 'npm', 'openclaw.ps1'),
      ];
      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) return candidate;
      }
    }

    if (process.platform === 'win32') {
      for (const probe of ['openclaw.cmd', 'openclaw.exe', 'openclaw.bat', 'openclaw.ps1', 'openclaw']) {
        const result = await this._runCommand(`where ${probe}`, 2000);
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
      }
    } else {
      const result = await this._runCommand('which openclaw', 2000);
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
    }

    const npmCandidates = await this._getNpmGlobalCliCandidates();
    for (const candidate of npmCandidates) {
      if (fs.existsSync(candidate)) return candidate;
    }

    const fallback = this._getCandidateCliPaths();
    for (const candidate of fallback) {
      if (fs.existsSync(candidate)) return candidate;
    }

    return undefined;
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
        path.join(appData, 'npm', 'openclaw.bat'),
        path.join(appData, 'npm', 'openclaw.ps1'),
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
      return [
        `${base}.cmd`,
        `${base}.exe`,
        `${base}.bat`,
        `${base}.ps1`,
        base,
      ];
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

  private _getPreferredWindowsCmdPath(candidate: string | undefined) {
    if (process.platform !== 'win32') return candidate;
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    const shim = path.join(appData, 'npm', 'openclaw.cmd');
    if (fs.existsSync(shim)) return shim;
    return candidate;
  }

  private _runCommand(cmd: string, timeoutMs: number): Promise<{ stdout: string; stderr: string; error?: string; notFound?: boolean }> {
    const env = this._buildExecEnv();
    return new Promise(resolve => {
      cp.exec(
        cmd,
        { timeout: timeoutMs, windowsHide: true, maxBuffer: 1024 * 1024, env },
        (error, stdout, stderr) => {
          const result = { stdout: stdout?.toString() || '', stderr: stderr?.toString() || '' } as {
            stdout: string;
            stderr: string;
            error?: string;
            notFound?: boolean;
          };
          if (error) {
            result.error = error.message || 'Command failed';
            const text = `${result.stderr}\n${result.error}`.toLowerCase();
            result.notFound =
              (error as any).code === 'ENOENT' ||
              text.includes('not recognized as an internal or external command') ||
              text.includes('command not found');
          }
          resolve(result);
        }
      );
    });
  }

  private _buildExecEnv() {
    const env = { ...process.env };
    const basePath = env.PATH || (env as any).Path || '';
    const extra: string[] = [];
    if (process.platform === 'win32') {
      const appData = env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
      if (appData) extra.push(path.join(appData, 'npm'));
      if (env.ProgramFiles) extra.push(path.join(env.ProgramFiles, 'nodejs'));
      if (env.LOCALAPPDATA) extra.push(path.join(env.LOCALAPPDATA, 'Programs', 'nodejs'));
      const systemRoot = env.SystemRoot || (env as any).WINDIR;
      if (systemRoot) extra.push(path.join(systemRoot, 'System32'));
    } else {
      extra.push('/usr/local/bin', '/opt/homebrew/bin');
      extra.push(path.join(os.homedir(), '.local', 'bin'));
      extra.push(path.join(os.homedir(), '.npm-global', 'bin'));
      extra.push(path.join(os.homedir(), '.openclaw', 'bin'));
    }
    const sep = process.platform === 'win32' ? ';' : ':';
    env.PATH = [...extra, basePath].filter(Boolean).join(sep);
    (env as any).Path = env.PATH;
    return env;
  }
}
