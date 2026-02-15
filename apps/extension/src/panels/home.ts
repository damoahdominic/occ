import * as vscode from 'vscode';

export class HomePanel {
  public static currentPanel: HomePanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel) {
    this._panel = panel;
    this._panel.webview.html = this._getHtml();
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  public static createOrShow(extensionUri: vscode.Uri) {
    if (HomePanel.currentPanel) {
      HomePanel.currentPanel._panel.reveal();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'openclawHome', 'OpenClaw Home', vscode.ViewColumn.One, { enableScripts: true }
    );
    HomePanel.currentPanel = new HomePanel(panel);
  }

  public dispose() {
    HomePanel.currentPanel = undefined;
    this._panel.dispose();
    this._disposables.forEach(d => d.dispose());
  }

  private _getHtml(): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {
      font-family: var(--vscode-font-family);
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      display: flex; flex-direction: column; align-items: center;
      padding: 40px 20px;
    }
    h1 { font-size: 32px; margin-bottom: 8px; }
    .accent { color: #00d4aa; }
    .subtitle { color: var(--vscode-descriptionForeground); margin-bottom: 32px; }
    .actions { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; }
    button {
      background: #00d4aa; color: #1a1a2e; border: none; padding: 10px 20px;
      border-radius: 6px; font-size: 14px; cursor: pointer; font-weight: 600;
    }
    button:hover { background: #00b894; }
    button.secondary {
      background: transparent; border: 1px solid var(--vscode-button-border, #555);
      color: var(--vscode-editor-foreground);
    }
    .links { margin-top: 40px; }
    .links a {
      color: var(--vscode-textLink-foreground); text-decoration: none; margin: 0 12px;
    }
  </style>
</head>
<body>
  <h1>🐾 <span class="accent">OpenClaw</span></h1>
  <p class="subtitle">Your AI-powered development companion</p>
  <div class="actions">
    <button onclick="cmd('openclaw.setupLocal')">Setup Local Environment</button>
    <button class="secondary" onclick="cmd('openclaw.status')">Check Status</button>
  </div>
  <div class="links">
    <a href="https://github.com/damoahdominic/occ">GitHub</a>
    <a href="https://openclaw.ai">Website</a>
    <a href="https://docs.openclaw.ai">Docs</a>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    function cmd(c) { vscode.postMessage({ command: c }); }
  </script>
</body>
</html>`;
  }
}
