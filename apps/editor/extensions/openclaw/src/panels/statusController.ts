/**
 * StatusPanelController — shared status-panel logic usable by any adapter
 * (LocalSetupPanel, DockerSetupPanel, SSHSetupPanel, and HomePanel itself).
 *
 * Handles: gateway polling, version checks, sign-in/out, CASS setup,
 * workspace file shortcuts, and the full renderStatusHtml() render cycle.
 */
import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import type { HostConnection } from '../hosts/types';
import { renderStatusHtml } from './statusHtml';

type GatewayStatus = 'checking' | 'running' | 'stopped' | 'starting' | 'stopping' | 'restarting' | 'errored' | 'ai-fixing';

// ── Workspace folder management ───────────────────────────────────────────────

/** Known OpenClaw state dirs that we manage as workspace folders. */
const KNOWN_STATE_DIRS = [
  path.join(os.homedir(), '.openclaw'),
  path.join(os.homedir(), 'Desktop', 'occ-state-dir'),
];

/**
 * Closes all open editor tabs whose files live under `dirPath`.
 * Best-effort — never throws. Resolves immediately if the API is unavailable.
 */
export async function closeFilesFromDir(dirPath: string): Promise<void> {
  try {
    const sep = path.sep;
    const normalizedDir = dirPath.endsWith(sep) ? dirPath : dirPath + sep;
    // tabGroups may be unavailable in older VS Code forks — guard defensively.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tabGroups = (vscode.window as any).tabGroups as { all: { tabs: { input: unknown }[] }[]; close(tabs: unknown[], preserveFocus?: boolean): Promise<void> } | undefined;
    if (!tabGroups?.all) return;
    const allTabs = tabGroups.all.flatMap(g => g.tabs);
    const toClose = allTabs.filter(tab => {
      try {
        const input = tab.input as { uri?: { fsPath?: string } } | null;
        return typeof input?.uri?.fsPath === 'string' && input.uri.fsPath.startsWith(normalizedDir);
      } catch { return false; }
    });
    if (toClose.length > 0) {
      await tabGroups.close(toClose, true);
    }
  } catch { /* non-fatal */ }
}

/**
 * Ensures `targetPath` is the only OpenClaw state dir in the current workspace.
 * Removes any other known state dirs, adds targetPath if not already present.
 *
 * Debounced: rapid successive calls within 300 ms are coalesced into one write
 * so we never trigger concurrent `updateWorkspaceFolders` → "File Modified Since"
 * race conditions on the .code-workspace file.
 */
let _wsUpdateTimer: ReturnType<typeof setTimeout> | undefined;
let _wsUpdateTarget: string | undefined;

export function setActiveOpenClawWorkspaceFolder(targetPath: string): void {
  // Always record the latest desired target; last caller wins.
  _wsUpdateTarget = targetPath;
  if (_wsUpdateTimer !== undefined) return; // already scheduled — coalesce
  _wsUpdateTimer = setTimeout(() => {
    _wsUpdateTimer = undefined;
    const target = _wsUpdateTarget;
    _wsUpdateTarget = undefined;
    if (target !== undefined) { _applyActiveOpenClawWorkspaceFolder(target); }
  }, 300);
}

function _applyActiveOpenClawWorkspaceFolder(targetPath: string): void {
  try {
    const targetUri = vscode.Uri.file(targetPath);
    const folders = vscode.workspace.workspaceFolders ?? [];

    const toRemove: number[] = [];
    let targetFound = false;
    for (const f of folders) {
      if (f.uri.fsPath === targetUri.fsPath) {
        targetFound = true;
      } else if (KNOWN_STATE_DIRS.some(d => f.uri.fsPath === d)) {
        toRemove.push(f.index);
      }
    }

    if (targetFound && toRemove.length === 0) return; // already correct

    // Remove stale dirs in descending index order so indices stay valid
    for (const idx of [...toRemove].sort((a, b) => b - a)) {
      vscode.workspace.updateWorkspaceFolders(idx, 1);
    }

    if (!targetFound) {
      const count = vscode.workspace.workspaceFolders?.length ?? 0;
      vscode.workspace.updateWorkspaceFolders(count, null, {
        uri: targetUri,
        name: path.basename(targetPath),
      });
    }
  } catch { /* non-fatal */ }
}

