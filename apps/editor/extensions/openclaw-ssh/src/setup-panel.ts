import * as cp from 'child_process';
import * as vscode from 'vscode';
import type { OpenClawCoreAPI } from '../../openclaw/src/hosts/types';

export class SSHSetupPanel {
  public static currentPanel: SSHSetupPanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri, coreAPI: OpenClawCoreAPI): void {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (SSHSetupPanel.currentPanel) {
      SSHSetupPanel.currentPanel._panel.reveal(column);
      return;
    }

    const homeExt = vscode.extensions.getExtension('openclaw.home');
    const homeUri = homeExt?.extensionUri ?? extensionUri;
    const iconUri = vscode.Uri.joinPath(homeUri, 'media', 'icon.png');

    const panel = vscode.window.createWebviewPanel(
      'openclawSSHSetup',
      'OCC Home [SSH]',
      column ?? vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(homeUri, 'media'),
        ],
        retainContextWhenHidden: true,
      },
    );

    SSHSetupPanel.currentPanel = new SSHSetupPanel(panel, extensionUri, coreAPI, iconUri);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    private readonly _coreAPI: OpenClawCoreAPI,
    iconUri: vscode.Uri,
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    const webviewIconUri = panel.webview.asWebviewUri(iconUri).toString();
    this._panel.webview.html = this._getHtml(webviewIconUri);

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      async (msg: { command: string; host?: string; user?: string; port?: string; keyPath?: string }) => {
        switch (msg.command) {
          case 'sshInstallBegin': {
            const host = msg.host ?? '';
            const user = msg.user ?? '';
            const port = parseInt(msg.port ?? '22', 10) || 22;
            const keyPath = msg.keyPath || undefined;
            await this._handleSSHInstall(host, user, port, keyPath);
            break;
          }
          case 'closePanel':
            this.dispose();
            break;
          default:
            if (msg.command) {
              void vscode.commands.executeCommand(msg.command);
            }
            break;
        }
      },
      null,
      this._disposables,
    );
  }

  public dispose(): void {
    SSHSetupPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const d = this._disposables.pop();
      if (d) { d.dispose(); }
    }
  }

  // ── Handler ────────────────────────────────────────────────────────────────

  private async _handleSSHInstall(host: string, user: string, port: number, keyPath?: string): Promise<void> {
    const log = (text: string, isErr = false) => {
      try { this._panel.webview.postMessage({ type: 'sshLog', text, isErr }); } catch { /* ignore */ }
    };
    const fail = (text: string) => {
      try { this._panel.webview.postMessage({ type: 'sshError', text }); } catch { /* ignore */ }
    };

    try {
      const sshBase = [
        '-o', 'BatchMode=yes',
        '-o', 'ConnectTimeout=15',
        '-o', 'StrictHostKeyChecking=accept-new',
      ];
      if (port !== 22) { sshBase.push('-p', String(port)); }
      if (keyPath) { sshBase.push('-i', keyPath); }
      const remote = `${user}@${host}`;

      // Test connection
      log(`Testing SSH connection to ${remote}...\n`);
      const test = cp.spawnSync('ssh', [...sshBase, remote, 'echo ok'], { timeout: 15000, windowsHide: true });
      if (test.status !== 0 || !test.stdout.toString().includes('ok')) {
        fail(`Cannot connect to ${remote}.\n${test.stderr?.toString().trim() || 'Check hostname, user, and SSH key.'}`);
        return;
      }
      log(`\u2713 Connected to ${remote}\n`);

      // Check if openclaw already installed
      log('Checking for OpenClaw CLI...\n');
      const check = cp.spawnSync('ssh', [...sshBase, remote, 'which openclaw'], { timeout: 8000, windowsHide: true });
      const alreadyInstalled = check.status === 0 && check.stdout.toString().trim().length > 0;

      if (!alreadyInstalled) {
        log('Installing OpenClaw...\n');

        const INSTALL_SCRIPT_URL  = 'https://get.openclaw.sh';
        const INSTALL_CHECKSUM_URL = 'https://releases.openclaw.sh/install.sh.sha256';
        const TMP_SCRIPT   = '/tmp/occ-install.sh';
        const TMP_CHECKSUM = '/tmp/occ-install.sha256';

        const installSteps: Array<{ label: string; cmd: string }> = [
          {
            label: 'Downloading installer...\n',
            cmd: `curl -fsSL ${INSTALL_SCRIPT_URL} -o ${TMP_SCRIPT}`,
          },
          {
            label: 'Fetching checksum...\n',
            cmd: `curl -fsSL ${INSTALL_CHECKSUM_URL} -o ${TMP_CHECKSUM}`,
          },
          {
            label: 'Verifying installer integrity...\n',
            cmd: `cd /tmp && sha256sum -c ${TMP_CHECKSUM}`,
          },
          {
            label: 'Running installer...\n',
            cmd: `bash ${TMP_SCRIPT}`,
          },
        ];

        let installFailed = false;
        for (const step of installSteps) {
          log(step.label);
          const code = await new Promise<number>((resolve) => {
            const proc = cp.spawn('ssh', [...sshBase, remote, step.cmd], { windowsHide: true });
            proc.stdout.on('data', (d: Buffer) => log(d.toString()));
            proc.stderr.on('data', (d: Buffer) => log(d.toString(), true));
            proc.on('close', (c) => resolve(c ?? -1));
            proc.on('error', () => resolve(-1));
          });
          if (code !== 0) {
            // Always clean up temp files before reporting failure
            cp.spawn('ssh', [...sshBase, remote, `rm -f ${TMP_SCRIPT} ${TMP_CHECKSUM}`], { windowsHide: true });
            if (step.label.startsWith('Verifying')) {
              fail('Installer integrity check failed — the downloaded script does not match the expected checksum. Installation aborted.');
            } else {
              fail(`OpenClaw installation failed at: ${step.label.trim()}. See the log above for details.`);
            }
            installFailed = true;
            break;
          }
        }

        // Clean up temp files after successful install too
        cp.spawn('ssh', [...sshBase, remote, `rm -f ${TMP_SCRIPT} ${TMP_CHECKSUM}`], { windowsHide: true });

        if (installFailed) { return; }
        log('\n\u2713 OpenClaw installed\n');
      } else {
        log('\u2713 OpenClaw already installed \u2014 skipping\n');
      }

      // Register SSH host
      log('\nRegistering SSH host...\n');
      const entry = await this._coreAPI.addHost({
        type: 'ssh',
        label: `SSH (${user}@${host})`,
        connection: {
          type: 'ssh',
          host,
          port: port !== 22 ? port : undefined,
          user,
          authMethod: keyPath ? 'key' : 'agent',
          keyPath: keyPath || undefined,
        },
        lastStatus: 'online',
      });
      await this._coreAPI.setActiveHost(entry.id);

      log('\u2713 Done \u2014 loading setup...\n');
      try { this._panel.webview.postMessage({ type: 'sshInstallDone' }); } catch { /* ignore */ }
    } catch (err) {
      fail(String(err));
    }
  }

  // ── HTML ───────────────────────────────────────────────────────────────────

  private _getHtml(iconUri: string): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
      background: #1a1a1a; color: #e0e0e0;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      min-height: 100vh; padding: 32px 20px 48px; text-align: center;
    }
    .logo { width: 48px; height: 48px; filter: drop-shadow(0 4px 12px rgba(220,40,40,0.3)); margin-bottom: 10px; }
    .title { font-size: 19px; font-weight: 700; color: #fff; margin-bottom: 4px; }
    .sub { font-size: 12px; color: #555; margin-bottom: 28px; }
    .form { width: min(400px, 96vw); display: flex; flex-direction: column; gap: 14px; text-align: left; }
    .field { display: flex; flex-direction: column; gap: 5px; }
    .field-label { font-size: 11px; color: #888; font-weight: 500; }
    .field-row { display: flex; gap: 10px; }
    .field-row .field { flex: 1; }
    .field-row .field.narrow { flex: 0 0 80px; }
    input {
      width: 100%; background: #111; border: 1px solid #2b2b2b; border-radius: 6px;
      color: #e0e0e0; font-size: 13px; padding: 9px 12px; outline: none;
      box-sizing: border-box; font-family: inherit;
    }
    input:focus { border-color: #dc2828; }
    input::placeholder { color: #444; }
    .err-msg { font-size: 11.5px; color: #f87171; min-height: 16px; }
    .btn-primary {
      width: 100%; background: #dc2828; border: none; color: #fff;
      font-size: 14px; font-weight: 600; padding: 11px; border-radius: 8px;
      cursor: pointer; transition: background 0.15s; font-family: inherit; margin-top: 4px;
    }
    .btn-primary:hover { background: #b91c1c; }
    .btn-primary:disabled { background: #7a1515; cursor: not-allowed; }
    /* Progress view */
    .progress { width: min(440px, 96vw); display: none; flex-direction: column; gap: 12px; }
    .progress.visible { display: flex; }
    .status-row { display: flex; align-items: center; gap: 10px; font-size: 13px; color: #aaa; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .spinner { width: 16px; height: 16px; flex-shrink: 0; border: 2px solid rgba(220,40,40,0.25); border-top-color: #dc2828; border-radius: 50%; animation: spin 0.7s linear infinite; }
    .log-box {
      background: #0d0d0d; border: 1px solid #222; border-radius: 8px;
      padding: 12px 14px; height: 200px; overflow-y: auto;
      font-family: 'SF Mono', 'Fira Mono', 'Consolas', monospace;
      font-size: 11px; line-height: 1.6; text-align: left; color: #888;
    }
    .log-line { white-space: pre-wrap; word-break: break-all; }
    .log-line.err { color: #f87171; }
    .err-card { font-size: 12px; color: #f87171; background: rgba(248,113,113,0.07); border: 1px solid rgba(248,113,113,0.2); border-radius: 8px; padding: 12px 16px; text-align: left; white-space: pre-wrap; }
    .btn-retry { background: #dc2828; border: none; color: #fff; font-size: 13px; font-weight: 600; padding: 9px 22px; border-radius: 8px; cursor: pointer; font-family: inherit; }
    .btn-retry:hover { background: #b91c1c; }
    .done-msg { font-size: 13px; color: #4ade80; font-weight: 600; }
    .btn-back { background: transparent; border: 1px solid #2b2b2b; color: #666; font-size: 12px; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-family: inherit; margin-top: 8px; }
    .btn-back:hover { color: #aaa; border-color: #444; }
  </style>
</head>
<body>
  <img class="logo" src="${iconUri}" alt="OpenClaw" />
  <div class="title">SSH Installation</div>
  <div class="sub">Install OpenClaw on a remote server via SSH</div>

  <!-- Form view -->
  <div id="view-form">
    <div class="form">
      <div class="field-row">
        <div class="field">
          <div class="field-label">Hostname or IP</div>
          <input id="ssh-host" type="text" placeholder="example.com" autocomplete="off" />
        </div>
        <div class="field narrow">
          <div class="field-label">Port</div>
          <input id="ssh-port" type="number" placeholder="22" value="22" />
        </div>
      </div>
      <div class="field">
        <div class="field-label">SSH User</div>
        <input id="ssh-user" type="text" placeholder="ubuntu, ec2-user, root..." autocomplete="off" />
      </div>
      <div class="field">
        <div class="field-label">SSH Key Path (leave blank to use SSH agent)</div>
        <input id="ssh-key" type="text" placeholder="~/.ssh/id_rsa" autocomplete="off" />
      </div>
      <div class="err-msg" id="form-err"></div>
      <button class="btn-primary" id="btn-connect" onclick="sshSubmit()">
        Connect &amp; Install &#8594;
      </button>
    </div>
  </div>

  <!-- Progress view -->
  <div class="progress" id="view-progress">
    <div class="status-row" id="progress-status">
      <div class="spinner"></div>
      <span id="progress-text">Connecting...</span>
    </div>
    <div class="log-box" id="log-box"></div>
    <div id="err-area" style="display:none;flex-direction:column;align-items:center;gap:10px;">
      <div class="err-card" id="err-card"></div>
      <button class="btn-retry" onclick="retrySSH()">Retry</button>
    </div>
    <div id="done-area" style="display:none;">
      <div class="done-msg">\u2713 All done \u2014 loading setup...</div>
    </div>
  </div>

  <button class="btn-back" onclick="goBack()">&#8592; Back</button>

  <script>
    const vscode = acquireVsCodeApi();

    function goBack() {
      vscode.postMessage({ command: 'closePanel' });
    }

    function retrySSH() {
      document.getElementById('view-progress').classList.remove('visible');
      document.getElementById('view-form').style.display = '';
      document.getElementById('err-area').style.display = 'none';
      document.getElementById('err-card').textContent = '';
      document.getElementById('log-box').innerHTML = '';
      document.getElementById('done-area').style.display = 'none';
    }

    function sshSubmit() {
      var host = document.getElementById('ssh-host').value.trim();
      var user = document.getElementById('ssh-user').value.trim();
      var port = document.getElementById('ssh-port').value.trim() || '22';
      var keyPath = document.getElementById('ssh-key').value.trim();
      var errEl = document.getElementById('form-err');

      if (!host) { errEl.textContent = 'Hostname is required.'; return; }
      if (!user) { errEl.textContent = 'SSH user is required.'; return; }
      errEl.textContent = '';

      document.getElementById('view-form').style.display = 'none';
      document.getElementById('view-progress').classList.add('visible');
      document.getElementById('progress-text').textContent = 'Connecting to ' + user + '@' + host + '...';

      vscode.postMessage({ command: 'sshInstallBegin', host: host, user: user, port: port, keyPath: keyPath });
    }

    window.addEventListener('message', function(e) {
      var msg = e.data;
      if (msg.type === 'sshLog') {
        var box = document.getElementById('log-box');
        var line = document.createElement('div');
        line.className = 'log-line' + (msg.isErr ? ' err' : '');
        line.textContent = msg.text;
        box.appendChild(line);
        box.scrollTop = box.scrollHeight;
        document.getElementById('progress-status').style.display = 'none';
      } else if (msg.type === 'sshError') {
        document.getElementById('progress-status').style.display = 'none';
        document.getElementById('err-area').style.display = 'flex';
        document.getElementById('err-card').textContent = msg.text;
      } else if (msg.type === 'sshInstallDone') {
        document.getElementById('progress-status').style.display = 'none';
        document.getElementById('done-area').style.display = '';
      }
    });

    document.getElementById('ssh-host').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') sshSubmit();
    });
    document.getElementById('ssh-user').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') sshSubmit();
    });
  </script>
</body>
</html>`;
  }
}
