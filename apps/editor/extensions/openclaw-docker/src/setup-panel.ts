import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import type { OpenClawCoreAPI } from '../../openclaw/src/hosts/types';
import { StatusPanelController } from '../../openclaw/src/panels/statusController';

export class DockerSetupPanel {
  public static currentPanel: DockerSetupPanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _dockerWorkspaceHostPath: string | undefined;
  private _disposables: vscode.Disposable[] = [];
  private _statusController: StatusPanelController | undefined;

  private get _homeUri(): vscode.Uri {
    const homeExt = vscode.extensions.getExtension('openclaw.home');
    return homeExt?.extensionUri ?? this._extensionUri;
  }

  public static createOrShow(extensionUri: vscode.Uri, coreAPI: OpenClawCoreAPI): void {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (DockerSetupPanel.currentPanel) {
      DockerSetupPanel.currentPanel._panel.reveal(column);
      return;
    }

    const homeExt = vscode.extensions.getExtension('openclaw.home');
    const homeUri = homeExt?.extensionUri ?? extensionUri;
    const iconUri = vscode.Uri.joinPath(homeUri, 'media', 'icon.png');

    const panel = vscode.window.createWebviewPanel(
      'openclawDockerSetup',
      'OCC Home [Docker]',
      column ?? vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(homeUri, 'media'),
        ],
        retainContextWhenHidden: true,
      },
    );

    DockerSetupPanel.currentPanel = new DockerSetupPanel(panel, extensionUri, coreAPI, iconUri);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    private readonly _coreAPI: OpenClawCoreAPI,
    iconUri: vscode.Uri,
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    const webviewIconUri = panel.webview.asWebviewUri(iconUri).toString();
    this._panel.webview.html = this._getHtml(webviewIconUri);

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      async (msg: { command: string; [key: string]: unknown }) => {
        if (this._statusController) {
          this._statusController.handleMessage(msg);
          return;
        }
        switch (msg.command) {
          case 'dockerPreflightCheck':
            await this._handleDockerPreflight();
            break;
          case 'dockerFindOrCreate':
            await this._handleDockerFindOrCreate();
            break;
          case 'dockerInstallCli':
            await this._handleDockerInstallCli();
            break;
          case 'dockerRunOnboard':
            await this._handleDockerConfigure(
              msg.provider as string,
              msg.apiKey as string,
              msg.port as string,
            );
            break;
          case 'closePanel':
            this.dispose();
            break;
          default:
            if (msg.command) {
              void vscode.commands.executeCommand(msg.command);
            }
            break;
        }
      },
      null,
      this._disposables,
    );
  }

  public dispose(): void {
    DockerSetupPanel.currentPanel = undefined;
    this._statusController?.dispose();
    this._statusController = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const d = this._disposables.pop();
      if (d) { d.dispose(); }
    }
  }

  private async _showStatusPanel(): Promise<void> {
    if (!this._statusController) {
      const { DockerHostConnection } = await import('./connection');
      const host = new DockerHostConnection(
        { type: 'docker', containerLabel: 'occ-openclaw', portMappings: { gateway: 18789 } },
        'occ-openclaw',
      );
      this._statusController = new StatusPanelController(this._panel, this._homeUri, host);
    }
    await this._statusController.show();
  }

  // ── Handlers ───────────────────────────────────────────────────────────────

  private async _handleDockerPreflight(): Promise<void> {
    try {
      await new Promise<void>((resolve) => {
        const proc = cp.spawn('docker', ['info'], { windowsHide: true, timeout: 10000 });
        let stderr = '';
        proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
        proc.on('close', (code) => {
          if (code === 0) {
            try { this._panel.webview.postMessage({ type: 'dockerPreflightResult', ok: true }); } catch { /* ignore */ }
          } else {
            const lower = stderr.toLowerCase();
            const error = lower.includes('permission denied')
              ? 'Permission denied connecting to Docker. Try restarting Docker Desktop or OrbStack.'
              : (lower.includes('cannot connect') || lower.includes('daemon') || lower.includes('no such file'))
              ? 'Docker daemon is not running. Please start Docker Desktop or OrbStack, then try again.'
              : 'Docker is not available. Please install Docker Desktop or OrbStack.';
            try { this._panel.webview.postMessage({ type: 'dockerPreflightResult', ok: false, error }); } catch { /* ignore */ }
          }
          resolve();
        });
        proc.on('error', () => {
          try { this._panel.webview.postMessage({ type: 'dockerPreflightResult', ok: false, error: 'Docker CLI not found. Please install Docker Desktop or OrbStack.' }); } catch { /* ignore */ }
          resolve();
        });
      });
    } catch (err) {
      try { this._panel.webview.postMessage({ type: 'dockerPreflightResult', ok: false, error: String(err) }); } catch { /* ignore */ }
    }
  }

  private async _handleDockerFindOrCreate(): Promise<void> {
    const log = (text: string, isErr = false) => {
      try { this._panel.webview.postMessage({ type: 'dockerLog', text, isErr }); } catch { /* ignore */ }
    };
    const fail = (text: string) => {
      try { this._panel.webview.postMessage({ type: 'dockerError', text }); } catch { /* ignore */ }
    };

    try {
      // Check if container exists (running or stopped)
      const check = cp.spawnSync('docker', ['ps', '-a', '--filter', 'name=^/occ-openclaw$', '--format', '{{.Status}}'], { timeout: 8000, windowsHide: true });
      const status = check.stdout?.toString().trim() ?? '';

      if (status) {
        if (status.toLowerCase().startsWith('up')) {
          log('✓ Found occ-openclaw — already running\n');
        } else {
          log('Found occ-openclaw (stopped) — starting...\n');
          const start = cp.spawnSync('docker', ['start', 'occ-openclaw'], { timeout: 15000, windowsHide: true });
          if (start.status !== 0) {
            fail(`Failed to start container: ${start.stderr?.toString().trim() ?? 'unknown error'}`);
            return;
          }
          log('✓ Container started\n');
        }
      } else {
        // Pull image
        log('Container not found — pulling node:22-slim...\n');
        const pullCode = await new Promise<number>((resolve) => {
          const proc = cp.spawn('docker', ['pull', 'node:22-slim'], { windowsHide: true });
          proc.stdout.on('data', (d: Buffer) => log(d.toString()));
          proc.stderr.on('data', (d: Buffer) => log(d.toString()));
          proc.on('close', (code) => resolve(code ?? -1));
          proc.on('error', () => resolve(-1));
        });
        if (pullCode !== 0) { fail('Failed to pull node:22-slim. Check your internet connection.'); return; }

        // Prepare state dir on host Desktop (mounted as entire .openclaw dir in container)
        const wsDir = path.join(os.homedir(), 'Desktop', 'occ-state-dir');
        try { fs.mkdirSync(wsDir, { recursive: true }); } catch { /* ok */ }
        this._dockerWorkspaceHostPath = wsDir;

        // Create container with full openclaw state dir mounted
        log('\nCreating occ-openclaw container...\n');
        const createCode = await new Promise<number>((resolve) => {
          const proc = cp.spawn('docker', [
            'run', '-d',
            '--name', 'occ-openclaw',
            '--restart', 'unless-stopped',
            '-p', '18789:18789',
            '-v', `${wsDir}:/root/.openclaw`,
            'node:22-slim',
            'tail', '-f', '/dev/null',
          ], { windowsHide: true });
          proc.stdout.on('data', (d: Buffer) => log(d.toString()));
          proc.stderr.on('data', (d: Buffer) => log(d.toString(), true));
          proc.on('close', (code) => resolve(code ?? -1));
          proc.on('error', () => resolve(-1));
        });
        if (createCode !== 0) { fail('Failed to create occ-openclaw container.'); return; }
        log('✓ Container created\n');
      }

      try { this._panel.webview.postMessage({ type: 'dockerContainerReady' }); } catch { /* ignore */ }
    } catch (err) {
      fail(String(err));
    }
  }

  private async _handleDockerInstallCli(): Promise<void> {
    const log = (text: string, isErr = false) => {
      try { this._panel.webview.postMessage({ type: 'dockerLog', text, isErr }); } catch { /* ignore */ }
    };
    const fail = (text: string) => {
      try { this._panel.webview.postMessage({ type: 'dockerError', text }); } catch { /* ignore */ }
    };

    try {
      // Check if already installed
      log('Checking for OpenClaw CLI in container...\n');
      const check = cp.spawnSync('docker', ['exec', 'occ-openclaw', 'which', 'openclaw'], { timeout: 8000, windowsHide: true });
      const alreadyInstalled = check.status === 0 && check.stdout.toString().trim().length > 0;

      if (!alreadyInstalled) {
        // Ensure curl is available then run installer
        log('Installing curl and OpenClaw...\n');
        const installCode = await new Promise<number>((resolve) => {
          const proc = cp.spawn('docker', [
            'exec', 'occ-openclaw',
            'bash', '-c',
            'apt-get update -qq 2>&1 && apt-get install -y -qq curl 2>&1 && curl -fsSL https://get.openclaw.sh | bash',
          ], { windowsHide: true });
          proc.stdout.on('data', (d: Buffer) => log(d.toString()));
          proc.stderr.on('data', (d: Buffer) => log(d.toString(), true));
          proc.on('close', (code) => resolve(code ?? -1));
          proc.on('error', () => resolve(-1));
        });
        if (installCode !== 0) { fail('OpenClaw installation failed. See the log above for details.'); return; }
        log('\n✓ OpenClaw installed\n');
      } else {
        log('✓ OpenClaw already installed — skipping\n');
      }

      // Register docker host and set as active
      log('\nRegistering Docker host...\n');
      const entry = await this._coreAPI.addHost({
        type: 'docker',
        label: 'Docker (occ-openclaw)',
        connection: { type: 'docker', containerLabel: 'occ-openclaw', portMappings: { gateway: 18789 } },
        lastStatus: 'online',
      });
      await this._coreAPI.setActiveHost(entry.id);

      // Ensure workspace host path is set (existing container scenario)
      if (!this._dockerWorkspaceHostPath) {
        this._dockerWorkspaceHostPath = path.join(os.homedir(), 'Desktop', 'occ-state-dir');
        try { fs.mkdirSync(this._dockerWorkspaceHostPath, { recursive: true }); } catch { /* ok */ }
      }

      // Open the state dir as a workspace folder
      const wsUri = vscode.Uri.file(this._dockerWorkspaceHostPath);
      vscode.workspace.updateWorkspaceFolders(
        vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders.length : 0,
        null,
        { uri: wsUri, name: 'occ-state-dir' },
      );

      log('✓ Done — loading setup...\n');
      try { this._panel.webview.postMessage({ type: 'dockerInstallDone' }); } catch { /* ignore */ }
    } catch (err) {
      fail(String(err));
    }
  }

  private async _handleDockerConfigure(provider: string, _apiKey: string, port: string): Promise<void> {
    const log = (text: string, isErr = false) => {
      try { this._panel.webview.postMessage({ type: 'configureLog', text, isErr }); } catch { /* ignore */ }
    };
    const fail = (text: string) => {
      try { this._panel.webview.postMessage({ type: 'dockerError', text }); } catch { /* ignore */ }
    };

    // Always use OCC free tier (occ-legacy) — user can reconfigure later via the status panel.
    const gwPort = /^\d+$/.test(port) ? port : '18789';
    const args = [
      'onboard',
      '--non-interactive', '--accept-risk',
      '--flow', 'quickstart',
      '--gateway-auth', 'token',
      '--gateway-port', gwPort,
      '--skip-channels', '--skip-skills', '--skip-health',
      '--auth-choice', 'custom-api-key',
      '--custom-base-url', 'https://occ.mba.sh/v1',
      '--custom-api-key', '',
      '--custom-model-id', 'occ-legacy',
      '--custom-compatibility', 'openai',
    ];

    try {
      log('Configuring OpenClaw with OCC free tier...\n');
      const code = await new Promise<number>((resolve) => {
        const proc = cp.spawn('docker', ['exec', 'occ-openclaw', 'openclaw', ...args], { windowsHide: true });
        proc.stdout.on('data', (d: Buffer) => log(d.toString()));
        proc.stderr.on('data', (d: Buffer) => log(d.toString(), true));
        proc.on('close', (c) => resolve(c ?? -1));
        proc.on('error', () => resolve(-1));
      });

      if (code !== 0) {
        fail('Setup failed. See the log above for details.');
        return;
      }

      // Patch openclaw.json inside the container to set correct occ-legacy model metadata.
      log('Patching model config...\n');
      try {
        const cfgRaw = cp.execSync('docker exec occ-openclaw cat /root/.openclaw/openclaw.json', { timeout: 5000 }).toString();
        const cfg = JSON.parse(cfgRaw) as Record<string, unknown>;
        const OCC_LEGACY_COST = { input: 0.0000006, output: 0.000003, cacheRead: 0.0000001, cacheWrite: 0 };
        const patchModel = (obj: unknown): void => {
          if (!obj || typeof obj !== 'object') return;
          if (Array.isArray(obj)) { obj.forEach(patchModel); return; }
          const o = obj as Record<string, unknown>;
          if (o['id'] === 'occ-legacy') {
            o['name']          = 'occ-legacy';
            o['reasoning']     = false;
            o['input']         = ['text'];
            o['cost']          = { ...OCC_LEGACY_COST };
            o['contextWindow'] = 262144;
            o['maxTokens']     = 262144;
            return;
          }
          Object.values(o).forEach(patchModel);
        };
        patchModel(cfg);
        const patched = JSON.stringify(cfg, null, 2);
        cp.execFileSync('docker', ['exec', '-i', 'occ-openclaw', 'sh', '-c', 'cat > /root/.openclaw/openclaw.json'], { input: patched, timeout: 5000 });
      } catch { /* non-fatal — model metadata patch is best-effort */ }

      // Write moltpilot-tier.json on the host (the state dir is mounted from the host).
      try {
        const wsDir = this._dockerWorkspaceHostPath ?? path.join(os.homedir(), 'Desktop', 'occ-state-dir');
        fs.writeFileSync(
          path.join(wsDir, 'moltpilot-tier.json'),
          JSON.stringify({ tier: 'free', grantedAt: new Date().toISOString(), limitUsd: 1.00 }),
        );
      } catch { /* non-fatal */ }

      log('\n\u2713 Setup complete!\n');
      try { this._panel.webview.postMessage({ type: 'configureDone' }); } catch { /* ignore */ }
      setTimeout(() => void this._showStatusPanel(), 1800);
    } catch (err) {
      fail(String(err));
    }
  }

  // ── HTML ───────────────────────────────────────────────────────────────────

  private _getHtml(iconUri: string): string {
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
      min-height: 100vh; padding: 32px 20px 48px; text-align: center;
    }
    .logo { width: 48px; height: 48px; filter: drop-shadow(0 4px 12px rgba(220,40,40,0.3)); margin-bottom: 10px; }
    .title { font-size: 19px; font-weight: 700; color: #fff; margin-bottom: 4px; }
    .sub { font-size: 12px; color: #555; margin-bottom: 28px; }

    /* Step timeline */
    .steps { display: flex; align-items: flex-start; gap: 0; margin-bottom: 28px; width: min(460px, 96vw); }
    .step-item { display: flex; flex-direction: column; align-items: center; flex: 1; position: relative; }
    .step-item:not(:last-child)::after {
      content: ''; position: absolute; top: 13px; left: calc(50% + 16px);
      width: calc(100% - 32px); height: 1px; background: #2b2b2b;
    }
    .step-item.done:not(:last-child)::after { background: #dc2828; }
    .step-dot {
      width: 26px; height: 26px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; font-weight: 700; margin-bottom: 6px;
      position: relative; z-index: 1;
    }
    .step-item.done .step-dot { background: #dc2828; color: #fff; border: 2px solid #dc2828; }
    .step-item.active .step-dot { background: transparent; border: 2px solid #dc2828; color: #dc2828; }
    .step-item.pending .step-dot { background: transparent; border: 2px solid #2b2b2b; color: #444; }
    .step-label { font-size: 10px; color: #555; text-align: center; line-height: 1.3; }
    .step-item.done .step-label { color: #dc2828; }
    .step-item.active .step-label { color: #e0e0e0; }

    /* Content area */
    .content { width: min(440px, 96vw); display: flex; flex-direction: column; align-items: center; gap: 14px; }
    .status-row { display: flex; align-items: center; gap: 10px; font-size: 13px; color: #aaa; }
    .status-err { color: #f87171; font-size: 12px; line-height: 1.5; text-align: left; background: rgba(248,113,113,0.07); border: 1px solid rgba(248,113,113,0.2); border-radius: 8px; padding: 12px 16px; width: 100%; }

    /* Log box */
    .log-wrap { width: 100%; display: none; }
    .log-wrap.visible { display: block; }
    .log-box {
      background: #0d0d0d; border: 1px solid #222; border-radius: 8px;
      padding: 12px 14px; height: 180px; overflow-y: auto;
      font-family: 'SF Mono', 'Fira Mono', 'Consolas', monospace;
      font-size: 11px; line-height: 1.6; text-align: left; color: #888;
    }
    .log-line { white-space: pre-wrap; word-break: break-all; }
    .log-line.ok { color: #4ade80; }
    .log-line.err { color: #f87171; }

    /* Spinner */
    @keyframes spin { to { transform: rotate(360deg); } }
    .spinner {
      width: 18px; height: 18px; flex-shrink: 0;
      border: 2px solid rgba(220,40,40,0.25); border-top-color: #dc2828;
      border-radius: 50%; animation: spin 0.7s linear infinite;
    }

    /* Buttons */
    .btn-back {
      background: transparent; border: 1px solid #2b2b2b; color: #666;
      font-size: 12px; padding: 6px 14px; border-radius: 6px; cursor: pointer;
      font-family: inherit; transition: color 0.15s, border-color 0.15s; margin-top: 8px;
    }
    .btn-back:hover { color: #aaa; border-color: #444; }
    .btn-retry {
      background: #dc2828; border: none; color: #fff;
      font-size: 13px; font-weight: 600; padding: 9px 22px; border-radius: 8px;
      cursor: pointer; font-family: inherit; transition: background 0.15s;
    }
    .btn-retry:hover { background: #b91c1c; }
    .done-msg { font-size: 13px; color: #4ade80; font-weight: 600; }

  </style>
</head>
<body>
  <img class="logo" src="${iconUri}" alt="OpenClaw" />
  <div class="title">Docker Installation</div>
  <div class="sub">Setting up OpenClaw in a Docker container</div>

  <!-- Step timeline -->
  <div class="steps">
    <div class="step-item active" id="s1">
      <div class="step-dot">1</div>
      <div class="step-label">Docker<br>Check</div>
    </div>
    <div class="step-item pending" id="s2">
      <div class="step-dot">2</div>
      <div class="step-label">Container<br>Setup</div>
    </div>
    <div class="step-item pending" id="s3">
      <div class="step-dot">3</div>
      <div class="step-label">Install<br>CLI</div>
    </div>
    <div class="step-item pending" id="s4">
      <div class="step-dot">4</div>
      <div class="step-label">Configure<br>AI</div>
    </div>
  </div>

  <!-- Content -->
  <div class="content" id="content">
    <!-- Step 1: preflight -->
    <div id="view-preflight">
      <div class="status-row">
        <div class="spinner" id="preflight-spinner"></div>
        <span id="preflight-text">Checking Docker...</span>
      </div>
    </div>

    <!-- Step 2: container -->
    <div id="view-container" style="display:none;width:100%;">
      <div class="status-row" id="container-status">
        <div class="spinner"></div>
        <span>Looking for occ-openclaw container...</span>
      </div>
      <div class="log-wrap" id="container-log-wrap">
        <div class="log-box" id="container-log"></div>
      </div>
    </div>

    <!-- Step 3: install -->
    <div id="view-install" style="display:none;width:100%;">
      <div class="status-row" id="install-status">
        <div class="spinner"></div>
        <span>Installing OpenClaw...</span>
      </div>
      <div class="log-wrap" id="install-log-wrap">
        <div class="log-box" id="install-log"></div>
      </div>
    </div>

    <!-- Configure log (shown during onboard) -->
    <div id="view-configure-log" style="display:none;width:100%;">
      <div class="status-row" id="configure-status">
        <div class="spinner"></div>
        <span>Configuring OpenClaw...</span>
      </div>
      <div class="log-wrap" id="configure-log-wrap">
        <div class="log-box" id="configure-log"></div>
      </div>
    </div>

    <!-- Error view -->
    <div id="view-error" style="display:none;width:100%;flex-direction:column;align-items:center;gap:12px;">
      <div class="status-err" id="error-text"></div>
      <button class="btn-retry" onclick="retry()">Retry</button>
    </div>

    <!-- Done -->
    <div id="view-done" style="display:none;">
      <div class="done-msg">\u2713 Setup complete! Opening dashboard...</div>
    </div>
  </div>

  <button class="btn-back" id="btn-back" onclick="goBack()">\u2190 Back</button>

  <script>
    const vscode = acquireVsCodeApi();
    let currentStep = 1;

    function goBack() {
      vscode.postMessage({ command: 'closePanel' });
    }

    function retry() {
      document.getElementById('view-error').style.display = 'none';
      if (currentStep === 1) startPreflight();
      else if (currentStep === 2) startContainer();
      else if (currentStep === 3) startInstall();
      else if (currentStep === 4) startAutoOnboard();
    }

    function markDone(n) {
      const el = document.getElementById('s' + n);
      if (!el) return;
      el.className = 'step-item done';
      el.querySelector('.step-dot').textContent = '\u2713';
    }
    function markActive(n) {
      const el = document.getElementById('s' + n);
      if (!el) return;
      el.className = 'step-item active';
      el.querySelector('.step-dot').textContent = String(n);
    }

    function hideAll() {
      ['preflight','container','install','configure','configure-log','error','done'].forEach(function(id) {
        var el = document.getElementById('view-' + id);
        if (el) el.style.display = 'none';
      });
    }

    function showError(text) {
      hideAll();
      var ev = document.getElementById('view-error');
      ev.style.display = 'flex';
      document.getElementById('error-text').textContent = text;
    }

    function appendLog(boxId, wrapId, text, isErr) {
      var wrap = document.getElementById(wrapId);
      if (wrap) wrap.className = 'log-wrap visible';
      var box = document.getElementById(boxId);
      if (!box) return;
      var line = document.createElement('div');
      line.className = 'log-line' + (isErr ? ' err' : '');
      line.textContent = text;
      box.appendChild(line);
      box.scrollTop = box.scrollHeight;
    }

    function startPreflight() {
      currentStep = 1;
      markActive(1);
      hideAll();
      document.getElementById('view-preflight').style.display = '';
      document.getElementById('preflight-spinner').style.display = '';
      document.getElementById('preflight-text').textContent = 'Checking Docker...';
      vscode.postMessage({ command: 'dockerPreflightCheck' });
    }

    function startContainer() {
      currentStep = 2;
      markDone(1); markActive(2);
      hideAll();
      document.getElementById('view-container').style.display = '';
      vscode.postMessage({ command: 'dockerFindOrCreate' });
    }

    function startInstall() {
      currentStep = 3;
      markDone(2); markActive(3);
      hideAll();
      document.getElementById('view-install').style.display = '';
      vscode.postMessage({ command: 'dockerInstallCli' });
    }

    function startAutoOnboard() {
      currentStep = 4;
      markDone(3); markActive(4);
      hideAll();
      document.getElementById('view-configure-log').style.display = '';
      document.getElementById('btn-back').style.display = 'none';
      vscode.postMessage({ command: 'dockerRunOnboard', provider: 'free', apiKey: '', port: '18789' });
    }

    window.addEventListener('message', function(e) {
      var msg = e.data;
      if (msg.type === 'dockerPreflightResult') {
        if (msg.ok) { startContainer(); }
        else { document.getElementById('preflight-spinner').style.display = 'none'; showError(msg.error || 'Docker check failed.'); }
      } else if (msg.type === 'dockerLog') {
        if (currentStep === 2) { document.getElementById('container-status').style.display = 'none'; appendLog('container-log', 'container-log-wrap', msg.text, !!msg.isErr); }
        else if (currentStep === 3) { document.getElementById('install-status').style.display = 'none'; appendLog('install-log', 'install-log-wrap', msg.text, !!msg.isErr); }
      } else if (msg.type === 'dockerContainerReady') {
        startInstall();
      } else if (msg.type === 'dockerInstallDone') {
        startAutoOnboard();
      } else if (msg.type === 'configureLog') {
        document.getElementById('configure-status').style.display = 'none';
        appendLog('configure-log', 'configure-log-wrap', msg.text, !!msg.isErr);
      } else if (msg.type === 'configureDone') {
        markDone(4);
        hideAll();
        document.getElementById('view-done').style.display = '';
      } else if (msg.type === 'dockerError') {
        showError(msg.text || 'An error occurred.');
      }
    });

    document.addEventListener('DOMContentLoaded', startPreflight);
  </script>
</body>
</html>`;
  }
}
