import * as vscode from 'vscode';
import * as cp from 'child_process';

type GatewayStatus = {
  installed: boolean;
  running: boolean;
  pid?: string;
  port?: string;
  uptime?: string;
  service?: string;
  dashboard?: string;
  probe?: string;
  logFile?: string;
  configPath?: string;
  issues?: string[];
  exitCode?: string;
  raw: string;
  error?: string;
  updatedAt: string;
};

export class StatusPanel {
  public static currentPanel: StatusPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel) {
    this._panel = panel;
    void this._update();
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage(msg => {
      if (msg.command === 'refresh') {
        void this._update();
      } else if (msg.command === 'gateway-start') {
        void this._runGateway('start');
      } else if (msg.command === 'gateway-stop') {
        void this._runGateway('stop');
      } else if (msg.command === 'gateway-restart') {
        void this._runGateway('restart');
      } else if (msg.command === 'install') {
        vscode.commands.executeCommand('openclaw.install');
      } else if (msg.command === 'configure') {
        vscode.commands.executeCommand('openclaw.configure');
      } else if (msg.command === 'open-dashboard' && msg.url) {
        vscode.env.openExternal(vscode.Uri.parse(msg.url));
      } else if (msg.command === 'open-logs' && msg.path) {
        let p = msg.path as string;
        if (process.platform === 'win32' && !/^[a-zA-Z]:/.test(p) && /^[\\/]/.test(p)) {
          const drive = process.env.SystemDrive || 'C:';
          p = `${drive}${p}`;
        }
        const uri = vscode.Uri.file(p);
        vscode.workspace.openTextDocument(uri).then(doc => vscode.window.showTextDocument(doc));
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

  private async _runGateway(action: string) {
    try {
      await this._exec(`openclaw gateway ${action}`, 60000);
      vscode.window.showInformationMessage(`OpenClaw gateway ${action} successful.`);
    } catch (err: any) {
      const details = this._formatError(err);
      if (err?.code === 'ETIMEDOUT') {
        vscode.window.showWarningMessage(`OpenClaw gateway ${action} is taking longer than expected.`);
      } else {
        vscode.window.showErrorMessage(`Failed to ${action} OpenClaw gateway.`);
      }
      if (details) {
        console.warn('[OpenClaw] Gateway error:', details);
      }
    }
    await this._update();
  }

  private async _update() {
    const status = await this._getStatus();
    this._panel.webview.html = this._getHtml(status);
  }

  private async _getStatus(): Promise<GatewayStatus> {
    const updatedAt = new Date().toLocaleTimeString();
    try {
      const { stdout, stderr } = await this._exec('openclaw gateway status', 4000);
      const out = stdout.trim();
      const parsed = this._parseStatus(out);
      return {
        installed: parsed.installed,
        running: parsed.running,
        pid: parsed.pid,
        port: parsed.port,
        uptime: parsed.uptime,
        service: parsed.service,
        dashboard: parsed.dashboard,
        probe: parsed.probe,
        logFile: parsed.logFile,
        configPath: parsed.configPath,
        issues: parsed.issues,
        raw: out || 'No output from status command.',
        error: stderr?.trim() || undefined,
        updatedAt,
      };
    } catch (err: any) {
      const stdout = err?.stdout ? err.stdout.toString() : '';
      const stderr = err?.stderr ? err.stderr.toString() : '';
      const hasOutput = stdout.trim().length > 0;
      if (hasOutput) {
        const out = stdout.trim();
        const parsed = this._parseStatus(out);
        const message = [stderr, err?.message].filter(Boolean).join('\n').trim();
        return {
          installed: parsed.installed,
          running: parsed.running,
          pid: parsed.pid,
          port: parsed.port,
          uptime: parsed.uptime,
          service: parsed.service,
          dashboard: parsed.dashboard,
          probe: parsed.probe,
          logFile: parsed.logFile,
          configPath: parsed.configPath,
          issues: parsed.issues,
          exitCode: err?.code ? String(err.code) : undefined,
          raw: out,
          error: message || undefined,
          updatedAt,
        };
      }

      const message = this._formatError(err);
      const notFound = this._isCommandNotFound(err);
      const timedOut = err?.code === 'ETIMEDOUT';
      return {
        installed: !notFound,
        running: false,
        exitCode: err?.code ? String(err.code) : undefined,
        raw: notFound
          ? 'OpenClaw CLI not detected.'
          : timedOut
            ? 'Status command timed out.'
            : 'Failed to read gateway status.',
        error: message,
        updatedAt,
      };
    }
  }

  private _exec(cmd: string, timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      cp.exec(
        cmd,
        {
          timeout: timeoutMs,
          windowsHide: true,
          maxBuffer: 1024 * 1024,
        },
        (error, stdout, stderr) => {
          if (error) {
            (error as any).stdout = stdout;
            (error as any).stderr = stderr;
            return reject(error);
          }
          resolve({ stdout, stderr });
        }
      );
    });
  }

  private _parseStatus(out: string) {
    const lower = out.toLowerCase();
    let running = /runtime:\s*running|gateway:\s*running/.test(lower) || /running|active|started/.test(lower);
    if (/not running|stopped|inactive|down|runtime:\s*stopped/.test(lower)) running = false;

    const pid = out.match(/pid[:\s]+(\d+)/i)?.[1];
    const port = out.match(/port[:=\s]+(\d+)/i)?.[1];
    const uptime = out.match(/uptime[:\s]+([^\n]+)/i)?.[1];
    const service = out.match(/service:\s*([^\n]+)/i)?.[1]?.trim();
    const dashboard = out.match(/dashboard:\s*(https?:\/\/[^\s]+)/i)?.[1];
    const probe = out.match(/probe target:\s*([^\n]+)/i)?.[1]?.trim();
    const logFile = out.match(/file logs:\s*([^\n]+)/i)?.[1]?.trim();
    const configPath = out.match(/config \(cli\):\s*([^\n]+)/i)?.[1]?.trim();
    const installed = /openclaw\s+\d{4}\./i.test(out) || /openclaw/gi.test(out);
    const issues = this._extractIssues(out);

    return { running, pid, port, uptime, service, dashboard, probe, logFile, configPath, installed, issues };
  }

  private _extractIssues(out: string): string[] {
    const lines = out.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const issues: string[] = [];
    for (const line of lines) {
      const lower = line.toLowerCase();
      if (lower.startsWith('fix:') || lower.startsWith('troubles:') || lower.startsWith('troubleshooting:')) {
        issues.push(line);
        continue;
      }
      if (lower.includes('missing') && lower.includes('config')) {
        issues.push(line);
        continue;
      }
      if (lower.startsWith('rpc probe:') || lower.startsWith('service is loaded but not running')) {
        issues.push(line);
        continue;
      }
      if (lower.includes('requires explicit credentials') || lower.includes('pass --token') || lower.includes('pass --password')) {
        issues.push(line);
        continue;
      }
    }
    return issues;
  }

  private _isCommandNotFound(err: any) {
    const msg = this._formatError(err).toLowerCase();
    return (
      err?.code === 'ENOENT' ||
      msg.includes('not recognized as an internal or external command') ||
      msg.includes('command not found')
    );
  }

  private _formatError(err: any) {
    const stdout = err?.stdout ? err.stdout.toString() : '';
    const stderr = err?.stderr ? err.stderr.toString() : '';
    return [stderr, stdout, err?.message].filter(Boolean).join('\n').trim();
  }

  private _escapeHtml(input: string) {
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private _getHtml(status: GatewayStatus): string {
    const {
      running,
      installed,
      raw,
      error,
      pid,
      port,
      uptime,
      service,
      dashboard,
      probe,
      logFile,
      configPath,
      issues,
      exitCode,
      updatedAt,
    } = status;
    const safeRaw = this._escapeHtml(raw || '');
    const safeError = error ? this._escapeHtml(error) : '';
    const safeIssues = (issues || []).map(i => this._escapeHtml(i));
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family, sans-serif);
      background: radial-gradient(1200px 600px at -10% -10%, rgba(220,40,40,0.15), transparent),
                  radial-gradient(900px 400px at 110% 10%, rgba(220,40,40,0.12), transparent),
                  #141414;
      color: #e7e7e7;
      padding: 28px;
    }
    h2 { color: #dc2828; margin-bottom: 6px; letter-spacing: 0.2px; }
    .subtitle { color: #b2b2b2; font-size: 12px; margin-bottom: 18px; }
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
    .card {
      background: #1d1d1d;
      border: 1px solid #2a2a2a;
      border-radius: 10px;
      padding: 14px;
      margin-bottom: 16px;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px 16px;
    }
    .kv {
      display: flex;
      justify-content: space-between;
      font-size: 13px;
      color: #c8c8c8;
    }
    .kv span:first-child { color: #8c8c8c; }
    pre {
      background: #111;
      padding: 12px;
      border-radius: 8px;
      margin-bottom: 14px;
      overflow-x: auto;
      font-size: 12px;
      color: #c0c0c0;
    }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; }
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
    .btn-restart { background: #f59e0b; color: #141414; }
    .btn-refresh { background: #222; color: #bdbdbd; border: 1px solid #3a3a3a; }
    .btn-install { background: #dc2828; color: #fff; }
    .btn-config { background: #444; color: #e2e2e2; border: 1px solid #5a5a5a; }
    .btn-link { background: #1f2937; color: #dbeafe; border: 1px solid #374151; }
    .error {
      color: #fca5a5;
      font-size: 12px;
      margin-top: 8px;
      white-space: pre-wrap;
    }
    .issues {
      margin-top: 8px;
      font-size: 12px;
      color: #fef3c7;
    }
    .issue-item {
      padding: 6px 8px;
      border: 1px solid #4b2e12;
      background: #2a1e12;
      border-radius: 6px;
      margin-bottom: 6px;
    }
    .muted { color: #9a9a9a; font-size: 12px; }
  </style>
</head>
<body>
  <h2>OpenClaw Gateway Status</h2>
  <div class="subtitle">Last updated: ${updatedAt}</div>
  <div class="status-row">
    <span class="indicator ${running ? 'on' : 'off'}"></span>
    <span>${running ? 'Running' : installed ? 'Not Running' : 'Not Installed'}</span>
  </div>
  <div class="card">
    <div class="grid">
      <div class="kv"><span>Status</span><span>${running ? 'Running' : installed ? 'Stopped' : 'Missing'}</span></div>
      <div class="kv"><span>Service</span><span>${service || '—'}</span></div>
      <div class="kv"><span>PID</span><span>${pid || '—'}</span></div>
      <div class="kv"><span>Port</span><span>${port || '—'}</span></div>
      <div class="kv"><span>Uptime</span><span>${uptime || '—'}</span></div>
    </div>
  </div>
  <div class="card">
    <div class="grid">
      <div class="kv"><span>Dashboard</span><span>${dashboard || '—'}</span></div>
      <div class="kv"><span>Probe</span><span>${probe || '—'}</span></div>
      <div class="kv"><span>Logs</span><span>${logFile || '—'}</span></div>
      <div class="kv"><span>Config</span><span>${configPath || '—'}</span></div>
    </div>
  </div>
  ${safeIssues.length
    ? `<div class="card">
        <div class="issues">
          ${safeIssues.map(i => `<div class="issue-item">${i}</div>`).join('')}
        </div>
      </div>`
    : ''}
  <pre>${safeRaw}</pre>
  ${error ? `<div class="error">${safeError}</div>` : `<div class="muted">Command: openclaw gateway status</div>`}
  ${exitCode ? `<div class="muted">Exit code: ${exitCode}</div>` : ''}
  <div class="actions">
    ${installed
      ? (running
          ? '<button class="btn-stop" data-cmd="gateway-stop">Stop Gateway</button>'
          : '<button class="btn-start" data-cmd="gateway-start">Start Gateway</button>')
      : '<button class="btn-install" data-cmd="install">Install OpenClaw</button>'}
    ${installed ? '<button class="btn-restart" data-cmd="gateway-restart">Restart Gateway</button>' : ''}
    ${installed ? '<button class="btn-config" data-cmd="configure">Open Config</button>' : ''}
    ${dashboard ? '<button class="btn-link" data-cmd="open-dashboard">Open Dashboard</button>' : ''}
    ${logFile ? '<button class="btn-link" data-cmd="open-logs">Open Logs</button>' : ''}
    <button class="btn-refresh" data-cmd="refresh">Refresh</button>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const dashboardUrl = ${JSON.stringify(dashboard || '')};
    const logFilePath = ${JSON.stringify(logFile || '')};
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-cmd]');
      if (!btn) return;
      const cmd = btn.getAttribute('data-cmd');
      if (cmd === 'open-dashboard') return vscode.postMessage({ command: cmd, url: dashboardUrl });
      if (cmd === 'open-logs') return vscode.postMessage({ command: cmd, path: logFilePath });
      vscode.postMessage({ command: cmd });
    });
    setInterval(() => vscode.postMessage({ command: 'refresh' }), 5000);
  </script>
</body>
</html>`;
  }
}