// ── Persistent diagnostics log ────────────────────────────────────────────────
const LOG_PATH = path.join(os.homedir(), '.openclaw', 'occ-home.log');
const LOG_MAX_BYTES = 512 * 1024;
const _ansiRe = /\x1b(\[[0-9;]*[A-Za-z]|[^[])/g;

function writeLog(text: string): void {
  try {
    const dir = path.dirname(LOG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(LOG_PATH) && fs.statSync(LOG_PATH).size > LOG_MAX_BYTES) {
      const lines = fs.readFileSync(LOG_PATH, 'utf-8').split('\n');
      fs.writeFileSync(LOG_PATH, lines.slice(Math.floor(lines.length / 2)).join('\n'), 'utf-8');
    }
    const ts = new Date().toISOString();
    const clean = text.replace(_ansiRe, '');
    const stamped = clean
      .split('\n')
      .map(l => (l.trim() ? `[${ts}] ${l}` : l))
      .join('\n');
    fs.appendFileSync(LOG_PATH, stamped, 'utf-8');
  } catch { /* non-fatal */ }
}


// ── Gateway security helpers ─────────────────────────────────────────────────

const DEFAULT_GATEWAY_PORT = 18789;

/**
 * Reads the gateway auth token from ~/.openclaw/openclaw.json.
 * Returns empty string if not configured or unreadable.
 */
function readGatewayToken(): string {
  try {
    const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
    const raw = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(raw) as Record<string, unknown>;
    const gateway = config['gateway'] as Record<string, unknown> | undefined;
    const auth = gateway?.['auth'] as Record<string, unknown> | undefined;
    if (auth?.['mode'] === 'token' && typeof auth?.['token'] === 'string') {
      return auth['token'] as string;
    }
  } catch { /* non-fatal */ }
  return '';
}

/**
 * Checks whether a port is reachable on 0.0.0.0 (all interfaces) by
 * attempting a TCP connection to a non-loopback IP. If reachable, the
 * gateway is dangerously exposed to the network.
 */
function checkGatewayExposed(port: number): Promise<boolean> {
  return new Promise(resolve => {
    // Find a non-loopback IPv4 address
    const interfaces = os.networkInterfaces();
    let nonLoopback: string | undefined;
    for (const addrs of Object.values(interfaces)) {
      for (const addr of addrs ?? []) {
        if (addr.family === 'IPv4' && !addr.internal) {
          nonLoopback = addr.address;
          break;
        }
      }
      if (nonLoopback) { break; }
    }
    if (!nonLoopback) { resolve(false); return; }

    const socket = new net.Socket();
    socket.setTimeout(1500);
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('error', () => { socket.destroy(); resolve(false); });
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
    socket.connect(port, nonLoopback);
  });
}

export class StatusPanelController {
  private _disposed = false;
  private _commandAction: 'start' | 'stop' | 'restart' | null = null;
  private _sidebarOpen = false;
  private _pollingTimer: ReturnType<typeof setInterval> | undefined;
  private _lastInstalledState: boolean | undefined;
  private _pollTick = 0;
  private _lastJwt = '';
  private _lastInstalledVersion: string | null = null;
  private _autoUpdateTriggered = false;
  private _closeSidebarOnGatewayStart = false;
  private _uninstallCloseSidebarTimer: ReturnType<typeof setTimeout> | undefined;
  private _uninstallCloseWatcher: ReturnType<typeof setInterval> | undefined;
  private _cachedGatewayPort = 18789;
  private _exposedWarningShown = false;
  private readonly _outputChannel: vscode.OutputChannel;

  constructor(
    private readonly _panel: vscode.WebviewPanel,
    private readonly _extensionUri: vscode.Uri,
    private readonly _host: HostConnection,
    /** Called when the user clicks "Disconnect host" in the status panel. */
    private readonly _onDisconnect?: () => void,
  ) {
    this._outputChannel = vscode.window.createOutputChannel('OpenClaw Gateway');
  }

  // ── Host-aware path helpers ───────────────────────────────────────────────

  /** Host-side state directory: ~/.openclaw (local) or ~/Desktop/occ-state-dir (docker). */
  private _getStateDir(): string {
    return this._host.localStateDir?.() ?? path.join(os.homedir(), '.openclaw');
  }

  /** Host-side config file path. */
  private _getConfigFilePath(): string {
    return path.join(this._getStateDir(), 'openclaw.json');
  }

  /** Host-side workspace directory, reading config's `workspace` field if present. */
  private _getWorkspaceDir(): string {
    const stateDir = this._getStateDir();
    const fallback = path.join(stateDir, 'workspace');
    try {
      const raw = fs.readFileSync(this._getConfigFilePath(), 'utf-8');
      const config = JSON.parse(raw) as Record<string, unknown>;
      const ws = config['workspace'];
      if (typeof ws === 'string' && ws.trim()) {
        return ws.startsWith('~') ? path.join(os.homedir(), ws.slice(1)) : ws;
      }
    } catch { /* openclaw.json missing or unreadable */ }
    return fallback;
  }

  /** Render the full status panel HTML and start polling. */
  public async show(): Promise<void> {
    // Ensure the workspace explorer shows only this host's state directory.
    const stateDir = this._getStateDir();
    if (fs.existsSync(stateDir) || this._host.type !== 'local') {
      setActiveOpenClawWorkspaceFolder(stateDir);
    }
    await this._update();
  }

  public async _update(): Promise<void> {
    if (this._disposed) return;

    const configFile = await this._host.getConfigPath();
    const isConfigured = await this._host.exists(configFile);

    // Prefer the host-side port override (e.g. Docker maps container 18789 → host 18790)
    const hostPortOverride = this._host.gatewayHostPort?.();
    if (hostPortOverride !== undefined && Number.isFinite(hostPortOverride) && hostPortOverride > 0) {
      this._cachedGatewayPort = hostPortOverride;
    } else if (isConfigured) {
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

    // For local hosts: check ~/.openclaw on disk and fix ownership if needed.
    // For non-local hosts (docker/ssh): the "dir" is on the remote; use isConfigured as proxy.
    const openclawDir = path.join(os.homedir(), '.openclaw');
    const dirExists = this._host.type === 'local'
      ? fs.existsSync(openclawDir)
      : isConfigured; // container config file present ≡ dir exists
    if (this._host.type === 'local' && dirExists && process.platform !== 'win32') {
      try {
        const stat = fs.statSync(openclawDir);
        if (stat.uid !== process.getuid!()) {
          const username = os.userInfo().username;
          cp.exec(`sudo -n chown -R ${username}:${username} ${openclawDir} && chmod 700 ${openclawDir}`);
        }
      } catch { /* non-fatal */ }
    }

    const cliCheck = await this._host.testOpenClawCli();
    writeLog(`[cli-check] ok=${cliCheck.ok} cmd="${cliCheck.command}" output="${(cliCheck.output ?? '').trim()}"\n`);
    // For non-local hosts the StatusPanelController is only opened after setup completes,
    // so the host being reachable is sufficient to consider openclaw "installed".
    const isInstalled = isConfigured || cliCheck.ok || this._host.type !== 'local';
    this._lastInstalledState = isInstalled;
    this._lastInstalledVersion = cliCheck.ok ? (cliCheck.output ?? '').trim() : null;

    const iconUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'icon.png')
    );
    const occJwt = await vscode.commands.executeCommand<string>('occ.auth.getLegacyJwt').then(r => r ?? '', () => '');
    this._lastJwt = occJwt;

    let occUser: { email: string; picture: string | null; balance_usd: number; api_keys?: { moltpilotKey?: string; occKey?: string } | null } | null = null;
    if (occJwt) {
      try {
        const r = await fetch('https://occ.mba.sh/api/v1/me', {
          headers: { Authorization: `Bearer ${occJwt}` },
        });
        if (r.ok) occUser = await r.json() as typeof occUser;
      } catch { /* network error */ }
    }

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
    } catch { /* openclaw.json unreadable */ }

    if (this._disposed) return;
    this._panel.webview.html = renderStatusHtml(isInstalled, dirExists, cliCheck, iconUri.toString(), occJwt, occUser, emojiBaseUri, aiModelName, this._host.type);

    if (!this._autoUpdateTriggered) {
      this._autoUpdateTriggered = true;
      setTimeout(() => void this._autoUpdateIfOutdated(), 3000);
    }

    this._startPolling();
    if (isInstalled) {
      setTimeout(() => {
        if (this._disposed) return;
        try { this._panel.webview.postMessage({ type: 'autoCheckVersion' }); } catch {}
        void this._checkLatestVersion();
      }, 800);
    }
  }

  /** Route a message from the webview. Returns true if handled. */
  public handleMessage(msg: { command: string; [k: string]: unknown }): boolean {
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
        await new Promise(r => setTimeout(r, 150));
        this._sidebarOpen = await vscode.commands.executeCommand<boolean>('void.sidebar.isVisible').then(v => !!v, () => this._sidebarOpen);
        try { this._panel.webview.postMessage({ type: 'chatState', open: this._sidebarOpen }); } catch {}
      });
    } else if (msg.command === 'signIn') {
      void vscode.env.openExternal(vscode.Uri.parse('https://occ.mba.sh/login?ref=occ-editor'));
    } else if (msg.command === 'openDashboard') {
      void vscode.env.openExternal(vscode.Uri.parse('https://occ.mba.sh/dashboard'));
    } else if (msg.command === 'signOut') {
      void vscode.commands.executeCommand('occ.auth.setLegacyJwt', '');
      void vscode.commands.executeCommand('occ.auth.setMoltpilotKey', '');
      void vscode.commands.executeCommand('openclaw.jwt.set', '');
    } else if (msg.command === 'openUrl') {
      const urlStr = msg.url as string;
      try {
        const parsed = new URL(urlStr);
        if (!['https:', 'http:'].includes(parsed.protocol)) { return true; }
        const allowed = ['occ.mba.sh', 'mba.sh', 'openclaw.ai', 'openclawcode.ai', 'github.com', 'openclaw.sh'];
        if (!allowed.some(d => parsed.hostname === d || parsed.hostname.endsWith('.' + d))) { return true; }
        vscode.env.openExternal(vscode.Uri.parse(urlStr));
      } catch { /* invalid URL — ignore */ }
    } else if (msg.command === 'openConfigFile') {
      const configPath = this._getConfigFilePath();
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
      if (!allowed.has(file)) return true;
      const workspaceDir = this._getWorkspaceDir();
      const filePath = path.join(workspaceDir, file);
      if (!fs.existsSync(filePath)) {
        if (file === 'MEMORY.md') {
          const scaffold = [
            '# Agent Long-Term Memory', '',
            'This file is the persistent long-term memory for the AI agent embedded in OCcode.',
            'The agent reads this file at the start of every session to recall important context,',
            'preferences, and decisions made in previous conversations.', '',
            '---', '', '## About This File', '',
            '- **Purpose**: Stores facts, decisions, and context that should persist across agent sessions.',
            '- **Owner**: You — edit freely to add, update, or remove entries.',
            '- **Format**: Plain Markdown. Keep entries concise and well-organised.', '',
            '## User Preferences', '',
            '<!-- Add preferences the agent should always follow, e.g.:',
            '- Prefer TypeScript over JavaScript',
            '- Always use tabs for indentation', '-->', '',
            '## Project Context', '',
            '<!-- Record important architectural decisions, repo layout notes, or recurring patterns. -->', '',
            '## Recurring Solutions', '',
            '<!-- Document fixes for problems that come up repeatedly. -->', '',
            '## Notes', '',
            '<!-- Anything else the agent should remember long-term. -->',
          ].join('\n');
          fs.mkdirSync(workspaceDir, { recursive: true });
          fs.writeFileSync(filePath, scaffold, 'utf8');
        } else {
          vscode.window.showWarningMessage(
            `${file} not found in ${workspaceDir}. OpenClaw may not have initialised its workspace yet.`
          );
          return true;
        }
      }
      vscode.commands.executeCommand('vscode.open', vscode.Uri.file(filePath));
    } else if (msg.command === 'openclaw.uninstall') {
      void this._runUninstall();
    } else if (msg.command === 'openclaw.setupBetterMemory') {
      void this._runCassSetup();
    } else if (msg.command === 'disconnectHost') {
      // Close workspace files best-effort (non-blocking) then navigate away.
      void closeFilesFromDir(this._getStateDir());
      void vscode.commands.executeCommand('occ.window.clearHost');
      this._onDisconnect?.();
    } else if (msg.command === 'void.openChatWithMessage') {
      const args = msg.args as string[];
      if (args && args.length > 0) {
        void vscode.commands.executeCommand('void.openChatWithMessage', args[0], 'agent');
      }
    } else {
      return false;
    }
    return true;
  }

  public dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
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
  }

  // ── Gateway ───────────────────────────────────────────────────────────────

  private _getConfiguredPort(): number {
    return this._cachedGatewayPort;
  }

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
      if (this._disposed) return;
      this._pollTick++;

      if (this._pollTick % 2 === 0) {
        const nowInstalled = await this._quickInstallCheck();
        if (nowInstalled !== this._lastInstalledState) {
          void this._update();
          return;
        }
      }

      if (this._pollTick % 15 === 0) {
        void this._host.testOpenClawCli().then(result => {
          const current = result.ok ? (result.output ?? '').trim() : null;
          const changed = current !== this._lastInstalledVersion;
          this._lastInstalledVersion = current;
          try {
            this._panel.webview.postMessage({ type: 'cliVersion', text: current ?? 'not found', ok: result.ok });
          } catch {}
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
      if (!this._commandAction) {
        try { this._panel.webview.postMessage({ type: 'gatewayStatus', status }); } catch {}
      }
      if (this._closeSidebarOnGatewayStart && status === 'running') {
        this._closeSidebarOnGatewayStart = false;
        void vscode.commands.executeCommand('void.sidebar.close');
      }
      // Security: check if gateway is exposed on non-loopback interfaces
      if (status === 'running' && this._host.type === 'local' && !this._exposedWarningShown) {
        void checkGatewayExposed(this._cachedGatewayPort).then(exposed => {
          if (exposed && !this._exposedWarningShown) {
            this._exposedWarningShown = true;
            void vscode.window.showWarningMessage(
              `⚠ Security: OpenClaw gateway on port ${this._cachedGatewayPort} is reachable from your network (bound to 0.0.0.0). ` +
              `This exposes your agents, API keys, and channel configs to anyone on your network. ` +
              `Restart the gateway bound to 127.0.0.1 only.`,
              'Learn More',
            ).then(choice => {
              if (choice === 'Learn More') {
                void vscode.env.openExternal(vscode.Uri.parse('https://openclaw.ai/docs/security#gateway-binding'));
              }
            });
          }
        });
      }
      if (status !== 'running') { this._exposedWarningShown = false; }
      try { this._panel.webview.postMessage({ type: 'aiRunning', running: aiRunning }); } catch {}
      try { this._panel.webview.postMessage({ type: 'chatState', open: this._sidebarOpen }); } catch {}
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

  private async _handleGatewayAction(action: 'start' | 'stop' | 'restart'): Promise<void> {
    const intermediary: GatewayStatus =
      action === 'start' ? 'starting' : action === 'stop' ? 'stopping' : 'restarting';
    const expectedState: GatewayStatus = action === 'stop' ? 'stopped' : 'running';

    this._commandAction = action;
    try { this._panel.webview.postMessage({ type: 'gatewayStatus', status: intermediary }); } catch {}

    const verb = action === 'restart' ? 'restart' : action;
    const osInfo = `${process.platform} ${os.release()} (${process.arch})`;
    const port = this._getConfiguredPort();
    const portCheckCmd = process.platform === 'win32'
      ? `netstat -ano | findstr :${port}`
      : `lsof -iTCP:${port} -sTCP:LISTEN -n -P 2>/dev/null || ss -tlnp 2>/dev/null | grep :${port}`;
    const isDocker = this._host.type === 'docker';
    const containerName = isDocker ? (this._host.label || 'occ-openclaw') : '';
    const gatewayCmd = isDocker
      ? `docker exec ${containerName} openclaw gateway ${action}`
      : `openclaw gateway ${action}`;
    const aiMessage = [
      `Please ${verb} the OpenClaw gateway.`,
      '',
      `Run the following command in your terminal:`,
      '```',
      gatewayCmd,
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
    this._pollUntilState(expectedState, intermediary);
  }

  private _pollUntilState(expected: GatewayStatus, intermediary: GatewayStatus, maxWaitMs = 180000): void {
    const deadline = Date.now() + maxWaitMs;
    const tick = async () => {
      if (this._disposed) return;
      if (Date.now() > deadline) {
        this._commandAction = null;
        try { this._panel.webview.postMessage({ type: 'gatewayStatus', status: await this._checkGatewayStatus() }); } catch {}
        return;
      }
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

  // ── Version check ─────────────────────────────────────────────────────────

  /** Strict semver-ish pattern to reject obviously spoofed version strings. */
  private static readonly _VERSION_RE = /^\d{1,5}\.\d{1,5}\.\d{1,5}(?:-[\w.]+)?$/;

  private _fetchLatestVersion(): Promise<string | null> {
    return new Promise(resolve => {
      const req = https.get(
        { hostname: 'registry.npmjs.org', path: '/openclaw/latest', headers: { Accept: 'application/json' } },
        res => {
          // Reject unexpected redirects — a spoofed DNS might redirect us
          if (res.statusCode !== 200) { res.resume(); resolve(null); return; }
          let data = '';
          res.on('data', (c: Buffer) => (data += c));
          res.on('end', () => {
            try {
              const version: unknown = JSON.parse(data).version;
              if (typeof version !== 'string' || !StatusPanelController._VERSION_RE.test(version)) {
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

  private _escHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  private async _checkLatestVersion(): Promise<void> {
    const post = (html: string) => {
      try { this._panel.webview.postMessage({ type: 'versionResult', html }); } catch {}
    };
    const [cliCheck, latest] = await Promise.all([
      this._host.testOpenClawCli(),
      this._fetchLatestVersion(),
    ]);
    if (!latest) {
      post(`<span style="color:#888">Could not reach version server — check your connection.</span>`);
      return;
    }
    const installed = cliCheck.ok ? (cliCheck.output ?? '').trim() : null;
    const safeLatest = this._escHtml(latest);
    if (!installed) {
      const notDetectedLabel = this._host.type === 'local' ? 'not detected locally' : 'not detected in container';
      post(`<span style="color:#60a5fa">Latest: <strong>${safeLatest}</strong> — OpenClaw CLI ${notDetectedLabel}.</span>`);
      return;
    }
    const safeInstalled = this._escHtml(installed);
    const norm = (v: string) => {
      const match = v.match(/\d+\.\d+(?:\.\d+)*/);
      return match ? match[0] : v.replace(/^v/i, '').split(/[-+(]/)[0].trim();
    };
    if (norm(installed) === norm(latest)) {
      post(`<span style="color:#4ade80">✓ Up to date &mdash; <strong>${safeInstalled}</strong></span>`);
    } else {
      post(
        `<span style="color:#fbbf24">Update available: <strong>${safeLatest}</strong> &mdash; you have <strong>${safeInstalled}</strong>.</span>` +
        `<button onclick="runUpdate()" style="margin-top:10px;display:flex;align-items:center;gap:6px;background:#f59e0b;color:#000;border:none;border-radius:6px;padding:7px 14px;font-size:13px;font-weight:600;cursor:pointer;width:100%;justify-content:center;" ` +
        `onmouseover="this.style.background='#fbbf24'" onmouseout="this.style.background='#f59e0b'">` +
        `⬆ Update to ${safeLatest} →</button>`,
      );
    }
  }

  private async _autoUpdateIfOutdated(): Promise<void> {
    try {
      const [cliCheck, latest] = await Promise.all([
        this._host.testOpenClawCli(),
        this._fetchLatestVersion(),
      ]);
      if (!cliCheck.ok || !latest) return;
      const norm = (v: string) => { const m = v.match(/\d+\.\d+(?:\.\d+)*/); return m ? m[0] : v.replace(/^v/i, '').split(/[-+(]/)[0].trim(); };
      const installed = (cliCheck.output ?? '').trim();
      if (norm(installed) === norm(latest)) return;
      void vscode.commands.executeCommand(
        'void.openChatWithMessage',
        `OpenClaw is installed but version ${installed} is not the latest (${latest}). Please update it now.\n\n` +
        `Run: openclaw update --yes --non-interactive\n\n` +
        `After updating, verify with: openclaw --version`,
        'agent',
      );
    } catch { /* best-effort */ }
  }

  // ── Uninstall ─────────────────────────────────────────────────────────────

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

  private async _runUninstall(): Promise<void> {
    const post = (msg: object) => { try { this._panel.webview.postMessage(msg); } catch {} };
    post({ type: 'uninstallLog', text: 'Handing off to AI for uninstall…\n', done: true, ok: true });
    const isDocker = this._host.type === 'docker';
    const containerName = isDocker ? (this._host.label || 'occ-openclaw') : '';
    const uninstallMsg = isDocker
      ? `Uninstall OpenClaw from Docker container "${containerName}".\n1. docker exec ${containerName} pkill -9 -f openclaw || true\n2. docker exec ${containerName} openclaw uninstall --all --yes --non-interactive\n3. docker rm -f ${containerName}\nConfirm each step ran OK, then tell the user it's done.`
      : 'Uninstall OpenClaw. No sudo.\n1. cd $HOME\n2. pkill -9 -f openclaw\n3. openclaw uninstall --all --yes --non-interactive\nConfirm each step ran OK, then tell the user it\'s done.';
    setTimeout(() => {
      post({ type: 'uninstallDone' });
      vscode.commands.executeCommand('void.openChatWithMessage', uninstallMsg, 'agent');
      this._schedulePostUninstallClose();
    }, 1200);
  }

  // ── CASS (Better Memory) setup ────────────────────────────────────────────

  private async _runCassSetup(): Promise<void> {
    const post = (msg: object) => { try { this._panel.webview.postMessage(msg); } catch {} };
    const home = os.homedir();
    const env = this._host.buildExecEnv();
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

    post({ type: 'wizardLog', text: '\n③ Extracting to staging directory...\n', done: false, ok: false });
    if (isWin) {
      await runCmd('powershell', ['-NoProfile', '-Command', `Expand-Archive -Path '${downloadPath}' -DestinationPath '${stagingDir}' -Force`], { shell: true });
    } else {
      await runCmd('tar', ['-xzf', downloadPath, '-C', stagingDir]);
    }
    try { fs.unlinkSync(downloadPath); } catch {}

    const stagedBinary = isWin
      ? path.join(stagingDir, 'cass.exe')
      : path.join(stagingDir, 'cass');

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
    post({ type: 'wizardLog', text: '\n✅ Download complete — handing off to MoltPilot for installation...\n', done: true, ok: true });

    const binaryName = isWin ? 'cass.exe' : 'cass';
    const handoffMessage = isWin
      ? `CASS binary has been downloaded and staged at ~/.occ/cass-staging/${binaryName}.\n\nPlease complete the installation:\n1. Create ~/.occ/bin/ if it doesn't exist and move the binary there\n2. Add ~/.occ/bin/ to the user's PATH if not already present\n3. Run \`cass health --json\` to verify it works\n4. Run \`cass index --full --json\` to build the initial index\n5. Update ~/.openclaw/agents/main/AGENTS.md with a CASS section if not already present — add instructions to use \`cass search "<topic>" --robot --limit 5\` before starting tasks\n6. Restart the OpenClaw gateway with \`openclaw gateway restart\`\n7. Run a smoke test: \`cass search "test" --robot --limit 1\`\n\nThe binary is already downloaded — do NOT re-download or compile anything.`
      : `CASS binary has been downloaded and staged at ~/.occ/cass-staging/${binaryName}.\n\nPlease complete the installation:\n1. Create ~/.local/bin/ if it doesn't exist and move the binary there\n2. Make it executable: chmod +x ~/.local/bin/cass\n3. Run \`cass health --json\` to verify it works\n4. Run \`cass index --full --json\` to build the initial index\n5. Update ~/.openclaw/agents/main/AGENTS.md with a CASS section if not already present — add instructions to use \`cass search "<topic>" --robot --limit 5\` before starting tasks\n6. Restart the OpenClaw gateway with \`openclaw gateway restart\`\n7. Run a smoke test: \`cass search "test" --robot --limit 1\`\n\nThe binary is already downloaded — do NOT re-download or compile anything.`;

    setTimeout(() => {
      vscode.commands.executeCommand('void.openChatWithMessage', handoffMessage, 'agent');
    }, 1200);

    setTimeout(() => void this._update(), 2500);
  }
}
