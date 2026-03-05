import * as vscode from 'vscode';
import * as http from 'http';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const CONFIG_TARGET_PORT = 18789;
const CONFIG_TARGET = `http://localhost:${CONFIG_TARGET_PORT}`;

// ── Proxy ─────────────────────────────────────────────────────────────────────
// Reverse-proxy that strips X-Frame-Options and CSP frame-ancestors so the
// page can load inside a VS Code webview iframe.

let _proxyServer: http.Server | undefined;
let _proxyPort: number | undefined;

export function getOrStartConfigProxy(): Promise<number> {
  if (_proxyServer && _proxyPort) return Promise.resolve(_proxyPort);
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const targetPath = req.url ?? '/';
      const options: http.RequestOptions = {
        hostname: '127.0.0.1',
        port: CONFIG_TARGET_PORT,
        path: targetPath,
        method: req.method,
        headers: { ...req.headers, host: `localhost:${CONFIG_TARGET_PORT}` },
      };
      const proxyReq = http.request(options, proxyRes => {
        const headers = { ...proxyRes.headers };
        // Remove headers that prevent iframe embedding.
        delete headers['x-frame-options'];
        const csp = headers['content-security-policy'];
        if (typeof csp === 'string') {
          const cleaned = csp
            .split(';')
            .map(d => d.trim())
            .filter(d => !/^frame-ancestors/i.test(d))
            .join('; ')
            .trim()
            .replace(/;$/, '');
          if (cleaned) {
            headers['content-security-policy'] = cleaned;
          } else {
            delete headers['content-security-policy'];
          }
        }
        res.writeHead(proxyRes.statusCode ?? 200, headers);
        proxyRes.pipe(res, { end: true });
      });
      proxyReq.on('error', () => {
        if (!res.headersSent) res.writeHead(502);
        res.end('Proxy error');
      });
      req.pipe(proxyReq, { end: true });
    });

    // WebSocket tunnel — forward upgrade requests straight through.
    server.on('upgrade', (req, socket, head) => {
      const proxyReq = http.request({
        hostname: '127.0.0.1',
        port: CONFIG_TARGET_PORT,
        path: req.url ?? '/',
        method: req.method,
        headers: { ...req.headers, host: `localhost:${CONFIG_TARGET_PORT}` },
      });
      proxyReq.on('upgrade', (_proxyRes, proxySocket) => {
        // Stitch the two sockets together bidirectionally.
        if (head?.length) proxySocket.unshift(head);
        socket.write('HTTP/1.1 101 Switching Protocols\r\n' +
          Object.entries(_proxyRes.headers)
            .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
            .join('\r\n') + '\r\n\r\n');
        proxySocket.pipe(socket, { end: true });
        socket.pipe(proxySocket, { end: true });
        proxySocket.on('error', () => socket.destroy());
        socket.on('error', () => proxySocket.destroy());
      });
      proxyReq.on('error', () => socket.destroy());
      proxyReq.end();
    });

    server.listen(0, '127.0.0.1', () => {
      _proxyPort = (server.address() as { port: number }).port;
      _proxyServer = server;
      resolve(_proxyPort);
    });
    server.on('error', reject);
  });
}

export function stopConfigProxy(): void {
  _proxyServer?.close();
  _proxyServer = undefined;
  _proxyPort = undefined;
}

// ── Token ─────────────────────────────────────────────────────────────────────

