import * as vscode from 'vscode';
import * as cp from 'child_process';

export class StatusPanel {
  public static currentPanel: StatusPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel) {
    this._panel = panel;
    this._update();
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage(msg => {
      if (msg.command === 'refresh') {
        this._update();
      } else if (msg.command === 'gateway-start') {
        this._runGateway('start');
      } else if (msg.command === 'gateway-stop') {
        this._runGateway('stop');
      }
    }, null, this._disposables);
  }

  public static createOrShow(extensionUri: vscode.Uri) {
    if (StatusPanel.currentPanel) {
      StatusPanel.currentPanel._panel.reveal();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'openclawStatus', 'OpenClaw Status', vscode.ViewColumn.One,
      { enableScripts: true }
    );
    StatusPanel.currentPanel = new StatusPanel(panel);
  }

  public dispose() {
    StatusPanel.currentPanel = undefined;
    this._panel.dispose();
    this._disposables.forEach(d => d.dispose());
  }

  private _runGateway(action: string) {
    try {
      cp.execSync(`openclaw gateway ${action}`, { timeout: 10000 });
      vscode.window.showInformationMessage(`OpenClaw gateway ${action} successful.`);
    } catch {
      vscode.window.showErrorMessage(`Failed to ${action} OpenClaw gateway.`);
    }
    this._update();
  }

  private _update() {
    let running = false;
    let details = 'OpenClaw gateway not detected.';

    try {
      const out = cp.execSync('openclaw gateway status', { timeout: 5000 }).toString().trim();
      running = out.toLowerCase().includes('running');
      details = out;
    } catch {
      // gateway not installed or not running
    }

    this._panel.webview.html = this._getHtml(running, details);
  }

  private _getHtml(running: boolean, details: string): string {
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
      padding: 30px;
    }
    h2 { color: #dc2828; margin-bottom: 20px; }
    .status-row {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 20px;
    }
    .indicator {
      width: 12px; height: 12px; border-radius: 50%;
    }
    .on { background: #4ade80; box-shadow: 0 0 8px rgba(74,222,128,0.4); }
    .off { background: #ef4444; box-shadow: 0 0 8px rgba(239,68,68,0.4); }
    pre {
      background: #2a2a2a;
      padding: 12px;
      border-radius: 6px;
      margin-bottom: 20px;
      overflow-x: auto;
      font-size: 12px;
      color: #aaa;
    }
    .actions { display: flex; gap: 8px; }
    button {
      padding: 8px 18px;
      border-radius: 6px;
      border: none;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-start { background: #4ade80; color: #1a1a1a; }
    .btn-stop { background: #ef4444; color: #fff; }
    .btn-refresh { background: #333; color: #aaa; border: 1px solid #555; }
  </style>
</head>
<body>
  <h2>📡 OpenClaw Gateway Status</h2>
  <div class="status-row">
    <span class="indicator ${running ? 'on' : 'off'}"></span>
    <span>${running ? 'Running' : 'Not Running'}</span>
  </div>
  <pre>${details}</pre>
  <div class="actions">
    ${running
      ? '<button class="btn-stop" onclick="cmd(\'gateway-stop\')">Stop Gateway</button>'
      : '<button class="btn-start" onclick="cmd(\'gateway-start\')">Start Gateway</button>'}
    <button class="btn-refresh" onclick="cmd('refresh')">Refresh</button>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    function cmd(c) { vscode.postMessage({ command: c }); }
  </script>
</body>
</html>`;
  }
}
