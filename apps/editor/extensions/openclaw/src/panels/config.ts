import * as vscode from 'vscode';
import * as http from 'http';
import * as cp from 'child_process';
import * as os from 'os';
import * as path from 'path';

const DEFAULT_GATEWAY_PORT = 18789;

// ── Proxy ─────────────────────────────────────────────────────────────────────
// Reverse-proxy that strips X-Frame-Options and CSP frame-ancestors so the
// page can load inside a VS Code webview iframe.

let _proxyServer: http.Server | undefined;
let _proxyPort: number | undefined;
let _proxyTargetPort = DEFAULT_GATEWAY_PORT;

export function getOrStartConfigProxy(targetPort = DEFAULT_GATEWAY_PORT): Promise<number> {
  // Restart proxy if target port changed
  if (_proxyServer && _proxyPort && _proxyTargetPort === targetPort) return Promise.resolve(_proxyPort);
  if (_proxyServer) { _proxyServer.close(); _proxyServer = undefined; _proxyPort = undefined; }
  _proxyTargetPort = targetPort;
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const targetPath = req.url ?? '/';
      const options: http.RequestOptions = {
        hostname: '127.0.0.1',
        port: _proxyTargetPort,
        path: targetPath,
        method: req.method,
        headers: { ...req.headers, host: `localhost:${_proxyTargetPort}` },
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

        const contentType = (headers['content-type'] as string | undefined) ?? '';
        const isHtml = contentType.includes('text/html');

        if (isHtml) {
          // Collect the full response so we can inject the clipboard bridge script.
          const chunks: Buffer[] = [];
          proxyRes.on('data', (chunk: Buffer) => chunks.push(chunk));
          proxyRes.on('end', () => {
            let body = Buffer.concat(chunks).toString('utf-8');
            // Clipboard bridge injected into the gateway page.
            // KEY INSIGHT: keyboard events inside a focused cross-origin iframe never
            // bubble to the parent document. So the iframe must intercept its own keys
            // and use postMessage to ask the parent (outer webview) for clipboard access,
            // since navigator.clipboard requires HTTPS and the gateway runs on HTTP.
            const bridge = `<script>
(function(){
  // ── AUTO-CONNECT: read token from URL and fill the form ──
  (function autoConnect() {
    // Support both ?token= (query) and #token= (hash) formats
    var token = new URLSearchParams(window.location.search).get('token') ||
                new URLSearchParams(window.location.hash.replace(/^#/, '')).get('token');
    if (!token) return;
    function tryFill(attempts) {
      // Find the gateway token input — try common patterns
      var input = document.querySelector(
        'input[placeholder*="TOKEN"], input[placeholder*="token"], ' +
        'input[name*="token"], input[id*="token"], ' +
        'input[placeholder*="GATEWAY"], input[placeholder*="gateway"]'
      );
      if (!input) {
        if (attempts < 20) setTimeout(function(){ tryFill(attempts + 1); }, 250);
        return;
      }
      // Already filled — don't overwrite user input
      if (input.value && input.value !== '') return;
      // Fill the token
      var nativeInputSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeInputSetter.call(input, token);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      // Find and click the Connect button
      setTimeout(function() {
        var btn = Array.from(document.querySelectorAll('button')).find(function(b) {
          return /connect/i.test(b.textContent || '');
        });
        if (btn && !btn.disabled) btn.click();
      }, 150);
    }
    // Start trying after a short delay for React/Vue to hydrate
    setTimeout(function(){ tryFill(0); }, 600);
  })();

  // ── CLIPBOARD BRIDGE ──
  // VS Code routes Cmd+C/X/V through Electron's webContents.copy/cut/paste(),
  // which fire DOM 'copy'/'cut'/'paste' events — NOT 'keydown' events.
  // We must listen for those DOM clipboard events directly.

  function getSelectedText() {
    var sel = window.getSelection ? window.getSelection() : null;
    if (sel && sel.toString()) return sel.toString();
    var ae = document.activeElement;
    if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) {
      return ae.value.slice(ae.selectionStart, ae.selectionEnd);
    }
    return '';
  }

  function insertAt(el, text) {
    if (!el || !text) return;
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      var s = el.selectionStart || 0, e = el.selectionEnd || 0;
      var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')
                || Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
      setter = setter && setter.set;
      var newVal = el.value.slice(0, s) + text + el.value.slice(e);
      if (setter) setter.call(el, newVal); else el.value = newVal;
      el.selectionStart = el.selectionEnd = s + text.length;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (el.isContentEditable) {
      document.execCommand('insertText', false, text);
    }
  }

  // PRIMARY: DOM clipboard events — fired by VS Code's webContents.copy/cut/paste()
  document.addEventListener('copy', function(ev) {
    var text = getSelectedText();
    if (!text) return;
    ev.preventDefault();
    ev.clipboardData.setData('text/plain', text);
  });

  document.addEventListener('cut', function(ev) {
    var ae = document.activeElement;
    var text = getSelectedText();
    if (!text) return;
    ev.preventDefault();
    ev.clipboardData.setData('text/plain', text);
    // Delete selected text from the active input
    if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) {
      var s = ae.selectionStart, e = ae.selectionEnd;
      var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      setter = setter && setter.set;
      var newVal = ae.value.slice(0, s) + ae.value.slice(e);
      if (setter) setter.call(ae, newVal); else ae.value = newVal;
      ae.selectionStart = ae.selectionEnd = s;
      ae.dispatchEvent(new Event('input', { bubbles: true }));
      ae.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });

  document.addEventListener('paste', function(ev) {
    var cd = ev.clipboardData || window.clipboardData;
    var text = cd ? cd.getData('text/plain') : '';
    if (!text) return;
    ev.preventDefault();
    insertAt(document.activeElement, text);
  });

  // FALLBACK: keydown — for cases where VS Code passes Cmd+C/X/V as keyboard events
  document.addEventListener('keydown', function(ev) {
    var mod = ev.metaKey || ev.ctrlKey;
    if (!mod) return;

    if (ev.key === 'v') {
      ev.preventDefault();
      // Try navigator.clipboard (works for localhost content in Electron)
      if (navigator.clipboard && navigator.clipboard.readText) {
        navigator.clipboard.readText().then(function(text) {
          insertAt(document.activeElement, text);
        }).catch(function() {
          window.parent.postMessage({ type: 'occ-request-paste' }, '*');
        });
      } else {
        window.parent.postMessage({ type: 'occ-request-paste' }, '*');
      }
    }

    if (ev.key === 'c' || ev.key === 'x') {
      var text = getSelectedText();
      if (!text) return;
      if (ev.key === 'x') {
        var ae = document.activeElement;
        if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) {
          var s = ae.selectionStart, e = ae.selectionEnd;
          var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
          setter = setter && setter.set;
          var newVal = ae.value.slice(0, s) + ae.value.slice(e);
          if (setter) setter.call(ae, newVal); else ae.value = newVal;
          ae.selectionStart = ae.selectionEnd = s;
          ae.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(function() {
          window.parent.postMessage({ type: 'occ-copy-data', text: text }, '*');
        });
      } else {
        window.parent.postMessage({ type: 'occ-copy-data', text: text }, '*');
      }
    }
  }, true);

  // Receive paste content from parent (postMessage fallback path)
  window.addEventListener('message', function(ev) {
    var d = ev.data;
    if (!d || d.type !== 'occ-paste') return;
    insertAt(document.activeElement, d.text || '');
  });
})();
<\/script>`;
            // Inject just before </body> or </html>, fallback: append.
            if (body.includes('</body>')) {
              body = body.replace('</body>', bridge + '</body>');
            } else if (body.includes('</html>')) {
              body = body.replace('</html>', bridge + '</html>');
            } else {
              body += bridge;
            }
            const buf = Buffer.from(body, 'utf-8');
            headers['content-length'] = String(buf.length);
            delete headers['transfer-encoding'];
            res.writeHead(proxyRes.statusCode ?? 200, headers);
            res.end(buf);
          });
        } else {
          res.writeHead(proxyRes.statusCode ?? 200, headers);
          proxyRes.pipe(res, { end: true });
        }
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
        port: _proxyTargetPort,
        path: req.url ?? '/',
        method: req.method,
        headers: { ...req.headers, host: `localhost:${_proxyTargetPort}` },
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

// ── Dashboard URL ──────────────────────────────────────────────────────────────
// Runs `openclaw dashboard --no-open` to get the tokenized URL, e.g.:
//   http://127.0.0.1:18789/#token=clawx-xxxx

function getDashboardUrl(): Promise<{ url: string; port: number } | undefined> {
  return new Promise(resolve => {
    const nvmSh = path.join(os.homedir(), '.nvm', 'nvm.sh');
    const cmd = require('fs').existsSync(nvmSh)
      ? `bash -c '. "${nvmSh}" 2>/dev/null && openclaw dashboard --no-open 2>&1'`
      : 'openclaw dashboard --no-open 2>&1';
    cp.exec(cmd, { timeout: 10000, maxBuffer: 1024 * 1024 }, (error, stdout) => {
      const output = (stdout || '').toString();
      // Parse "Dashboard URL: http://..." from output
      const match = output.match(/https?:\/\/[^\s]+/);
      if (!match) { resolve(undefined); return; }
      const raw = match[0];
      try {
        const parsed = new URL(raw);
        resolve({ url: raw, port: Number(parsed.port) || DEFAULT_GATEWAY_PORT });
      } catch {
        resolve(undefined);
      }
    });
  });
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
    this._panel.webview.onDidReceiveMessage(async msg => {
      if (msg.command === 'openExternal' && msg.url) {
        vscode.env.openExternal(vscode.Uri.parse(msg.url));
      }
      // Clipboard fallbacks via VS Code host API (when navigator.clipboard unavailable).
      if (msg.command === 'readClipboard') {
        const text = await vscode.env.clipboard.readText();
        void this._panel.webview.postMessage({ type: 'occ-clipboard-text', text });
      }
      if (msg.command === 'writeClipboard' && typeof msg.text === 'string') {
        await vscode.env.clipboard.writeText(msg.text);
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
      const dashInfo = await getDashboardUrl();
      const targetPort = dashInfo?.port ?? DEFAULT_GATEWAY_PORT;
      const proxyPort = await getOrStartConfigProxy(targetPort);

      let proxySrc: string;
      let externalSrc: string;

      if (dashInfo?.url) {
        // Replace the host in the tokenized URL with the proxy address.
        const parsed = new URL(dashInfo.url);
        proxySrc = `http://127.0.0.1:${proxyPort}${parsed.pathname}${parsed.search}${parsed.hash}`;
        externalSrc = dashInfo.url;
      } else {
        // Fallback: open root of gateway (no token)
        proxySrc = `http://127.0.0.1:${proxyPort}/`;
        externalSrc = `http://localhost:${targetPort}/`;
      }

      this._panel.webview.html = this._iframeHtml(proxySrc, externalSrc);
    } catch (err) {
      this._panel.webview.html = this._errorHtml(String(err));
    }
  }

  private _iframeHtml(src: string, externalSrc: string): string {
    // Lucide SVG icon helper — inline paths, no CDN needed.
    const icon = (paths: string) =>
      `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

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

    // Refresh: reassign src — cross-origin iframes block contentWindow.location.reload()
    document.getElementById('btn-refresh').onclick = () => { var s = frame.src; frame.src = ''; frame.src = s; };
    document.getElementById('btn-external').onclick = () => vscode.postMessage({ command: 'openExternal', url: '${externalSrc}' });

    // ── Clipboard bridge ─────────────────────────────────────────────────────
    // navigator.clipboard is unreliable inside VS Code webviews (focus/permission
    // issues). Always route through the extension host which uses vscode.env.clipboard.

    window.addEventListener('message', function(ev) {
      var d = ev.data;
      if (!d || typeof d !== 'object') return;

      // Iframe wants to paste — ask extension host for clipboard text.
      if (d.type === 'occ-request-paste') {
        vscode.postMessage({ command: 'readClipboard' });
      }

      // Iframe copied/cut text — ask extension host to write it.
      if (d.type === 'occ-copy-data' && typeof d.text === 'string') {
        vscode.postMessage({ command: 'writeClipboard', text: d.text });
      }

      // Extension host responded with clipboard text — forward to iframe.
      if (d.type === 'occ-clipboard-text') {
        frame.contentWindow.postMessage({ type: 'occ-paste', text: d.text || '' }, '*');
      }
    });
  </script>
</body>
</html>`;
  }

  private _loadingHtml(): string {
    return `<!DOCTYPE html><html><body style="background:#1a1a1a;color:#eee;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;">Loading OpenClaw Configuration…</body></html>`;
  }

  private _errorHtml(msg: string): string {
    return `<!DOCTYPE html><html><body style="background:#1a1a1a;color:#eee;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;flex-direction:column;gap:12px;padding:24px;text-align:center;"><h2>Cannot connect to OpenClaw gateway</h2><p style="color:#888">Make sure it is running (port ${DEFAULT_GATEWAY_PORT})</p><p style="color:#555;font-size:12px">${msg}</p></body></html>`;
  }
}
