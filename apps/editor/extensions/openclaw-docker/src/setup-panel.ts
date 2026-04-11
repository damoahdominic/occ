import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import type { OpenClawCoreAPI } from '../../openclaw/src/hosts/types';
import { StatusPanelController, setActiveOpenClawWorkspaceFolder } from '../../openclaw/src/panels/statusController';

const IMAGE = 'ghcr.io/openclaw/openclaw:latest';
const CONTAINER = 'occ-openclaw';
const DEFAULT_HOST_PORT = 18789;
const DEFAULT_CONTAINER_PORT = 18789;
const DEFAULT_STATE_DIR = path.join(os.homedir(), 'Desktop', 'occ-state-dir');

// Config file paths
function getDockerDir(extensionUri?: vscode.Uri): string {
  // Get workspace root - try multiple approaches
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (workspaceRoot) {
    return path.join(workspaceRoot, 'docker');
  }
  // Fallback: derive from extension path
  if (extensionUri) {
    return path.join(path.dirname(path.dirname(path.dirname(extensionUri.fsPath))), 'docker');
  }
  // Last resort: relative to where we think the repo is
  return path.join(os.homedir(), 'Desktop', 'workshop', 'studio', 'hustle', 'occ', 'docker');
}

function getConfigFilePath(extensionUri?: vscode.Uri): string {
  return path.join(getDockerDir(extensionUri), '.env.openclaw');
}

function getConfigExamplePath(extensionUri?: vscode.Uri): string {
  return path.join(getDockerDir(extensionUri), '.env.openclaw.example');
}

// Config type
export interface DockerConfig {
  image: string;
  port: string;
  dataDir: string;
  freshBuild: boolean;
  bindHost: string;
}

const DEFAULT_CONFIG: DockerConfig = {
  image: 'ghcr.io/openclaw/openclaw:latest',
  port: '18789',
  dataDir: './openclaw_docker_data',
  freshBuild: false,
  bindHost: '127.0.0.1',
};

