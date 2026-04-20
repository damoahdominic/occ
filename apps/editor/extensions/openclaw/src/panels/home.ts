import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as os from 'os';
import * as path from 'path';
import type { HostConnection, OpenClawCoreAPI } from '../hosts/types';
import { DefaultLocalHostConnection } from '../hosts/localDefault';
import { renderStatusHtml } from './statusHtml';
import { setActiveOpenClawWorkspaceFolder, closeFilesFromDir } from './statusController';

type GatewayStatus = 'checking' | 'running' | 'stopped' | 'starting' | 'stopping' | 'restarting' | 'errored' | 'ai-fixing';

// ── Persistent diagnostics log ────────────────────────────────────────────────
const LOG_PATH     = path.join(os.homedir(), '.openclaw', 'occ-home.log');
const LOG_MAX_BYTES = 512 * 1024; // 500 KB — rotate when exceeded

/**
 * Append timestamped text to ~/.openclaw/occ-home.log.
 * Creates the file (and directory) on first use. Rotates by dropping the
 * oldest half of lines when the file exceeds LOG_MAX_BYTES. Never throws.
 */
// Strip ANSI/VT escape sequences (e.g. colour codes from npm/openclaw output)
const _ansiRe = /\x1b(\[[0-9;]*[A-Za-z]|[^[])/g;

function writeLog(text: string): void {
  try {
    const dir = path.dirname(LOG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    // Rotate if oversized
    if (fs.existsSync(LOG_PATH) && fs.statSync(LOG_PATH).size > LOG_MAX_BYTES) {
      const lines = fs.readFileSync(LOG_PATH, 'utf-8').split('\n');
      fs.writeFileSync(LOG_PATH, lines.slice(Math.floor(lines.length / 2)).join('\n'), 'utf-8');
    }
    const ts = new Date().toISOString();
    const clean = text.replace(_ansiRe, '');
    // Stamp every non-empty line; leave blank lines unstamped
    const stamped = clean
      .split('\n')
      .map(l => (l.trim() ? `[${ts}] ${l}` : l))
      .join('\n');
    fs.appendFileSync(LOG_PATH, stamped, 'utf-8');
  } catch { /* non-fatal */ }
}

// ── OCC Legacy model constants ────────────────────────────────────────────────
const OCC_LEGACY_MODEL_ID   = 'occ-legacy';
const OCC_LEGACY_MODEL_NAME = 'occ-legacy';
const OCC_LEGACY_BASE_URL   = 'https://occ.mba.sh/v1';
const OCC_LEGACY_API        = 'openai-completions';
const OCC_LEGACY_COST = {
  input:      0.0000006,
  output:     0.000003,
  cacheRead:  0.0000001,
  cacheWrite: 0,
};
const OCC_LEGACY_CONTEXT_WINDOW = 262144;
const OCC_LEGACY_MAX_TOKENS     = 262144;

/**
 * Resolves the directory where OpenClaw stores its workspace files
 * (AGENTS.md, IDENTITY.md, USER.md, TOOLS.md, MEMORY.md, SOUL.md, HEARTBEAT.md).
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
  private _sidebarOpen = false; // tracks chat sidebar open state across webview reloads
  private _pollingTimer: ReturnType<typeof setInterval> | undefined;
  private readonly _outputChannel: vscode.OutputChannel;
  private _lastInstalledState: boolean | undefined;
  private _pollTick = 0;
  private _lastJwt = '';
  private _lastInstalledVersion: string | null = null;
  private _autoUpdateTriggered = false; // fire at most once per panel session
  private _closeSidebarOnGatewayStart = false; // close sidebar once gateway reaches running after first install
  private _uninstallCloseSidebarTimer: ReturnType<typeof setTimeout> | undefined;
  private _uninstallCloseWatcher: ReturnType<typeof setInterval> | undefined;
  /** Active host connection — defaults to local; swapped when the user picks a remote host. */
  private _host: HostConnection = new DefaultLocalHostConnection();
  /** Cached gateway port — populated on every _update() so _getConfiguredPort() stays sync. */
  private _cachedGatewayPort = 18789;
  /** Core extension API — used to register docker hosts after wizard completes. */
  private _coreAPI: OpenClawCoreAPI | undefined;
  /** When true, always show the host picker — never auto-route to a single installed host. */
  private _forcePicker = false;

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, forcePicker = false) {
    this._forcePicker = forcePicker;
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._outputChannel = vscode.window.createOutputChannel('OpenClaw Gateway');
    // Subscribe to active host changes from the core extension if available.
    const coreExt = vscode.extensions.getExtension<OpenClawCoreAPI>('openclaw.home');
    if (coreExt?.isActive && coreExt.exports != null) {
      const coreAPI = coreExt.exports;
      this._coreAPI = coreAPI;
      const hostSub = coreAPI.onDidChangeActiveHost(conn => {
        this._host = conn ?? new DefaultLocalHostConnection();
        void this._update();
      });
      this._disposables.push(hostSub);
      const active = coreAPI.getActiveHost();
      if (active) { this._host = active; }
    }
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
      } else if (msg.command === 'runUpdate') {
        void vscode.commands.executeCommand(
          'void.openChatWithMessage',
          'Please run `openclaw update` to upgrade OpenClaw to the latest version.',
          'agent',
        );
      } else if (msg.command === 'toggleChat') {
        const cmd = this._sidebarOpen ? 'void.sidebar.close' : 'void.sidebar.open';
        void vscode.commands.executeCommand(cmd).then(async () => {
          // Let the sidebar finish opening/closing, then read real state.
          await new Promise(r => setTimeout(r, 150));
          this._sidebarOpen = await vscode.commands.executeCommand<boolean>('void.sidebar.isVisible').then(v => !!v, () => this._sidebarOpen);
          try { this._panel.webview.postMessage({ type: 'chatState', open: this._sidebarOpen }); } catch {}
        });
      } else if (msg.command === 'signIn') {
        void vscode.env.openExternal(vscode.Uri.parse('https://occ.mba.sh/login?ref=occ-editor'));
      } else if (msg.command === 'openDashboard') {
        void vscode.env.openExternal(vscode.Uri.parse('https://occ.mba.sh/dashboard'));
      } else if (msg.command === 'signOut') {
        // Clear JWT, moltpilot key, and extension-host globalState
        void vscode.commands.executeCommand('occ.auth.setLegacyJwt', '');
        void vscode.commands.executeCommand('occ.auth.setMoltpilotKey', '');
        void vscode.commands.executeCommand('openclaw.jwt.set', '');
      } else if (msg.command === 'openUrl') {
        const urlStr = msg.url as string;
        try {
          const parsed = new URL(urlStr);
          const allowed = ['occ.mba.sh', 'mba.sh', 'openclaw.ai', 'openclawcode.ai', 'github.com', 'openclaw.sh'];
          if (['https:', 'http:'].includes(parsed.protocol) &&
              allowed.some(d => parsed.hostname === d || parsed.hostname.endsWith('.' + d))) {
            vscode.env.openExternal(vscode.Uri.parse(urlStr));
          }
        } catch { /* invalid URL — ignore */ }
      } else if (msg.command === 'openConfigFile') {
        const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
        vscode.commands.executeCommand('vscode.open', vscode.Uri.file(configPath));
      } else if (msg.command === 'openLogs') {
        if (!fs.existsSync(LOG_PATH)) {
          vscode.window.showInformationMessage('No log file yet — logs are created when install or setup runs.');
        } else {
          vscode.commands.executeCommand('vscode.open', vscode.Uri.file(LOG_PATH));
        }
      } else if (msg.command === 'openWorkspaceFile') {
        const allowed = new Set(['AGENTS.md', 'IDENTITY.md', 'USER.md', 'MEMORY.md', 'SOUL.md', 'HEARTBEAT.md']);
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
      } else if (msg.command === 'openclaw.uninstall') {
        void this._runUninstall();
      } else if (msg.command === 'openclaw.setupBetterMemory') {
        void this._runCassSetup();
      } else if (msg.command === 'void.openChatWithMessage') {
        const args = msg.args as string[];
        if (args && args.length > 0) {
          void vscode.commands.executeCommand('void.openChatWithMessage', args[0], 'agent');
        }
      } else if (msg.command === 'chooseHostType') {
        const t = msg.hostType as string;
        // Best-effort: close files from the other host's dir (non-blocking).
        if (t === 'local') { void closeFilesFromDir(path.join(os.homedir(), 'Desktop', 'occ-state-dir')); }
        else if (t === 'docker') { void closeFilesFromDir(path.join(os.homedir(), '.openclaw')); }
        // Close the picker immediately — the adapter panel takes over as the sole OCC Home tab.
        this.dispose();
        if (t === 'local') {
          void vscode.commands.executeCommand('openclaw.host.setup.local');
        } else if (t === 'docker') {
          void vscode.commands.executeCommand('openclaw.host.setup.docker');
        } else if (t === 'ssh') {
          void vscode.commands.executeCommand('openclaw.host.setup.ssh');
        }
      }
    }, null, this._disposables);
  }

  public static createOrShow(extensionUri: vscode.Uri, forcePicker = false) {
    if (HomePanel.currentPanel) {
      if (forcePicker) { HomePanel.currentPanel._forcePicker = true; }
      HomePanel.currentPanel._panel.reveal();
      if (forcePicker) { void HomePanel.currentPanel._update(); }
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'openclawHome', 'OCC Home', vscode.ViewColumn.One,
      { enableScripts: true, localResourceRoots: [
        vscode.Uri.joinPath(extensionUri, 'media'),
      ] }
    );
    HomePanel.currentPanel = new HomePanel(panel, extensionUri, forcePicker);
  }

  /** Push a live balance update to the webview popover — called from extension.ts balance poller. */
  public postBalanceUpdate(amount: number): void {
    try { this._panel.webview.postMessage({ type: 'balanceUpdate', amount }); } catch { /* non-fatal */ }
  }

  /** Re-run CLI detection and redraw — called after install completes. */
  public static refresh(): void {
    if (HomePanel.currentPanel) {
      void HomePanel.currentPanel._update();
    }
  }

  public dispose() {
    HomePanel.currentPanel = undefined;
    this._stopPolling();
    if (this._uninstallCloseWatcher !== undefined) {
      clearInterval(this._uninstallCloseWatcher);
      this._uninstallCloseWatcher = undefined;
    }
    if (this._uninstallCloseSidebarTimer !== undefined) {
      clearTimeout(this._uninstallCloseSidebarTimer);
      this._uninstallCloseSidebarTimer = undefined;
    }
    this._outputChannel.dispose();
    this._panel.dispose();
    this._disposables.forEach(d => d.dispose());
  }

  private async _update() {
    // Get config path and check existence via the active host.
    const configFile = await this._host.getConfigPath();
    const isConfigured = await this._host.exists(configFile);

    // Update cached port from config (keeps _getConfiguredPort() synchronous).
    if (isConfigured) {
      try {
        const cfg = await this._host.readConfig();
        const gateway = cfg['gateway'] as Record<string, unknown> | undefined;
        const p = gateway?.['port'] ?? cfg['port'] ?? cfg['gateway_port'] ?? cfg['gatewayPort'];
        const n = typeof p === 'string' ? parseInt(p, 10) : typeof p === 'number' ? p : NaN;
        if (Number.isFinite(n) && n > 0 && n < 65536) {
          this._cachedGatewayPort = n;
        }
      } catch { /* non-fatal */ }
    }

    // Silently fix ownership if ~/.openclaw was created as root (local host only, non-interactive sudo).
    const openclawDir = path.join(os.homedir(), '.openclaw');
    const dirExists = fs.existsSync(openclawDir);
    if (dirExists && process.platform !== 'win32') {
      try {
        const stat = fs.statSync(openclawDir);
        if (stat.uid !== process.getuid!()) {
          const username = os.userInfo().username;
          cp.exec(`sudo -n chown -R ${username}:${username} ${openclawDir} && chmod 700 ${openclawDir}`);
        }
      } catch { /* non-fatal */ }
    }

    const cliCheck = await this._testOpenClawCli();
    writeLog(`[cli-check] ok=${cliCheck.ok} cmd="${cliCheck.command}" output="${(cliCheck.output ?? '').trim()}"\n`);
    // For remote hosts (docker/ssh): CLI installed but not yet onboarded — go straight to configure step.
    // For local: config file is the sole source of truth (leftover binary without config = not installed).
    const isInstalled = isConfigured || (this._host.type !== 'local' && cliCheck.ok);
    this._lastInstalledState = isInstalled;
    this._lastInstalledVersion = cliCheck.ok ? (cliCheck.output ?? '').trim() : null;
    const iconUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'icon.png')
    );
    const occJwt = await vscode.commands.executeCommand<string>('occ.auth.getLegacyJwt').then(r => r ?? '', () => '');
    this._lastJwt = occJwt;

    // Fetch user info from extension host (avoids CORS — webview origin is vscode-webview://)
    let occUser: { email: string; picture: string | null; balance_usd: number; api_keys?: { moltpilotKey?: string; occKey?: string } | null } | null = null;
    if (occJwt) {
      try {
        const r = await fetch('https://occ.mba.sh/api/v1/me', {
          headers: { Authorization: `Bearer ${occJwt}` },
        });
        if (r.ok) occUser = await r.json() as { email: string; picture: string | null; balance_usd: number; api_keys?: { moltpilotKey?: string; occKey?: string } | null };
      } catch { /* network error — leave null */ }
    }

    // Check whether the Docker occ-openclaw container is also running.
    let isDockerRunning = false;
    try {
      const dc = cp.spawnSync(
        'docker',
        ['ps', '--filter', 'name=^/occ-openclaw$', '--format', '{{.Status}}'],
        { timeout: 3000, windowsHide: true },
      );
      const st = (dc.stdout?.toString() ?? '').trim();
      isDockerRunning = st.length > 0 && st.toLowerCase().startsWith('up');
    } catch { /* docker not available */ }

    // Probe the gateway HTTP endpoint — used below to skip the setup picker
    // when a gateway is already reachable (e.g. container running, editor reloaded).
    const isGatewayReachable = !isConfigured && !isDockerRunning
      ? (await this._checkGatewayStatusRaw()) === 'running'
      : false;

    // Host picker — single 3-card view (Local / Docker / SSH).
    // Shown when Docker is up, when forced (e.g. after disconnect/cancel), or
    // when there's no evidence of a running gateway anywhere.
    if (isDockerRunning || this._forcePicker || (!isConfigured && !isGatewayReachable)) {
      this._stopPolling();
      this._panel.webview.html = this._getHostTypeSelectionHtml(iconUri.toString());
      this._autoUpdateTriggered = false;
      return;
    }

    // Local is configured and Docker is not running — show local status.
    setActiveOpenClawWorkspaceFolder(path.join(os.homedir(), '.openclaw'));

    const emojiBaseUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'emojis')
    ).toString();
    let aiModelName = '';
    try {
      const cfg = await this._host.readConfig() as Record<string, unknown>;
      const primaryModel = (cfg as Record<string, Record<string, Record<string, Record<string, string>>>>)
        ?.agents?.defaults?.model?.primary ?? '';
      if (primaryModel) {
        const slashIdx = primaryModel.indexOf('/');
        const providerId = slashIdx >= 0 ? primaryModel.slice(0, slashIdx) : '';
        const modelId    = slashIdx >= 0 ? primaryModel.slice(slashIdx + 1) : primaryModel;
        const providers = (cfg as Record<string, Record<string, Record<string, Record<string, { id: string; name?: string; input?: string[] }[]>>>>)
          ?.models?.providers ?? {};
        const providerModels = providers[providerId]?.models ?? [];
        const modelDef = providerModels.find((m: { id: string; name?: string; input?: string[] }) => m.id === modelId);
        aiModelName = modelDef?.name ?? primaryModel;
      }
    } catch { /* openclaw.json unreadable or missing fields */ }

    this._panel.webview.html = this._getHtml(isInstalled, dirExists, cliCheck, iconUri.toString(), occJwt, occUser, emojiBaseUri, aiModelName);
    if (!this._autoUpdateTriggered) {
      this._autoUpdateTriggered = true;
      setTimeout(() => void this._autoUpdateIfOutdated(), 3000);
    }
    this._startPolling();
    if (isInstalled) {
      setTimeout(() => {
        try { this._panel.webview.postMessage({ type: 'autoCheckVersion' }); } catch {}
        void this._checkLatestVersion();
      }, 800);
    }
  }

  // ── Gateway status helpers ─────────────────────────────────────────────────

  /**
   * Returns the last-known gateway port (populated by _update() via host.readConfig()).
   * Falls back to 18789 before the first update completes.
   */
  private _getConfiguredPort(): number {
    return this._cachedGatewayPort;
  }

  /** Raw HTTP probe against the configured port — no _commandAction guard. Used by the polling loop. */
  private _checkGatewayStatusRaw(): Promise<GatewayStatus> {
    const port = this._getConfiguredPort();
    return new Promise(resolve => {
      const req = http.get(`http://127.0.0.1:${port}/`, { timeout: 2000 }, res => {
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
   * Check — openclaw.json is the single definitive signal that OpenClaw
   * is installed and initialised on the active host.
   */
  private async _quickInstallCheck(): Promise<boolean> {
    try {
      const cfgPath = await this._host.getConfigPath();
      return this._host.exists(cfgPath);
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

      // Every 2 ticks (~4s): quick existsSync check on known binary paths.
      // No process spawn — just cheap stat calls. If the result differs from
      // the last known state, do a full _update() to confirm and re-render.
      if (this._pollTick % 2 === 0) {
        const nowInstalled = await this._quickInstallCheck();
        if (nowInstalled !== this._lastInstalledState) {
          void this._update();
          return;
        }
      }

      // Every 15 ticks (~30s): re-fetch CLI version fresh via login shell — no cache.
      // Always push the latest value and refresh the update banner.
      if (this._pollTick % 15 === 0) {
        void this._testOpenClawCli().then(result => {
          const current = result.ok ? (result.output ?? '').trim() : null;
          const changed = current !== this._lastInstalledVersion;
          this._lastInstalledVersion = current;
          // Always push fresh version to the CLI row span.
          try {
            this._panel.webview.postMessage({ type: 'cliVersion', text: current ?? 'not found', ok: result.ok });
          } catch {}
          // Refresh the update banner whenever the version changed.
          if (changed) {
            try { this._panel.webview.postMessage({ type: 'autoCheckVersion' }); } catch {}
            void this._checkLatestVersion();
          }
        });
      }

      const [status, aiRunning, sidebarVisible, jwt] = await Promise.all([
        this._checkGatewayStatus(),
        vscode.commands.executeCommand<boolean>('void.getIsRunning').then(v => !!v, () => false),
        vscode.commands.executeCommand<boolean>('void.sidebar.isVisible').then(v => !!v, () => this._sidebarOpen),
        vscode.commands.executeCommand<string>('occ.auth.getLegacyJwt').then(r => r ?? '', () => ''),
      ]);
      this._sidebarOpen = sidebarVisible;
      // Don't overwrite the intermediary status while a gateway command is in progress.
      if (!this._commandAction) {
        try { this._panel.webview.postMessage({ type: 'gatewayStatus', status }); } catch {}
      }
      // After first-install setup: close the sidebar once the gateway is confirmed running.
      if (this._closeSidebarOnGatewayStart && status === 'running') {
        this._closeSidebarOnGatewayStart = false;
        void vscode.commands.executeCommand('void.sidebar.close');
      }
      try { this._panel.webview.postMessage({ type: 'aiRunning', running: aiRunning }); } catch {}
      try { this._panel.webview.postMessage({ type: 'chatState', open: this._sidebarOpen }); } catch {}
      // Full re-render if JWT changed (e.g. deep-link auth arrived while panel was open).
      // We do a full _update() so the extension host fetches /api/v1/me fresh (avoids webview CORS).
      if (jwt !== this._lastJwt) {
        void this._update();
        return;
      }
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
    const port = this._getConfiguredPort();
    const portCheckCmd = process.platform === 'win32'
      ? `netstat -ano | findstr :${port}`
      : `lsof -iTCP:${port} -sTCP:LISTEN -n -P 2>/dev/null || ss -tlnp 2>/dev/null | grep :${port}`;
    const aiMessage = [
      `Please ${verb} the OpenClaw gateway.`,
      '',
      `Run the following command in your terminal:`,
      '```',
      `openclaw gateway ${action}`,
      '```',
      '',
      `Environment: ${osInfo}`,
      `Configured gateway port: ${port}`,
      '',
      `After running the command, verify the gateway has reached the expected state by checking`,
      `whether port ${port} is ${expectedState === 'running' ? 'actively listening' : 'no longer listening'}:`,
      '```',
      portCheckCmd,
      '```',
      '',
      `The gateway is confirmed ${expectedState === 'running' ? 'running' : 'stopped'} when port ${port} ` +
      `${expectedState === 'running' ? 'shows an active LISTEN entry' : 'shows no LISTEN entry'}.`,
      `If the command fails or the port does not reach the expected state, diagnose and fix the issue.`,
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

  /** Strict semver-ish pattern to reject spoofed version strings. */
  private static readonly _VERSION_RE = /^\d{1,5}\.\d{1,5}\.\d{1,5}(?:-[\w.]+)?$/;

  /** Fetches the latest openclaw version from the npm registry. */
  private _fetchLatestVersion(): Promise<string | null> {
    return new Promise(resolve => {
      // Try npm registry first — openclaw is published there.
      const req = https.get(
        { hostname: 'registry.npmjs.org', path: '/openclaw/latest', headers: { Accept: 'application/json' } },
        res => {
          if (res.statusCode !== 200) { res.resume(); resolve(null); return; }
          let data = '';
          res.on('data', (c: Buffer) => (data += c));
          res.on('end', () => {
            try {
              const version: unknown = JSON.parse(data).version;
              if (typeof version !== 'string' || !HomePanel._VERSION_RE.test(version)) {
                resolve(null); return;
              }
              resolve(version);
            } catch { resolve(null); }
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

    // Extract the bare version number from any format:
    // "OpenClaw 2026.3.12 (6472949)" → "2026.3.12"
    // "v2026.3.12" → "2026.3.12"
    // "2026.3.12-beta.1" → "2026.3.12"
    const norm = (v: string) => {
      const match = v.match(/\d+\.\d+(?:\.\d+)*/);
      return match ? match[0] : v.replace(/^v/i, '').split(/[-+(]/)[0].trim();
    };
    if (norm(installed) === norm(latest)) {
      post(`<span style="color:#4ade80">✓ Up to date &mdash; <strong>${installed}</strong></span>`);
    } else {
      post(
        `<span style="color:#fbbf24">Update available: <strong>${latest}</strong> &mdash; you have <strong>${installed}</strong>.</span>` +
        `<button onclick="runUpdate()" style="margin-top:10px;display:flex;align-items:center;gap:6px;background:#f59e0b;color:#000;border:none;border-radius:6px;padding:7px 14px;font-size:13px;font-weight:600;cursor:pointer;width:100%;justify-content:center;" ` +
        `onmouseover="this.style.background='#fbbf24'" onmouseout="this.style.background='#f59e0b'">` +
        `⬆ Update to ${latest} →</button>`,
      );
    }
  }

  private async _autoUpdateIfOutdated(): Promise<void> {
    try {
      const [cliCheck, latest] = await Promise.all([
        this._testOpenClawCli(),
        this._fetchLatestVersion(),
      ]);
      if (!cliCheck.ok || !latest) return;
      const norm = (v: string) => { const m = v.match(/\d+\.\d+(?:\.\d+)*/); return m ? m[0] : v.replace(/^v/i, '').split(/[-+(]/)[0].trim(); };
      const installed = (cliCheck.output ?? '').trim();
      if (norm(installed) === norm(latest)) return; // already up to date
      void vscode.commands.executeCommand(
        'void.openChatWithMessage',
        `OpenClaw is installed but version ${installed} is not the latest (${latest}). Please update it now.\n\n` +
        `Run: openclaw update --yes --non-interactive\n\n` +
        `After updating, verify with: openclaw --version`,
        'agent',
      );
    } catch { /* best-effort */ }
  }

  private _checkPort(port: number): Promise<'running' | 'stopped'> {
    return new Promise(resolve => {
      const req = http.get(`http://127.0.0.1:${port}/`, { timeout: 2000 }, res => {
        res.resume();
        resolve(res.statusCode !== undefined && res.statusCode < 500 ? 'running' : 'stopped');
      });
      req.on('error', () => resolve('stopped'));
      req.on('timeout', () => { req.destroy(); resolve('stopped'); });
    });
  }

  private _getHostTypeSelectionHtml(iconUri: string): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    html { font-size: 16px; }
    body {
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
      background: #1a1a1a; color: #e0e0e0;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      min-height: 100vh; padding: clamp(16px,5vw,48px) clamp(12px,4vw,32px); text-align: center;
    }
    .logo {
      width: clamp(44px,10vw,68px); height: clamp(44px,10vw,68px);
      margin-bottom: clamp(10px,2.5vw,16px);
      filter: drop-shadow(0 4px 12px rgba(220,40,40,0.3)); flex-shrink: 0;
    }
    h1 { font-size: clamp(17px,4vw,26px); font-weight: 700; color: #fff; margin-bottom: 6px; line-height: 1.2; }
    h1 .accent { color: #dc2828; }
    .tagline { color: #666; font-size: clamp(11px,2.5vw,13px); margin-bottom: clamp(24px,5vw,40px); max-width: 44ch; line-height: 1.5; }
    .cards { display: flex; gap: clamp(12px,2.5vw,20px); flex-wrap: wrap; justify-content: center; width: 100%; max-width: 760px; }
    .card {
      flex: 1 1 240px; max-width: 300px;
      background: #1e1e1e; border: 1.5px solid rgba(255,255,255,0.08);
      border-radius: 16px; padding: 24px 22px 22px;
      cursor: pointer; transition: border-color 0.15s, background 0.15s, transform 0.12s;
      display: flex; flex-direction: column; align-items: flex-start; gap: 0;
      text-align: left; position: relative;
    }
    .card:hover { border-color: rgba(220,40,40,0.45); background: #222; transform: translateY(-2px); }
    .card:active { transform: translateY(0); }
    .card.disabled { opacity: 0.4; cursor: not-allowed; }
    .card.disabled:hover { border-color: rgba(255,255,255,0.08); background: #1e1e1e; transform: none; }
    .card-header { display: flex; align-items: center; justify-content: space-between; width: 100%; margin-bottom: 10px; }
    .card-icon { font-size: 30px; line-height: 1; }
    .badge-rec {
      font-size: 9px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
      background: rgba(74,222,128,0.1); color: #4ade80;
      border: 1px solid rgba(74,222,128,0.25); border-radius: 4px; padding: 3px 7px;
    }
    .badge-soon {
      font-size: 9px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
      background: rgba(220,40,40,0.1); color: #dc2828;
      border: 1px solid rgba(220,40,40,0.2); border-radius: 4px; padding: 3px 7px;
    }
    .card-title { font-size: 15px; font-weight: 700; color: #fff; margin-bottom: 4px; }
    .card-subtitle { font-size: 11px; color: #555; margin-bottom: 14px; }
    .card-divider { width: 100%; height: 1px; background: rgba(255,255,255,0.06); margin-bottom: 14px; }
    .card-bestfor { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.07em; color: #444; margin-bottom: 8px; }
    .card-bullets { list-style: none; display: flex; flex-direction: column; gap: 5px; width: 100%; }
    .card-bullets li { font-size: 11.5px; color: #777; line-height: 1.45; display: flex; align-items: flex-start; gap: 7px; }
    .card-bullets li::before { content: '·'; color: #444; font-size: 16px; line-height: 1.1; flex-shrink: 0; }
  </style>
</head>
<body>
  <img class="logo" src="${iconUri}" alt="OpenClaw" />
  <h1>Welcome to <span class="accent">OpenClaw</span></h1>
  <p class="tagline">Choose where OpenClaw runs. You can always switch later.</p>
  <div class="cards">

    <button class="card" data-card="local" onclick="pick('local')">
      <div class="card-header">
        <span class="card-icon">💻</span>
      </div>
      <div class="card-title">Local</div>
      <div class="card-subtitle">Runs natively on this machine</div>
      <div class="card-divider"></div>
      <div class="card-bestfor">Best if</div>
      <ul class="card-bullets">
        <li>You have a dedicated device — a Mac mini, spare laptop, or home server with no personal data on it</li>
        <li>You want maximum performance with zero container overhead</li>
        <li>You're comfortable giving the AI direct access to the machine</li>
      </ul>
    </button>

    <button class="card" data-card="docker" onclick="pick('docker')">
      <div class="card-header">
        <span class="card-icon">🐳</span>
        <span class="badge-rec">Recommended</span>
      </div>
      <div class="card-title">Docker</div>
      <div class="card-subtitle">Runs inside an isolated container</div>
      <div class="card-divider"></div>
      <div class="card-bestfor">Best if</div>
      <ul class="card-bullets">
        <li>This is your personal computer — MacBook, work laptop — with files you want to keep private</li>
        <li>You want the AI sandboxed so it can only access what you explicitly mount</li>
        <li>You're not sure which to pick — Docker is the safer default</li>
      </ul>
    </button>

    <button class="card disabled" title="Coming soon" onclick="return false">
      <div class="card-header">
        <span class="card-icon">🌐</span>
        <span class="badge-soon">Soon</span>
      </div>
      <div class="card-title">SSH</div>
      <div class="card-subtitle">Connect to a remote server</div>
      <div class="card-divider"></div>
      <div class="card-bestfor">Best if</div>
      <ul class="card-bullets">
        <li>You have a remote Linux server or VPS you want OpenClaw to run on</li>
        <li>You prefer keeping everything off your local machine entirely</li>
      </ul>
    </button>

  </div>
  <script>
    const vscode = acquireVsCodeApi();
    function pick(hostType) {
      vscode.postMessage({ command: 'chooseHostType', hostType });
    }
  </script>
</body>
</html>`;
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
    <h1>Welcome to OpenClaw <span class="accent">Code</span></h1>
    <p class="tagline">Cursor for OpenClaw</p>
    <div class="spinner-wrap">
      <div class="spinner"></div>
      <span class="loading-text">Checking environment<span class="loading-dots"></span></span>
    </div>
  </body>
</html>`;
  }

  // ── Uninstall ──────────────────────────────────────────────────────────────
  private _schedulePostUninstallClose(): void {
    if (this._uninstallCloseWatcher !== undefined) return;

    const maxWaitMs = 90_000;
    const pollMs = 2_000;
    const closeDelayMs = 3_000;
    const started = Date.now();
    let wasRunning = false;

    this._uninstallCloseWatcher = setInterval(async () => {
      if (Date.now() - started > maxWaitMs) {
        clearInterval(this._uninstallCloseWatcher);
        this._uninstallCloseWatcher = undefined;
        return;
      }

      const isRunning = await vscode.commands.executeCommand<boolean>('void.getIsRunning')
        .then(v => !!v, () => false);

      if (isRunning) { wasRunning = true; return; }
      if (!wasRunning) return;

      clearInterval(this._uninstallCloseWatcher);
      this._uninstallCloseWatcher = undefined;
      this._uninstallCloseSidebarTimer = setTimeout(() => {
        this._uninstallCloseSidebarTimer = undefined;
        vscode.commands.executeCommand('void.sidebar.close');
      }, closeDelayMs);
    }, pollMs);
  }

  // AI-only: hand everything to MoltPilot immediately.
  // MoltPilot is instructed to stop all running OpenClaw processes first
  // (to release lock files), then perform full uninstall using run_with_sudo
  // where elevation is required.

  private async _runUninstall(): Promise<void> {
    const post = (msg: object) => { try { this._panel.webview.postMessage(msg); } catch {} };

    post({ type: 'uninstallLog', text: 'Handing off to AI for uninstall…\n', done: true, ok: true });

    setTimeout(() => {
      post({ type: 'uninstallDone' });
      vscode.commands.executeCommand(
        'void.openChatWithMessage',
        'Uninstall OpenClaw. No sudo.\n1. cd $HOME\n2. pkill -9 -f openclaw\n3. openclaw uninstall --all --yes --non-interactive\nConfirm each step ran OK, then tell the user it\'s done.',
        'agent',
      );
      this._schedulePostUninstallClose();
      // Workspace cleanup (removing ~/.openclaw folder and .code-workspace file) is handled
      // by openOpenClawFolder() on the next startup — manipulating workspace state here
      // triggers VS Code to modify/reload the workspace, which can cause the extension to
      // re-activate and open a duplicate OCC Home tab.
    }, 1200);
  }

  private async _runCassSetup(): Promise<void> {
    const post = (msg: object) => { try { this._panel.webview.postMessage(msg); } catch {} };
    const home = os.homedir();
    const env = this._buildExecEnv();
    const isWin = process.platform === 'win32';

    const runCmd = (cmd: string, args: string[], opts: cp.SpawnOptions = {}): Promise<{ code: number; output: string }> =>
      new Promise(resolve => {
        const child = cp.spawn(cmd, args, { env, stdio: ['ignore', 'pipe', 'pipe'], ...opts });
        let out = '';
        child.stdout?.on('data', (d: Buffer) => { const s = d.toString(); out += s; post({ type: 'wizardLog', text: s, done: false, ok: false }); });
        child.stderr?.on('data', (d: Buffer) => { const s = d.toString(); out += s; post({ type: 'wizardLog', text: s, done: false, ok: false }); });
        child.on('close', code => resolve({ code: code ?? 1, output: out }));
        child.on('error', err => resolve({ code: 1, output: err.message }));
      });

    post({ type: 'wizardLog', text: 'Setting up CASS (Coding Agent Session Search)...\n\n', done: false, ok: false });

    // ══════════════════════════════════════════════════════════════════════════
    // Phase 1 — Deterministic: detect platform, download & stage the binary
    // ══════════════════════════════════════════════════════════════════════════

    // ── Step 1: Detect platform ───────────────────────────────────────────────
    post({ type: 'wizardLog', text: '① Detecting platform...\n', done: false, ok: false });
    const isMac = process.platform === 'darwin';
    const isArm = process.arch === 'arm64';

    let assetName: string;
    if (isWin) {
      assetName = 'cass-windows-amd64.zip';
    } else if (isMac) {
      assetName = 'cass-darwin-arm64.tar.gz';
    } else {
      assetName = isArm ? 'cass-linux-arm64.tar.gz' : 'cass-linux-amd64.tar.gz';
    }
    post({ type: 'wizardLog', text: `   Platform: ${process.platform}/${process.arch} → ${assetName}\n`, done: false, ok: false });

    // ── Step 2: Download the binary ───────────────────────────────────────────
    post({ type: 'wizardLog', text: '\n② Downloading CASS v0.2.2 binary...\n', done: false, ok: false });
    const occDir = path.join(home, '.occ');
    const stagingDir = path.join(occDir, 'cass-staging');
    if (!fs.existsSync(occDir)) fs.mkdirSync(occDir, { recursive: true });
    try { fs.rmSync(stagingDir, { recursive: true, force: true }); } catch {}
    fs.mkdirSync(stagingDir, { recursive: true });

    const downloadPath = path.join(occDir, assetName);
    try { fs.unlinkSync(downloadPath); } catch {}

    const downloadUrl = `https://github.com/Dicklesworthstone/coding_agent_session_search/releases/download/v0.2.2/${assetName}`;
    const downloadOk = await new Promise<boolean>(resolve => {
      const file = fs.createWriteStream(downloadPath);
      const download = (url: string) => {
        const mod = url.startsWith('https') ? require('https') : require('http');
        mod.get(url, (res: any) => {
          if (res.statusCode === 301 || res.statusCode === 302) {
            download(res.headers.location);
            return;
          }
          if (res.statusCode !== 200) { resolve(false); return; }
          res.pipe(file);
          file.on('finish', () => { file.close(); resolve(true); });
        }).on('error', () => resolve(false));
      };
      download(downloadUrl);
    });

    if (!downloadOk) {
      post({ type: 'wizardLog', text: '\n❌ Failed to download CASS binary. Check your internet connection.\n', done: true, ok: false });
      return;
    }
    post({ type: 'wizardLog', text: '   Downloaded.\n', done: false, ok: false });

    // ── Step 3: Extract to staging dir ────────────────────────────────────────
    post({ type: 'wizardLog', text: '\n③ Extracting to staging directory...\n', done: false, ok: false });

    if (isWin) {
      await runCmd('powershell', ['-NoProfile', '-Command', `Expand-Archive -Path '${downloadPath}' -DestinationPath '${stagingDir}' -Force`], { shell: true });
    } else {
      await runCmd('tar', ['-xzf', downloadPath, '-C', stagingDir]);
    }

    // Clean up the downloaded archive
    try { fs.unlinkSync(downloadPath); } catch {}

    // Verify the binary exists in staging
    const stagedBinary = isWin
      ? path.join(stagingDir, 'cass.exe')
      : path.join(stagingDir, 'cass');

    // The binary might be nested — try to find it
    if (!fs.existsSync(stagedBinary)) {
      const findBinary = (dir: string, name: string): string | null => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.isFile() && entry.name === name) return path.join(dir, entry.name);
          if (entry.isDirectory()) {
            const r = findBinary(path.join(dir, entry.name), name);
            if (r) return r;
          }
        }
        return null;
      };
      const found = findBinary(stagingDir, isWin ? 'cass.exe' : 'cass');
      if (found) {
        fs.copyFileSync(found, stagedBinary);
      } else {
        post({ type: 'wizardLog', text: '\n❌ Could not find CASS binary in the downloaded archive.\n', done: true, ok: false });
        return;
      }
    }

    post({ type: 'wizardLog', text: `   ✅ Binary staged at ${stagedBinary}\n`, done: false, ok: false });

    // ══════════════════════════════════════════════════════════════════════════
    // Phase 2 — Hand off to MoltPilot for AI-assisted installation
    // ══════════════════════════════════════════════════════════════════════════

    post({ type: 'wizardLog', text: '\n✅ Download complete — handing off to MoltPilot for installation...\n', done: true, ok: true });

    const binaryName = isWin ? 'cass.exe' : 'cass';
    const handoffMessage = isWin
      ? `CASS binary has been downloaded and staged at ~/.occ/cass-staging/${binaryName}.

Please complete the installation:
1. Create ~/.occ/bin/ if it doesn't exist and move the binary there
2. Add ~/.occ/bin/ to the user's PATH if not already present
3. Run \`cass health --json\` to verify it works
4. Run \`cass index --full --json\` to build the initial index
5. Update ~/.openclaw/agents/main/AGENTS.md with a CASS section if not already present — add instructions to use \`cass search "<topic>" --robot --limit 5\` before starting tasks
6. Restart the OpenClaw gateway with \`openclaw gateway restart\`
7. Run a smoke test: \`cass search "test" --robot --limit 1\`

The binary is already downloaded — do NOT re-download or compile anything.`
      : `CASS binary has been downloaded and staged at ~/.occ/cass-staging/${binaryName}.

Please complete the installation:
1. Create ~/.local/bin/ if it doesn't exist and move the binary there
2. Make it executable: chmod +x ~/.local/bin/cass
3. Run \`cass health --json\` to verify it works
4. Run \`cass index --full --json\` to build the initial index
5. Update ~/.openclaw/agents/main/AGENTS.md with a CASS section if not already present — add instructions to use \`cass search "<topic>" --robot --limit 5\` before starting tasks
6. Restart the OpenClaw gateway with \`openclaw gateway restart\`
7. Run a smoke test: \`cass search "test" --robot --limit 1\`

The binary is already downloaded — do NOT re-download or compile anything.`;

    setTimeout(() => {
      vscode.commands.executeCommand('void.openChatWithMessage', handoffMessage, 'agent');
    }, 1200);

    // Refresh panel
    setTimeout(() => HomePanel.refresh(), 2500);
  }


  private _getWizardHtml(iconUri: string, occUser: { email: string; picture: string | null; balance_usd: number; api_keys?: { moltpilotKey?: string; occKey?: string } | null } | null = null): string {
    // Render user area statically (avoids JS innerHTML escaping issues)
    let userAreaHtml: string;
    if (!occUser) {
      userAreaHtml = `<button class="sign-in-btn" onclick="signIn()">Sign In</button>`;
    } else {
      const initial = (occUser.email || '?')[0].toUpperCase();
      const safeEmail = occUser.email.replace(/"/g, '&quot;').replace(/</g, '&lt;');
      const avatarImg = occUser.picture
        ? `<img src="${occUser.picture}" alt="" referrerpolicy="no-referrer" />`
        : initial;
      userAreaHtml = `
        <div class="user-popover-wrap">
          <button class="user-avatar-btn" title="${safeEmail}" onclick="toggleUserPopover(event)">${avatarImg}</button>
          <div class="user-popover" id="user-popover">
            <div class="user-popover-header">
              <div class="user-popover-avatar">${avatarImg}</div>
              <div class="user-popover-email">${safeEmail}</div>
            </div>
            <div class="user-popover-actions">
              <a class="user-popover-action" href="#" onclick="openDashboard();return false;">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
                Open Dashboard
              </a>
            </div>
            <div class="user-popover-divider"></div>
            <button class="user-popover-signout" onclick="signOut()">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              Log Out
            </button>
          </div>
        </div>`;
    }

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
      min-height: 100vh; padding: 20px; text-align: center;
    }
    /* ── Header bar ──────────────────────────────────────────────── */
    .header-bar {
      position: fixed; top: 12px; right: 12px; z-index: 200;
      display: flex; align-items: center; gap: 8px;
    }
    .user-avatar-btn {
      width: 28px; height: 28px; border-radius: 50%;
      background: #dc2828; color: #fff;
      font-size: 11px; font-weight: 700;
      border: 1.5px solid rgba(255,255,255,0.15);
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      overflow: hidden; transition: opacity 0.15s;
    }
    .user-avatar-btn img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
    .user-avatar-btn:hover { opacity: 0.85; }
    .sign-in-btn {
      font-size: 11.5px; font-weight: 600; color: #dc2828;
      background: rgba(220,40,40,0.08); border: 1px solid rgba(220,40,40,0.22);
      padding: 4px 10px; border-radius: 6px; cursor: pointer; transition: background 0.15s;
    }
    .sign-in-btn:hover { background: rgba(220,40,40,0.16); }
    /* User popover */
    .user-popover-wrap { position: relative; }
    .user-popover {
      display: none; position: absolute; top: calc(100% + 8px); right: 0;
      background: #1e1e1e; border: 1px solid rgba(255,255,255,0.1);
      border-radius: 14px; min-width: 220px;
      box-shadow: 0 12px 32px rgba(0,0,0,0.6); overflow: hidden; z-index: 300;
    }
    .user-popover.open { display: block; }
    .user-popover-header {
      display: flex; flex-direction: column; align-items: center;
      padding: 18px 16px 12px; border-bottom: 1px solid rgba(255,255,255,0.07);
    }
    .user-popover-avatar {
      width: 48px; height: 48px; border-radius: 50%;
      background: #dc2828; color: #fff; font-size: 18px; font-weight: 700;
      display: flex; align-items: center; justify-content: center;
      margin-bottom: 8px; overflow: hidden;
    }
    .user-popover-avatar img { width: 100%; height: 100%; object-fit: cover; }
    .user-popover-email { font-size: 12px; color: #ddd; word-break: break-all; text-align: center; }
    .user-popover-actions { padding: 4px 0; }
    .user-popover-action {
      display: flex; align-items: center; gap: 10px;
      width: 100%; padding: 9px 16px;
      background: none; border: none; color: #ccc; font-size: 13px; font-family: inherit;
      text-align: left; cursor: pointer; text-decoration: none; transition: background 0.12s, color 0.12s;
    }
    .user-popover-action:hover { background: rgba(255,255,255,0.06); color: #fff; }
    .user-popover-divider { height: 1px; background: rgba(255,255,255,0.07); }
    .user-popover-signout {
      display: flex; align-items: center; gap: 10px;
      width: 100%; padding: 9px 16px;
      background: none; border: none; color: #888; font-size: 13px; font-family: inherit;
      text-align: left; cursor: pointer; transition: background 0.12s, color 0.12s;
    }
    .user-popover-signout:hover { background: rgba(255,255,255,0.06); color: #fff; }
    /* ── Logo ──────────────────────────────────────────────────────── */
    .logo { width: 64px; height: 64px; filter: drop-shadow(0 4px 12px rgba(220,40,40,0.3)); }
    /* ── Buttons ───────────────────────────────────────────────────── */
    .btn-primary {
      background: #dc2828; border: none; color: #fff;
      font-size: 14px; font-weight: 600; padding: 10px 28px; border-radius: 8px;
      cursor: pointer; display: inline-flex; align-items: center; gap: 8px;
      transition: background 0.15s; white-space: nowrap;
    }
    .btn-primary:hover { background: #b91c1c; }
    .btn-primary:disabled { background: #7a1515; cursor: not-allowed; }
    .btn-link {
      background: none; border: none; color: #555; font-size: 12px;
      font-family: inherit; cursor: pointer; padding: 4px 0;
      transition: color 0.15s; text-decoration: underline; text-underline-offset: 2px;
    }
    .btn-link:hover { color: #aaa; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .btn-spin {
      display: inline-block; width: 13px; height: 13px;
      border: 2px solid rgba(255,255,255,0.25); border-top-color: #fff;
      border-radius: 50%; animation: spin 0.65s linear infinite; flex-shrink: 0;
    }
    /* ── Provider cards (BYOK) ─────────────────────────────────────── */
    .step { width: min(480px, 96vw); text-align: left; }
    .step-label { font-size: 11px; color: #555; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 10px; text-align: center; }
    h2 { font-size: 15px; font-weight: 600; color: #fff; margin-bottom: 6px; text-align: center; }
    .step-desc { font-size: 12px; color: #888; margin-bottom: 20px; line-height: 1.5; text-align: center; }
    .prov-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; }
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
    .field-label { font-size: 11px; color: #888; margin-bottom: 5px; }
    .key-input {
      width: 100%; background: #111; border: 1px solid #2b2b2b; border-radius: 6px;
      color: #e0e0e0; font-size: 13px; padding: 9px 12px; outline: none;
      margin-bottom: 6px; box-sizing: border-box; font-family: monospace;
    }
    .key-input:focus { outline: none; border-color: #dc2828; }
    .key-hint { font-size: 11px; color: #555; margin-bottom: 20px; }
    .port-row { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; }
    .port-label { font-size: 12px; color: #888; white-space: nowrap; }
    .port-input {
      width: 90px; background: #111; border: 1px solid #2b2b2b; border-radius: 6px;
      color: #e0e0e0; font-size: 13px; padding: 7px 10px; outline: none; box-sizing: border-box;
    }
    .port-input:focus { outline: none; border-color: #dc2828; }
    .btn-row { display: flex; gap: 10px; justify-content: flex-end; }
    .btn-back {
      background: transparent; border: 1px solid #333; color: #888;
      font-size: 13px; padding: 8px 18px; border-radius: 6px; cursor: pointer;
    }
    .btn-back:hover { background: rgba(255,255,255,0.05); }
    /* Running step */
    .run-status {
      font-size: 12px; color: #555; margin-top: 12px;
      max-width: 280px; text-align: center; line-height: 1.5;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .run-status.done { color: #4ade80; white-space: normal; }
    .run-status.failed { color: #f87171; white-space: normal; }
    @keyframes dots { 0%,100%{content:''} 33%{content:'.'} 66%{content:'..'} 100%{content:'...'} }
    .dots::after { content: ''; animation: dots 1.2s steps(1) infinite; }
  </style>
</head>
<body>
  <!-- Header: user area -->
  <div class="header-bar">
    ${userAreaHtml}
  </div>

  <!-- Step 0: minimal — just logo + Start Free button -->
  <div id="step0" style="display:flex;flex-direction:column;align-items:center;gap:24px;">
    <img class="logo" src="${iconUri}" alt="OpenClaw" />
    <div style="display:flex;flex-direction:column;align-items:center;gap:10px;">
      <button class="btn-primary" id="btn-start-free" onclick="chooseFree()">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
        Start Free
      </button>
      <button class="btn-link" onclick="chooseBYOK()">Use my own API key →</button>
    </div>
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
  <div id="step3" style="display:none;flex-direction:column;align-items:center;gap:16px;">
    <img class="logo" src="${iconUri}" alt="OpenClaw" />
    <p style="font-size:13px;color:#888"><span class="dots">Setting up</span></p>
    <p class="run-status" id="run-status"></p>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let selectedProvider = null;
    const _occUser = ${JSON.stringify(occUser)};

    // ── User area ─────────────────────────────────────────────────
    function signIn() { vscode.postMessage({ command: 'signIn' }); }
    function openDashboard() { vscode.postMessage({ command: 'openDashboard' }); }
    function signOut() { vscode.postMessage({ command: 'signOut' }); closeUserPopover(); }
    function toggleUserPopover(e) {
      e.stopPropagation();
      const pop = document.getElementById('user-popover');
      if (pop) pop.classList.toggle('open');
    }
    function closeUserPopover() {
      const pop = document.getElementById('user-popover');
      if (pop) pop.classList.remove('open');
    }
    document.addEventListener('click', () => closeUserPopover());

    // ── Wizard steps ──────────────────────────────────────────────
    function goStep0() {
      document.getElementById('step1').style.display = 'none';
      document.getElementById('step2').style.display = 'none';
      document.getElementById('step0').style.display = 'flex';
    }

    function chooseFree() {
      document.getElementById('step0').style.display = 'none';
      document.getElementById('step3').style.display = 'flex';
      vscode.postMessage({ command: 'runSetup', provider: 'free', apiKey: (_occUser && _occUser.api_keys && _occUser.api_keys.occKey) || '', port: '18789' });
    }

    function chooseBYOK() {
      document.getElementById('step0').style.display = 'none';
      document.getElementById('step1').style.display = 'block';
    }

    function pickProvider(btn) {
      document.querySelectorAll('.prov-card').forEach(function(c) { c.classList.remove('selected'); });
      btn.classList.add('selected');
      selectedProvider = btn.dataset.id;
      document.getElementById('btn-next1').disabled = false;
    }

    function goStep2() {
      if (!selectedProvider) return;
      var card = document.querySelector('.prov-card.selected');
      document.getElementById('step2-title').textContent = card.querySelector('.prov-label').textContent + ' API Key';
      document.getElementById('api-key').placeholder = card.dataset.placeholder;
      document.getElementById('key-link').textContent = card.dataset.hint;
      document.getElementById('step1').style.display = 'none';
      document.getElementById('step2').style.display = 'block';
      document.getElementById('api-key').focus();
    }

    function goStep1() {
      document.getElementById('step2').style.display = 'none';
      document.getElementById('step1').style.display = 'block';
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
      const s3 = document.getElementById('step3');
      s3.style.display = 'flex';
      vscode.postMessage({ command: 'runSetup', provider: selectedProvider, apiKey, port });
    }

    const statusEl = document.getElementById('run-status');

    window.addEventListener('message', e => {
      if (e.data.type === 'wizardLog') {
        if (e.data.done) {
          statusEl.className = 'run-status ' + (e.data.ok ? 'done' : 'failed');
          statusEl.textContent = e.data.ok ? "You're all set." : 'Something went wrong. The AI will help fix it.';
        } else {
          const line = (e.data.text || '').split('\\n').map(function(l) { return l.trim(); }).filter(Boolean).pop();
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
    iconUri: string,
    occJwt: string = '',
    occUser: { email: string; picture: string | null; balance_usd: number; api_keys?: { moltpilotKey?: string; occKey?: string } | null } | null = null,
    emojiBaseUri: string = '',
    aiModelName = ''
  ): string {
    return renderStatusHtml(isInstalled, dirExists, cliCheck, iconUri, occJwt, occUser, emojiBaseUri, aiModelName);
  }


  private async _testOpenClawCli(): Promise<{ ok: boolean; output?: string; error?: string; command: string }> {
    return this._host.testOpenClawCli();
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
    return this._host.findOpenClawPath();
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

  private _buildExecEnv(): Record<string, string | undefined> {
    return this._host.buildExecEnv();
  }
}
