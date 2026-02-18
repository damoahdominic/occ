import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as cp from 'child_process';

type Nullable<T> = T | undefined | null;

type SavePayload = {
  general?: Record<string, unknown>;
  channels?: Record<string, unknown>;
  gateway?: Record<string, unknown>;
  commands?: Record<string, unknown>;
  voiceCall?: Record<string, unknown>;
};

function expandHome(p: string) {
  if (!p) return p;
  if (p.startsWith('~')) {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

function normalizePath(p: string) {
  if (!p) return p;
  const expanded = expandHome(p);
  if (process.platform === 'win32') {
    return expanded.replace(/\\/g, '/');
  }
  return expanded;
}

function escapeHtml(input: string) {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripJsonComments(input: string) {
  let output = '';
  let inString: string | null = null;
  let escaped = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    const next = input[i + 1];
    if (inString) {
      output += char;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === inString) {
        inString = null;
      }
      continue;
    }
    if (char === '"' || char === '\'' || char === '`') {
      inString = char;
      output += char;
      continue;
    }
    if (char === '/' && next === '/') {
      while (i < input.length && input[i] !== '\n') {
        i++;
      }
      if (input[i] === '\n') {
        output += '\n';
      }
      continue;
    }
    if (char === '/' && next === '*') {
      i += 2;
      while (i < input.length && !(input[i] === '*' && input[i + 1] === '/')) {
        i++;
      }
      i++;
      continue;
    }
    output += char;
  }
  return output;
}

function parseJsonLoose(raw: string): { ok: boolean; value: Record<string, any>; error?: string } {
  if (!raw || !raw.trim()) {
    return { ok: true, value: {} };
  }
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (err) {
    try {
      const cleaned = stripJsonComments(raw).replace(/,\s*([}\]])/g, '$1');
      return { ok: true, value: JSON.parse(cleaned) };
    } catch (err2) {
      const message = err2 instanceof Error ? err2.message : String(err2);
      return { ok: false, value: {}, error: message };
    }
  }
}