export class DockerSetupPanel {
  public static currentPanel: DockerSetupPanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];
  private _statusController: StatusPanelController | undefined;
  private _disposed = false;

  // Config flow state (0=Config, 1=Confirm, 2=Preflight, 3=Pull, 4=Onboard, 5=Launch, 6=Done)
  private _configStep: 0 | 1 | 2 | 3 | 4 | 5 | 6 = 0;
  private _configDraft: DockerConfig | null = null;
  private _activeConfig: DockerConfig = { ...DEFAULT_CONFIG };
  private _pullLogs: string[] = [];
  private _onboardLogs: string[] = [];

  // Helper getters for provisioning
  private get _image(): string { return this._activeConfig.image; }
  private get _hostPort(): number { return parseInt(this._activeConfig.port, 10) || DEFAULT_HOST_PORT; }
  private get _containerPort(): number { return DEFAULT_CONTAINER_PORT; }
  private get _dataDir(): string { 
    // Resolve relative paths relative to docker folder
    const dockerDir = getDockerDir(this._extensionUri);
    const dataDir = this._activeConfig.dataDir;
    if (dataDir.startsWith('./') || !path.isAbsolute(dataDir)) {
      return path.resolve(dockerDir, dataDir);
    }
    return dataDir;
  }
  private get _bindHost(): string { return this._activeConfig.bindHost; }
  private get _freshBuild(): boolean { return this._activeConfig.freshBuild; }
  private get _volumeMount(): string { return `${this._dataDir}:/home/node/.openclaw`; }

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

        // Handle config flow messages
        switch (msg.command) {
          case 'dockerBrowseDir':
            await this._handleBrowseDir();
            break;
          case 'dockerSaveConfig':
            this._handleSaveConfig(msg as unknown as { image: string; port: string; dataDir: string; freshBuild: boolean; bindHost: string });
            break;
          case 'dockerConfirmConfig':
            await this._handleConfirmConfig();
            break;
          case 'dockerBack':
            this._handleBack();
            break;
          case 'dockerCancel':
            this._handleCancel();
            break;
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
          case 'openErrorLog':
            await this._handleOpenErrorLog(msg.path as string);
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

  // ── Config Helpers ──────────────────────────────────────────────────────────

  /** Load config from file or return defaults */
  private async _loadConfig(): Promise<DockerConfig> {
    const configPath = getConfigFilePath(this._extensionUri);
    try {
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, 'utf-8');
        const config: DockerConfig = { ...DEFAULT_CONFIG };
        
        const imageMatch = content.match(/^GATEWAY_IMAGE=(.+)$/m);
        const portMatch = content.match(/^GATEWAY_PORT=(.+)$/m);
        const dataDirMatch = content.match(/^OPENCLAW_DATA_DIR=(.+)$/m);
        const freshBuildMatch = content.match(/^FRESH_BUILD=(.+)$/m);
        const bindHostMatch = content.match(/^BIND_HOST=(.+)$/m);
        
        if (imageMatch?.[1]) config.image = imageMatch[1].trim();
        if (portMatch?.[1]) config.port = portMatch[1].trim();
        if (dataDirMatch?.[1]) config.dataDir = dataDirMatch[1].trim();
        if (freshBuildMatch?.[1]) config.freshBuild = freshBuildMatch[1].trim().toLowerCase() === 'true';
        if (bindHostMatch?.[1]) config.bindHost = bindHostMatch[1].trim();
        
        return config;
      }
    } catch { /* use defaults */ }
    return { ...DEFAULT_CONFIG };
  }

  /** Save config to file atomically */
  private async _saveConfig(config: DockerConfig): Promise<void> {
    const configPath = getConfigFilePath(this._extensionUri);
    const dockerDir = getDockerDir(this._extensionUri);
    
    // Ensure docker directory exists
    if (!fs.existsSync(dockerDir)) {
      fs.mkdirSync(dockerDir, { recursive: true });
    }
    
    const content = [
      `GATEWAY_IMAGE=${config.image}`,
      `GATEWAY_PORT=${config.port}`,
      `OPENCLAW_DATA_DIR=${config.dataDir}`,
      `FRESH_BUILD=${config.freshBuild}`,
      `BIND_HOST=${config.bindHost}`,
      '',
    ].join('\n');
    
    // Atomic write: temp file + rename
    const tempPath = configPath + '.tmp';
    fs.writeFileSync(tempPath, content, 'utf-8');
    fs.renameSync(tempPath, configPath);
  }

  /** Validate config values */
  private _validateConfig(config: DockerConfig): string | null {
    const port = parseInt(config.port, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      return 'Port must be between 1 and 65535';
    }
    if (!config.dataDir || config.dataDir.trim() === '') {
      return 'Data directory is required';
    }
    if (config.bindHost !== '127.0.0.1' && config.bindHost !== '0.0.0.0') {
      return 'Bind host must be 127.0.0.1 or 0.0.0.0';
    }
    return null;
  }

  // ── Config Message Handlers ────────────────────────────────────────────────

  private async _handleBrowseDir(): Promise<void> {
    const uri = await vscode.window.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      canSelectMany: false,
      title: 'Select OpenClaw Data Directory',
    });
    if (uri?.[0]) {
      try {
        this._panel.webview.postMessage({ type: 'dockerBrowseResult', path: uri[0].fsPath });
      } catch { /* ignore */ }
    }
  }

  private _handleSaveConfig(msg: { image: string; port: string; dataDir: string; freshBuild: boolean; bindHost: string }): void {
    this._configDraft = {
      image: msg.image || DEFAULT_CONFIG.image,
      port: msg.port || DEFAULT_CONFIG.port,
      dataDir: msg.dataDir || DEFAULT_CONFIG.dataDir,
      freshBuild: Boolean(msg.freshBuild),
      bindHost: msg.bindHost || DEFAULT_CONFIG.bindHost,
    };
    
    // Validate
    const error = this._validateConfig(this._configDraft);
    if (error) {
      try {
        this._panel.webview.postMessage({ type: 'dockerConfigError', message: error });
      } catch { /* ignore */ }
      return;
    }
    
    // Advance to Confirm step
    this._configStep = 1;
    this._renderConfigStep();
  }

  private async _handleConfirmConfig(): Promise<void> {
    if (!this._configDraft) return;
    
    // Save config to file
    await this._saveConfig(this._configDraft);
    this._activeConfig = { ...this._configDraft };
    
    // Advance to Step 3 (Preflight)
    this._configStep = 2;
    this._renderProvisioningStep();
    
    // Auto-start preflight
    await this._handleDockerPreflight();
  }

  private _handleBack(): void {
    if (this._configStep === 1) {
      // Go back from Confirm to Config
      this._configStep = 0;
      this._renderConfigStep();
    }
  }

  private _handleCancel(): void {
    this.dispose();
    void vscode.commands.executeCommand('openclaw.home.picker');
  }

  // ── Render Methods ─────────────────────────────────────────────────────────

  private _renderConfigStep(): void {
    const iconUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this._homeUri, 'media', 'icon.png')
    ).toString();
    
    this._panel.webview.html = this._getConfigHtml(iconUri, this._configDraft || DEFAULT_CONFIG);
  }

  private _renderProvisioningStep(): void {
    const iconUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this._homeUri, 'media', 'icon.png')
    ).toString();
    
    this._panel.webview.html = this._getHtml(iconUri);
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

    // Container not running (or was deleted above) — show config step first
    this._activeConfig = await this._loadConfig();
    this._configStep = 0;
    this._configDraft = null;
    this._panel.webview.html = this._getConfigHtml(webviewIconUri, this._activeConfig);
  }

  private async _showStatusPanel(): Promise<void> {
    if (!this._statusController) {
      const { DockerHostConnection } = await import('./connection');
      const host = new DockerHostConnection(
        { type: 'docker', containerLabel: CONTAINER, portMappings: { gateway: this._hostPort }, localMountPath: this._dataDir },
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
    this._panel.title = `OCC Home {Docker:${this._hostPort}}`;
    void vscode.commands.executeCommand('occ.window.setHost', {
      type: 'docker', hostId: `docker:${CONTAINER}`, port: this._hostPort, label: `Docker (${CONTAINER})`,
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
    // Reset logs for this pull attempt
    this._pullLogs = [];

    const log = (text: string, isErr = false) => {
      this._pullLogs.push(text);
      try { this._panel.webview.postMessage({ type: 'dockerLog', text, isErr }); } catch { /* ignore */ }
    };
    const logCmd = (text: string) => {
      this._pullLogs.push(text);
      try { this._panel.webview.postMessage({ type: 'dockerLog', text, isCmd: true }); } catch { /* ignore */ }
    };
    const fail = (text: string) => {
      // Save accumulated logs to error file before showing error
      const errorLogPath = path.join(os.homedir(), '.openclaw', 'docker-setup-error.log');
      try {
        fs.mkdirSync(path.dirname(errorLogPath), { recursive: true });
        fs.writeFileSync(errorLogPath, this._pullLogs.join(''), 'utf-8');
      } catch (err) {
        // Non-fatal: log save failure won't prevent error message
      }
      try { this._panel.webview.postMessage({ type: 'dockerError', text, errorLogPath }); } catch { /* ignore */ }
    };

    try {
      logCmd(`$ docker pull ${this._image}\n`);
      log(`Pulling ${this._image}...\n`);
      const pullCode = await new Promise<number>((resolve) => {
        const proc = cp.spawn('docker', ['pull', this._image], { windowsHide: true });
        proc.stdout.on('data', (d: Buffer) => log(d.toString()));
        proc.stderr.on('data', (d: Buffer) => log(d.toString()));
        proc.on('close', (code) => resolve(code ?? -1));
        proc.on('error', () => resolve(-1));
      });
      if (pullCode !== 0) { fail(`Failed to pull ${this._image}. Check your internet connection.`); return; }
      log(`\n✓ Image ready\n`);

      // Ensure state directory exists on the host
      try { fs.mkdirSync(this._dataDir, { recursive: true }); } catch { /* ok */ }
      log(`✓ State dir: ${this._dataDir}\n`);

      try { this._panel.webview.postMessage({ type: 'dockerPullDone' }); } catch { /* ignore */ }
    } catch (err) {
      fail(String(err));
    }
  }

  // ── Step 3: Onboard (one-shot container) ──────────────────────────────────

  private async _handleOnboard(): Promise<void> {
    // Reset logs for this onboard attempt
    this._onboardLogs = [];

    const log = (text: string, isErr = false) => {
      this._onboardLogs.push(text);
      try { this._panel.webview.postMessage({ type: 'onboardLog', text, isErr }); } catch { /* ignore */ }
    };
    const logCmd = (text: string) => {
      this._onboardLogs.push(text);
      try { this._panel.webview.postMessage({ type: 'onboardLog', text, isCmd: true }); } catch { /* ignore */ }
    };
    const fail = (text: string) => {
      // Save accumulated logs to error file before showing error
      const errorLogPath = path.join(os.homedir(), '.openclaw', 'docker-setup-error.log');
      try {
        fs.mkdirSync(path.dirname(errorLogPath), { recursive: true });
        fs.writeFileSync(errorLogPath, this._onboardLogs.join(''), 'utf-8');
      } catch (err) {
        // Non-fatal: log save failure won't prevent error message
      }
      try { this._panel.webview.postMessage({ type: 'dockerError', text, errorLogPath }); } catch { /* ignore */ }
    };

    try {
      logCmd(`$ docker run --rm \\\n    -v ${this._volumeMount} \\\n    --security-opt no-new-privileges \\\n    --cap-drop ALL \\\n    --cap-add NET_BIND_SERVICE \\\n    ${this._image} \\\n    openclaw onboard --non-interactive --accept-risk \\\n    --flow quickstart --auth-choice custom-api-key \\\n    --custom-base-url https://occ.mba.sh/v1 \\\n    --gateway-auth token --gateway-port ${this._containerPort}\n`);
      log('Running OpenClaw onboard in container...\n');
      const code = await new Promise<number>((resolve) => {
        const proc = cp.spawn('docker', [
          'run', '--rm',
          '-v', this._volumeMount,
          '--security-opt', 'no-new-privileges',
          '--cap-drop', 'ALL',
          '--cap-add', 'NET_BIND_SERVICE',
          this._image,
          'openclaw', 'onboard',
          '--non-interactive', '--accept-risk',
          '--flow', 'quickstart',
          '--auth-choice', 'custom-api-key',
          '--custom-base-url', 'https://occ.mba.sh/v1',
          '--custom-api-key', '',
          '--custom-model-id', 'occ-legacy',
          '--custom-compatibility', 'openai',
          '--gateway-auth', 'token',
          '--gateway-port', String(this._containerPort),
          '--skip-channels', '--skip-skills', '--skip-health',
        ], { windowsHide: true });
        proc.stdout.on('data', (d: Buffer) => log(d.toString()));
        proc.stderr.on('data', (d: Buffer) => log(d.toString(), true));
        proc.on('close', (c) => resolve(c ?? -1));
        proc.on('error', () => resolve(-1));
      });

      if (code !== 0) {
        fail('Onboard failed. See the error log for details.');
        return;
      }

      // Write logs to file for troubleshooting
      const logDir = path.join(os.homedir(), '.openclaw');
      const logPath = path.join(logDir, 'docker-setup.log');
      try {
        fs.mkdirSync(logDir, { recursive: true });
        const timestamp = new Date().toISOString();
        const logContent = `[${timestamp}] Docker Setup Onboard Logs\n${'='.repeat(60)}\n\n${this._onboardLogs.join('')}\n`;
        fs.writeFileSync(logPath, logContent, 'utf-8');
        log(`\n✓ Logs saved to: ${logPath}\n`);
        try { this._panel.webview.postMessage({ type: 'onboardLogsPath', path: logPath }); } catch { /* ignore */ }
      } catch (err) {
        log(`\nWarning: Failed to save logs: ${String(err)}\n`);
      }

      // Patch occ-legacy model metadata in the config written to data dir
      log('\nPatching model config...\n');
      try {
        const cfgPath = path.join(this._dataDir, 'openclaw.json');
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

      // Write moltpilot-tier.json into the data dir
      try {
        fs.writeFileSync(
          path.join(this._dataDir, 'moltpilot-tier.json'),
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

      logCmd(`$ docker run -d \\\n    --name ${CONTAINER} \\\n    --restart unless-stopped \\\n    -p ${this._hostPort}:${this._containerPort} \\\n    -v ${this._volumeMount} \\\n    --security-opt no-new-privileges \\\n    --cap-drop ALL \\\n    --cap-add NET_BIND_SERVICE \\\n    ${this._image} \\\n    tail -f /dev/null\n`);
      log(`Starting ${CONTAINER} container (port ${this._hostPort}:${this._containerPort})...\n`);
      const launchCode = await new Promise<number>((resolve) => {
        const proc = cp.spawn('docker', [
          'run', '-d',
          '--name', CONTAINER,
          '--restart', 'unless-stopped',
          '-p', `${this._hostPort}:${this._containerPort}`,
          '-v', this._volumeMount,
          '--security-opt', 'no-new-privileges',
          '--cap-drop', 'ALL',
          '--cap-add', 'NET_BIND_SERVICE',
          this._image,
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
      try { setActiveOpenClawWorkspaceFolder(this._dataDir); } catch { /* non-fatal */ }

      log('\n✓ Setup complete!\n');
      try { this._panel.webview.postMessage({ type: 'launchDone' }); } catch { /* ignore */ }
      setTimeout(() => void this._showStatusPanel(), 1800);
    } catch (err) {
      fail(String(err));
    }
  }

  // ── Error Log Handling ──────────────────────────────────────────────────────

  private async _handleOpenErrorLog(errorLogPath: string): Promise<void> {
    try {
      const uri = vscode.Uri.file(errorLogPath);
      // Try to open the file in the editor
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc, { preview: false });
    } catch (err) {
      // If opening fails, try to reveal it in file explorer
      try {
        await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(errorLogPath));
      } catch (err2) {
        // As a last resort, show the file path so user can open it manually
        void vscode.window.showInformationMessage(`Error log saved at: ${errorLogPath}`);
      }
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

  // ── Config Step HTML ───────────────────────────────────────────────────────

  private _getConfigHtml(iconUri: string, config: DockerConfig): string {
    const isConfirm = this._configStep === 1;
    
    if (isConfirm) {
      return this._getConfirmHtml(iconUri, config);
    }
    
    // Step 1: Config form
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
    .sub { font-size: 12px; color: #555; margin-bottom: 20px; }

    /* Step timeline - 6 steps */
    .steps { display: flex; align-items: flex-start; gap: 0; margin-bottom: 24px; width: min(520px, 96vw); }
    .step-item { display: flex; flex-direction: column; align-items: center; flex: 1; position: relative; }
    .step-item:not(:last-child)::after {
      content: ''; position: absolute; top: 13px; left: calc(50% + 14px);
      width: calc(100% - 28px); height: 1px; background: #2b2b2b;
    }
    .step-item.done:not(:last-child)::after { background: #dc2828; }
    .step-dot {
      width: 24px; height: 24px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 10px; font-weight: 700; margin-bottom: 4px;
      position: relative; z-index: 1;
    }
    .step-item.done .step-dot { background: #dc2828; color: #fff; border: 2px solid #dc2828; }
    .step-item.active .step-dot { background: transparent; border: 2px solid #dc2828; color: #dc2828; }
    .step-item.pending .step-dot { background: transparent; border: 2px solid #2b2b2b; color: #444; }
    .step-label { font-size: 9px; color: #555; text-align: center; line-height: 1.2; }
    .step-item.done .step-label { color: #dc2828; }
    .step-item.active .step-label { color: #e0e0e0; }

    /* Form */
    .form { width: min(420px, 96vw); display: flex; flex-direction: column; gap: 14px; }
    .field { display: flex; flex-direction: column; gap: 6px; text-align: left; }
    .field label { font-size: 12px; color: #888; font-weight: 500; }
    .field input, .field select {
      background: #252525; border: 1px solid #333; border-radius: 6px;
      padding: 10px 12px; font-size: 13px; color: #e0e0e0; font-family: inherit;
    }
    .field input:focus, .field select:focus { outline: none; border-color: #dc2828; }
    .field-row { display: flex; gap: 10px; }
    .field-row .field { flex: 1; }
    .field-with-btn { display: flex; gap: 8px; }
    .field-with-btn .field { flex: 1; }
    .btn-browse {
      background: #333; border: 1px solid #444; color: #aaa;
      padding: 10px 14px; border-radius: 6px; cursor: pointer; font-size: 12px;
      font-family: inherit; white-space: nowrap;
    }
    .btn-browse:hover { background: #444; color: #fff; }
    .checkbox { flex-direction: row; align-items: center; gap: 10px; }
    .checkbox input { width: 16px; height: 16px; }
    .checkbox label { font-size: 13px; color: #aaa; }

    /* Error */
    .error { color: #f87171; font-size: 12px; text-align: left; background: rgba(248,113,113,0.07); border: 1px solid rgba(248,113,113,0.2); border-radius: 6px; padding: 10px 14px; width: 100%; }

    /* Buttons */
    .btns { display: flex; gap: 12px; margin-top: 16px; width: min(420px, 96vw); justify-content: center; }
    .btn-next {
      background: #dc2828; border: none; color: #fff;
      font-size: 13px; font-weight: 600; padding: 10px 28px; border-radius: 8px;
      cursor: pointer; font-family: inherit; transition: background 0.15s;
    }
    .btn-next:hover { background: #b91c1c; }
    .btn-cancel {
      background: transparent; border: 1px solid #333; color: #666;
      font-size: 13px; padding: 10px 20px; border-radius: 8px; cursor: pointer;
      font-family: inherit;
    }
    .btn-cancel:hover { color: #aaa; border-color: #444; }
  </style>
</head>
<body>
  <img class="logo" src="${iconUri}" alt="OpenClaw" />
  <div class="title">Docker Setup</div>
  <div class="sub">Configure your Docker environment</div>

  <!-- Step timeline -->
  <div class="steps">
    <div class="step-item active" id="s1">
      <div class="step-dot">1</div>
      <div class="step-label">Config</div>
    </div>
    <div class="step-item pending" id="s2">
      <div class="step-dot">2</div>
      <div class="step-label">Confirm</div>
    </div>
    <div class="step-item pending" id="s3">
      <div class="step-dot">3</div>
      <div class="step-label">Check</div>
    </div>
    <div class="step-item pending" id="s4">
      <div class="step-dot">4</div>
      <div class="step-label">Pull</div>
    </div>
    <div class="step-item pending" id="s5">
      <div class="step-dot">5</div>
      <div class="step-label">Onboard</div>
    </div>
    <div class="step-item pending" id="s6">
      <div class="step-dot">6</div>
      <div class="step-label">Launch</div>
    </div>
  </div>

  <!-- Config form -->
  <div class="form" id="config-form">
    <div class="field">
      <label>Docker Image</label>
      <input type="text" id="image" value="${config.image}" placeholder="ghcr.io/openclaw/openclaw:latest" />
    </div>
    <div class="field-row">
      <div class="field">
        <label>Gateway Port (Host)</label>
        <input type="number" id="port" value="${config.port}" placeholder="18789" min="1" max="65535" />
      </div>
      <div class="field">
        <label>Bind Host</label>
        <select id="bindHost">
          <option value="127.0.0.1" ${config.bindHost === '127.0.0.1' ? 'selected' : ''}>127.0.0.1 (localhost)</option>
          <option value="0.0.0.0" ${config.bindHost === '0.0.0.0' ? 'selected' : ''}>0.0.0.0 (all interfaces)</option>
        </select>
      </div>
    </div>
    <div class="field">
      <label>Data Directory</label>
      <div class="field-with-btn">
        <input type="text" id="dataDir" value="${config.dataDir}" placeholder="./openclaw_docker_data" />
        <button class="btn-browse" onclick="browseDir()">Browse</button>
      </div>
    </div>
    <div class="field checkbox">
      <input type="checkbox" id="freshBuild" ${config.freshBuild ? 'checked' : ''} />
      <label for="freshBuild">Force fresh build (rebuild image)</label>
    </div>
    <div class="error" id="error" style="display:none;"></div>
  </div>

  <div class="btns">
    <button class="btn-cancel" onclick="cancel()">Cancel</button>
    <button class="btn-next" onclick="next()">Next</button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    function browseDir() {
      vscode.postMessage({ command: 'dockerBrowseDir' });
    }

    function cancel() {
      vscode.postMessage({ command: 'dockerCancel' });
    }

    function next() {
      const image = document.getElementById('image').value;
      const port = document.getElementById('port').value;
      const dataDir = document.getElementById('dataDir').value;
      const bindHost = document.getElementById('bindHost').value;
      const freshBuild = document.getElementById('freshBuild').checked;
      
      vscode.postMessage({ 
        command: 'dockerSaveConfig', 
        image, port, dataDir, freshBuild, bindHost 
      });
    }

    window.addEventListener('message', function(e) {
      const msg = e.data;
      if (msg.type === 'dockerBrowseResult') {
        document.getElementById('dataDir').value = msg.path;
      } else if (msg.type === 'dockerConfigError') {
        const err = document.getElementById('error');
        err.textContent = msg.message;
        err.style.display = 'block';
      }
    });
  </script>
</body>
</html>`;
  }

  private _getConfirmHtml(iconUri: string, config: DockerConfig): string {
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
    .sub { font-size: 12px; color: #555; margin-bottom: 20px; }

    /* Step timeline */
    .steps { display: flex; align-items: flex-start; gap: 0; margin-bottom: 24px; width: min(520px, 96vw); }
    .step-item { display: flex; flex-direction: column; align-items: center; flex: 1; position: relative; }
    .step-item:not(:last-child)::after {
      content: ''; position: absolute; top: 13px; left: calc(50% + 14px);
      width: calc(100% - 28px); height: 1px; background: #2b2b2b;
    }
    .step-item.done:not(:last-child)::after { background: #dc2828; }
    .step-dot {
      width: 24px; height: 24px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 10px; font-weight: 700; margin-bottom: 4px;
      position: relative; z-index: 1;
    }
    .step-item.done .step-dot { background: #dc2828; color: #fff; border: 2px solid #dc2828; }
    .step-item.active .step-dot { background: transparent; border: 2px solid #dc2828; color: #dc2828; }
    .step-item.pending .step-dot { background: transparent; border: 2px solid #2b2b2b; color: #444; }
    .step-label { font-size: 9px; color: #555; text-align: center; line-height: 1.2; }
    .step-item.done .step-label { color: #dc2828; }
    .step-item.active .step-label { color: #e0e0e0; }

    /* Review table */
    .review { width: min(420px, 96vw); background: #222; border-radius: 10px; padding: 20px; }
    .review-title { font-size: 14px; font-weight: 600; color: #fff; margin-bottom: 16px; text-align: left; }
    .review-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #2a2a2a; }
    .review-row:last-child { border-bottom: none; }
    .review-label { color: #888; font-size: 12px; }
    .review-value { color: #e0e0e0; font-size: 13px; font-family: monospace; }

    /* Buttons */
    .btns { display: flex; gap: 12px; margin-top: 20px; width: min(420px, 96vw); justify-content: center; }
    .btn-back {
      background: transparent; border: 1px solid #333; color: #aaa;
      font-size: 13px; padding: 10px 20px; border-radius: 8px; cursor: pointer;
      font-family: inherit;
    }
    .btn-back:hover { color: #fff; border-color: #444; }
    .btn-confirm {
      background: #dc2828; border: none; color: #fff;
      font-size: 13px; font-weight: 600; padding: 10px 28px; border-radius: 8px;
      cursor: pointer; font-family: inherit; transition: background 0.15s;
    }
    .btn-confirm:hover { background: #b91c1c; }
  </style>
</head>
<body>
  <img class="logo" src="${iconUri}" alt="OpenClaw" />
  <div class="title">Docker Setup</div>
  <div class="sub">Review your configuration</div>

  <!-- Step timeline -->
  <div class="steps">
    <div class="step-item done" id="s1">
      <div class="step-dot">✓</div>
      <div class="step-label">Config</div>
    </div>
    <div class="step-item active" id="s2">
      <div class="step-dot">2</div>
      <div class="step-label">Confirm</div>
    </div>
    <div class="step-item pending" id="s3">
      <div class="step-dot">3</div>
      <div class="step-label">Check</div>
    </div>
    <div class="step-item pending" id="s4">
      <div class="step-dot">4</div>
      <div class="step-label">Pull</div>
    </div>
    <div class="step-item pending" id="s5">
      <div class="step-dot">5</div>
      <div class="step-label">Onboard</div>
    </div>
    <div class="step-item pending" id="s6">
      <div class="step-dot">6</div>
      <div class="step-label">Launch</div>
    </div>
  </div>

  <!-- Review -->
  <div class="review">
    <div class="review-title">Configuration Review</div>
    <div class="review-row">
      <span class="review-label">Image</span>
      <span class="review-value">${config.image}</span>
    </div>
    <div class="review-row">
      <span class="review-label">Port</span>
      <span class="review-value">${config.port}</span>
    </div>
    <div class="review-row">
      <span class="review-label">Bind Host</span>
      <span class="review-value">${config.bindHost}</span>
    </div>
    <div class="review-row">
      <span class="review-label">Data Directory</span>
      <span class="review-value">${config.dataDir}</span>
    </div>
    <div class="review-row">
      <span class="review-label">Fresh Build</span>
      <span class="review-value">${config.freshBuild ? 'Yes' : 'No'}</span>
    </div>
  </div>

  <div class="btns">
    <button class="btn-back" onclick="back()">Back</button>
    <button class="btn-confirm" onclick="confirm()">Confirm</button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    function back() {
      vscode.postMessage({ command: 'dockerBack' });
    }

    function confirm() {
      vscode.postMessage({ command: 'dockerConfirmConfig' });
    }
  </script>
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
        <span>Pulling ${this._image}...</span>
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
      <div style="display:flex;gap:8px;width:100%;justify-content:center;">
        <button class="btn-retry" onclick="viewErrorLog()" id="btn-view-log" style="display:none;">View Error Log</button>
        <button class="btn-retry" onclick="retry()">Retry</button>
      </div>
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

    var lastErrorLogPath = null;

    function showError(text, errorLogPath) {
      lastErrorLogPath = errorLogPath || null;
      hideAll();
      var ev = document.getElementById('view-error');
      ev.style.display = 'flex';
      document.getElementById('error-text').textContent = text;
      // Show View Error Log button only if we have a log path
      var btnViewLog = document.getElementById('btn-view-log');
      if (errorLogPath) {
        btnViewLog.style.display = 'inline-block';
      } else {
        btnViewLog.style.display = 'none';
      }
    }

    function viewErrorLog() {
      if (lastErrorLogPath) {
        vscode.postMessage({ command: 'openErrorLog', path: lastErrorLogPath });
      }
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
        showError(msg.text || 'An error occurred.', msg.errorLogPath);
      }
    });

    document.addEventListener('DOMContentLoaded', startPreflight);
  </script>
</body>
</html>`;
  }
}
