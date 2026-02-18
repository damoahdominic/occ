import * as vscode from "vscode";
import type { ControlCenterData } from "@occode/control-center/data";

function getNonce() {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i += 1) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

export function renderControlCenterHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  data: ControlCenterData
) {
  const nonce = getNonce();
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "media", "control-center.js")
  );
  const tailwindUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "media", "tailwindcdn.js")
  );
  const serialized = JSON.stringify(data).replace(/</g, "\\u003c");

  const baseStyles = `
    :root {
      color-scheme: dark;
      --accent: #EF4444;
      --accent-hover: #DC2626;
      --bg: #0A0A0A;
      --bg-card: #141414;
      --bg-elevated: #1A1A1A;
      --border: #262626;
      --text: #FAFAFA;
      --text-muted: #A3A3A3;
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
