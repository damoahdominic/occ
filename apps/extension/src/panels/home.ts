import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export class HomePanel {
  public static currentPanel: HomePanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._update();
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage(msg => {
      if (msg.command) {
        vscode.commands.executeCommand(msg.command);
      }
    }, null, this._disposables);
  }

  public static createOrShow(extensionUri: vscode.Uri) {
    if (HomePanel.currentPanel) {
      HomePanel.currentPanel._panel.reveal();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'openclawHome', 'OpenClaw Home', vscode.ViewColumn.One,
      { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')] }
    );
    HomePanel.currentPanel = new HomePanel(panel, extensionUri);
  }

  public dispose() {
    HomePanel.currentPanel = undefined;
    this._panel.dispose();
    this._disposables.forEach(d => d.dispose());
  }

  private _update() {
    const openclawDir = path.join(os.homedir(), '.openclaw');
    const isInstalled = fs.existsSync(openclawDir);
    const iconUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'icon.png')
    );
    this._panel.webview.html = this._getHtml(isInstalled, iconUri.toString());
  }

  private _getHtml(isInstalled: boolean, iconUri: string): string {
    const statusIcon = isInstalled ? '✅' : '⚠️';
    const statusText = isInstalled ? 'OpenClaw detected' : 'OpenClaw not found';
    const statusClass = isInstalled ? 'detected' : 'not-found';
    const buttonLabel = isInstalled ? 'Configure OpenClaw' : 'Install OpenClaw';
    const buttonCommand = isInstalled ? 'openclaw.configure' : 'openclaw.install';

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, sans-serif);
      background: #1a1a1a;
      color: #e0e0e0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 40px 20px;
    }
    .logo {
      width: 96px;
      height: 96px;
      margin-bottom: 24px;
      filter: drop-shadow(0 4px 12px rgba(220, 40, 40, 0.3));
    }
    h1 {
      font-size: 28px;
      font-weight: 700;
      margin-bottom: 8px;
      color: #fff;
    }
    h1 .accent { color: #dc2828; }
    .tagline {
      color: #888;
      font-size: 14px;
      margin-bottom: 32px;
    }
    .status {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      margin-bottom: 28px;
      padding: 8px 16px;
      border-radius: 6px;
      background: rgba(255,255,255,0.04);
    }
    .status.detected { color: #4ade80; }
    .status.not-found { color: #facc15; }
    .btn-primary {
      background: #dc2828;
      color: #fff;
      border: none;
      padding: 12px 28px;
      border-radius: 8px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s;
    }
    .btn-primary:hover { background: #b91c1c; }
    .btn-secondary {
      background: transparent;
      color: #aaa;
      border: 1px solid #444;
      padding: 10px 20px;
      border-radius: 8px;
      font-size: 13px;
      cursor: pointer;
      margin-top: 12px;
      transition: border-color 0.15s;
    }
    .btn-secondary:hover { border-color: #888; color: #ddd; }
    .links {
      margin-top: 48px;
      display: flex;
      gap: 24px;
    }
    .links a {
      color: #666;
      text-decoration: none;
      font-size: 12px;
      transition: color 0.15s;
    }
    .links a:hover { color: #dc2828; }
  </style>
</head>
<body>
  <img class="logo" src="${iconUri}" alt="OpenClaw" />
  <h1>Welcome to <span class="accent">OpenClaw</span> Code</h1>
  <p class="tagline">Your AI-powered development environment</p>
  <div class="status ${statusClass}">${statusIcon} ${statusText}</div>
  <button class="btn-primary" onclick="cmd('${buttonCommand}')">${buttonLabel}</button>
  <button class="btn-secondary" onclick="cmd('openclaw.status')">Check Status</button>
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
