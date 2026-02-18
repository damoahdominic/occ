import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

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

export class ConfigPanel {
  public static currentPanel: ConfigPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];
  private _disposed = false;
  private static readonly CONFIG_PATH = path.join(os.homedir(), '.openclaw', 'openclaw.json');
  private static _customPath: string | undefined;

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
    this._update();
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage(msg => {
      if (msg.command === 'save') {
        this._saveConfig(msg.config);
      } else if (msg.command === 'refresh') {
        this._update();
      }
    }, null, this._disposables);
  }

  public static createOrShow(extensionUri: vscode.Uri) {
    if (ConfigPanel.currentPanel) {
      ConfigPanel.currentPanel._panel.reveal();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'openclawConfig', 'OpenClaw Configuration', vscode.ViewColumn.Two,
      { enableScripts: true }
    );
    ConfigPanel.currentPanel = new ConfigPanel(panel);
  }

  public dispose() {
    this._disposed = true;
    ConfigPanel.currentPanel = undefined;
    this._panel.dispose();
    this._disposables.forEach(d => d.dispose());
  }

  private _readConfig(): Record<string, unknown> {
    try {
      const raw = fs.readFileSync(ConfigPanel._getConfigPath(), 'utf-8');
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  private _saveConfig(config: Record<string, unknown>) {
    try {
      const targetPath = ConfigPanel._getConfigPath();
      const dir = path.dirname(targetPath);
      if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
      fs.writeFileSync(targetPath, JSON.stringify(config, null, 2), 'utf-8');
      vscode.window.showInformationMessage('OpenClaw configuration saved.');
      this._update();
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      vscode.window.showErrorMessage(`Failed to save config: ${errMsg}`);
    }
  }

  private _update() {
    if (this._disposed) return;
    const config = this._readConfig();
    const targetPath = ConfigPanel._getConfigPath();
    if (this._disposed) return;
    this._panel.webview.html = this._getHtml(config, targetPath);
  }

  private _getHtml(config: Record<string, unknown>, configPath: string): string {
    const model =
      (config.model as string) ||
      (((config as any).agents?.defaults?.model?.primary) as string) ||
      '';
    const channels = (config.channels && typeof config.channels === 'object') ? config.channels : {};
    const channelEntries = (channels && typeof channels === 'object')
      ? Object.entries(channels as Record<string, unknown>)
      : [];
    const channelRows = channelEntries.length
      ? channelEntries.map(([key, value]) => {
        const valueText = typeof value === 'string' ? value : JSON.stringify(value);
        return `
          <div class="channel-row">
            <input class="channel-name" type="text" value="${escapeHtml(key)}" placeholder="e.g. default" />
            <input class="channel-value" type="text" value="${escapeHtml(valueText)}" placeholder="URL, token, or JSON" />
            <button class="icon-btn" title="Remove" onclick="removeRow(this)">x</button>
          </div>
        `;
      }).join('\n')
      : `
        <div class="channel-row">
          <input class="channel-name" type="text" placeholder="e.g. default" />
          <input class="channel-value" type="text" placeholder="URL, token, or JSON" />
          <button class="icon-btn" title="Remove" onclick="removeRow(this)">x</button>
        </div>
      `;

    const configJson = JSON.stringify(config, null, 2);
    const safeConfig = escapeHtml(configJson);
    const safeConfigPath = escapeHtml(configPath);
    const safeModel = escapeHtml(model);

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family, sans-serif);
      background: radial-gradient(circle at top left, #261313, #151515 35%, #101010 70%);
      color: #e6e6e6;
      padding: 28px;
    }
    .page { max-width: 920px; margin: 0 auto; }
    .hero {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 12px;
      flex-wrap: wrap;
    }
    .path-pill {
      background: rgba(15,15,15,0.7);
      border: 1px solid #2b2b2b;
      color: #bdbdbd;
      padding: 8px 12px;
      border-radius: 999px;
      font-size: 12px;
    }
    h2 { color: #ff4b4b; margin-bottom: 6px; font-size: 22px; }
    .subtitle {
      color: #b6b6b6;
      font-size: 13px;
      margin-bottom: 18px;
    }
    .card {
      background: rgba(20,20,20,0.75);
      border: 1px solid #2b2b2b;
      border-radius: 12px;
      padding: 18px;
      margin-bottom: 16px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.35);
    }
    .section-title {
      font-size: 14px;
      font-weight: 700;
      color: #f5f5f5;
      margin-bottom: 8px;
    }
    .section-hint {
      font-size: 12px;
      color: #9a9a9a;
      margin-bottom: 12px;
    }
    label {
      display: block;
      font-size: 12px;
      color: #bdbdbd;
      margin-bottom: 6px;
      margin-top: 10px;
      font-weight: 600;
    }
    input, textarea, select {
      width: 100%;
      background: #1f1f1f;
      border: 1px solid #3a3a3a;
      color: #f0f0f0;
      padding: 10px 12px;
      border-radius: 8px;
      font-family: var(--vscode-editor-font-family, sans-serif);
      font-size: 14px;
    }
    input:focus, textarea:focus, select:focus {
      outline: none;
      border-color: #ff4b4b;
      box-shadow: 0 0 0 2px rgba(255, 75, 75, 0.15);
    }
    textarea { min-height: 160px; resize: vertical; }
    .actions { margin-top: 16px; display: flex; gap: 10px; flex-wrap: wrap; }
    button {
      padding: 10px 18px;
      border-radius: 8px;
      border: none;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }
    .chips { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
    .chip {
      background: #1f1f1f;
      color: #e0e0e0;
      border: 1px solid #3a3a3a;
      padding: 6px 10px;
      border-radius: 999px;
      font-size: 12px;
      cursor: pointer;
    }
    .chip:hover { border-color: #ff4b4b; color: #fff; }
    .btn-save { background: #ff4b4b; color: #fff; }
    .btn-save:hover { background: #dc2828; }
    .btn-secondary { background: #2c2c2c; color: #cfcfcf; border: 1px solid #3a3a3a; }
    .btn-secondary:hover { background: #3a3a3a; }
    .channel-row {
      display: grid;
      grid-template-columns: 1fr 2fr auto;
      gap: 8px;
      margin-bottom: 8px;
    }
    .icon-btn {
      background: #2b2b2b;
      border: 1px solid #3a3a3a;
      color: #bdbdbd;
      padding: 0 10px;
      border-radius: 8px;
      height: 40px;
    }
    .icon-btn:hover { background: #3a3a3a; color: #fff; }
    .hint {
      font-size: 12px;
      color: #8c8c8c;
      margin-top: 6px;
    }
    .error {
      display: none;
      background: rgba(255, 75, 75, 0.1);
      border: 1px solid rgba(255, 75, 75, 0.4);
      color: #ff9b9b;
      padding: 10px 12px;
      border-radius: 8px;
      margin-bottom: 12px;
      font-size: 12px;
    }
    .error.show { display: block; }
    details {
      margin-top: 10px;
      border: 1px dashed #3a3a3a;
      border-radius: 8px;
      padding: 10px 12px;
      background: rgba(10,10,10,0.5);
    }
    summary {
      cursor: pointer;
      font-weight: 600;
      color: #cfcfcf;
      font-size: 13px;
    }
    .note {
      margin-top: 12px;
      font-size: 11px;
      color: #7a7a7a;
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="hero">
      <div>
        <h2>OpenClaw Setup</h2>
        <div class="subtitle">Simple, guided setup. Save when you are done.</div>
      </div>
      <div class="path-pill">Config: <code>${safeConfigPath}</code></div>
    </div>

    <div id="error" class="error"></div>

    <div class="card">
      <div class="section-title">Model</div>
      <div class="section-hint">Pick a model or type your own.</div>
      <input id="model" type="text" list="model-list" value="${safeModel}" placeholder="e.g. claude-sonnet-4-20250514" />
      <datalist id="model-list">
        <option value="claude-sonnet-4-20250514"></option>
        <option value="claude-3-5-sonnet"></option>
        <option value="gpt-4o-mini"></option>
        <option value="gpt-4o"></option>
        <option value="o3-mini"></option>
      </datalist>
      <div class="chips">
        <button class="chip" onclick="setModel('claude-sonnet-4-20250514')">claude-sonnet-4-20250514</button>
        <button class="chip" onclick="setModel('claude-3-5-sonnet')">claude-3-5-sonnet</button>
        <button class="chip" onclick="setModel('gpt-4o-mini')">gpt-4o-mini</button>
        <button class="chip" onclick="setModel('gpt-4o')">gpt-4o</button>
      </div>
      <div class="hint">If you are unsure, leave it as-is.</div>
    </div>

    <div class="card">
      <div class="section-title">Channels</div>
      <div class="section-hint">One row per channel. Name is a label, value is a URL or token.</div>
      <div id="channels">${channelRows}</div>
      <div class="actions">
        <button class="btn-secondary" onclick="addRow()">Add Channel</button>
        <button class="btn-secondary" onclick="addExample()">Add Example</button>
      </div>
      <div class="hint">Example: name "default", value "https://example.com"</div>
    </div>

    <div class="actions">
      <button class="btn-save" onclick="save()">Save Settings</button>
      <button class="btn-secondary" onclick="refresh()">Reload From File</button>
    </div>

    <details>
      <summary>Advanced (JSON)</summary>
      <p class="section-hint" style="margin-top:8px;">Only edit if you know what you are doing.</p>
      <textarea id="configRaw">${safeConfig}</textarea>
      <div class="actions">
        <button class="btn-secondary" onclick="saveAdvanced()">Save Advanced JSON</button>
      </div>
    </details>

    <p class="note">Changes are written directly to your OpenClaw config file.</p>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const errorEl = document.getElementById('error');

    function showError(message) {
      errorEl.textContent = message;
      errorEl.classList.add('show');
    }
    function clearError() {
      errorEl.textContent = '';
      errorEl.classList.remove('show');
    }

    function addRow(name = '', value = '') {
      const container = document.getElementById('channels');
      const row = document.createElement('div');
      row.className = 'channel-row';
      row.innerHTML = \`
        <input class="channel-name" type="text" value="\${name}" placeholder="e.g. default" />
        <input class="channel-value" type="text" value="\${value}" placeholder="URL, token, or JSON" />
        <button class="icon-btn" title="Remove" onclick="removeRow(this)">x</button>
      \`;
      container.appendChild(row);
    }

    function addExample() {
      addRow('default', 'https://example.com');
    }

    function setModel(value) {
      document.getElementById('model').value = value;
    }

    function removeRow(btn) {
      const row = btn.closest('.channel-row');
      if (row) row.remove();
    }

    function refresh() {
      vscode.postMessage({ command:'refresh' });
    }

    function buildChannels() {
      const rows = [...document.querySelectorAll('.channel-row')];
      const channels = {};
      for (const row of rows) {
        const name = row.querySelector('.channel-name').value.trim();
        const valueRaw = row.querySelector('.channel-value').value.trim();
        if (!name) continue;
        if (!valueRaw) {
          channels[name] = '';
          continue;
        }
        if ((valueRaw.startsWith('{') && valueRaw.endsWith('}')) || (valueRaw.startsWith('[') && valueRaw.endsWith(']'))) {
          try {
            channels[name] = JSON.parse(valueRaw);
            continue;
          } catch (e) {
            channels[name] = valueRaw;
            continue;
          }
        }
        channels[name] = valueRaw;
      }
      return channels;
    }

    function applyUpdates(config, model, channels) {
      const configEmpty = Object.keys(config).length === 0;
      const hasTopModel = Object.prototype.hasOwnProperty.call(config, 'model');
      const hasTopChannels = Object.prototype.hasOwnProperty.call(config, 'channels');
      const hasAgentsModel =
        config &&
        config.agents &&
        config.agents.defaults &&
        config.agents.defaults.model &&
        Object.prototype.hasOwnProperty.call(config.agents.defaults.model, 'primary');

      if (hasTopModel || configEmpty) {
        config.model = model;
      }
      if (hasTopChannels || configEmpty) {
        config.channels = channels;
      }
      if (hasAgentsModel) {
        config.agents.defaults.model.primary = model;
      }
    }

    function save() {
      clearError();
      const model = document.getElementById('model').value.trim();
      const channels = buildChannels();
      let config;
      try {
        config = JSON.parse(document.getElementById('configRaw').value);
      } catch (err) {
        config = {};
      }
      applyUpdates(config, model, channels);
      document.getElementById('configRaw').value = JSON.stringify(config, null, 2);
      vscode.postMessage({ command: 'save', config });
    }

    function saveAdvanced() {
      clearError();
      let config;
      try {
        config = JSON.parse(document.getElementById('configRaw').value);
      } catch (err) {
        showError('Advanced JSON is invalid. Please fix it before saving.');
        return;
      }
      vscode.postMessage({ command: 'save', config });
    }
  </script>
</body>
</html>`;
  }
}
