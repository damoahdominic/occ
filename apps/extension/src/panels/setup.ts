import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export class ConfigPanel {
  public static currentPanel: ConfigPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];
  private static readonly CONFIG_PATH = path.join(os.homedir(), '.openclaw', 'openclaw.json');

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
    ConfigPanel.currentPanel = undefined;
    this._panel.dispose();
    this._disposables.forEach(d => d.dispose());
  }

  private _readConfig(): Record<string, unknown> {
    try {
      const raw = fs.readFileSync(ConfigPanel.CONFIG_PATH, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  private _saveConfig(config: Record<string, unknown>) {
    try {
      const dir = path.dirname(ConfigPanel.CONFIG_PATH);
      if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
      fs.writeFileSync(ConfigPanel.CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
      vscode.window.showInformationMessage('OpenClaw configuration saved.');
      this._update();
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      vscode.window.showErrorMessage(`Failed to save config: ${errMsg}`);
    }
  }

  private _update() {
    const config = this._readConfig();
    this._panel.webview.html = this._getHtml(config);
  }

  private _getHtml(config: Record<string, unknown>): string {
    const model = (config.model as string) || '';
    const channels = config.channels || {};
    const channelsJson = JSON.stringify(channels, null, 2);

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family, sans-serif);
      background: #1a1a1a;
      color: #e0e0e0;
      padding: 24px;
    }
    h2 { color: #dc2828; margin-bottom: 20px; font-size: 20px; }
    label {
      display: block;
      font-size: 12px;
      color: #aaa;
      margin-bottom: 4px;
      margin-top: 16px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    input, textarea {
      width: 100%;
      background: #2a2a2a;
      border: 1px solid #444;
      color: #e0e0e0;
      padding: 8px 12px;
      border-radius: 6px;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 13px;
    }
    input:focus, textarea:focus {
      outline: none;
      border-color: #dc2828;
    }
    textarea { min-height: 120px; resize: vertical; }
    .actions { margin-top: 24px; display: flex; gap: 8px; }
    button {
      padding: 8px 20px;
      border-radius: 6px;
      border: none;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-save { background: #dc2828; color: #fff; }
    .btn-save:hover { background: #b91c1c; }
    .btn-refresh { background: #333; color: #aaa; border: 1px solid #555; }
    .btn-refresh:hover { background: #444; }
    .note {
      margin-top: 20px;
      font-size: 11px;
      color: #666;
    }
  </style>
</head>
<body>
  <h2>⚙️ OpenClaw Configuration</h2>
  <p style="color:#888;font-size:13px;margin-bottom:8px;">
    Editing <code>~/.openclaw/openclaw.json</code>
  </p>

  <label>Model</label>
  <input id="model" type="text" value="${model}" placeholder="e.g. claude-sonnet-4-20250514" />

  <label>Channels (JSON)</label>
  <textarea id="channels">${channelsJson.replace(/</g, '&lt;')}</textarea>

  <div class="actions">
    <button class="btn-save" onclick="save()">Save</button>
    <button class="btn-refresh" onclick="vscode.postMessage({command:'refresh'})">Reload</button>
  </div>

  <p class="note">Changes are written directly to your OpenClaw config file.</p>

  <script>
    const vscode = acquireVsCodeApi();
    function save() {
      let channels;
      try {
        channels = JSON.parse(document.getElementById('channels').value);
      } catch(e) {
        channels = {};
        alert('Invalid JSON in channels field — saving as empty object.');
      }
      const config = ${JSON.stringify(config)};
      config.model = document.getElementById('model').value;
      config.channels = channels;
      vscode.postMessage({ command: 'save', config });
    }
  </script>
</body>
</html>`;
  }
}