function readGatewayToken(): string | undefined {
  const jsonPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
  if (!fs.existsSync(jsonPath)) return undefined;
  try {
    const raw = fs.readFileSync(jsonPath, 'utf-8');
    // Extract token with a regex to avoid full JSON parse issues with comments/trailing commas.
    const match = /"token"\s*:\s*"([^"]+)"/.exec(raw);
    return match?.[1];
  } catch {
    return undefined;
  }
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export class ConfigPanel {
  public static currentPanel: ConfigPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel) {
    this._panel = panel;
    // When the user closes the tab, bring the AI chat back.
    this._panel.onDidDispose(() => {
      this.dispose();
      // Re-open the auxiliary bar and focus the Void AI chat.
      void vscode.commands.executeCommand('workbench.action.focusAuxiliaryBar')
        .then(() => vscode.commands.executeCommand('workbench.view.void'));
    }, null, this._disposables);
    this._panel.webview.onDidReceiveMessage(msg => {
      if (msg.command === 'openExternal' && msg.url) {
        vscode.env.openExternal(vscode.Uri.parse(msg.url));
      }
    }, null, this._disposables);
    this._panel.webview.html = this._loadingHtml();
    void this._load();
  }

  public static async createOrShow(): Promise<void> {
    // Close both sidebars (File Explorer on left, AI Chat on right) so the
    // browser gets the full editor width.
    await vscode.commands.executeCommand('workbench.action.closeSidebar');
    await vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar');

    if (ConfigPanel.currentPanel) {
      ConfigPanel.currentPanel._panel.reveal();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'openclawConfig',
      'OpenClaw Configure',
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    ConfigPanel.currentPanel = new ConfigPanel(panel);
  }

  public dispose(): void {
    ConfigPanel.currentPanel = undefined;
    this._panel.dispose();
    this._disposables.forEach(d => d.dispose());
  }

  private async _load(): Promise<void> {
    try {
      const port = await getOrStartConfigProxy();
      const token = readGatewayToken();
      const qs = token ? `?token=${encodeURIComponent(token)}` : '';
      const proxySrc = `http://127.0.0.1:${port}/config${qs}`;
      const externalSrc = `http://localhost:${CONFIG_TARGET_PORT}/config${qs}`;
      this._panel.webview.html = this._iframeHtml(proxySrc, externalSrc);
    } catch (err) {
      this._panel.webview.html = this._errorHtml(String(err));
    }
  }

  private _iframeHtml(src: string, externalSrc: string): string {
    // Lucide SVG icon helper — inline paths, no CDN needed.
    const icon = (paths: string) =>
      `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

    const iconArrowLeft    = icon('<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>');
    const iconArrowRight   = icon('<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>');
    const iconRefreshCw    = icon('<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>');
    const iconExternalLink = icon('<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>');

    return `<!DOCTYPE html>
<html style="margin:0;padding:0;height:100%;overflow:hidden;">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src * data: blob: 'unsafe-inline' 'unsafe-eval'; frame-src *;">
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; background: #1a1a1a; display: flex; flex-direction: column; }
    #toolbar {
      display: flex;
      align-items: center;
      gap: 2px;
      padding: 4px 8px;
      background: #252526;
      border-bottom: 1px solid #3c3c3c;
      flex-shrink: 0;
    }
    #url-bar {
      flex: 1;
      background: #1a1a1a;
      border: 1px solid #3c3c3c;
      border-radius: 4px;
      color: #999;
      font-size: 11px;
      padding: 3px 8px;
      font-family: monospace;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      cursor: default;
      user-select: none;
      margin: 0 4px;
    }
    button {
      background: transparent;
      border: none;
      color: #999;
      cursor: pointer;
      width: 26px;
      height: 26px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.1s, color 0.1s;
      flex-shrink: 0;
    }
    button:hover { background: #3c3c3c; color: #e0e0e0; }
    button:active { background: #505050; }
    button svg { pointer-events: none; }
    iframe { flex: 1; width: 100%; border: none; min-height: 0; }
  </style>
</head>
<body>
  <div id="toolbar">
    <button id="btn-back" title="Back">${iconArrowLeft}</button>
    <button id="btn-forward" title="Forward">${iconArrowRight}</button>
    <button id="btn-refresh" title="Refresh">${iconRefreshCw}</button>
    <div id="url-bar">${src}</div>
    <button id="btn-external" title="Open in browser">${iconExternalLink}</button>
  </div>
  <iframe
    id="frame"
    src="${src}"
    allow="clipboard-read; clipboard-write; fullscreen"
  ></iframe>
  <script>
    const vscode = acquireVsCodeApi();
    const frame = document.getElementById('frame');
    document.getElementById('btn-refresh').onclick  = () => frame.contentWindow.location.reload();
    document.getElementById('btn-back').onclick     = () => frame.contentWindow.history.back();
    document.getElementById('btn-forward').onclick  = () => frame.contentWindow.history.forward();
    document.getElementById('btn-external').onclick = () => vscode.postMessage({ command: 'openExternal', url: '${externalSrc}' });
  </script>
</body>
</html>`;
  }

  private _loadingHtml(): string {
    return `<!DOCTYPE html><html><body style="background:#1a1a1a;color:#eee;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;">Loading OpenClaw Configuration…</body></html>`;
  }

  private _errorHtml(msg: string): string {
    return `<!DOCTYPE html><html><body style="background:#1a1a1a;color:#eee;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;flex-direction:column;gap:12px;padding:24px;text-align:center;"><h2>Cannot connect to OpenClaw gateway</h2><p style="color:#888">Make sure it is running at ${CONFIG_TARGET}</p><p style="color:#555;font-size:12px">${msg}</p></body></html>`;
  }
}
