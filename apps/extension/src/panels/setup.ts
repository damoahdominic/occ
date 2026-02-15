import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as os from 'os';

interface CheckResult {
  name: string;
  found: boolean;
  version?: string;
}

function checkCommand(cmd: string, versionFlag = '--version'): CheckResult {
  try {
    const out = cp.execSync(`${cmd} ${versionFlag}`, { timeout: 5000 }).toString().trim();
    return { name: cmd, found: true, version: out.split('\n')[0] };
  } catch {
    return { name: cmd, found: false };
  }
}

export class SetupPanel {
  public static currentPanel: SetupPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel) {
    this._panel = panel;
    this._update();
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage(msg => {
      if (msg.command === 'refresh') { this._update(); }
    }, null, this._disposables);
  }

  public static createOrShow(extensionUri: vscode.Uri) {
    if (SetupPanel.currentPanel) {
      SetupPanel.currentPanel._panel.reveal();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'openclawSetup', 'OpenClaw Setup', vscode.ViewColumn.One, { enableScripts: true }
    );
    SetupPanel.currentPanel = new SetupPanel(panel);
  }

  public dispose() {
    SetupPanel.currentPanel = undefined;
    this._panel.dispose();
    this._disposables.forEach(d => d.dispose());
  }

  private _update() {
    const platform = `${os.type()} ${os.release()} (${os.arch()})`;
    const checks = [
      checkCommand('git'),
      checkCommand('node'),
      checkCommand('npm'),
      checkCommand('docker'),
    ];
    this._panel.webview.html = this._getHtml(platform, checks);
  }

  private _getHtml(platform: string, checks: CheckResult[]): string {
    const rows = checks.map(c => `
      <tr>
        <td>${c.found ? '✅' : '❌'}</td>
        <td>${c.name}</td>
        <td>${c.found ? c.version : 'Not found'}</td>
      </tr>`).join('');

    const allGood = checks.filter(c => ['git', 'node'].includes(c.name)).every(c => c.found);

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {
      font-family: var(--vscode-font-family);
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      padding: 30px;
    }
    h2 { color: #00d4aa; }
    table { border-collapse: collapse; margin: 16px 0; }
    td { padding: 6px 16px 6px 0; }
    .platform { color: var(--vscode-descriptionForeground); margin-bottom: 20px; }
    button {
      background: #00d4aa; color: #1a1a2e; border: none; padding: 8px 16px;
      border-radius: 4px; cursor: pointer; font-weight: 600; margin-right: 8px;
    }
    .status { margin-top: 16px; padding: 12px; border-radius: 4px; }
    .ok { background: rgba(0,212,170,0.1); }
    .warn { background: rgba(255,165,0,0.1); }
  </style>
</head>
<body>
  <h2>🔧 OpenClaw Local Setup</h2>
  <p class="platform">Detected: ${platform}</p>

  <h3>Prerequisites</h3>
  <table>${rows}</table>

  ${allGood
    ? '<div class="status ok">✅ Core prerequisites met! You can proceed with OpenClaw setup.</div>'
    : '<div class="status warn">⚠️ Please install missing prerequisites (git, node) before continuing.</div>'}

  <br>
  <button onclick="vscode.postMessage({command:'refresh'})">Re-check</button>

  <script>const vscode = acquireVsCodeApi();</script>
</body>
</html>`;
  }
}
