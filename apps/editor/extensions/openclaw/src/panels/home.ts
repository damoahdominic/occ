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
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];
  private _commandAction: 'start' | 'stop' | 'restart' | null = null;
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
    // Watch ~/.openclaw/openclaw.json — the single install signal.
    // Fires immediately when OpenClaw creates or deletes this file.
    const configUri = vscode.Uri.file(path.join(os.homedir(), '.openclaw', 'openclaw.json'));
    const configWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(vscode.Uri.file(path.join(os.homedir(), '.openclaw')), 'openclaw.json'),
      false, true, false,
    );
    configWatcher.onDidCreate(() => void this._update(), null, this._disposables);
    configWatcher.onDidDelete(() => void this._update(), null, this._disposables);
    this._disposables.push(configWatcher);
    void configUri; // suppress unused warning
    this._panel.webview.onDidReceiveMessage(msg => {
      if (msg.command === 'gatewayAction') {
        void this._handleGatewayAction(msg.action as 'start' | 'stop' | 'restart');
      } else if (msg.command === 'checkVersion') {
        void this._checkLatestVersion();
      } else if (msg.command === 'openWorkspaceFile') {
        const allowed = new Set(['AGENTS.md', 'IDENTITY.md', 'USER.md', 'TOOLS.md', 'MEMORY.md']);
        const file = msg.file as string;
        if (!allowed.has(file)) return;
        const workspaceDir = getOpenClawWorkspaceDir();
        const filePath = path.join(workspaceDir, file);
        if (!fs.existsSync(filePath)) {
          vscode.window.showWarningMessage(
            `${file} not found in ${workspaceDir}. OpenClaw may not have initialised its workspace yet.`
          );
          return;
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

    // Ask for sudo password via VS Code input, cache with `sudo -S -v`, return success.
    const cacheSudo = async (prompt: string): Promise<boolean> => {
      const password = await vscode.window.showInputBox({
        password: true, prompt, placeHolder: 'Password (not stored)', ignoreFocusOut: true,
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
    // openclaw.json is the definitive signal — created by OpenClaw on first run.
    // If it's absent, OpenClaw is not properly installed regardless of binaries.
    const configFile = path.join(os.homedir(), '.openclaw', 'openclaw.json');
    const isInstalled = fs.existsSync(configFile);
    this._lastInstalledState = isInstalled;
    const iconUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'icon.png')
    );
    this._panel.webview.html = this._getHtml(isInstalled, dirExists, cliCheck, iconUri.toString());
    // Kick off gateway status polling now that the webview is ready.
    this._startPolling();
  }

  // ── Gateway status helpers ─────────────────────────────────────────────────

  private async _checkGatewayStatus(): Promise<GatewayStatus> {
    if (this._commandAction) {
      return this._commandAction === 'start' ? 'starting'
           : this._commandAction === 'stop'  ? 'stopping'
           : 'restarting';
    }
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

  /**
   * Fast synchronous check — ~/.openclaw/openclaw.json is the single
   * definitive signal that OpenClaw is installed and initialised.
   */
  private _quickInstallCheck(): boolean {
    return fs.existsSync(path.join(os.homedir(), '.openclaw', 'openclaw.json'));
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

      const [status, aiRunning] = await Promise.all([
        this._checkGatewayStatus(),
        vscode.commands.executeCommand<boolean>('void.getIsRunning').then(v => !!v, () => false),
      ]);
      try { this._panel.webview.postMessage({ type: 'gatewayStatus', status }); } catch {}
      try { this._panel.webview.postMessage({ type: 'aiRunning', running: aiRunning }); } catch {}
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
  private async _waitForDesiredState(
    expected: GatewayStatus,
    intermediary: GatewayStatus,
    timeoutMs = 20000,
  ): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 1500));
      const current = await this._checkGatewayStatus();
      if (current === expected) return true;
      // Still transitioning — keep the intermediary label in the UI.
      try { this._panel.webview.postMessage({ type: 'gatewayStatus', status: intermediary }); } catch {}
    }
    return false;
  }

  private async _handleGatewayAction(action: 'start' | 'stop' | 'restart'): Promise<void> {
    const intermediary: GatewayStatus =
      action === 'start' ? 'starting' : action === 'stop' ? 'stopping' : 'restarting';
    const expectedState: GatewayStatus = action === 'stop' ? 'stopped' : 'running';

    this._commandAction = action;
    try { this._panel.webview.postMessage({ type: 'gatewayStatus', status: intermediary }); } catch {}

    const cliPath = await this._findOpenClawPath();
    if (!cliPath) {
      this._outputChannel.appendLine('[OpenClaw] Error: openclaw CLI not found');
      this._commandAction = null;
      return;
    }

    this._outputChannel.clear();
    this._outputChannel.appendLine(`[OpenClaw] gateway ${action} …`);

    let output = '';
    const child = cp.spawn(cliPath, ['gateway', action], {
      env: this._buildExecEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout?.on('data', (d: Buffer) => { const t = d.toString(); output += t; this._outputChannel.append(t); });
    child.stderr?.on('data', (d: Buffer) => { const t = d.toString(); output += t; this._outputChannel.append(t); });
    child.on('close', async (code: number | null) => {
      this._outputChannel.appendLine(`[OpenClaw] gateway ${action} exited (${code ?? 'signal'})`);
      this._commandAction = null;

      // Give the gateway time to actually reach the desired state before
      // deciding anything — the CLI often exits before the service is up/down.
      const reached = await this._waitForDesiredState(expectedState, intermediary);

      if (reached) {
        // All good — show the confirmed final state.
        try { this._panel.webview.postMessage({ type: 'gatewayStatus', status: expectedState }); } catch {}
      } else {
        // Still not in the right state after waiting — hand off to AI.
        this._outputChannel.appendLine(`[OpenClaw] Expected "${expectedState}" but gateway did not reach it. Invoking MoltPilot…`);
        try { this._panel.webview.postMessage({ type: 'gatewayStatus', status: 'ai-fixing' }); } catch {}

        const currentStatus = await this._checkGatewayStatus();
        const aiMessage =
          `I tried to run \`openclaw gateway ${action}\` but the gateway never reached the expected state ("${expectedState}"). ` +
          `It is currently **${currentStatus}**.\n\n` +
          `Here is the full command output:\n\`\`\`\n${output.trim()}\n\`\`\`\n\n` +
          `Please diagnose the issue and provide the exact steps or commands to fix it.`;
        await vscode.commands.executeCommand('void.openChatWithMessage', aiMessage);

        // Resume normal status polling after a moment.
        setTimeout(async () => {
          const final = await this._checkGatewayStatus();
          try { this._panel.webview.postMessage({ type: 'gatewayStatus', status: final }); } catch {}
        }, 5000);
      }
    });
    child.on('error', (err: Error) => {
      this._outputChannel.appendLine(`[OpenClaw] Error: ${err.message}`);
      this._commandAction = null;
    });
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
  <p class="tagline">AI powered local harness for OpenClaw installation, configuration and troubleshooting</p>
  <div class="spinner-wrap">
    <div class="spinner"></div>
    <span class="loading-text">Checking environment<span class="loading-dots"></span></span>
  </div>
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
      justify-content: center;
      min-height: 100vh;
      padding: clamp(16px, 5vw, 48px) clamp(12px, 4vw, 32px);
      text-align: center;
    }

    /* ── Hero ──────────────────────────────────────────────────── */
    .logo {
      width: clamp(56px, 14vw, 96px);
      height: clamp(56px, 14vw, 96px);
      margin-bottom: clamp(12px, 3vw, 24px);
      filter: drop-shadow(0 4px 12px rgba(220, 40, 40, 0.3));
      flex-shrink: 0;
    }
    h1 {
      font-size: clamp(15px, 4.5vw, 28px);
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
      margin-bottom: clamp(18px, 5vw, 32px);
      max-width: 44ch;
      line-height: 1.5;
    }

    /* ── Status badge ──────────────────────────────────────────── */
    .status {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: clamp(11px, 2.5vw, 14px);
      margin-bottom: clamp(16px, 4vw, 28px);
      padding: clamp(5px, 1.5vw, 8px) clamp(10px, 3vw, 16px);
      border-radius: 6px;
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
      padding: clamp(8px, 2.5vw, 12px) clamp(10px, 3vw, 16px);
      margin-bottom: clamp(16px, 4vw, 24px);
      font-size: clamp(11px, 2.5vw, 13px);
    }
    .check-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      padding: clamp(4px, 1.2vw, 6px) 0;
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
      max-width: 50%;
      overflow: hidden;
      text-overflow: ellipsis;
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
    @keyframes gw-spin { to { transform: rotate(360deg); } }
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
      gap: clamp(8px, 2vw, 12px);
      width: min(320px, 96vw);
      margin-top: clamp(20px, 5vw, 32px);
    }
    .btn-primary {
      background: #dc2828;
      color: #fff;
      border: none;
      padding: clamp(9px, 2.5vw, 12px) clamp(18px, 5vw, 28px);
      border-radius: 8px;
      font-size: clamp(13px, 3vw, 15px);
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
    .btn-secondary {
      background: transparent;
      color: #aaa;
      border: 1px solid #444;
      padding: clamp(7px, 2vw, 10px) clamp(14px, 4vw, 20px);
      border-radius: 8px;
      font-size: clamp(11px, 2.5vw, 13px);
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
      gap: 6px;
      margin-top: clamp(12px, 3vw, 18px);
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

    /* ── Footer links ──────────────────────────────────────────── */
    .links {
      margin-top: clamp(28px, 7vw, 48px);
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: clamp(12px, 3vw, 24px);
    }
    .links a {
      color: #666;
      text-decoration: none;
      font-size: clamp(10px, 2vw, 12px);
      transition: color 0.15s;
      white-space: nowrap;
    }
    .links a:hover { color: #dc2828; }


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
  </style>
</head>
<body>
  <img class="logo" src="${iconUri}" alt="OpenClaw" />
  <h1>Welcome to <span class="accent">OpenClaw</span> Code</h1>
  <p class="tagline">AI powered local harness for OpenClaw installation, configuration and troubleshooting</p>
  <div class="status ${statusClass}">${statusIcon} ${statusText}</div>
  <div class="checks">
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
      </span>
    </div>
  </div>
  ${isInstalled ? `<div class="pills-row">
    ${['AGENTS.md','IDENTITY.md','USER.md','TOOLS.md','MEMORY.md'].map(f =>
      `<span class="pill" onclick="openFile('${f}')">${f}</span>`
    ).join('\n    ')}
  </div>` : ''}
  <div class="btn-group">
    <button class="btn-primary" onclick="cmd('${buttonCommand}')">${icBtnPrimary}${buttonLabel}</button>
    <button class="btn-secondary" onclick="cmd('openclaw.configureTUI')">${icTerminalBtn}Configure (TUI)</button>
    <button class="btn-secondary" id="btn-version" onclick="checkVersion()">${icRefreshCw}Check for Updates with OpenClaw</button>
    <div id="version-result" style="display:none;font-size:clamp(10px,2vw,12px);margin-top:2px;line-height:1.5;max-width:min(320px,94vw);text-align:center;"></div>
  </div>
  <div class="links">
    <a href="https://github.com/damoahdominic/occ">GitHub</a>
    <a href="https://openclaw.ai">Website</a>
    <a href="https://docs.openclaw.ai">Docs</a>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    function cmd(c) { vscode.postMessage({ command: c }); }
    function openFile(name) { vscode.postMessage({ command: 'openWorkspaceFile', file: name }); }

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

    // Show spinner while checking on load.
    gwSpinner.style.display = 'inline-block';

    function updateGateway(status) {
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

    gwBtn.addEventListener('click', () => {
      const action = gwBtn.dataset.action;
      if (!action) return;
      gwBtn.disabled = true;
      vscode.postMessage({ command: 'gatewayAction', action });
    });

    // ── MoltPilot status ──────────────────────────────────────────
    const moltDot     = document.getElementById('molt-dot');
    const moltText    = document.getElementById('molt-text');
    const moltSparkle = document.getElementById('molt-sparkle');
    let _moltRunning  = false;

    function updateMoltPilot(running) {
      if (_moltRunning === running) return;
      _moltRunning = running;
      moltDot.classList.toggle('working', running);
      moltSparkle.classList.toggle('visible', running);
      moltText.textContent = running ? 'Running' : 'Idle';
      moltText.style.color = running ? '#a78bfa' : '#666';
    }

    // ── Version check ─────────────────────────────────────────────
    function checkVersion() {
      const btn = document.getElementById('btn-version');
      const res = document.getElementById('version-result');
      btn.disabled = true;
      btn.textContent = 'Checking…';
      res.style.display = 'none';
      vscode.postMessage({ command: 'checkVersion' });
    }

    window.addEventListener('message', e => {
      if (e.data.type === 'gatewayStatus') {
        updateGateway(e.data.status);
        if (e.data.status === 'ai-fixing') updateMoltPilot(true);
      } else if (e.data.type === 'aiRunning') {
        updateMoltPilot(e.data.running);
      } else if (e.data.type === 'versionResult') {
        const btn = document.getElementById('btn-version');
        const res = document.getElementById('version-result');
        btn.disabled = false;
        btn.innerHTML = '${icRefreshCw}Check for Updates with OpenClaw';
        res.innerHTML = e.data.html;
        res.style.display = 'block';
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
