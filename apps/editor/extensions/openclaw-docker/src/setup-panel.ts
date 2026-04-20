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

// Config file paths — resolve relative to the extension, not the workspace,
// because the user's workspace may be ~/.openclaw (not the project root).
// Extension lives at: <project>/apps/editor/extensions/openclaw-docker/
// Docker dir lives at: <project>/docker/
function getDockerDir(extensionUri?: vscode.Uri): string {
  if (extensionUri) {
    // 4 levels up from extension dir → project root
    const projectRoot = path.dirname(path.dirname(path.dirname(path.dirname(extensionUri.fsPath))));
    return path.join(projectRoot, 'docker');
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
  /**
   * The HOST-side absolute path for the data directory.
   *
   * When the extension runs inside occ-editor-dev (docker-in-docker via the
   * mounted socket), _dataDir resolves to a container-internal path like
   * /workspace/docker/openclaw_docker_data. The host Docker daemon has no
   * /workspace mount, so it creates that path as root → EACCES in the
   * gateway container. HOST_WORKSPACE is injected by docker-compose.yml so
   * we can translate the container path to the real host path.
   */
  private get _hostDataDir(): string {
    const containerPath = this._dataDir;
    const hostWorkspace = process.env.HOST_WORKSPACE;
    if (hostWorkspace && containerPath.startsWith('/workspace')) {
      return containerPath.replace(/^\/workspace/, hostWorkspace);
    }
    return containerPath;
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
          case 'dockerCheckEnvironment':
            await this._handleCheckDockerEnvironment();
            break;
          case 'openDockerDocs':
            await vscode.env.openExternal(vscode.Uri.parse('https://docs.docker.com/get-docker/'));
            break;
          case 'dockerReportError':
            await this._handleReportError(msg as unknown as { error: string; logs: string; systemInfo: unknown; timestamp: string });
            break;
          case 'dockerBrowseDir':
            await this._handleBrowseDir();
            break;
          case 'dockerValidateFields':
            await this._handleValidateFields(msg as unknown as { image: string; port: string; dataDir: string; bindHost: string });
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

  /** Validate config values - returns all validation errors */
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

  /** Run all validation checks for form fields */
  private async _runValidationChecks(config: Partial<DockerConfig>): Promise<{
    errors:   { image: string | null; port: string | null; bindHost: string | null; dataDir: string | null };
    warnings: { dataDir: string | null };
  }> {
    const errors = {
      image: null as string | null,
      port: null as string | null,
      bindHost: null as string | null,
      dataDir: null as string | null,
    };
    const warnings = {
      dataDir: null as string | null,
    };

    // Validate image — blank is fine (defaults to DEFAULT_CONFIG.image)
    if (config.image && config.image.trim() !== '' && !config.image.includes(':')) {
      errors.image = 'Image must include a tag (e.g., :latest)';
    }

    // Validate port
    if (!config.port || config.port.trim() === '') {
      errors.port = 'Port is required';
    } else {
      const port = parseInt(config.port, 10);
      if (isNaN(port) || port < 1024 || port > 65535) {
        errors.port = 'Port must be between 1024 and 65535';
      } else if (await this._isPortInUse(port)) {
        errors.port = `Port ${port} is already in use`;
      }
    }

    // Validate bindHost
    if (config.bindHost && config.bindHost !== '127.0.0.1' && config.bindHost !== '0.0.0.0') {
      errors.bindHost = 'Bind host must be 127.0.0.1 or 0.0.0.0';
    }

    // Validate dataDir — "required" and path-access remain blocking errors.
    // Disk space is a soft recommendation surfaced as a warning, never blocking.
    if (!config.dataDir || config.dataDir.trim() === '') {
      errors.dataDir = 'Data directory is required';
    } else {
      const resolvedPath = path.resolve(config.dataDir);
      const accessError = await this._checkPathAccess(resolvedPath);
      if (accessError) {
        errors.dataDir = accessError;
      }
      warnings.dataDir = await this._checkDiskSpace(resolvedPath);
    }

    return { errors, warnings };
  }

  /** Check if a port is in use */
  private async _isPortInUse(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const result = cp.spawnSync(
          'sh',
          ['-c', `netstat -tuln 2>/dev/null | grep -q ":${port} " || lsof -Pi :${port} -sTCP:LISTEN -t >/dev/null 2>&1`],
          { timeout: 2000, windowsHide: true },
        );
        resolve(result.status === 0);
      } catch {
        resolve(false);
      }
    });
  }

  /** Check path accessibility and writability */
  private async _checkPathAccess(fsPath: string): Promise<string | null> {
    return new Promise((resolve) => {
      try {
        // Check if parent directory exists and is writable
        const parentDir = path.dirname(fsPath);
        const result = cp.spawnSync(
          'test',
          ['-w', parentDir],
          { timeout: 1000, windowsHide: true },
        );

        if (result.status === 0) {
          resolve(null);
        } else {
          resolve(`No write permission for ${parentDir}. Check directory permissions or choose a different path.`);
        }
      } catch {
        resolve(`Unable to access path: ${fsPath}`);
      }
    });
  }

  /** Soft disk-space recommendation (5 GB). Returns advisory text, never blocks. */
  private async _checkDiskSpace(fsPath: string): Promise<string | null> {
    return new Promise((resolve) => {
      try {
        const parentDir = path.dirname(fsPath);
        const result = cp.spawnSync(
          'df',
          ['-B1', parentDir],
          { timeout: 2000, windowsHide: true, encoding: 'utf-8' },
        );

        if (result.status === 0 && result.stdout) {
          const lines = result.stdout.trim().split('\n');
          if (lines.length > 1) {
            const parts = lines[1].split(/\s+/);
            const available = parseInt(parts[3], 10);
            const recommendedBytes = 5 * 1024 * 1024 * 1024; // 5 GB recommended

            if (available < recommendedBytes) {
              const availableGB = (available / (1024 * 1024 * 1024)).toFixed(1);
              resolve(
                `Only ${availableGB} GB free here — we recommend at least 5 GB. You can continue, but setup may run out of space.`,
              );
              return;
            }
          }
        }
        resolve(null);
      } catch {
        resolve(null); // Don't fail on disk space check errors
      }
    });
  }

  /** Check if Docker is installed and available */
  private async _checkDockerAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const result = cp.spawnSync(
          'docker',
          ['--version'],
          { timeout: 2000, windowsHide: true },
        );
        resolve(result.status === 0);
      } catch {
        resolve(false);
      }
    });
  }

  /** Check if docker compose (V2 plugin) is installed and available */
  private async _checkComposeAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const result = cp.spawnSync(
          'docker',
          ['compose', 'version'],
          { timeout: 2000, windowsHide: true },
        );
        resolve(result.status === 0);
      } catch {
        resolve(false);
      }
    });
  }

  /** Check both Docker and docker compose (V2 plugin) availability */
  private async _checkDockerEnvironment(): Promise<{ docker: boolean; compose: boolean; error?: string }> {
    const docker = await this._checkDockerAvailable();
    const compose = await this._checkComposeAvailable();

    if (!docker || !compose) {
      const missing = [];
      if (!docker) missing.push('Docker');
      if (!compose) missing.push('docker compose');
      return {
        docker,
        compose,
        error: `${missing.join(' and ')} not found. Please install Docker Desktop: https://docs.docker.com/get-docker/`,
      };
    }

    return { docker, compose };
  }

  /** Get the compose file path — uses the canonical docker-compose.openclaw.yml */
  private _getComposeFilePath(): string {
    return path.join(getDockerDir(this._extensionUri), 'docker-compose.openclaw.yml');
  }

  /** Build env vars to pass user config to docker-compose.openclaw.yml */
  private _getComposeEnv(): Record<string, string> {
    return {
      ...process.env as Record<string, string>,
      OCC_GATEWAY_IMAGE: this._image,
      GATEWAY_PORT: String(this._hostPort),
      GATEWAY_BIND_HOST: this._bindHost,
      // Use the HOST-side absolute path so the host Docker daemon mounts the
      // correct directory. When running inside occ-editor-dev, _hostDataDir
      // translates the container path (/workspace/...) to the real host path
      // using the HOST_WORKSPACE env var injected by docker-compose.yml.
      OPENCLAW_DATA_DIR: this._hostDataDir,
    };
  }

  // ── Config Message Handlers ────────────────────────────────────────────────

  private async _handleCheckDockerEnvironment(): Promise<void> {
    const result = await this._checkDockerEnvironment();
    try {
      this._panel.webview.postMessage({ type: 'dockerEnvironmentCheck', result });
    } catch { /* ignore */ }
  }

  private async _handleReportError(msg: { error: string; logs: string; systemInfo: unknown; timestamp: string }): Promise<void> {
    const result = await this._createGithubIssue(msg.error, msg.logs, msg.systemInfo, msg.timestamp);
    try {
      this._panel.webview.postMessage({ type: 'dockerErrorReported', result });
    } catch { /* ignore */ }
  }

  /** Create GitHub issue for error reporting */
  private async _createGithubIssue(error: string, logs: string, systemInfo: unknown, timestamp: string): Promise<{ success: boolean; url?: string; error?: string }> {
    try {
      // Collect system information
      const osInfo = `${os.platform()} ${os.release()}`;
      const dockerVersion = this._getDockerVersion();
      const composeVersion = this._getComposeVersion();

      const title = `[Docker Setup Error] ${error.substring(0, 60)}...`;
      const body = `
## Error Report

**Timestamp:** ${timestamp}

### Error Message
\`\`\`
${error}
\`\`\`

### System Information
- **OS:** ${osInfo}
- **Docker:** ${dockerVersion}
- **Docker Compose:** ${composeVersion}
- **Node:** ${process.version}

### Configuration
- **Image:** ${this._image}
- **Port:** ${this._activeConfig?.port || 'N/A'}
- **Data Directory:** ${this._activeConfig?.dataDir || 'N/A'}
- **Bind Host:** ${this._activeConfig?.bindHost || 'N/A'}

### Setup Logs
\`\`\`
${logs.substring(0, 3000)}
\`\`\`

---
*This issue was automatically created by OCC Docker Setup*
`;

      // Try to open issue creation page with pre-filled data
      const issueUrl = `https://github.com/openclaw/openclaw/issues/new?labels=area:docker-setup,type:user-reported&title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
      await vscode.env.openExternal(vscode.Uri.parse(issueUrl));

      return { success: true, url: issueUrl };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  private _getDockerVersion(): string {
    try {
      const result = cp.spawnSync('docker', ['--version'], { timeout: 2000, encoding: 'utf-8', windowsHide: true });
      return (result.stdout || 'unknown').trim();
    } catch {
      return 'unknown';
    }
  }

  private _getComposeVersion(): string {
    try {
      const result = cp.spawnSync('docker', ['compose', 'version'], { timeout: 2000, encoding: 'utf-8', windowsHide: true });
      return (result.stdout || 'unknown').trim();
    } catch {
      return 'unknown';
    }
  }

  private async _handleValidateFields(msg: { image: string; port: string; dataDir: string; bindHost: string }): Promise<void> {
    const { errors, warnings } = await this._runValidationChecks(msg);
    try {
      this._panel.webview.postMessage({ type: 'dockerValidationErrors', errors, warnings });
    } catch { /* ignore */ }
  }

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
    if (this._configStep <= 1) {
      // Go back to Config (step 0)
      this._configStep = 0;
    } else {
      // From any provisioning step, go back to Config (step 0) so user can edit
      this._configStep = 0;
    }
    this._renderConfigStep();
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

  /** On open: probe gateway at user-configured port. If healthy → status panel, else → wizard. */
  private async _initHtml(iconUri: vscode.Uri): Promise<void> {
    const webviewIconUri = this._panel.webview.asWebviewUri(iconUri).toString();

    // Load saved user config and probe the gateway at the configured port
    const config = await this._loadConfig();
    const port = parseInt(config.port, 10) || DEFAULT_HOST_PORT;
    const host = config.bindHost === '0.0.0.0' ? '127.0.0.1' : (config.bindHost || '127.0.0.1');

    const gatewayHealthy = (() => {
      try {
        const result = cp.spawnSync(
          'curl', ['-sf', '-o', '/dev/null', '-w', '%{http_code}', `http://${host}:${port}/health`, '--max-time', '2'],
          { timeout: 5000, windowsHide: true },
        );
        const code = result.stdout?.toString().trim();
        return code === '200' || code === '204';
      } catch { return false; }
    })();

    if (gatewayHealthy) {
      // Gateway is responding at the user-configured port — go straight to status panel
      this._activeConfig = config;
      this._panel.webview.html = this._getLoadingHtml(webviewIconUri);
      void this._showStatusPanel().catch((err) => {
        // If status panel fails to load, fall back to the wizard
        console.error('[openclaw-docker] Status panel failed:', err);
        if (!this._disposed) {
          this._panel.webview.html = this._getConfigHtml(webviewIconUri, config);
        }
      });
      return;
    }

    // Gateway not responding — show config step with saved user config
    this._activeConfig = config;
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
      const composeFile = this._getComposeFilePath();
      const env = this._getComposeEnv();

      logCmd(`$ docker compose -f docker-compose.openclaw.yml pull --ignore-buildable\n`);
      log(`Pulling images...\n`);
      const pullCode = await new Promise<number>((resolve) => {
        const proc = cp.spawn('docker', ['compose', '-f', composeFile, 'pull', '--ignore-buildable'], {
          env,
          windowsHide: true,
        });
        proc.stdout.on('data', (d: Buffer) => log(d.toString()));
        proc.stderr.on('data', (d: Buffer) => log(d.toString()));
        proc.on('close', (code) => resolve(code ?? -1));
        proc.on('error', () => resolve(-1));
      });
      if (pullCode !== 0) {
        log(`\n⚠ Pull returned non-zero (buildable images will be built during start)\n`);
      } else {
        log(`\n✓ Images ready\n`);
      }

      // Ensure state directory exists on the host
      try { fs.mkdirSync(this._dataDir, { recursive: true }); } catch { /* ok */ }
      log(`✓ State dir: ${this._dataDir}\n`);

      try { this._panel.webview.postMessage({ type: 'dockerPullDone' }); } catch { /* ignore */ }
    } catch (err) {
      fail(String(err));
    }
  }

  // ── Step 3: Onboard (compose up — the compose command handles onboarding) ─

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
      const composeFile = this._getComposeFilePath();
      const env = this._getComposeEnv();

      // Ensure state directory exists on the host
      try { fs.mkdirSync(this._dataDir, { recursive: true }); } catch { /* ok */ }

      const args = ['-f', composeFile, 'up', '-d'];
      if (this._freshBuild) { args.push('--build'); }

      logCmd(`$ docker compose -f docker-compose.openclaw.yml up -d${this._freshBuild ? ' --build' : ''}\n`);
      log('Starting gateway services (gateway, postgres, redis)...\n');
      const code = await new Promise<number>((resolve) => {
        const proc = cp.spawn('docker', ['compose', ...args], {
          env,
          windowsHide: true,
        });
        proc.stdout.on('data', (d: Buffer) => log(d.toString()));
        proc.stderr.on('data', (d: Buffer) => log(d.toString(), true));
        proc.on('close', (c) => resolve(c ?? -1));
        proc.on('error', () => resolve(-1));
      });

      if (code !== 0) {
        fail('Services failed to start. See the log above for details.');
        return;
      }

      log('✓ Services started\n');

      // Write logs to file for troubleshooting
      const logDir = path.join(os.homedir(), '.openclaw');
      const logPath = path.join(logDir, 'docker-setup.log');
      try {
        fs.mkdirSync(logDir, { recursive: true });
        const timestamp = new Date().toISOString();
        const logContent = `[${timestamp}] Docker Setup Logs\n${'='.repeat(60)}\n\n${this._onboardLogs.join('')}\n`;
        fs.writeFileSync(logPath, logContent, 'utf-8');
        log(`✓ Logs saved to: ${logPath}\n`);
        try { this._panel.webview.postMessage({ type: 'onboardLogsPath', path: logPath }); } catch { /* ignore */ }
      } catch (err) {
        log(`\nWarning: Failed to save logs: ${String(err)}\n`);
      }

      log('\n✓ Onboard complete!\n');
      try { this._panel.webview.postMessage({ type: 'onboardDone' }); } catch { /* ignore */ }
    } catch (err) {
      fail(String(err));
    }
  }

  // ── Step 4: Verify gateway is healthy ────────────────────────────────────

  private async _handleLaunchGateway(): Promise<void> {
    const log = (text: string, isErr = false) => {
      try { this._panel.webview.postMessage({ type: 'launchLog', text, isErr }); } catch { /* ignore */ }
    };
    const fail = (text: string) => {
      try { this._panel.webview.postMessage({ type: 'dockerError', text }); } catch { /* ignore */ }
    };

    try {
      const composeFile = this._getComposeFilePath();
      const env = this._getComposeEnv();

      // Services were started in Step 3. Verify the gateway is up.
      const existing = cp.spawnSync('docker', ['ps', '-a', '--filter', `name=^/${CONTAINER}$`, '--format', '{{.Status}}'], { timeout: 8000, windowsHide: true });
      const existingStatus = existing.stdout?.toString().trim() ?? '';

      if (!existingStatus || !existingStatus.toLowerCase().startsWith('up')) {
        log(`Gateway not running — restarting...\n`);
        const upCode = await new Promise<number>((resolve) => {
          const proc = cp.spawn('docker', ['compose', '-f', composeFile, 'up', '-d'], {
            env,
            windowsHide: true,
          });
          proc.stdout.on('data', (d: Buffer) => log(d.toString()));
          proc.stderr.on('data', (d: Buffer) => log(d.toString(), true));
          proc.on('close', (c) => resolve(c ?? -1));
          proc.on('error', () => resolve(-1));
        });
        if (upCode !== 0) { fail('Failed to launch gateway container.'); return; }
      }

      log(`✓ Gateway container is running\n`);

      // Probe the gateway HTTP endpoint at the user-configured port
      const gatewayUrl = `http://${this._bindHost === '0.0.0.0' ? '127.0.0.1' : this._bindHost}:${this._hostPort}`;
      log(`Probing gateway at ${gatewayUrl}...\n`);
      let gatewayReady = false;
      for (let attempt = 0; attempt < 15; attempt++) {
        try {
          const probe = cp.spawnSync('curl', ['-sf', '-o', '/dev/null', '-w', '%{http_code}', `${gatewayUrl}/health`, '--max-time', '2'], { timeout: 5000, windowsHide: true });
          const code = probe.stdout?.toString().trim();
          if (code === '200' || code === '204') {
            gatewayReady = true;
            break;
          }
        } catch { /* retry */ }
        log('.');
        await new Promise(r => setTimeout(r, 2000));
      }

      if (!gatewayReady) {
        log(`\n⚠ Gateway not responding at ${gatewayUrl}/health (may still be starting)\n`);
      } else {
        log(`\n✓ Gateway is healthy at ${gatewayUrl}\n`);
      }

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

    /* Validation */
    .warning-banner {
      background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3);
      border-radius: 8px; padding: 12px 14px; margin-bottom: 16px;
      display: none; width: min(420px, 96vw);
    }
    .warning-banner.show { display: block; }
    .warning-banner h3 {
      font-size: 13px; font-weight: 600; color: #ef4444; margin-bottom: 6px;
    }
    .warning-banner p {
      font-size: 12px; color: #fca5a5; line-height: 1.4; margin: 4px 0;
    }
    .warning-banner a {
      color: #fca5a5; text-decoration: underline; cursor: pointer;
    }
    .field-error { border-color: #f87171 !important; }
    .error-msg { color: #f87171; font-size: 11px; margin-top: 4px; display: none; }
    .error-msg.show { display: block; }
    .warn-msg { color: #fbbf24; font-size: 11px; margin-top: 4px; display: none; line-height: 1.4; }
    .warn-msg.show { display: block; }
    .validation-badge {
      display: inline-block; margin-left: 6px; font-size: 10px; font-weight: 600;
      padding: 2px 6px; border-radius: 3px;
    }
    .validation-badge.validating { color: #888; background: rgba(136,136,136,0.1); }
    .validation-badge.valid { color: #4ade80; background: rgba(74,222,128,0.1); }
    .validation-badge.invalid { color: #f87171; background: rgba(248,113,113,0.1); }

    /* Buttons */
    .btns { display: flex; gap: 12px; margin-top: 16px; width: min(420px, 96vw); justify-content: center; }
    .btn-next {
      background: #dc2828; border: none; color: #fff;
      font-size: 13px; font-weight: 600; padding: 10px 28px; border-radius: 8px;
      cursor: pointer; font-family: inherit; transition: background 0.15s;
    }
    .btn-next:hover:not(:disabled) { background: #b91c1c; }
    .btn-next:disabled {
      background: #444; color: #666; cursor: not-allowed; opacity: 0.5;
    }
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

  <!-- Docker environment warning -->
  <div class="warning-banner" id="docker-warning">
    <h3>⚠️ Docker Environment Not Found</h3>
    <p id="docker-warning-msg"></p>
    <p><a href="#" onclick="openDockerDocs(event)">Install Docker Desktop →</a></p>
  </div>

  <!-- Config form -->
  <div class="form" id="config-form">
    <div class="field">
      <label>Docker Image <span style="font-weight:400;color:#666;font-size:11px;">(optional — defaults to ghcr.io/openclaw/openclaw:latest)</span></label>
      <input type="text" id="image" value="${config.image}" placeholder="ghcr.io/openclaw/openclaw:latest" onchange="validateField('image')" onkeyup="debounceValidate('image')" />
      <div class="error-msg" id="image-error"></div>
    </div>
    <div class="field-row">
      <div class="field">
        <label>Gateway Port (Host)</label>
        <input type="number" id="port" value="${config.port}" placeholder="18789" min="1" max="65535" onchange="validateField('port')" onkeyup="debounceValidate('port')" />
        <div class="error-msg" id="port-error"></div>
      </div>
      <div class="field">
        <label>Bind Host</label>
        <select id="bindHost" onchange="validateField('bindHost')">
          <option value="127.0.0.1" ${config.bindHost === '127.0.0.1' ? 'selected' : ''}>127.0.0.1 (localhost)</option>
          <option value="0.0.0.0" ${config.bindHost === '0.0.0.0' ? 'selected' : ''}>0.0.0.0 (all interfaces)</option>
        </select>
        <div class="error-msg" id="bindHost-error"></div>
      </div>
    </div>
    <div class="field">
      <label>Data Directory</label>
      <div class="field-with-btn">
        <input type="text" id="dataDir" value="${config.dataDir}" placeholder="./openclaw_docker_data" onchange="validateField('dataDir')" onkeyup="debounceValidate('dataDir')" />
        <button class="btn-browse" onclick="browseDir()">Browse</button>
      </div>
      <div class="error-msg" id="dataDir-error"></div>
      <div class="warn-msg" id="dataDir-warn"></div>
    </div>
    <div class="field checkbox">
      <input type="checkbox" id="freshBuild" ${config.freshBuild ? 'checked' : ''} />
      <label for="freshBuild">Force fresh build (rebuild image)</label>
    </div>
    <div class="error" id="error" style="display:none;"></div>
  </div>

  <div class="btns">
    <button class="btn-cancel" onclick="cancel()">Cancel</button>
    <button class="btn-next" id="btn-next" onclick="next()" disabled>Next</button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let validationState = { image: null, port: null, bindHost: null, dataDir: null };
    let validationTimeouts = {};

    function getFormState() {
      return {
        image: document.getElementById('image').value,
        port: document.getElementById('port').value,
        dataDir: document.getElementById('dataDir').value,
        bindHost: document.getElementById('bindHost').value,
      };
    }

    function debounceValidate(fieldName) {
      if (validationTimeouts[fieldName]) {
        clearTimeout(validationTimeouts[fieldName]);
      }
      validationTimeouts[fieldName] = setTimeout(() => validateField(fieldName), 500);
    }

    function validateField(fieldName) {
      const formState = getFormState();
      vscode.postMessage({ command: 'dockerValidateFields', ...formState });
    }

    function checkDockerEnvironment() {
      vscode.postMessage({ command: 'dockerCheckEnvironment' });
    }

    function openDockerDocs(event) {
      event.preventDefault();
      vscode.postMessage({ command: 'openDockerDocs' });
    }

    function updateDockerWarning(result) {
      const warningBanner = document.getElementById('docker-warning');
      const warningMsg = document.getElementById('docker-warning-msg');

      if (!result.docker || !result.compose) {
        warningMsg.textContent = result.error || 'Docker with compose plugin is required.';
        warningBanner.classList.add('show');
        document.getElementById('btn-next').disabled = true;
      } else {
        warningBanner.classList.remove('show');
        validateField('image');
      }
    }

    function updateValidationUI(errors, warnings) {
      validationState = errors;

      // Update error messages and field styling
      Object.keys(errors).forEach(fieldName => {
        const errorMsg = document.getElementById(fieldName + '-error');
        const input = document.getElementById(fieldName);
        const error = errors[fieldName];

        if (error) {
          errorMsg.textContent = error;
          errorMsg.classList.add('show');
          input.classList.add('field-error');
        } else {
          errorMsg.classList.remove('show');
          input.classList.remove('field-error');
        }
      });

      // Render soft warnings (non-blocking advisories — amber, Next stays enabled)
      const warnEl = document.getElementById('dataDir-warn');
      if (warnEl) {
        const w = warnings && warnings.dataDir;
        if (w) {
          warnEl.textContent = w;
          warnEl.classList.add('show');
        } else {
          warnEl.classList.remove('show');
        }
      }

      // Update Next button state — warnings never gate submission
      const allValid = Object.values(errors).every(e => e === null);
      document.getElementById('btn-next').disabled = !allValid;
    }

    function browseDir() {
      vscode.postMessage({ command: 'dockerBrowseDir' });
    }

    function cancel() {
      vscode.postMessage({ command: 'dockerCancel' });
    }

    function next() {
      const formState = getFormState();
      const freshBuild = document.getElementById('freshBuild').checked;

      vscode.postMessage({
        command: 'dockerSaveConfig',
        ...formState,
        freshBuild
      });
    }

    window.addEventListener('message', function(e) {
      const msg = e.data;
      if (msg.type === 'dockerBrowseResult') {
        document.getElementById('dataDir').value = msg.path;
        validateField('dataDir');
      } else if (msg.type === 'dockerEnvironmentCheck') {
        updateDockerWarning(msg.result);
      } else if (msg.type === 'dockerValidationErrors') {
        updateValidationUI(msg.errors, msg.warnings);
      } else if (msg.type === 'dockerConfigError') {
        const err = document.getElementById('error');
        err.textContent = msg.message;
        err.style.display = 'block';
      }
    });

    // Initial checks on load
    checkDockerEnvironment();
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
    .btn-secondary {
      background: transparent; border: 1px solid #333; color: #aaa;
      font-size: 12px; padding: 8px 16px; border-radius: 6px; cursor: pointer;
      font-family: inherit; transition: color 0.15s, border-color 0.15s;
    }
    .btn-secondary:hover { color: #e0e0e0; border-color: #555; }
    .error-actions {
      display: flex; gap: 8px; width: 100%; justify-content: center; flex-wrap: wrap;
    }
    .done-msg { font-size: 13px; color: #4ade80; font-weight: 600; }
  </style>
</head>
<body>
  <img class="logo" src="${iconUri}" alt="OpenClaw" />
  <div class="title">Docker Setup</div>
  <div class="sub">Setting up OpenClaw in a Docker container</div>

  <!-- Step timeline -->
  <div class="steps">
    <div class="step-item active" id="s1" onclick="backToConfig()" style="cursor:pointer;" title="Back to config">
      <div class="step-dot">1</div>
      <div class="step-label">Docker<br>Check</div>
    </div>
    <div class="step-item pending" id="s2" onclick="backToConfig()" style="cursor:pointer;" title="Back to config">
      <div class="step-dot">2</div>
      <div class="step-label">Pull<br>Image</div>
    </div>
    <div class="step-item pending" id="s3" onclick="backToConfig()" style="cursor:pointer;" title="Back to config">
      <div class="step-dot">3</div>
      <div class="step-label">Onboard<br>Config</div>
    </div>
    <div class="step-item pending" id="s4" onclick="backToConfig()" style="cursor:pointer;" title="Back to config">
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
      <div class="log-wrap" id="error-log-wrap">
        <div class="log-box" id="error-log"></div>
      </div>
      <div class="error-actions">
        <button class="btn-secondary" onclick="copyErrorLogs()" id="btn-copy-logs">📋 Copy Logs</button>
        <button class="btn-secondary" onclick="reportErrorToGithub()" id="btn-report-github">🐙 Report to GitHub</button>
        <button class="btn-secondary" onclick="viewErrorLog()" id="btn-view-log" style="display:none;">📄 View Error Log</button>
        <button class="btn-retry" onclick="retry()">🔄 Retry</button>
        <button class="btn-secondary" onclick="backToConfig()">← Back</button>
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

    function backToConfig() {
      vscode.postMessage({ command: 'dockerBack' });
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
    var errorLogContent = '';

    function showError(text, errorLogPath) {
      lastErrorLogPath = errorLogPath || null;
      hideAll();
      var ev = document.getElementById('view-error');
      ev.style.display = 'flex';
      document.getElementById('error-text').textContent = text;

      // Copy all accumulated logs to error view
      var errorLogBox = document.getElementById('error-log');
      var allLogs = document.querySelectorAll('.log-box');
      var hasLogs = false;
      allLogs.forEach(function(logBox, index) {
        logBox.querySelectorAll('.log-line').forEach(function(line) {
          var logLine = document.createElement('div');
          logLine.className = line.className;
          logLine.textContent = line.textContent;
          errorLogBox.appendChild(logLine);
          hasLogs = true;
        });
      });

      // Show View Error Log button only if we have a log path
      var btnViewLog = document.getElementById('btn-view-log');
      if (errorLogPath) {
        btnViewLog.style.display = 'inline-block';
      } else {
        btnViewLog.style.display = 'none';
      }

      // Show copy logs button if we have any logs
      var btnCopyLogs = document.getElementById('btn-copy-logs');
      if (hasLogs || errorLogBox.children.length > 0) {
        btnCopyLogs.style.display = 'inline-block';
        document.getElementById('error-log-wrap').style.display = 'block';
      }
    }

    function getErrorLogs() {
      var errorLogBox = document.getElementById('error-log');
      if (!errorLogBox) return '';
      var lines = [];
      errorLogBox.querySelectorAll('.log-line').forEach(function(el) {
        lines.push(el.textContent);
      });
      // If no logs in error box, try to gather from visible logs
      if (lines.length === 0) {
        var allLogBoxes = document.querySelectorAll('.log-box');
        allLogBoxes.forEach(function(box) {
          box.querySelectorAll('.log-line').forEach(function(el) {
            lines.push(el.textContent);
          });
        });
      }
      return lines.join('\\n');
    }

    function copyErrorLogs() {
      var logs = getErrorLogs();
      if (!logs) {
        // Try to get from any visible log box
        var logBoxes = document.querySelectorAll('.log-box');
        var allLogs = [];
        logBoxes.forEach(function(box) {
          box.querySelectorAll('.log-line').forEach(function(el) {
            allLogs.push(el.textContent);
          });
        });
        logs = allLogs.join('\\n');
      }

      if (logs) {
        navigator.clipboard.writeText(logs).then(function() {
          alert('Error logs copied to clipboard');
        }).catch(function() {
          alert('Failed to copy logs');
        });
      }
    }

    function reportErrorToGithub() {
      var errorText = document.getElementById('error-text').textContent;
      var logs = getErrorLogs();
      var systemInfo = getSystemInfo();

      vscode.postMessage({
        command: 'dockerReportError',
        error: errorText,
        logs: logs,
        systemInfo: systemInfo,
        timestamp: new Date().toISOString(),
      });
    }

    function getSystemInfo() {
      // This will be populated by the extension with actual system info
      return {
        platform: 'linux', // placeholder - will be set by extension
        nodeVersion: '20.x',
        timestamp: new Date().toISOString(),
      };
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