export class ConfigPanel {
  public static currentPanel: ConfigPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];
  private static readonly CONFIG_PATH = path.join(os.homedir(), '.openclaw', 'openclaw.json');
  private static _customPath: string | undefined;
  private _doctorProcess: cp.ChildProcessWithoutNullStreams | undefined;

  private static _getConfigPath() {
    if (ConfigPanel._customPath) return ConfigPanel._customPath;
    const userPath = vscode.workspace.getConfiguration('openclaw').get<string>('configPath');
    if (userPath) {
      ConfigPanel._customPath = normalizePath(userPath);
      return ConfigPanel._customPath;
    }
    return ConfigPanel.CONFIG_PATH;
  }

  public static overrideConfigPath(p: string | undefined) {
    ConfigPanel._customPath = p ? normalizePath(p) : undefined;
  }

  private constructor(panel: vscode.WebviewPanel) {
    this._panel = panel;
    void this._update();
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage(message => this._handleMessage(message), null, this._disposables);
  }

  public static createOrShow(extensionUri: vscode.Uri) {
    if (ConfigPanel.currentPanel) {
      ConfigPanel.currentPanel._panel.reveal();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'openclawConfig',
      'OpenClaw Control Center',
      vscode.ViewColumn.Two,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
      }
    );
    ConfigPanel.currentPanel = new ConfigPanel(panel);
  }

  public dispose() {
    if (this._doctorProcess) {
      this._doctorProcess.kill();
      this._doctorProcess = undefined;
    }
    ConfigPanel.currentPanel = undefined;
    this._panel.dispose();
    this._disposables.forEach(d => d.dispose());
  }

  private _handleMessage(message: any) {
    const cmd = message?.command;
    switch (cmd) {
      case 'saveSections':
        void this._saveSections(message.payload as SavePayload ?? {});
        break;
      case 'saveRaw':
        void this._saveRawConfig(String(message.raw ?? ''));
        break;
      case 'refresh':
        void this._update();
        break;
      case 'runDoctor':
        void this._runDoctor(message.mode === 'repair' ? 'repair' : 'quick');
        break;
      case 'runCommand':
        void this._runGatewayUtility(String(message.target ?? 'status'));
        break;
      case 'openConfig':
        void this._openConfigFile();
        break;
      case 'openState':
        void this._openStateFolder();
        break;
      default:
        break;
    }
  }

  private _readRawConfig(): string {
    try {
      return fs.readFileSync(ConfigPanel._getConfigPath(), 'utf-8');
    } catch {
      return '{}';
    }
  }

  private _parseConfig(): Record<string, any> {
    const raw = this._readRawConfig();
    const parsed = parseJsonLoose(raw);
    return parsed.ok ? parsed.value : {};
  }

  private _writeConfig(config: Record<string, unknown>) {
    try {
      const targetPath = ConfigPanel._getConfigPath();
      const dir = path.dirname(targetPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(targetPath, JSON.stringify(config, null, 2), 'utf-8');
      vscode.window.showInformationMessage('OpenClaw configuration saved.');
      void this._update();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Failed to save config: ${message}`);
    }
  }

  private async _saveSections(payload: SavePayload) {
    const config = this._parseConfig();
    this._applyGeneral(config, payload.general ?? {});
    this._applyChannels(config, payload.channels ?? {});
    this._applyGateway(config, payload.gateway ?? {});
    this._applyCommands(config, payload.commands ?? {});
    this._applyVoiceCall(config, payload.voiceCall ?? {});
    this._writeConfig(config);
  }

  private async _saveRawConfig(raw: string) {
    const parsed = parseJsonLoose(raw);
    if (!parsed.ok) {
      vscode.window.showErrorMessage(`Advanced JSON is invalid: ${parsed.error}`);
      this._postToWebview({ type: 'error', message: parsed.error });
      return;
    }
    this._writeConfig(parsed.value);
  }

  private async _openConfigFile() {
    try {
      const uri = vscode.Uri.file(ConfigPanel._getConfigPath());
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc, { preview: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Unable to open config: ${message}`);
    }
  }

  private async _openStateFolder() {
    try {
      const stateDir = path.dirname(ConfigPanel._getConfigPath());
      await vscode.env.openExternal(vscode.Uri.file(stateDir));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Unable to open state folder: ${message}`);
    }
  }

  private async _update() {
    const config = this._parseConfig();
    const targetPath = ConfigPanel._getConfigPath();

    const general = this._buildGeneralModel(config);
    const whatsapp = this._buildWhatsappModel(config);
    const telegram = this._buildTelegramModel(config);
    const discord = this._buildDiscordModel(config);
    const gateway = this._buildGatewayModel(config);
    const commands = this._buildCommandsModel(config);
    const voiceCall = this._buildVoiceCallModel(config);
    const wizard = (config.wizard ?? {}) as Record<string, any>;
    const lastDoctor = wizard.lastRunAt ? new Date(wizard.lastRunAt).toLocaleString() : 'Never';
    const rawJson = JSON.stringify(config, null, 2);
    const sidebarChannels = {
      whatsapp: whatsapp.enabled,
      telegram: telegram.enabled,
      discord: discord.enabled
    };

    const state = {
      configPath: targetPath,
      general,
      whatsapp,
      telegram,
      discord,
      gateway,
      commands,
      voiceCall,
      lastDoctor,
      uiVersion: 'config-ui-2026-02-18a',
      rawJson
    };

    this._panel.webview.html = this._getHtml(state, sidebarChannels);
  }

  private _serializeForWebview(data: unknown) {
    return JSON.stringify(data).replace(/</g, '\\u003c');
  }

  private _getHtml(
    state: Record<string, any>,
    sidebarChannels: { whatsapp: boolean; telegram: boolean; discord: boolean }
  ): string {
    const safePath = escapeHtml(state.configPath ?? '');
    const safeRaw = escapeHtml(state.rawJson ?? '{}');

    const checked = (value: boolean) => (value ? 'checked' : '');
    const selectOption = (current: string, value: string) => (current === value ? 'selected' : '');

    const whatsappAllowFrom = escapeHtml((state.whatsapp.allowFrom ?? []).join('\n'));
    const whatsappGroupAllowFrom = escapeHtml((state.whatsapp.groupAllowFrom ?? []).join('\n'));
    const telegramAllowFrom = escapeHtml((state.telegram.allowFrom ?? []).join('\n'));
    const discordAllowFrom = escapeHtml((state.discord.allowFrom ?? []).join('\n'));

    const voiceNumbersInfo = {
      from: escapeHtml(state.voiceCall.fromNumber ?? ''),
      to: escapeHtml(state.voiceCall.toNumber ?? ''),
      webhook: escapeHtml(state.voiceCall.webhook ?? ''),
      streamPath: escapeHtml(state.voiceCall.streamPath ?? ''),
      publicUrl: escapeHtml(state.voiceCall.publicUrl ?? ''),
      voiceId: escapeHtml(state.voiceCall.voiceId ?? ''),
      apiKey: escapeHtml(state.voiceCall.apiKey ?? ''),
      streaming: state.voiceCall.streaming ?? false,
      enabled: state.voiceCall.enabled ?? true
    };

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    :root {
      color-scheme: dark;
      --bg: #0f0f10;
      --card: #17181c;
      --border: #27282f;
      --accent: #ff4741;
      --accent-dim: rgba(255, 71, 65, 0.2);
      --text: #f4f4f5;
      --muted: #a0a0a8;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: var(--vscode-font-family, 'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif);
      background: var(--bg);
      color: var(--text);
      display: flex;
      min-height: 100vh;
    }
    .sidebar {
      width: 280px;
      border-right: 1px solid var(--border);
      padding: 24px 20px;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }
    .sidebar h1 {
      font-size: 22px;
      margin: 0 0 4px;
      color: #fff;
    }
    .path {
      font-size: 11px;
      color: var(--muted);
      word-break: break-all;
    }
    .summary-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .summary-card .label { font-size: 12px; color: var(--muted); }
    .summary-card .value { font-size: 14px; font-weight: 600; }
    .debug-line {
      font-size: 11px;
      color: #8b8b93;
      word-break: break-word;
    }
    .channel-status {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-top: 8px;
      font-size: 13px;
    }
    .channel-pill {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 10px;
      border-radius: 8px;
      background: rgba(255,255,255,0.04);
    }
    .channel-pill span {
      font-weight: 600;
    }
    .channel-pill .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }
    .dot.on { background: #30e88e; }
    .dot.off { background: #ff8d4d; }
    .tabs {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .tab-btn {
      background: transparent;
      border: 1px solid transparent;
      color: var(--muted);
      padding: 10px 12px;
      border-radius: 10px;
      text-align: left;
      cursor: pointer;
      font-weight: 600;
      transition: all 0.15s ease;
    }
    .tab-btn.active {
      background: rgba(255, 71, 65, 0.1);
      border-color: var(--accent);
      color: #fff;
    }
    .main {
      flex: 1;
      padding: 30px 36px;
      overflow-y: auto;
    }
    .tab {
      display: none;
      flex-direction: column;
      gap: 20px;
    }
    .tab.active { display: flex; }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 22px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.35);
    }
    .card h2 {
      margin: 0 0 8px;
      font-size: 18px;
    }
    .card p.description {
      margin: 0 0 16px;
      font-size: 13px;
      color: var(--muted);
    }
    label {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 12px;
      color: var(--muted);
      font-weight: 600;
    }
    input, select, textarea {
      background: #101114;
      border: 1px solid #2b2c33;
      border-radius: 12px;
      padding: 10px 14px;
      color: #fefefe;
      font-size: 14px;
      font-family: inherit;
    }
    textarea {
      min-height: 90px;
      resize: vertical;
    }
    input[type="checkbox"] {
      width: auto;
      height: auto;
      accent-color: var(--accent);
      transform: scale(1.15);
    }
    .field-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
    }
    .actions {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      margin-top: 16px;
    }
    button.primary {
      background: var(--accent);
      color: #fff;
      border: none;
      padding: 12px 20px;
      border-radius: 999px;
      font-weight: 600;
      cursor: pointer;
    }
    button.secondary {
      background: transparent;
      border: 1px solid var(--border);
      color: #fff;
      padding: 11px 18px;
      border-radius: 999px;
      font-weight: 600;
      cursor: pointer;
    }
    .checkbox-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 0;
    }
    .logs {
      background: #0b0c0e;
      border: 1px solid #1f2025;
      border-radius: 12px;
      padding: 14px;
      min-height: 160px;
      font-size: 12px;
      overflow-y: auto;
      white-space: pre-wrap;
      font-family: var(--vscode-editor-font-family, monospace);
    }
    .advanced textarea {
      min-height: 220px;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      border-radius: 999px;
      background: rgba(255,255,255,0.05);
      font-size: 12px;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <aside class="sidebar">
    <div>
      <h1>OpenClaw Control</h1>
      <div class="path">${safePath}</div>
    </div>
    <div class="summary-card">
      <div>
        <div class="label">Last Doctor run</div>
        <div class="value">${escapeHtml(state.lastDoctor ?? 'Never')}</div>
      </div>
      <div>
        <div class="label">UI Version</div>
        <div class="value">${escapeHtml(state.uiVersion ?? '')}</div>
      </div>
      <div>
        <div class="label">UI Debug</div>
        <div id="uiDebug" class="debug-line">ready</div>
      </div>
      <div class="channel-status">
        <div class="channel-pill">
          <span>WhatsApp</span>
          <div class="dot ${sidebarChannels.whatsapp ? 'on' : 'off'}"></div>
        </div>
        <div class="channel-pill">
          <span>Telegram</span>
          <div class="dot ${sidebarChannels.telegram ? 'on' : 'off'}"></div>
        </div>
        <div class="channel-pill">
          <span>Discord</span>
          <div class="dot ${sidebarChannels.discord ? 'on' : 'off'}"></div>
        </div>
      </div>
      <div class="actions">
        <button class="secondary" data-command="open-config">Open Config File</button>
        <button class="secondary" data-command="open-state">Open State Folder</button>
      </div>
    </div>
    <div class="tabs">
      <button class="tab-btn active" data-tab="general">Assistant & Gateway</button>
      <button class="tab-btn" data-tab="channels">Channels & Voice</button>
      <button class="tab-btn" data-tab="automation">Automation & Doctor</button>
      <button class="tab-btn" data-tab="advanced">Advanced JSON</button>
    </div>
  </aside>
  <main class="main">
    <section id="tab-general" class="tab active" data-tab-panel="general">
      <div class="card">
        <h2>Assistant profile</h2>
        <p class="description">Name, workspace, and model selection apply to the primary OpenClaw agent.</p>
        <div class="field-grid">
          <label>Display name<input id="assistantName" value="${escapeHtml(state.general.name ?? '')}" /></label>
          <label>Emoji / signature<input id="assistantEmoji" value="${escapeHtml(state.general.emoji ?? '')}" /></label>
          <label>Workspace path<input id="workspacePath" value="${escapeHtml(state.general.workspace ?? '')}" /></label>
          <label>Response prefix<input id="responsePrefix" value="${escapeHtml(state.general.responsePrefix ?? '')}" placeholder="e.g. Boss" /></label>
        </div>
        <div class="field-grid" style="margin-top:16px;">
          <label>Primary model<input id="defaultModel" value="${escapeHtml(state.general.model ?? '')}" placeholder="openai/gpt-5.1-codex" /></label>
          <label>Image model<input id="imageModel" value="${escapeHtml(state.general.imageModel ?? '')}" placeholder="openai/gpt-5.2-codex" /></label>
          <label>Max concurrent tasks<input id="maxConcurrent" type="number" min="1" value="${escapeHtml(String(state.general.maxConcurrent ?? ''))}" /></label>
          <label>Sub-agent concurrency<input id="subagentMax" type="number" min="1" value="${escapeHtml(String(state.general.subagentMax ?? ''))}" /></label>
        </div>
        <div class="actions">
          <button class="primary" data-command="save-all">Save Assistant Settings</button>
        </div>
      </div>
      <div class="card">
        <h2>Gateway & Access</h2>
        <p class="description">Ports, auth, and tailscale preferences come from the OpenClaw gateway config.</p>
        <div class="field-grid">
          <label>Gateway port<input id="gatewayPort" type="number" value="${escapeHtml(String(state.gateway.port ?? '18789'))}" /></label>
          <label>Bind mode<select id="gatewayBind">
            <option value="loopback" ${selectOption(state.gateway.bind, 'loopback')}>Loopback only</option>
            <option value="lan" ${selectOption(state.gateway.bind, 'lan')}>LAN</option>
            <option value="public" ${selectOption(state.gateway.bind, 'public')}>Public</option>
          </select></label>
          <label>Auth mode<select id="gatewayAuthMode">
            <option value="token" ${selectOption(state.gateway.authMode, 'token')}>Token</option>
            <option value="none" ${selectOption(state.gateway.authMode, 'none')}>None (local only)</option>
          </select></label>
          <label>Auth token<input id="gatewayAuthToken" value="${escapeHtml(state.gateway.authToken ?? '')}" /></label>
        </div>
        <div class="field-grid" style="margin-top:16px;">
          <label>Tailscale<select id="tailscaleMode">
            <option value="off" ${selectOption(state.gateway.tailscaleMode, 'off')}>Disabled</option>
            <option value="client" ${selectOption(state.gateway.tailscaleMode, 'client')}>Client</option>
            <option value="server" ${selectOption(state.gateway.tailscaleMode, 'server')}>Server</option>
          </select></label>
          <label>Storage quota (GB)<input id="storageLimit" type="number" min="10" value="${escapeHtml(String(state.general.storageLimit ?? '50'))}" /></label>
        </div>
        <div class="actions">
          <button class="primary" data-command="save-all">Save Gateway Settings</button>
        </div>
      </div>
      <div class="card">
        <h2>Command permissions</h2>
        <div class="checkbox-row"><input id="cmdNative" type="checkbox" ${checked(state.commands.native !== false)} /><label for="cmdNative">Allow native commands</label></div>
        <div class="checkbox-row"><input id="cmdBash" type="checkbox" ${checked(state.commands.bash !== false)} /><label for="cmdBash">Allow Bash shell</label></div>
        <div class="checkbox-row"><input id="cmdRestart" type="checkbox" ${checked(state.commands.restart !== false)} /><label for="cmdRestart">Allow gateway restart</label></div>
        <div class="actions">
          <button class="primary" data-command="save-all">Save Command Rules</button>
        </div>
      </div>
    </section>

    <section id="tab-channels" class="tab" data-tab-panel="channels">
      <div class="card">
        <h2>WhatsApp</h2>
        <p class="description">DM / group access policies come from the OpenClaw WhatsApp channel config.</p>
        <div class="checkbox-row"><input id="whatsappEnabled" type="checkbox" ${checked(state.whatsapp.enabled)} />Enable WhatsApp listener</div>
        <div class="field-grid">
          <label>DM policy<select id="whatsappDmPolicy">
            <option value="pairing" ${selectOption(state.whatsapp.dmPolicy, 'pairing')}>Pairing</option>
            <option value="allowlist" ${selectOption(state.whatsapp.dmPolicy, 'allowlist')}>Allowlist</option>
            <option value="open" ${selectOption(state.whatsapp.dmPolicy, 'open')}>Open</option>
            <option value="disabled" ${selectOption(state.whatsapp.dmPolicy, 'disabled')}>Disabled</option>
          </select></label>
          <label>Group policy<select id="whatsappGroupPolicy">
            <option value="allowlist" ${selectOption(state.whatsapp.groupPolicy, 'allowlist')}>Allowlist</option>
            <option value="open" ${selectOption(state.whatsapp.groupPolicy, 'open')}>Open</option>
            <option value="disabled" ${selectOption(state.whatsapp.groupPolicy, 'disabled')}>Disabled</option>
          </select></label>
          <label>Media cap (MB)<input id="whatsappMediaMax" type="number" min="1" value="${escapeHtml(String(state.whatsapp.mediaMaxMb ?? '50'))}" /></label>
        </div>
        <label>Allowed numbers (one per line)<textarea id="whatsappAllowFrom" placeholder="+15551234567">${whatsappAllowFrom}</textarea></label>
        <label>Group sender allowlist<textarea id="whatsappGroupAllowFrom" placeholder="+15550000001">${whatsappGroupAllowFrom}</textarea></label>
        <div class="checkbox-row"><input id="whatsappRequireMention" type="checkbox" ${checked(state.whatsapp.requireMention)} />Require @mention in groups</div>
        <div class="checkbox-row"><input id="whatsappSelfChat" type="checkbox" ${checked(state.whatsapp.selfChatMode)} />Enable self-chat safeguards</div>
        <div class="checkbox-row"><input id="whatsappReadReceipts" type="checkbox" ${checked(state.whatsapp.sendReadReceipts)} />Send read receipts</div>
      </div>

      <div class="card">
        <h2>Telegram</h2>
        <div class="checkbox-row"><input id="telegramEnabled" type="checkbox" ${checked(state.telegram.enabled)} />Enable Telegram bot</div>
        <div class="field-grid">
          <label>Bot token<input id="telegramToken" value="${escapeHtml(state.telegram.botToken ?? '')}" placeholder="1234:token" /></label>
          <label>DM policy<select id="telegramDmPolicy">
            <option value="pairing" ${selectOption(state.telegram.dmPolicy, 'pairing')}>Pairing</option>
            <option value="allowlist" ${selectOption(state.telegram.dmPolicy, 'allowlist')}>Allowlist</option>
            <option value="open" ${selectOption(state.telegram.dmPolicy, 'open')}>Open</option>
            <option value="disabled" ${selectOption(state.telegram.dmPolicy, 'disabled')}>Disabled</option>
          </select></label>
          <label>Reply-to mode<select id="telegramReplyMode">
            <option value="first" ${selectOption(state.telegram.replyToMode, 'first')}>First only</option>
            <option value="all" ${selectOption(state.telegram.replyToMode, 'all')}>All messages</option>
            <option value="off" ${selectOption(state.telegram.replyToMode, 'off')}>Off</option>
          </select></label>
          <label>Stream mode<select id="telegramStreamMode">
            <option value="partial" ${selectOption(state.telegram.streamMode, 'partial')}>Partial</option>
            <option value="block" ${selectOption(state.telegram.streamMode, 'block')}>Block</option>
            <option value="off" ${selectOption(state.telegram.streamMode, 'off')}>Off</option>
          </select></label>
        </div>
        <label>Allowed IDs / handles<textarea id="telegramAllowFrom" placeholder="tg:123456789">${telegramAllowFrom}</textarea></label>
        <div class="checkbox-row"><input id="telegramRequireMention" type="checkbox" ${checked(state.telegram.requireMention)} />Require mention in groups</div>
        <div class="checkbox-row"><input id="telegramLinkPreview" type="checkbox" ${checked(state.telegram.linkPreview)} />Enable link previews</div>
      </div>

      <div class="card">
        <h2>Discord</h2>
        <div class="checkbox-row"><input id="discordEnabled" type="checkbox" ${checked(state.discord.enabled)} />Enable Discord bot</div>
        <div class="field-grid">
          <label>Bot token<input id="discordToken" value="${escapeHtml(state.discord.token ?? '')}" placeholder="Bot token" /></label>
          <label>DM policy<select id="discordDmPolicy">
            <option value="pairing" ${selectOption(state.discord.dmPolicy, 'pairing')}>Pairing</option>
            <option value="allowlist" ${selectOption(state.discord.dmPolicy, 'allowlist')}>Allowlist</option>
            <option value="open" ${selectOption(state.discord.dmPolicy, 'open')}>Open</option>
            <option value="disabled" ${selectOption(state.discord.dmPolicy, 'disabled')}>Disabled</option>
          </select></label>
          <label>Reply-to mode<select id="discordReplyMode">
            <option value="off" ${selectOption(state.discord.replyToMode, 'off')}>Off</option>
            <option value="first" ${selectOption(state.discord.replyToMode, 'first')}>First</option>
            <option value="all" ${selectOption(state.discord.replyToMode, 'all')}>All</option>
          </select></label>
          <label>Chunk size<input id="discordChunk" type="number" value="${escapeHtml(String(state.discord.textChunkLimit ?? '2000'))}" /></label>
        </div>
        <label>Allowlist<textarea id="discordAllowFrom" placeholder="1234567890">${discordAllowFrom}</textarea></label>
        <div class="checkbox-row"><input id="discordAllowBots" type="checkbox" ${checked(state.discord.allowBots)} />Process bot-authored messages</div>
      </div>

      <div class="card">
        <h2>Voice & Calls</h2>
        <p class="description">Configure the Twilio voice-call plugin and ElevenLabs TTS voice.</p>
        <div class="checkbox-row"><input id="voiceEnabled" type="checkbox" ${checked(voiceNumbersInfo.enabled)} />Enable voice-call plugin</div>
        <div class="field-grid">
          <label>From number<input id="voiceFrom" value="${voiceNumbersInfo.from}" placeholder="+13315551234" /></label>
          <label>Default target<input id="voiceTo" value="${voiceNumbersInfo.to}" placeholder="+13315551234" /></label>
          <label>Webhook URL<input id="voiceWebhook" value="${voiceNumbersInfo.webhook}" placeholder="https://example.com/voice" /></label>
          <label>Public URL<input id="voicePublic" value="${voiceNumbersInfo.publicUrl}" placeholder="https://..." /></label>
        </div>
        <div class="field-grid" style="margin-top:16px;">
          <label>Stream path<input id="voiceStreamPath" value="${voiceNumbersInfo.streamPath}" placeholder="/voice/stream" /></label>
          <label>ElevenLabs voice ID<input id="voiceId" value="${voiceNumbersInfo.voiceId}" placeholder="7WFX..." /></label>
          <label>ElevenLabs API key<input id="voiceApiKey" value="${voiceNumbersInfo.apiKey}" placeholder="sk-..." /></label>
        </div>
        <div class="checkbox-row"><input id="voiceStreaming" type="checkbox" ${checked(voiceNumbersInfo.streaming)} />Enable Twilio media streaming</div>
        <div class="actions">
          <button class="primary" data-command="save-all">Save Voice Settings</button>
        </div>
      </div>
      <div class="actions">
        <button class="primary" data-command="save-all">Save All Channel Changes</button>
      </div>
    </section>

    <section id="tab-automation" class="tab" data-tab-panel="automation">
      <div class="card">
        <h2>Health & Doctor</h2>
        <p class="description">Run OpenClaw doctor straight from VS Code. Quick mode uses --non-interactive.</p>
        <div class="actions">
          <button class="primary" data-command="run-doctor" data-mode="quick">Run Doctor (quick)</button>
          <button class="secondary" data-command="run-doctor" data-mode="repair">Run Doctor (repair)</button>
        </div>
        <div class="logs" id="doctorLog">Ready.</div>
      </div>
      <div class="card">
        <h2>Gateway commands</h2>
        <div class="actions">
          <button class="primary" data-command="run-gateway" data-target="status">openclaw status</button>
          <button class="secondary" data-command="run-gateway" data-target="restart">openclaw restart</button>
        </div>
        <div class="logs" id="commandLog">No commands run yet.</div>
      </div>
    </section>

    <section id="tab-advanced" class="tab advanced" data-tab-panel="advanced">
      <div class="card">
        <h2>Advanced JSON editor</h2>
        <p class="description">For power users who still want direct JSON access. Parsed with JSON5 and saved with canonical JSON.</p>
        <textarea id="configRaw">${safeRaw}</textarea>
        <div class="actions">
          <button class="primary" data-command="save-raw">Save Raw JSON</button>
          <button class="secondary" data-command="refresh-config">Reload From Disk</button>
        </div>
      </div>
    </section>
  </main>

  <script>
    (function () {
      var uiDebugEl = document.getElementById('uiDebug');
      function updateUiDebug(message) {
        if (uiDebugEl) {
          uiDebugEl.textContent = message;
        }
      }

      var vscodeApi;
      try {
        vscodeApi = acquireVsCodeApi();
        updateUiDebug('ready');
      } catch (error) {
        updateUiDebug('api unavailable');
        console.error('OpenClaw config UI failed to init VS Code API', error);
        return;
      }

      var tabButtons = Array.prototype.slice.call(document.querySelectorAll('[data-tab]'));
      var tabPanels = Array.prototype.slice.call(document.querySelectorAll('[data-tab-panel]'));

      function switchTab(target) {
        tabButtons.forEach(function (btn) {
          var match = btn.getAttribute('data-tab') === target;
          btn.classList.toggle('active', match);
        });
        tabPanels.forEach(function (panel) {
          var match = panel.getAttribute('data-tab-panel') === target;
          panel.classList.toggle('active', match);
        });
      }

      tabButtons.forEach(function (btn) {
        btn.addEventListener('click', function () {
          var target = btn.getAttribute('data-tab');
          if (target) {
            switchTab(target);
          }
        });
      });

      function activateInitialTab() {
        var defaultTab = document.querySelector('.tab-btn.active');
        if (defaultTab) {
          var target = defaultTab.getAttribute('data-tab');
          if (target) {
            switchTab(target);
            return;
          }
        }
        if (tabButtons.length > 0) {
          var fallback = tabButtons[0].getAttribute('data-tab');
          if (fallback) {
            switchTab(fallback);
          }
        }
      }

      activateInitialTab();

      function normalizeListInput(value) {
        if (!value) {
          return [];
        }
        return value
          .replace(/\r/g, '')
          .split('\\n')
          .reduce(function (acc, line) {
            return acc.concat(line.split(','));
          }, [])
          .map(function (entry) {
            return entry.trim();
          })
          .filter(function (entry) {
            return entry.length > 0;
          });
      }

      function getValue(id) {
        var el = document.getElementById(id);
        return el && 'value' in el ? el.value : '';
      }

      function getChecked(id) {
        var el = document.getElementById(id);
        return !!(el && 'checked' in el && el.checked);
      }

      function setLog(id, text) {
        var el = document.getElementById(id);
        if (el) {
          el.textContent = text;
        }
      }

      function appendLog(id, text) {
        var el = document.getElementById(id);
        if (!el) {
          return;
        }
        var previous = el.textContent || '';
        el.textContent = previous ? previous + '\n' + text : text;
        el.scrollTop = el.scrollHeight;
      }

      function gatherGeneral() {
        return {
          name: getValue('assistantName').trim(),
          emoji: getValue('assistantEmoji').trim(),
          workspace: getValue('workspacePath').trim(),
          responsePrefix: getValue('responsePrefix').trim(),
          model: getValue('defaultModel').trim(),
          imageModel: getValue('imageModel').trim(),
          maxConcurrent: getValue('maxConcurrent'),
          subagentMax: getValue('subagentMax'),
          storageLimit: getValue('storageLimit')
        };
      }

      function gatherGateway() {
        return {
          port: getValue('gatewayPort'),
          bind: getValue('gatewayBind'),
          authMode: getValue('gatewayAuthMode'),
          authToken: getValue('gatewayAuthToken').trim(),
          tailscale: getValue('tailscaleMode'),
          storageLimit: getValue('storageLimit')
        };
      }

      function gatherCommands() {
        return {
          native: getChecked('cmdNative'),
          bash: getChecked('cmdBash'),
          restart: getChecked('cmdRestart')
        };
      }

      function gatherChannels() {
        return {
          whatsapp: {
            enabled: getChecked('whatsappEnabled'),
            dmPolicy: getValue('whatsappDmPolicy'),
            groupPolicy: getValue('whatsappGroupPolicy'),
            allowFrom: normalizeListInput(getValue('whatsappAllowFrom')),
            groupAllowFrom: normalizeListInput(getValue('whatsappGroupAllowFrom')),
            requireMention: getChecked('whatsappRequireMention'),
            selfChatMode: getChecked('whatsappSelfChat'),
            sendReadReceipts: getChecked('whatsappReadReceipts'),
            mediaMaxMb: getValue('whatsappMediaMax')
          },
          telegram: {
            enabled: getChecked('telegramEnabled'),
            botToken: getValue('telegramToken').trim(),
            dmPolicy: getValue('telegramDmPolicy'),
            allowFrom: normalizeListInput(getValue('telegramAllowFrom')),
            requireMention: getChecked('telegramRequireMention'),
            replyToMode: getValue('telegramReplyMode'),
            linkPreview: getChecked('telegramLinkPreview'),
            streamMode: getValue('telegramStreamMode')
          },
          discord: {
            enabled: getChecked('discordEnabled'),
            token: getValue('discordToken').trim(),
            dmPolicy: getValue('discordDmPolicy'),
            allowFrom: normalizeListInput(getValue('discordAllowFrom')),
            replyToMode: getValue('discordReplyMode'),
            allowBots: getChecked('discordAllowBots'),
            textChunkLimit: getValue('discordChunk')
          }
        };
      }

      function gatherVoice() {
        return {
          enabled: getChecked('voiceEnabled'),
          fromNumber: getValue('voiceFrom').trim(),
          toNumber: getValue('voiceTo').trim(),
          webhook: getValue('voiceWebhook').trim(),
          publicUrl: getValue('voicePublic').trim(),
          streamPath: getValue('voiceStreamPath').trim(),
          voiceId: getValue('voiceId').trim(),
          apiKey: getValue('voiceApiKey').trim(),
          streaming: getChecked('voiceStreaming')
        };
      }

      function saveAll() {
        var payload = {
          general: gatherGeneral(),
          channels: gatherChannels(),
          gateway: gatherGateway(),
          commands: gatherCommands(),
          voiceCall: gatherVoice()
        };
        vscodeApi.postMessage({ command: 'saveSections', payload: payload });
      }

      function saveRaw() {
        var editor = document.getElementById('configRaw');
        var raw = editor && 'value' in editor ? editor.value : '';
        vscodeApi.postMessage({ command: 'saveRaw', raw: raw });
      }

      function refresh() {
        vscodeApi.postMessage({ command: 'refresh' });
      }

      function runDoctor(mode) {
        setLog('doctorLog', 'Running openclaw doctor ...');
        vscodeApi.postMessage({ command: 'runDoctor', mode: mode });
      }

      function runGateway(target) {
        setLog('commandLog', 'Running openclaw ' + target + ' ...');
        vscodeApi.postMessage({ command: 'runCommand', target: target });
      }

      function openConfig() {
        vscodeApi.postMessage({ command: 'openConfig' });
      }

      function openState() {
        vscodeApi.postMessage({ command: 'openState' });
      }

      function wireInteractions() {
        tabButtons.forEach(function (btn) {
          btn.addEventListener('click', function () {
            var target = btn.getAttribute('data-tab');
            if (target) {
              switchTab(target);
            }
          });
        });

        Array.prototype.slice.call(document.querySelectorAll('[data-command="save-all"]')).forEach(function (btn) {
          btn.addEventListener('click', saveAll);
        });

        Array.prototype.slice.call(document.querySelectorAll('[data-command="run-doctor"]')).forEach(function (btn) {
          btn.addEventListener('click', function () {
            var mode = btn.getAttribute('data-mode') || 'quick';
            runDoctor(mode);
          });
        });

        Array.prototype.slice.call(document.querySelectorAll('[data-command="run-gateway"]')).forEach(function (btn) {
          btn.addEventListener('click', function () {
            var target = btn.getAttribute('data-target') || 'status';
            runGateway(target);
          });
        });

        var openConfigBtn = document.querySelector('[data-command="open-config"]');
        if (openConfigBtn) {
          openConfigBtn.addEventListener('click', openConfig);
        }

        var openStateBtn = document.querySelector('[data-command="open-state"]');
        if (openStateBtn) {
          openStateBtn.addEventListener('click', openState);
        }

        var saveRawBtn = document.querySelector('[data-command="save-raw"]');
        if (saveRawBtn) {
          saveRawBtn.addEventListener('click', saveRaw);
        }

        var refreshBtn = document.querySelector('[data-command="refresh-config"]');
        if (refreshBtn) {
          refreshBtn.addEventListener('click', refresh);
        }

        activateInitialTab();
      }

      wireInteractions();

      function findCommandTarget(node) {
        var el = node;
        while (el && el !== document.body) {
          if (el.getAttribute && el.getAttribute('data-command')) {
            return el;
          }
          el = el.parentElement;
        }
        return null;
      }

      document.addEventListener('click', function (event) {
        var target = findCommandTarget(event.target);
        if (!target) {
          return;
        }
        var command = target.getAttribute('data-command');
        if (command === 'save-all') {
          event.preventDefault();
          saveAll();
        } else if (command === 'open-config') {
          event.preventDefault();
          openConfig();
        } else if (command === 'open-state') {
          event.preventDefault();
          openState();
        }
      });

      window.addEventListener('message', function (event) {
        var msg = event.data;
        if (!msg) {
          return;
        }
        if (msg.type === 'doctorStream') {
          appendLog('doctorLog', msg.chunk);
        } else if (msg.type === 'doctorResult') {
          var doctorText = msg.ok ? 'Doctor finished successfully.' : 'Doctor exited with code ' + msg.code + '.';
          appendLog('doctorLog', doctorText);
        } else if (msg.type === 'commandStream') {
          appendLog('commandLog', msg.chunk);
        } else if (msg.type === 'commandResult') {
          var commandText = msg.ok ? 'Command completed.' : 'Command failed (code ' + msg.code + ').';
          appendLog('commandLog', commandText);
        } else if (msg.type === 'error') {
          appendLog('doctorLog', msg.message);
        }
      });

    })();
  </script>
</body>
</html>`;
  }

  private _buildGeneralModel(config: Record<string, any>) {
    const defaults = (((config as any).agents?.defaults) ?? {}) as Record<string, any>;
    const identity = (defaults.identity ?? {}) as Record<string, any>;
    const messages = (config.messages ?? {}) as Record<string, any>;
    return {
      name: identity.name ?? '',
      emoji: identity.emoji ?? '',
      workspace: defaults.workspace ?? '',
      responsePrefix: messages.responsePrefix ?? '',
      model: defaults.model?.primary ?? config.model ?? '',
      imageModel: defaults.imageModel?.primary ?? '',
      maxConcurrent: defaults.maxConcurrent,
      subagentMax: defaults.subagents?.maxConcurrent,
      storageLimit: (config.storage?.limitGb) ?? 50
    };
  }

  private _buildWhatsappModel(config: Record<string, any>) {
    const whatsapp = (config.channels?.whatsapp ?? {}) as Record<string, any>;
    const groups = (whatsapp.groups ?? {}) as Record<string, any>;
    const star = groups['*'] ?? {};
    return {
      enabled: whatsapp.enabled !== false,
      dmPolicy: whatsapp.dmPolicy ?? 'pairing',
      groupPolicy: whatsapp.groupPolicy ?? 'allowlist',
      allowFrom: whatsapp.allowFrom ?? [],
      groupAllowFrom: whatsapp.groupAllowFrom ?? [],
      requireMention: star.requireMention ?? false,
      selfChatMode: whatsapp.selfChatMode ?? false,
      sendReadReceipts: whatsapp.sendReadReceipts ?? true,
      mediaMaxMb: whatsapp.mediaMaxMb ?? 50
    };
  }

  private _buildTelegramModel(config: Record<string, any>) {
    const telegram = (config.channels?.telegram ?? {}) as Record<string, any>;
    const groups = (telegram.groups ?? {}) as Record<string, any>;
    const star = groups['*'] ?? {};
    return {
      enabled: telegram.enabled !== false,
      botToken: telegram.botToken ?? '',
      dmPolicy: telegram.dmPolicy ?? 'pairing',
      allowFrom: telegram.allowFrom ?? [],
      requireMention: star.requireMention ?? false,
      replyToMode: telegram.replyToMode ?? 'first',
      linkPreview: telegram.linkPreview ?? true,
      streamMode: telegram.streamMode ?? 'partial'
    };
  }

  private _buildDiscordModel(config: Record<string, any>) {
    const discord = (config.channels?.discord ?? {}) as Record<string, any>;
    return {
      enabled: discord.enabled !== false,
      token: discord.token ?? '',
      dmPolicy: discord.dmPolicy ?? 'pairing',
      allowFrom: discord.allowFrom ?? [],
      replyToMode: discord.replyToMode ?? 'off',
      allowBots: discord.allowBots ?? false,
      textChunkLimit: discord.textChunkLimit ?? 2000
    };
  }

  private _buildGatewayModel(config: Record<string, any>) {
    const gateway = (config.gateway ?? {}) as Record<string, any>;
    const auth = (gateway.auth ?? {}) as Record<string, any>;
    const tailscale = (gateway.tailscale ?? {}) as Record<string, any>;
    return {
      port: gateway.port ?? 18789,
      bind: gateway.bind ?? 'loopback',
      authMode: auth.mode ?? 'token',
      authToken: auth.token ?? '',
      tailscaleMode: tailscale.mode ?? 'off'
    };
  }

  private _buildCommandsModel(config: Record<string, any>) {
    const commands = (config.commands ?? {}) as Record<string, any>;
    return {
      native: commands.native !== false,
      bash: commands.bash !== false,
      restart: commands.restart !== false
    };
  }

  private _buildVoiceCallModel(config: Record<string, any>) {
    const voiceEntry = (config.plugins?.entries?.['voice-call'] ?? {}) as Record<string, any>;
    const voiceConfig = (voiceEntry.config ?? {}) as Record<string, any>;
    const tts = (voiceConfig.tts ?? {}) as Record<string, any>;
    const elevenlabs = (tts.elevenlabs ?? {}) as Record<string, any>;
    return {
      enabled: voiceEntry.enabled !== false,
      fromNumber: voiceConfig.fromNumber ?? '',
      toNumber: voiceConfig.toNumber ?? '',
      webhook: voiceConfig.publicUrl ? voiceConfig.publicUrl : voiceConfig.webhook,
      publicUrl: voiceConfig.publicUrl ?? '',
      streamPath: voiceConfig.streaming?.streamPath ?? voiceConfig.streamPath ?? '',
      voiceId: elevenlabs.voiceId ?? '',
      apiKey: elevenlabs.apiKey ?? '',
      streaming: voiceConfig.streaming?.enabled ?? false
    };
  }

  private _applyGeneral(config: Record<string, any>, general: Record<string, unknown>) {
    config.agents = config.agents ?? {};
    config.agents.defaults = config.agents.defaults ?? {};
    const defaults = config.agents.defaults;
    defaults.identity = defaults.identity ?? {};
    if (general.name) defaults.identity.name = general.name;
    else delete defaults.identity.name;
    if (general.emoji) defaults.identity.emoji = general.emoji;
    else delete defaults.identity.emoji;
    if (general.workspace) defaults.workspace = general.workspace;
    else delete defaults.workspace;

    defaults.model = defaults.model ?? {};
    if (general.model) defaults.model.primary = general.model;
    if (general.imageModel) {
      defaults.imageModel = defaults.imageModel ?? {};
      defaults.imageModel.primary = general.imageModel;
    }

    const max = this._asNumber(general.maxConcurrent);
    if (max !== undefined) defaults.maxConcurrent = max;
    else delete defaults.maxConcurrent;

    const subMax = this._asNumber(general.subagentMax);
    if (subMax !== undefined) {
      defaults.subagents = defaults.subagents ?? {};
      defaults.subagents.maxConcurrent = subMax;
    } else if (defaults.subagents) {
      delete defaults.subagents.maxConcurrent;
      if (!Object.keys(defaults.subagents).length) delete defaults.subagents;
    }

    config.messages = config.messages ?? {};
    if (general.responsePrefix) config.messages.responsePrefix = general.responsePrefix;
    else delete config.messages.responsePrefix;

    config.storage = config.storage ?? {};
    const quota = this._asNumber(general.storageLimit);
    if (quota !== undefined) config.storage.limitGb = quota;
  }

  private _applyChannels(config: Record<string, any>, channelsPayload: Record<string, unknown>) {
    config.channels = config.channels ?? {};
    const channels = config.channels;

    if (channelsPayload.whatsapp) {
      channels.whatsapp = channels.whatsapp ?? {};
      const target = channels.whatsapp;
      const payload = channelsPayload.whatsapp as Record<string, any>;
      target.enabled = payload.enabled !== false;
      target.dmPolicy = payload.dmPolicy || 'pairing';
      target.groupPolicy = payload.groupPolicy || 'allowlist';
      target.allowFrom = Array.isArray(payload.allowFrom) ? payload.allowFrom : [];
      target.groupAllowFrom = Array.isArray(payload.groupAllowFrom) ? payload.groupAllowFrom : [];
      const media = this._asNumber(payload.mediaMaxMb);
      if (media !== undefined) target.mediaMaxMb = media;
      target.selfChatMode = Boolean(payload.selfChatMode);
      target.sendReadReceipts = payload.sendReadReceipts !== false;
      target.groups = target.groups ?? {};
      target.groups['*'] = target.groups['*'] ?? {};
      target.groups['*'].requireMention = Boolean(payload.requireMention);
    }

    if (channelsPayload.telegram) {
      channels.telegram = channels.telegram ?? {};
      const target = channels.telegram;
      const payload = channelsPayload.telegram as Record<string, any>;
      target.enabled = payload.enabled !== false;
      if (payload.botToken) target.botToken = payload.botToken;
      target.dmPolicy = payload.dmPolicy || 'pairing';
      target.allowFrom = Array.isArray(payload.allowFrom) ? payload.allowFrom : [];
      target.replyToMode = payload.replyToMode || 'first';
      target.linkPreview = payload.linkPreview !== false;
      target.streamMode = payload.streamMode || 'partial';
      target.groups = target.groups ?? {};
      target.groups['*'] = target.groups['*'] ?? {};
      target.groups['*'].requireMention = Boolean(payload.requireMention);
    }

    if (channelsPayload.discord) {
      channels.discord = channels.discord ?? {};
      const target = channels.discord;
      const payload = channelsPayload.discord as Record<string, any>;
      target.enabled = payload.enabled !== false;
      if (payload.token) target.token = payload.token;
      target.dmPolicy = payload.dmPolicy || 'pairing';
      target.allowFrom = Array.isArray(payload.allowFrom) ? payload.allowFrom : [];
      target.replyToMode = payload.replyToMode || 'off';
      target.allowBots = Boolean(payload.allowBots);
      const chunk = this._asNumber(payload.textChunkLimit);
      if (chunk !== undefined) target.textChunkLimit = chunk;
    }
  }

  private _applyGateway(config: Record<string, any>, gatewayPayload: Record<string, unknown>) {
    config.gateway = config.gateway ?? {};
    const gateway = config.gateway;
    if (gatewayPayload.port) {
      const port = this._asNumber(gatewayPayload.port);
      if (port !== undefined) gateway.port = port;
    }
    if (gatewayPayload.bind) gateway.bind = gatewayPayload.bind;
    gateway.auth = gateway.auth ?? {};
    if (gatewayPayload.authMode) gateway.auth.mode = gatewayPayload.authMode;
    if (gatewayPayload.authToken) gateway.auth.token = gatewayPayload.authToken;
    gateway.tailscale = gateway.tailscale ?? {};
    if (gatewayPayload.tailscale) gateway.tailscale.mode = gatewayPayload.tailscale;

    if (gatewayPayload.storageLimit) {
      const lim = this._asNumber(gatewayPayload.storageLimit);
      if (lim !== undefined) {
        config.storage = config.storage ?? {};
        config.storage.limitGb = lim;
      }
    }
  }

  private _applyCommands(config: Record<string, any>, commandsPayload: Record<string, unknown>) {
    config.commands = config.commands ?? {};
    config.commands.native = commandsPayload.native !== false;
    config.commands.bash = commandsPayload.bash !== false;
    config.commands.restart = commandsPayload.restart !== false;
  }

  private _applyVoiceCall(config: Record<string, any>, voicePayload: Record<string, unknown>) {
    config.plugins = config.plugins ?? {};
    config.plugins.entries = config.plugins.entries ?? {};
    const entries = config.plugins.entries;
    entries['voice-call'] = entries['voice-call'] ?? { enabled: true, config: {} };
    const entry = entries['voice-call'];
    entry.enabled = voicePayload.enabled !== false;
    entry.config = entry.config ?? {};
    const cfg = entry.config;
    if (voicePayload.fromNumber) cfg.fromNumber = voicePayload.fromNumber;
    if (voicePayload.toNumber) cfg.toNumber = voicePayload.toNumber;
    if (voicePayload.webhook) cfg.webhook = voicePayload.webhook;
    if (voicePayload.publicUrl) cfg.publicUrl = voicePayload.publicUrl;
    cfg.streaming = cfg.streaming ?? {};
    cfg.streaming.enabled = voicePayload.streaming === true;
    if (voicePayload.streamPath) cfg.streaming.streamPath = voicePayload.streamPath;
    cfg.tts = cfg.tts ?? { provider: 'elevenlabs' };
    cfg.tts.provider = 'elevenlabs';
    cfg.tts.elevenlabs = cfg.tts.elevenlabs ?? {};
    if (voicePayload.voiceId) cfg.tts.elevenlabs.voiceId = voicePayload.voiceId;
    if (voicePayload.apiKey) cfg.tts.elevenlabs.apiKey = voicePayload.apiKey;
  }

  private _asNumber(value: Nullable<unknown>) {
    if (value === undefined || value === null || value === '') return undefined;
    const num = Number(value);
    return Number.isFinite(num) ? num : undefined;
  }

  private _postToWebview(message: unknown) {
    void this._panel.webview.postMessage(message);
  }

  private async _runDoctor(mode: 'quick' | 'repair') {
    const cli = await this._findOpenClawPath();
    if (!cli) {
      vscode.window.showErrorMessage('Cannot find openclaw CLI');
      this._postToWebview({ type: 'doctorResult', ok: false, code: -1 });
      return;
    }
    const args = ['doctor'];
    if (mode === 'quick') args.push('--non-interactive');
    else args.push('--repair', '--yes');
    this._doctorProcess?.kill();
    const child = cp.spawn(cli, args, { env: this._buildExecEnv(), cwd: os.homedir() });
    this._doctorProcess = child;
    child.stdout.on('data', chunk => this._postToWebview({ type: 'doctorStream', chunk: chunk.toString() }));
    child.stderr.on('data', chunk => this._postToWebview({ type: 'doctorStream', chunk: chunk.toString() }));
    child.on('close', code => {
      this._postToWebview({ type: 'doctorResult', ok: code === 0, code });
      this._doctorProcess = undefined;
      void this._update();
    });
    child.on('error', err => {
      this._postToWebview({ type: 'doctorStream', chunk: err.message });
      this._postToWebview({ type: 'doctorResult', ok: false, code: -1 });
      this._doctorProcess = undefined;
    });
  }

  private async _runGatewayUtility(target: string) {
    const cli = await this._findOpenClawPath();
    if (!cli) {
      vscode.window.showErrorMessage('Cannot find openclaw CLI');
      this._postToWebview({ type: 'commandResult', ok: false, code: -1 });
      return;
    }
    const args = target === 'restart' ? ['gateway', 'restart'] : ['status'];
    const child = cp.spawn(cli, args, { env: this._buildExecEnv(), cwd: os.homedir() });
    child.stdout.on('data', chunk => this._postToWebview({ type: 'commandStream', chunk: chunk.toString() }));
    child.stderr.on('data', chunk => this._postToWebview({ type: 'commandStream', chunk: chunk.toString() }));
    child.on('close', code => {
      this._postToWebview({ type: 'commandResult', ok: code === 0, code });
    });
    child.on('error', err => {
      this._postToWebview({ type: 'commandStream', chunk: err.message });
      this._postToWebview({ type: 'commandResult', ok: false, code: -1 });
    });
  }

  private async _findOpenClawPath(): Promise<string | undefined> {
    const cfgPath = vscode.workspace.getConfiguration('openclaw').get<string>('cliPath');
    if (cfgPath && fs.existsSync(cfgPath)) return cfgPath;

    const envPath = process.env.OPENCLAW_CLI;
    if (envPath && fs.existsSync(envPath)) return envPath;

    const preferred = await this._runCommand(process.platform === 'win32' ? 'where openclaw' : 'which openclaw', 2000);
    if (!preferred.error) {
      const candidate = preferred.stdout.trim().split(/\r?\n/)[0]?.trim();
      if (candidate && fs.existsSync(candidate)) return candidate;
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
      const programFiles = process.env.ProgramFiles || 'C:/Program Files';
      return [
        path.join(appData, 'npm', 'openclaw.cmd'),
        path.join(appData, 'npm', 'openclaw.exe'),
        path.join(localAppData, 'Programs', 'OpenClaw', 'openclaw.exe'),
        path.join(programFiles, 'OpenClaw', 'openclaw.exe'),
        path.join(home, '.npm-global', 'bin', 'openclaw.cmd')
      ];
    }
    if (process.platform === 'darwin') {
      return [
        '/opt/homebrew/bin/openclaw',
        '/usr/local/bin/openclaw',
        path.join(home, '.local', 'bin', 'openclaw'),
        path.join(home, '.npm-global', 'bin', 'openclaw')
      ];
    }
    return [
      '/usr/local/bin/openclaw',
      '/usr/bin/openclaw',
      path.join(home, '.local', 'bin', 'openclaw'),
      path.join(home, '.npm-global', 'bin', 'openclaw')
    ];
  }

  private _runCommand(cmd: string, timeoutMs: number) {
    return new Promise<{ stdout: string; stderr: string; error?: string }>(resolve => {
      cp.exec(cmd, { timeout: timeoutMs, env: this._buildExecEnv() }, (error, stdout, stderr) => {
        resolve({ stdout: stdout?.toString() ?? '', stderr: stderr?.toString() ?? '', error: error?.message });
      });
    });
  }

  private _buildExecEnv() {
    const env = { ...process.env } as Record<string, string>;
    const paths = [env.PATH ?? ''];
    const home = os.homedir();
    if (process.platform === 'win32') {
      const appData = env.APPDATA || path.join(home, 'AppData', 'Roaming');
      paths.push(path.join(appData, 'npm'));
    } else {
      paths.push('/usr/local/bin', '/usr/bin', path.join(home, '.local', 'bin'), path.join(home, '.npm-global', 'bin'));
    }
    env.PATH = paths.filter(Boolean).join(process.platform === 'win32' ? ';' : ':');
    return env;
  }
}
