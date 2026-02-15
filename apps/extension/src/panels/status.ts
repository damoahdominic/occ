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
      if (msg.command === 'refresh') { this._update(); }
    }, null, this._disposables);
  }

  public static createOrShow(extensionUri: vscode.Uri) {
    if (StatusPanel.currentPanel) {
      StatusPanel.currentPanel._panel.reveal();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'openclawStatus', 'OpenClaw Status', vscode.ViewColumn.One, { enableScripts: true }
    );
    StatusPanel.currentPanel = new StatusPanel(panel);
  }

  public dispose() {
    StatusPanel.currentPanel = undefined;
    this._panel.dispose();
    this._disposables.forEach(d => d.dispose());
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
    body {
      font-family: var(--vscode-font-family);
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      padding: 30px;
    }
    h2 { color: #00d4aa; }
    .indicator {
      display: inline-block; width: 12px; height: 12px; border-radius: 50%;
      margin-right: 8px;
    }
    .on { background: #00d4aa; }
    .off { background: #e74c3c; }
    pre {
      background: var(--vscode-textCodeBlock-background);
      padding: 12px; border-radius: 4px; margin-top: 16px;
      overflow-x: auto;
    }
    button {
      background: #00d4aa; color: #1a1a2e; border: none; padding: 8px 16px;
      border-radius: 4px; cursor: pointer; font-weight: 600; margin-top: 16px;
    }
  </style>
</head>
<body>
  <h2>📡 OpenClaw Status</h2>
  <p>
    <span class="indicator ${running ? 'on' : 'off'}"></span>
    ${running ? 'Running' : 'Not Running'}
  </p>
  <pre>${details}</pre>
  <button onclick="vscode.postMessage({command:'refresh'})">Refresh</button>
  <script>const vscode = acquireVsCodeApi();</script>
</body>
</html>`;
  }
}
