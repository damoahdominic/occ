import * as vscode from "vscode";
import type { ControlCenterData } from "@occode/control-center/data";
import { getControlCenterData } from "@occode/control-center/data";
import { resolveConfigPath, overrideConfigPath } from "./config-path";

function getNonce() {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i += 1) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

export class ConfigPanel {
  public static currentPanel: ConfigPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  public static overrideConfigPath(p: string | undefined) {
    overrideConfigPath(p);
    if (ConfigPanel.currentPanel) {
      void ConfigPanel.currentPanel._update();
    }
  }

  public static createOrShow(extensionUri: vscode.Uri) {
    if (ConfigPanel.currentPanel) {
      ConfigPanel.currentPanel._panel.reveal();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      "openclawConfig",
      "OpenClaw Configuration",
      vscode.ViewColumn.Two,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, "media")],
      }
    );
    ConfigPanel.currentPanel = new ConfigPanel(panel, extensionUri);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage((message) => {
      if (message?.command === "refresh") {
        void this._update();
      }
    });
    void this._update();
  }

  public dispose() {
    ConfigPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  private async _update() {
    const configPath = resolveConfigPath();
    const data = getControlCenterData(configPath);
    this._panel.webview.html = this._getHtml(data);
  }

  private _getHtml(data: ControlCenterData) {
    const webview = this._panel.webview;
    const nonce = getNonce();
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "control-center.js")
    );
    const tailwindUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "tailwindcdn.js")
    );
    const serialized = JSON.stringify(data).replace(/</g, "\\u003c");

    const baseStyles = `
      :root {
        color-scheme: dark;
        --accent: #6ee7ff;
        --accent-hover: #9d7bff;
        --bg: #0f1115;
        --bg-card: #151922;
        --bg-elevated: #1b2030;
        --border: #26304a;
        --text: #e7ecf6;
        --text-muted: #8b93a7;
      }
      body {
        margin: 0;
        background: var(--bg);
        color: var(--text);
        font-family: var(--vscode-font-family, "Inter", system-ui, -apple-system, BlinkMacSystemFont, sans-serif);
      }
      #control-center-root {
        min-height: 100vh;
      }
    `;

    const csp = `default-src 'none'; img-src ${webview.cspSource} https: data:; font-src ${webview.cspSource} https:; style-src 'nonce-${nonce}' ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' ${webview.cspSource}; connect-src ${webview.cspSource} https:`;

    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style nonce="${nonce}">${baseStyles}</style>
    <script nonce="${nonce}">window.__CONTROL_CENTER_DATA__ = ${serialized};</script>
    <script nonce="${nonce}" src="${tailwindUri}"></script>
  </head>
  <body>
    <div id="control-center-root"></div>
    <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
  }
}
