import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import type { OpenClawCoreAPI } from '../../openclaw/src/hosts/types';
import { StatusPanelController, setActiveOpenClawWorkspaceFolder } from '../../openclaw/src/panels/statusController';

const IMAGE = 'ghcr.io/openclaw/openclaw:latest';
const CONTAINER = 'occ-openclaw';
const HOST_PORT = 18790;
const CONTAINER_PORT = 18790;
const STATE_DIR = path.join(os.homedir(), 'Desktop', 'occ-state-dir');
const VOLUME_MOUNT = `${STATE_DIR}:/home/node/.openclaw`;

export class DockerSetupPanel {
  public static currentPanel: DockerSetupPanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];
  private _statusController: StatusPanelController | undefined;
  private _disposed = false;

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

    void this._initHtml(iconUri);

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
          case 'dockerPullImage':
            await this._handlePullImage();
            break;
          case 'dockerOnboard':
            await this._handleOnboard();
            break;
          case 'dockerLaunchGateway':
            await this._handleLaunchGateway();
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
    if (this._disposed) return;
    this._disposed = true;
    DockerSetupPanel.currentPanel = undefined;
    this._statusController?.dispose();
    this._statusController = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const d = this._disposables.pop();
      if (d) { d.dispose(); }
    }
  }

  /** On open: jump straight to status panel if the container is already set up, else show wizard. */
  private async _initHtml(iconUri: vscode.Uri): Promise<void> {
    const webviewIconUri = this._panel.webview.asWebviewUri(iconUri).toString();

    // Quick synchronous check — is the container running at all?
    const containerRunning = (() => {
      try {
        const result = cp.spawnSync(
          'docker',
          ['ps', '--filter', `name=^/${CONTAINER}$`, '--format', '{{.Status}}'],
          { timeout: 5000, windowsHide: true },
        );
        const st = (result.stdout?.toString() ?? '').trim();
        return st.length > 0 && st.toLowerCase().startsWith('up');
      } catch { return false; }
    })();

    if (containerRunning) {
      // Health check: config file at the known path is the source of truth.
      const configCheck = cp.spawnSync(
        'docker',
        ['exec', CONTAINER, 'test', '-f', '/home/node/.openclaw/openclaw.json'],
        { timeout: 5000, windowsHide: true },
      );
      const isConfigured = configCheck.status === 0;

      if (isConfigured) {
        // Show a loading placeholder immediately so the panel isn't blank
        // while the async status checks (docker exec calls) run in the background.
        this._panel.webview.html = this._getLoadingHtml(webviewIconUri);
        void this._showStatusPanel().catch(() => {
          // If status panel fails to load, fall back to the wizard so the user
          // isn't stuck looking at a blank / loading screen.
          if (!this._disposed) {
            this._panel.webview.html = this._getHtml(webviewIconUri);
          }
        });
        return;
      }

      // Container running but config missing — it's broken. Delete it and restart.
      cp.spawnSync('docker', ['rm', '-f', CONTAINER], { timeout: 10000, windowsHide: true });
    }

    // Container not running (or was deleted above) — show the setup wizard.
    this._panel.webview.html = this._getHtml(webviewIconUri);
  }

  private async _showStatusPanel(): Promise<void> {
    if (!this._statusController) {
      const { DockerHostConnection } = await import('./connection');
      const host = new DockerHostConnection(
        { type: 'docker', containerLabel: CONTAINER, portMappings: { gateway: HOST_PORT }, localMountPath: STATE_DIR },
        CONTAINER,
      );
      this._statusController = new StatusPanelController(
        this._panel,
        this._homeUri,
        host,
        () => {
          // Disconnect: clear binding, dispose this panel, reopen the host picker (never auto-route).
          this.dispose();
          void vscode.commands.executeCommand('openclaw.home.picker');
        },
      );
    }
    await this._statusController.show();
    this._panel.title = `OCC Home {Docker:${HOST_PORT}}`;
    void vscode.commands.executeCommand('occ.window.setHost', {
      type: 'docker', hostId: `docker:${CONTAINER}`, port: HOST_PORT, label: `Docker (${CONTAINER})`,
    });
  }

  // ── Step 1: Docker preflight ──────────────────────────────────────────────

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

  // ── Step 2: Pull image + create state dir ─────────────────────────────────

  private async _handlePullImage(): Promise<void> {
    const log = (text: string, isErr = false) => {
      try { this._panel.webview.postMessage({ type: 'dockerLog', text, isErr }); } catch { /* ignore */ }
    };
    const logCmd = (text: string) => {
      try { this._panel.webview.postMessage({ type: 'dockerLog', text, isCmd: true }); } catch { /* ignore */ }
    };
    const fail = (text: string) => {
      try { this._panel.webview.postMessage({ type: 'dockerError', text }); } catch { /* ignore */ }
    };

    try {
      logCmd(`$ docker pull ${IMAGE}\n`);
      log(`Pulling ${IMAGE}...\n`);
      const pullCode = await new Promise<number>((resolve) => {
        const proc = cp.spawn('docker', ['pull', IMAGE], { windowsHide: true });
        proc.stdout.on('data', (d: Buffer) => log(d.toString()));
        proc.stderr.on('data', (d: Buffer) => log(d.toString()));
        proc.on('close', (code) => resolve(code ?? -1));
        proc.on('error', () => resolve(-1));
      });
      if (pullCode !== 0) { fail(`Failed to pull ${IMAGE}. Check your internet connection.`); return; }
      log(`\n✓ Image ready\n`);

      // Ensure state directory exists on the host
      try { fs.mkdirSync(STATE_DIR, { recursive: true }); } catch { /* ok */ }
      log(`✓ State dir: ${STATE_DIR}\n`);

      try { this._panel.webview.postMessage({ type: 'dockerPullDone' }); } catch { /* ignore */ }
    } catch (err) {
      fail(String(err));
    }
  }

  // ── Step 3: Onboard (one-shot container) ──────────────────────────────────

  private async _handleOnboard(): Promise<void> {
    const log = (text: string, isErr = false) => {
      try { this._panel.webview.postMessage({ type: 'onboardLog', text, isErr }); } catch { /* ignore */ }
    };
    const logCmd = (text: string) => {
      try { this._panel.webview.postMessage({ type: 'onboardLog', text, isCmd: true }); } catch { /* ignore */ }
    };
    const fail = (text: string) => {
      try { this._panel.webview.postMessage({ type: 'dockerError', text }); } catch { /* ignore */ }
    };

    try {
      logCmd(`$ docker run --rm \\\n    -v ${VOLUME_MOUNT} \\\n    --security-opt no-new-privileges \\\n    --cap-drop ALL \\\n    --cap-add NET_BIND_SERVICE \\\n    ${IMAGE} \\\n    openclaw onboard --non-interactive --accept-risk \\\n    --flow quickstart --auth-choice custom-api-key \\\n    --custom-base-url https://occ.mba.sh/v1 \\\n    --gateway-auth token --gateway-port ${CONTAINER_PORT}\n`);
      log('Running OpenClaw onboard in container...\n');
      const code = await new Promise<number>((resolve) => {
        const proc = cp.spawn('docker', [
          'run', '--rm',
          '-v', VOLUME_MOUNT,
          '--security-opt', 'no-new-privileges',
          '--cap-drop', 'ALL',
          '--cap-add', 'NET_BIND_SERVICE',
          IMAGE,
          'openclaw', 'onboard',
          '--non-interactive', '--accept-risk',
          '--flow', 'quickstart',
          '--auth-choice', 'custom-api-key',
          '--custom-base-url', 'https://occ.mba.sh/v1',
          '--custom-api-key', '',
          '--custom-model-id', 'occ-legacy',
          '--custom-compatibility', 'openai',
          '--gateway-auth', 'token',
          '--gateway-port', String(CONTAINER_PORT),
          '--skip-channels', '--skip-skills', '--skip-health',
        ], { windowsHide: true });
        proc.stdout.on('data', (d: Buffer) => log(d.toString()));
        proc.stderr.on('data', (d: Buffer) => log(d.toString(), true));
        proc.on('close', (c) => resolve(c ?? -1));
        proc.on('error', () => resolve(-1));
      });

      if (code !== 0) {
        fail('Onboard failed. See the log above for details.');
        return;
      }

      // Patch occ-legacy model metadata in the config written to STATE_DIR
      log('\nPatching model config...\n');
      try {
        const cfgPath = path.join(STATE_DIR, 'openclaw.json');
        if (fs.existsSync(cfgPath)) {
          const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8')) as Record<string, unknown>;
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
          fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), 'utf-8');
        }
      } catch { /* non-fatal */ }

      // Write moltpilot-tier.json into the state dir
      try {
        fs.writeFileSync(
          path.join(STATE_DIR, 'moltpilot-tier.json'),
          JSON.stringify({ tier: 'free', grantedAt: new Date().toISOString(), limitUsd: 1.00 }),
        );
      } catch { /* non-fatal */ }

      log('\n✓ Onboard complete!\n');
      try { this._panel.webview.postMessage({ type: 'onboardDone' }); } catch { /* ignore */ }
    } catch (err) {
      fail(String(err));
    }
  }

  // ── Step 4: Launch persistent gateway container ───────────────────────────

  private async _handleLaunchGateway(): Promise<void> {
    const log = (text: string, isErr = false) => {
      try { this._panel.webview.postMessage({ type: 'launchLog', text, isErr }); } catch { /* ignore */ }
    };
    const logCmd = (text: string) => {
      try { this._panel.webview.postMessage({ type: 'launchLog', text, isCmd: true }); } catch { /* ignore */ }
    };
    const fail = (text: string) => {
      try { this._panel.webview.postMessage({ type: 'dockerError', text }); } catch { /* ignore */ }
    };

    try {
      // Remove any existing stopped container with this name
      const existing = cp.spawnSync('docker', ['ps', '-a', '--filter', `name=^/${CONTAINER}$`, '--format', '{{.Status}}'], { timeout: 8000, windowsHide: true });
      const existingStatus = existing.stdout?.toString().trim() ?? '';

      if (existingStatus) {
        if (existingStatus.toLowerCase().startsWith('up')) {
          // Health check: config file must exist before we consider the container healthy.
          const configCheck = cp.spawnSync(
            'docker',
            ['exec', CONTAINER, 'test', '-f', '/home/node/.openclaw/openclaw.json'],
            { timeout: 5000, windowsHide: true },
          );
          if (configCheck.status === 0) {
            log(`✓ Container ${CONTAINER} is already running and configured\n`);
            try { this._panel.webview.postMessage({ type: 'launchDone' }); } catch { /* ignore */ }
            setTimeout(() => void this._showStatusPanel(), 1200);
            return;
          }
          // Running but not configured — delete and restart from Step 2.
          log(`Container is running but not configured — removing and restarting setup...\n`);
          cp.spawnSync('docker', ['rm', '-f', CONTAINER], { timeout: 10000, windowsHide: true });
          try { this._panel.webview.postMessage({ type: 'dockerContainerBroken' }); } catch { /* ignore */ }
          return;
        }
        log(`Removing existing stopped container...\n`);
        cp.spawnSync('docker', ['rm', '-f', CONTAINER], { timeout: 10000, windowsHide: true });
      }

      logCmd(`$ docker run -d \\\n    --name ${CONTAINER} \\\n    --restart unless-stopped \\\n    -p ${HOST_PORT}:${CONTAINER_PORT} \\\n    -v ${VOLUME_MOUNT} \\\n    --security-opt no-new-privileges \\\n    --cap-drop ALL \\\n    --cap-add NET_BIND_SERVICE \\\n    ${IMAGE} \\\n    tail -f /dev/null\n`);
      log(`Starting ${CONTAINER} container (port ${HOST_PORT}:${CONTAINER_PORT})...\n`);
      const launchCode = await new Promise<number>((resolve) => {
        const proc = cp.spawn('docker', [
          'run', '-d',
          '--name', CONTAINER,
          '--restart', 'unless-stopped',
          '-p', `${HOST_PORT}:${CONTAINER_PORT}`,
          '-v', VOLUME_MOUNT,
          '--security-opt', 'no-new-privileges',
          '--cap-drop', 'ALL',
          '--cap-add', 'NET_BIND_SERVICE',
          IMAGE,
          'tail', '-f', '/dev/null',
        ], { windowsHide: true });
        proc.stdout.on('data', (d: Buffer) => log(d.toString()));
        proc.stderr.on('data', (d: Buffer) => log(d.toString(), true));
        proc.on('close', (c) => resolve(c ?? -1));
        proc.on('error', () => resolve(-1));
      });

      if (launchCode !== 0) { fail('Failed to launch gateway container.'); return; }
      log(`✓ Container started\n`);

      // Swap workspace folder to show STATE_DIR only (removes ~/.openclaw if present)
      try { setActiveOpenClawWorkspaceFolder(STATE_DIR); } catch { /* non-fatal */ }

      log('\n✓ Setup complete!\n');
      try { this._panel.webview.postMessage({ type: 'launchDone' }); } catch { /* ignore */ }
      setTimeout(() => void this._showStatusPanel(), 1800);
    } catch (err) {
      fail(String(err));
    }
  }

  // ── HTML ───────────────────────────────────────────────────────────────────

  private _getLoadingHtml(iconUri: string): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
      background: #1a1a1a; color: #888;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      min-height: 100vh; gap: 16px;
    }
    .logo { width: 44px; height: 44px; opacity: 0.5; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .spinner {
      width: 20px; height: 20px;
      border: 2px solid rgba(255,255,255,0.1);
      border-top-color: rgba(220,40,40,0.6);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    p { font-size: 12px; color: #555; }
  </style>
</head>
<body>
  <img class="logo" src="${iconUri}" alt="OpenClaw" />
  <div class="spinner"></div>
  <p>Connecting to Docker container&hellip;</p>
</body>
</html>`;
  }

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
      padding: 12px 14px; height: 200px; overflow-y: auto;
      font-family: 'SF Mono', 'Fira Mono', 'Consolas', monospace;
      font-size: 11px; line-height: 1.6; text-align: left; color: #888;
    }
    .log-line { white-space: pre-wrap; word-break: break-all; }
    .log-line.ok { color: #4ade80; }
    .log-line.err { color: #f87171; }
    .log-line.cmd { color: #60a5fa; opacity: 0.75; margin-bottom: 2px; }

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
  <div class="title">Docker Setup</div>
  <div class="sub">Setting up OpenClaw in a Docker container</div>

  <!-- Step timeline -->
  <div class="steps">
    <div class="step-item active" id="s1">
      <div class="step-dot">1</div>
      <div class="step-label">Docker<br>Check</div>
    </div>
    <div class="step-item pending" id="s2">
      <div class="step-dot">2</div>
      <div class="step-label">Pull<br>Image</div>
    </div>
    <div class="step-item pending" id="s3">
      <div class="step-dot">3</div>
      <div class="step-label">Onboard<br>Config</div>
    </div>
    <div class="step-item pending" id="s4">
      <div class="step-dot">4</div>
      <div class="step-label">Launch<br>Gateway</div>
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

    <!-- Step 2: pull image -->
    <div id="view-pull" style="display:none;width:100%;">
      <div class="status-row" id="pull-status">
        <div class="spinner"></div>
        <span>Pulling ${IMAGE}...</span>
      </div>
      <div class="log-wrap" id="pull-log-wrap">
        <div class="log-box" id="pull-log"></div>
      </div>
    </div>

    <!-- Step 3: onboard -->
    <div id="view-onboard" style="display:none;width:100%;">
      <div class="status-row" id="onboard-status">
        <div class="spinner"></div>
        <span>Running OpenClaw onboard...</span>
      </div>
      <div class="log-wrap" id="onboard-log-wrap">
        <div class="log-box" id="onboard-log"></div>
      </div>
    </div>

    <!-- Step 4: launch gateway -->
    <div id="view-launch" style="display:none;width:100%;">
      <div class="status-row" id="launch-status">
        <div class="spinner"></div>
        <span>Launching gateway container...</span>
      </div>
      <div class="log-wrap" id="launch-log-wrap">
        <div class="log-box" id="launch-log"></div>
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
      else if (currentStep === 2) startPull();
      else if (currentStep === 3) startOnboard();
      else if (currentStep === 4) startLaunch();
    }

    function markDone(n) {
      var el = document.getElementById('s' + n);
      if (!el) return;
      el.className = 'step-item done';
      el.querySelector('.step-dot').textContent = '\u2713';
    }
    function markActive(n) {
      var el = document.getElementById('s' + n);
      if (!el) return;
      el.className = 'step-item active';
      el.querySelector('.step-dot').textContent = String(n);
    }

    function hideAll() {
      ['preflight','pull','onboard','launch','error','done'].forEach(function(id) {
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

    function appendLog(boxId, wrapId, text, isErr, isCmd) {
      var wrap = document.getElementById(wrapId);
      if (wrap) wrap.className = 'log-wrap visible';
      var box = document.getElementById(boxId);
      if (!box) return;
      var line = document.createElement('div');
      line.className = 'log-line' + (isCmd ? ' cmd' : isErr ? ' err' : '');
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

    function startPull() {
      currentStep = 2;
      markDone(1); markActive(2);
      hideAll();
      document.getElementById('view-pull').style.display = '';
      vscode.postMessage({ command: 'dockerPullImage' });
    }

    function startOnboard() {
      currentStep = 3;
      markDone(2); markActive(3);
      hideAll();
      document.getElementById('view-onboard').style.display = '';
      document.getElementById('btn-back').style.display = 'none';
      vscode.postMessage({ command: 'dockerOnboard' });
    }

    function startLaunch() {
      currentStep = 4;
      markDone(3); markActive(4);
      hideAll();
      document.getElementById('view-launch').style.display = '';
      vscode.postMessage({ command: 'dockerLaunchGateway' });
    }

    window.addEventListener('message', function(e) {
      var msg = e.data;
      if (msg.type === 'dockerPreflightResult') {
        if (msg.ok) { startPull(); }
        else { document.getElementById('preflight-spinner').style.display = 'none'; showError(msg.error || 'Docker check failed.'); }
      } else if (msg.type === 'dockerLog') {
        if (currentStep === 2) { document.getElementById('pull-status').style.display = 'none'; appendLog('pull-log', 'pull-log-wrap', msg.text, !!msg.isErr, !!msg.isCmd); }
      } else if (msg.type === 'dockerPullDone') {
        startOnboard();
      } else if (msg.type === 'onboardLog') {
        document.getElementById('onboard-status').style.display = 'none';
        appendLog('onboard-log', 'onboard-log-wrap', msg.text, !!msg.isErr, !!msg.isCmd);
      } else if (msg.type === 'onboardDone') {
        startLaunch();
      } else if (msg.type === 'launchLog') {
        document.getElementById('launch-status').style.display = 'none';
        appendLog('launch-log', 'launch-log-wrap', msg.text, !!msg.isErr, !!msg.isCmd);
      } else if (msg.type === 'launchDone') {
        markDone(4);
        hideAll();
        document.getElementById('view-done').style.display = '';
      } else if (msg.type === 'dockerContainerBroken') {
        // Container was running but had no config — deleted it, restart from Pull Image.
        startPull();
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
