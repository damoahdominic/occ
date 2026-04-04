import * as cp from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as https from 'https';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import type { OpenClawCoreAPI } from '../../openclaw/src/hosts/types';
import { DefaultLocalHostConnection } from '../../openclaw/src/hosts/localDefault';
import { StatusPanelController } from '../../openclaw/src/panels/statusController';

// ── Persistent diagnostics log ────────────────────────────────────────────────
const LOG_PATH      = path.join(os.homedir(), '.openclaw', 'occ-home.log');
const LOG_MAX_BYTES = 512 * 1024; // 500 KB

const _ansiRe = /\x1b(\[[0-9;]*[A-Za-z]|[^[])/g;

function writeLog(text: string): void {
  try {
    const dir = path.dirname(LOG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(LOG_PATH) && fs.statSync(LOG_PATH).size > LOG_MAX_BYTES) {
      const lines = fs.readFileSync(LOG_PATH, 'utf-8').split('\n');
      fs.writeFileSync(LOG_PATH, lines.slice(Math.floor(lines.length / 2)).join('\n'), 'utf-8');
    }
    const ts = new Date().toISOString();
    const clean = text.replace(_ansiRe, '');
    const stamped = clean
      .split('\n')
      .map(l => (l.trim() ? `[${ts}] ${l}` : l))
      .join('\n');
    fs.appendFileSync(LOG_PATH, stamped, 'utf-8');
  } catch { /* non-fatal */ }
}

// ── OCC Legacy model constants ────────────────────────────────────────────────
const OCC_LEGACY_MODEL_ID   = 'occ-legacy';
const OCC_LEGACY_MODEL_NAME = 'occ-legacy';
const OCC_LEGACY_BASE_URL   = 'https://occ.mba.sh/v1';
const OCC_LEGACY_API        = 'openai-completions';
const OCC_LEGACY_COST = {
  input:      0.0000006,
  output:     0.000003,
  cacheRead:  0.0000001,
  cacheWrite: 0,
};
const OCC_LEGACY_CONTEXT_WINDOW = 262144;
const OCC_LEGACY_MAX_TOKENS     = 262144;

export class LocalSetupPanel {
  public static currentPanel: LocalSetupPanel | undefined;
  private static _installedCliPath: string | undefined;
  /** Resolves with the password (or undefined on cancel) when the webview modal submits. */
  private _pendingPasswordResolve: ((pwd: string | undefined) => void) | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private readonly _coreAPI: OpenClawCoreAPI;
  private _disposables: vscode.Disposable[] = [];
  private _host = new DefaultLocalHostConnection();
  private _statusController: StatusPanelController | undefined;

  /** Returns the home extension URI (has media/icon.png and media/emojis/). */
  private get _homeUri(): vscode.Uri {
    const homeExt = vscode.extensions.getExtension('openclaw.home');
    return homeExt?.extensionUri ?? this._extensionUri;
  }

  public static createOrShow(extensionUri: vscode.Uri, coreAPI: OpenClawCoreAPI): void {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (LocalSetupPanel.currentPanel) {
      LocalSetupPanel.currentPanel._panel.reveal(column);
      return;
    }

    const homeExt = vscode.extensions.getExtension('openclaw.home');
    const homeUri = homeExt?.extensionUri ?? extensionUri;
    const iconUri = vscode.Uri.joinPath(homeUri, 'media', 'icon.png');

    const panel = vscode.window.createWebviewPanel(
      'openclawLocalSetup',
      'OCC Home [Local]',
      column ?? vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(homeUri, 'media'),
        ],
        retainContextWhenHidden: true,
      },
    );

    LocalSetupPanel.currentPanel = new LocalSetupPanel(panel, extensionUri, coreAPI, iconUri);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    coreAPI: OpenClawCoreAPI,
    iconUri: vscode.Uri,
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._coreAPI = coreAPI;

    void this._initHtml(iconUri);

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      async (msg: { command: string; [key: string]: unknown }) => {
        // When the status panel is active, delegate all messages to it.
        if (this._statusController) {
          this._statusController.handleMessage(msg);
          return;
        }
        if (msg.command === 'openclaw.install') {
          void this._runInstall();
        } else if (msg.command === 'runSetup') {
          void this._runSetup(msg as { command: string; provider: string; apiKey: string; port: string });
        } else if (msg.command === 'autoSetupSkipped') {
          setTimeout(() => {
            void this._showStatusPanel();
            void vscode.commands.executeCommand('openclaw.openWorkspace');
            setTimeout(() => {
              void vscode.commands.executeCommand('void.openChatWithMessage',
                'Run `openclaw gateway start` to start the OpenClaw gateway.',
                'agent');
            }, 1000);
          }, 500);
        } else if (msg.command === 'verifyCliBeforeSetup') {
          const storedPath = LocalSetupPanel._installedCliPath;
          if (storedPath && fs.existsSync(storedPath)) {
            try { this._panel.webview.postMessage({ type: 'proceedAutoSetup' }); } catch {}
            return;
          }
          void this._host.testOpenClawCli().then(result => {
            if (result.ok) {
              try {
                this._panel.webview.postMessage({ type: 'proceedAutoSetup' });
              } catch {}
            } else {
              try {
                this._panel.webview.postMessage({
                  type: 'installLog',
                  text: '\n⚠️  OpenClaw was installed but could not be found in PATH.\n' +
                        '    Please restart OCCode to pick up the new PATH.\n'
                });
              } catch {}
            }
          });
        } else if (msg.command === 'sudoPassword') {
          this._pendingPasswordResolve?.(msg.password as string | undefined);
          this._pendingPasswordResolve = undefined;
        } else if (msg.command === 'signIn') {
          void vscode.env.openExternal(vscode.Uri.parse('https://occ.mba.sh/login?ref=occ-editor'));
        } else if (msg.command === 'openDashboard') {
          void vscode.env.openExternal(vscode.Uri.parse('https://occ.mba.sh/dashboard'));
        } else if (msg.command === 'signOut') {
          void vscode.commands.executeCommand('occ.auth.setLegacyJwt', '');
          void vscode.commands.executeCommand('occ.auth.setMoltpilotKey', '');
          void vscode.commands.executeCommand('openclaw.jwt.set', '');
        } else if (msg.command === 'closePanel') {
          this.dispose();
        } else if (msg.command) {
          void vscode.commands.executeCommand(msg.command);
        }
      },
      null,
      this._disposables,
    );
  }

  public dispose(): void {
    LocalSetupPanel.currentPanel = undefined;
    this._statusController?.dispose();
    this._statusController = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const d = this._disposables.pop();
      if (d) { d.dispose(); }
    }
  }

  private async _initHtml(iconUri: vscode.Uri): Promise<void> {
    const configPath = await this._host.getConfigPath();
    const isInstalled = await this._host.exists(configPath);

    if (isInstalled) {
      await this._showStatusPanel();
      return;
    }

    const webviewIconUri = this._panel.webview.asWebviewUri(iconUri);

    const occJwt = await vscode.commands.executeCommand<string>('occ.auth.getLegacyJwt').then(r => r ?? '', () => '');

    let occUser: { email: string; picture: string | null; balance_usd: number; api_keys?: { moltpilotKey?: string; occKey?: string } | null } | null = null;
    if (occJwt) {
      try {
        const r = await fetch('https://occ.mba.sh/api/v1/me', {
          headers: { Authorization: `Bearer ${occJwt}` },
        });
        if (r.ok) occUser = await r.json() as { email: string; picture: string | null; balance_usd: number; api_keys?: { moltpilotKey?: string; occKey?: string } | null };
      } catch { /* network error */ }
    }

    this._panel.webview.html = this._getHtml(isInstalled, webviewIconUri.toString(), occUser);
  }

  /** Switch this panel to show the full status panel (with gateway controls, AI model, etc.). */
  private async _showStatusPanel(): Promise<void> {
    if (this._statusController) {
      await this._statusController._update();
      return;
    }
    this._statusController = new StatusPanelController(
      this._panel,
      this._homeUri,
      this._host,
      () => {
        // Disconnect: clear binding, dispose this panel, reopen the host picker (never auto-route).
        this.dispose();
        void vscode.commands.executeCommand('openclaw.home.picker');
      },
    );
    await this._statusController.show();
    // Update tab title and set window-level host binding.
    try {
      const cfg = await this._host.readConfig();
      const gw = cfg['gateway'] as Record<string, unknown> | undefined;
      const p = gw?.['port'] ?? cfg['gateway_port'] ?? 18789;
      const port = typeof p === 'number' ? p : parseInt(String(p), 10) || 18789;
      this._panel.title = `OCC Home {Local:${port}}`;
      void vscode.commands.executeCommand('occ.window.setHost', {
        type: 'local', hostId: 'local', port, label: 'Local',
      });
    } catch {
      this._panel.title = 'OCC Home {Local}';
      void vscode.commands.executeCommand('occ.window.setHost', {
        type: 'local', hostId: 'local', port: 18789, label: 'Local',
      });
    }
  }

  /**
   * Fetches openclaw package metadata from npm, downloads the tarball,
   * verifies its SHA-512 integrity, and returns the path to the verified file.
   * Throws if the download fails or the hash doesn't match.
   */
  private async _downloadAndVerifyOpenClaw(tee: (s: string) => void): Promise<string> {
    tee('Fetching package metadata from npm registry...\n');

    // 1. Fetch metadata
    const meta = await new Promise<{ version: string; integrity: string; tarball: string }>((resolve, reject) => {
      const req = https.get(
        { hostname: 'registry.npmjs.org', path: '/openclaw/latest', headers: { Accept: 'application/json' } },
        res => {
          let raw = '';
          res.on('data', (c: Buffer) => { raw += c.toString(); });
          res.on('end', () => {
            try {
              const d = JSON.parse(raw) as { version: string; dist: { integrity: string; tarball: string } };
              resolve({ version: d.version, integrity: d.dist.integrity, tarball: d.dist.tarball });
            } catch (e) { reject(new Error(`Failed to parse npm metadata: ${e}`)); }
          });
        }
      );
      req.on('error', reject);
      req.setTimeout(15000, () => { req.destroy(); reject(new Error('npm registry request timed out')); });
    });

    tee(`  ✓ Latest version: ${meta.version}\n`);
    tee(`Downloading openclaw@${meta.version}...\n`);

    // 2. Download tarball
    const tmpFile = path.join(os.tmpdir(), `openclaw-${meta.version}-${Date.now()}.tgz`);
    await new Promise<void>((resolve, reject) => {
      const follow = (url: string) => {
        https.get(url, res => {
          if (res.statusCode === 301 || res.statusCode === 302) {
            follow(res.headers.location!); return;
          }
          if (res.statusCode !== 200) { reject(new Error(`Download failed: HTTP ${res.statusCode}`)); return; }
          const out = fs.createWriteStream(tmpFile);
          res.pipe(out);
          out.on('finish', () => { out.close(); resolve(); });
          out.on('error', reject);
          res.on('error', reject);
        }).on('error', reject);
      };
      follow(meta.tarball);
    });

    tee('  ✓ Download complete\n');
    tee('Verifying package integrity...\n');

    // 3. Verify SHA-512 (SRI format: "sha512-<base64>")
    const [algo, expectedB64] = meta.integrity.split('-');
    if (algo !== 'sha512' || !expectedB64) {
      throw new Error(`Unsupported integrity algorithm: ${algo}. Expected sha512.`);
    }
    const fileBuffer = fs.readFileSync(tmpFile);
    const actualHash = crypto.createHash('sha512').update(fileBuffer).digest('base64');
    if (actualHash !== expectedB64) {
      try { fs.unlinkSync(tmpFile); } catch {}
      throw new Error(
        `⚠ Security check failed — package integrity mismatch for openclaw@${meta.version}.\n` +
        `Expected: ${expectedB64}\nGot:      ${actualHash}\n` +
        `This could indicate a compromised download. Installation aborted.`
      );
    }

    tee('  ✓ Integrity verified (SHA-512 match)\n');
    return tmpFile;
  }

  private async _runInstall(): Promise<void> {
    const platform = process.platform;
    const arch = process.arch;
    const shell = process.env.SHELL || '';

    const post = (msg: object) => { try { this._panel.webview.postMessage(msg); } catch {} };
    let fullLog = '';
    const tee = (text: string) => { fullLog += text; post({ type: 'installLog', text }); writeLog(text); };

    writeLog(`\n=== _runInstall START platform=${platform} arch=${arch} ===\n`);
    post({ type: 'installState', state: 'running' });

    const env = this._host.buildExecEnv();
    const isPermError = (s: string) => /EACCES|permission denied|EPERM|not permitted|Need sudo access|needs to be an Administrator/i.test(s);

    const cmdExists = (cmd: string): Promise<boolean> =>
      new Promise(resolve =>
        cp.exec(cmd, { env, timeout: 5000, windowsHide: true }, err => resolve(!err))
      );

    const runCaptured = (cmd: string, args: string[], opts: cp.SpawnOptions = {}): Promise<{ code: number }> =>
      new Promise(resolve => {
        const child = cp.spawn(cmd, args, { env, stdio: ['ignore', 'pipe', 'pipe'], ...opts });
        child.stdout?.on('data', (d: Buffer) => tee(d.toString()));
        child.stderr?.on('data', (d: Buffer) => tee(d.toString()));
        child.on('close', code => resolve({ code: code ?? 1 }));
        child.on('error', err => { tee(`\nError: ${err.message}\n`); resolve({ code: 1 }); });
      });

    const cacheSudo = async (_prompt: string): Promise<boolean> => {
      const password = await new Promise<string | undefined>(resolve => {
        this._pendingPasswordResolve = resolve;
        post({ type: 'requestPassword' });
      });
      if (!password) return false;
      tee('Verifying credentials...\n');
      return new Promise(resolve => {
        const child = cp.spawn('sudo', ['-S', '-v'], { env, stdio: ['pipe', 'pipe', 'pipe'] });
        child.stdin?.write(password + '\n');
        child.stdin?.end();
        child.on('close', code => resolve(code === 0));
        child.on('error', () => resolve(false));
      });
    };

    const fixOpenclawPermissions = async () => {
      if (platform === 'win32') return;
      const openclawDir = path.join(os.homedir(), '.openclaw');
      if (!fs.existsSync(openclawDir)) return;
      try {
        const username = os.userInfo().username;
        tee('Fixing .openclaw folder ownership...\n');
        await runCaptured('sudo', ['-n', 'chown', '-R', username, openclawDir]);
        await runCaptured('chmod', ['700', openclawDir]);
        tee('✅  Permissions set (700, owned by you)\n');
      } catch { /* non-fatal */ }
    };

    const failCancelled = () => {
      post({ type: 'installState', state: 'cancelled' });
    };

    const fail = async () => {
      writeLog('=== _runInstall END failed ===\n');
      post({ type: 'installState', state: 'failed' });
      const platformDesc = platform === 'darwin' ? 'macOS' : platform === 'win32' ? 'Windows' : `Linux (${arch})`;
      await vscode.commands.executeCommand('void.openChatWithMessage', [
        `OpenClaw installation failed on **${platformDesc}**.`,
        ``, `**System info:**`,
        `- Node.js: \`${process.version}\``,
        `- Shell: \`${shell || 'unknown'}\``,
        ``, `**Full output:**`, `\`\`\``, fullLog.trim(), `\`\`\``, ``,
        `Please diagnose what went wrong and provide exact steps to fix it on this platform.`,
        `If Node.js or npm is missing, explain how to install them first.`,
      ].join('\n'));
      void vscode.commands.executeCommand('openclaw.balance.spend');
    };

    const captureInstalledPath = async (): Promise<void> => {
      if (platform === 'win32') return;
      const candidates: string[] = [];
      const prefixResult = await new Promise<string>(resolve => {
        cp.exec('npm config get prefix', { env, timeout: 5000 }, (err, stdout) =>
          resolve(err ? '' : (stdout || '').trim())
        );
      });
      if (prefixResult) candidates.push(path.join(prefixResult, 'bin', 'openclaw'));
      const home = os.homedir();
      candidates.push(
        '/usr/local/bin/openclaw',
        '/opt/homebrew/bin/openclaw',
        path.join(home, '.local', 'bin', 'openclaw'),
        path.join(home, '.npm-global', 'bin', 'openclaw'),
        path.join(home, '.openclaw', 'bin', 'openclaw'),
      );
      const nvmVersionsDir = path.join(home, '.nvm', 'versions', 'node');
      if (fs.existsSync(nvmVersionsDir)) {
        fs.readdirSync(nvmVersionsDir)
          .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
          .forEach(ver => candidates.push(path.join(nvmVersionsDir, ver, 'bin', 'openclaw')));
      }
      const found = candidates.find(c => c && fs.existsSync(c));
      if (found) {
        LocalSetupPanel._installedCliPath = found;
        tee(`  ✓ Binary found at ${found}\n`);
      }
    };

    const succeed = async () => {
      await captureInstalledPath();
      tee('\n✅  Installed successfully!\n');
      writeLog('=== _runInstall END ok ===\n');
      post({ type: 'installState', state: 'done' });
    };

    // ── PREREQUISITE CHECKS ──────────────────────────────────────────────────
    tee('Checking prerequisites...\n');

    if (platform === 'darwin') {
      const xcodeOk = await new Promise<boolean>(resolve =>
        cp.exec('xcode-select -p', { env, timeout: 5000 }, (err, stdout) => {
          resolve(!err && !!stdout?.toString().trim());
        })
      );
      if (!xcodeOk) {
        post({ type: 'xcodeRequired' });
        return;
      }
      tee('  ✓ Xcode Command Line Tools\n');
    }

    if (platform === 'win32') {
      let nodeOk = await cmdExists('node --version');
      if (!nodeOk) {
        const nodeVersion = '20.18.2';
        const nodeArch = arch === 'arm64' ? 'arm64' : 'x64';
        const zipName = `node-v${nodeVersion}-win-${nodeArch}.zip`;
        const zipUrl = `https://nodejs.org/dist/v${nodeVersion}/${zipName}`;
        const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
        const installDir = path.join(localAppData, 'Programs', 'nodejs');
        const tmpZip = path.join(os.tmpdir(), zipName);
        const tmpExtract = path.join(os.tmpdir(), `occ-node-${Date.now()}`);

        tee(`  ⚠ Node.js not found — downloading v${nodeVersion} (${nodeArch})...\n`);
        const dlR = await runCaptured('powershell', [
          '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
          `$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing '${zipUrl}' -OutFile '${tmpZip}'`,
        ], { windowsHide: true, shell: true } as cp.SpawnOptions);

        if (dlR.code !== 0) {
          tee('  ❌ Failed to download Node.js. Check your internet connection.\n');
          await fail(); return;
        }

        tee(`  Extracting...\n`);
        const innerDir = path.join(tmpExtract, `node-v${nodeVersion}-win-${nodeArch}`);
        const exR = await runCaptured('powershell', [
          '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
          `$ProgressPreference='SilentlyContinue'; ` +
          `Expand-Archive -Path '${tmpZip}' -DestinationPath '${tmpExtract}' -Force; ` +
          `if (Test-Path '${installDir}') { Remove-Item '${installDir}' -Recurse -Force }; ` +
          `Move-Item '${innerDir}' '${installDir}'`,
        ], { windowsHide: true, shell: true } as cp.SpawnOptions);

        try { fs.unlinkSync(tmpZip); } catch {}

        if (exR.code !== 0) {
          tee('  ❌ Failed to extract Node.js.\n');
          await fail(); return;
        }

        env.PATH = [installDir, env.PATH || ''].filter(Boolean).join(';');
        (env as Record<string, string | undefined>).Path = env.PATH;

        nodeOk = await cmdExists('node --version');
        if (!nodeOk) {
          tee('  ❌ Node.js install did not complete properly.\n');
          await fail(); return;
        }
        tee(`  ✓ Node.js v${nodeVersion} installed to ${installDir}\n`);
      } else {
        tee('  ✓ Node.js found\n');
      }
    }

    const npmOk = await cmdExists('npm --version');
    if (npmOk) {
      tee('  ✓ npm found\n');
    } else if (platform === 'win32') {
      tee('  ❌ npm not found after Node.js install — unexpected.\n');
      await fail(); return;
    } else {
      tee('  ⚠ npm not found — will attempt to install Node.js\n');
    }

    let sudoCached = false;
    if (platform !== 'win32') {
      let needsSudo = false;
      if (npmOk) {
        const prefixResult = await new Promise<string>(resolve =>
          cp.exec('npm config get prefix', { env, timeout: 5000 }, (err, stdout) =>
            resolve(err ? '' : stdout?.toString().trim() || ''))
        );
        if (prefixResult) {
          try {
            const gBin = path.join(prefixResult, 'bin');
            const gLib = path.join(prefixResult, 'lib');
            if (fs.existsSync(gBin)) fs.accessSync(gBin, fs.constants.W_OK);
            if (fs.existsSync(gLib)) fs.accessSync(gLib, fs.constants.W_OK);
          } catch {
            needsSudo = true;
          }
        }
      } else {
        for (const dir of ['/usr/local/bin', '/usr/local/lib']) {
          try { if (fs.existsSync(dir)) fs.accessSync(dir, fs.constants.W_OK); } catch { needsSudo = true; break; }
        }
      }

      if (needsSudo) {
        tee('\n  Administrator password required for installation.\n');
        const sudoOk = await cacheSudo('Enter your system password to install OpenClaw');
        if (!sudoOk) { tee('  Incorrect password or cancelled.\n'); failCancelled(); return; }
        tee('  ✓ Credentials verified\n');
        sudoCached = true;
      } else {
        tee('  ✓ Write access OK\n');
      }
    }

    tee('\n');

    if (npmOk) {
      // Download and verify before installing
      let verifiedTgz: string | null = null;
      try {
        verifiedTgz = await this._downloadAndVerifyOpenClaw(tee);
      } catch (e) {
        tee(`\n${(e as Error).message}\n`);
        await fail(); return;
      }

      tee('Installing openclaw...\n');
      const spawnOpts: cp.SpawnOptions = platform === 'win32' ? { shell: true, windowsHide: true } : {};
      const npmArgs = ['install', '-g', verifiedTgz];
      const r1 = sudoCached
        ? await runCaptured('sudo', ['-E', 'npm', ...npmArgs])
        : await runCaptured('npm', npmArgs, spawnOpts);
      try { fs.unlinkSync(verifiedTgz); } catch {}
      if (r1.code === 0) {
        if (sudoCached) await fixOpenclawPermissions();
        await succeed(); return;
      }
      if (!sudoCached && platform !== 'win32' && isPermError(fullLog)) {
        tee('\nPermission error — elevated access required.\n');
        const ok = await cacheSudo('Enter your system password to install OpenClaw');
        if (!ok) { tee('Incorrect password or cancelled.\n'); failCancelled(); return; }
        sudoCached = true;
        tee('Retrying with elevated permissions...\n');
        // Re-download and re-verify for the sudo retry
        let retryTgz: string | null = null;
        try {
          retryTgz = await this._downloadAndVerifyOpenClaw(tee);
        } catch (e) {
          tee(`\n${(e as Error).message}\n`);
          await fail(); return;
        }
        const r2 = await runCaptured('sudo', ['-E', 'npm', 'install', '-g', retryTgz]);
        try { fs.unlinkSync(retryTgz); } catch {}
        if (r2.code === 0) {
          await fixOpenclawPermissions();
          await succeed(); return;
        }
      }
      tee('\nnpm install did not succeed — trying full installer script...\n');
    } else if (platform !== 'win32') {

      const nvmSh = path.join(os.homedir(), '.nvm', 'nvm.sh');
      if (fs.existsSync(nvmSh)) {
        tee('nvm detected — installing Node.js LTS...\n');
        let nvmTgz: string | null = null;
        try {
          nvmTgz = await this._downloadAndVerifyOpenClaw(tee);
        } catch (e) {
          tee(`\n${(e as Error).message}\n`);
          await fail(); return;
        }
        const nvmR = await runCaptured('bash', ['-c',
          `. "${nvmSh}" && nvm install --lts && nvm use --lts && npm install -g '${nvmTgz}'`
        ]);
        try { fs.unlinkSync(nvmTgz); } catch {}
        if (nvmR.code === 0) { await fixOpenclawPermissions(); await succeed(); return; }
        tee('nvm install failed — falling back to system install...\n');
      }

      if (!sudoCached) {
        tee('\nNode.js is required. Your password is needed once to install it.\n');
        const sudoOk = await cacheSudo('Enter your password to install Node.js');
        if (!sudoOk) { tee('Incorrect password or cancelled.\n'); failCancelled(); return; }
        sudoCached = true;
      }

      if (platform === 'darwin') {
        const nodeVersion = '20.18.2';
        const pkgUrl = `https://nodejs.org/dist/v${nodeVersion}/node-v${nodeVersion}.pkg`;
        const pkgPath = `/tmp/.occ-node-${nodeVersion}.pkg`;
        tee(`Downloading Node.js v${nodeVersion}...\n`);
        const dlR = await runCaptured('curl', ['-fsSL', pkgUrl, '-o', pkgPath]);
        if (dlR.code !== 0) { try { fs.unlinkSync(pkgPath); } catch {} await fail(); return; }
        tee('Installing Node.js (this may take a moment)...\n');
        const instR = await runCaptured('sudo', ['-n', 'installer', '-pkg', pkgPath, '-target', '/']);
        try { fs.unlinkSync(pkgPath); } catch { /* non-fatal */ }
        if (instR.code !== 0) { await fail(); return; }
      } else {
        const hasCmdSync = (cmd: string): boolean => {
          try { cp.execSync(`which ${cmd}`, { env, stdio: 'ignore' }); return true; } catch { return false; }
        };
        tee('Installing Node.js via package manager...\n');
        let pkgResult: { code: number } | undefined;
        if (hasCmdSync('apt-get')) {
          pkgResult = await runCaptured('sudo', ['-n', 'bash', '-c',
            'curl -fsSL https://deb.nodesource.com/setup_lts.x | bash - && apt-get install -y nodejs'
          ]);
        } else if (hasCmdSync('dnf')) {
          pkgResult = await runCaptured('sudo', ['-n', 'bash', '-c',
            'curl -fsSL https://rpm.nodesource.com/setup_lts.x | bash - && dnf install -y nodejs'
          ]);
        } else if (hasCmdSync('yum')) {
          pkgResult = await runCaptured('sudo', ['-n', 'bash', '-c',
            'curl -fsSL https://rpm.nodesource.com/setup_lts.x | bash - && yum install -y nodejs'
          ]);
        }
        if (!pkgResult) { tee('No supported package manager found (tried apt-get, dnf, yum).\n'); await fail(); return; }
        if (pkgResult.code !== 0) { await fail(); return; }
      }

      tee('Installing OpenClaw...\n');
      const npmCandidates = ['/usr/local/bin/npm', '/usr/bin/npm'];
      const npmBin = npmCandidates.find(p => fs.existsSync(p)) ?? 'npm';
      // Always use verified tarball — never install bare package name
      let postNodeTgz: string | null = null;
      try {
        postNodeTgz = await this._downloadAndVerifyOpenClaw(tee);
      } catch (e) {
        tee(`\n${(e as Error).message}\n`);
        await fail(); return;
      }
      const npmR1 = await runCaptured(npmBin, ['install', '-g', postNodeTgz]);
      try { fs.unlinkSync(postNodeTgz); } catch {}
      if (npmR1.code === 0) { await fixOpenclawPermissions(); await succeed(); return; }
      if (isPermError(fullLog)) {
        let sudoTgz: string | null = null;
        try {
          sudoTgz = await this._downloadAndVerifyOpenClaw(tee);
        } catch (e) {
          tee(`\n${(e as Error).message}\n`);
          await fail(); return;
        }
        const npmR2 = await runCaptured('sudo', ['-n', npmBin, 'install', '-g', sudoTgz]);
        try { fs.unlinkSync(sudoTgz); } catch {}
        if (npmR2.code === 0) { await fixOpenclawPermissions(); await succeed(); return; }
      }
      await fail(); return;

    } else {
      tee('npm not found — running full installer script...\n');
    }

    // Last-resort: download installer script, verify checksum, then run.
    // Never pipe remote scripts directly into a shell.
    const INSTALL_CHECKSUM_URL = 'https://releases.openclaw.sh/install.sh.sha256';

    if (platform === 'win32') {
      tee('Running PowerShell installer...\n');
      const psScript = path.join(os.tmpdir(), `occ-install-${Date.now()}.ps1`);
      const psChecksumFile = path.join(os.tmpdir(), `occ-install-${Date.now()}.ps1.sha256`);
      const dlScript = await runCaptured('powershell', ['-NoProfile', '-Command',
        `Invoke-WebRequest -UseBasicParsing https://openclaw.ai/install.ps1 -OutFile '${psScript}'`
      ], { windowsHide: true } as cp.SpawnOptions);
      if (dlScript.code !== 0) { tee('Failed to download installer script.\n'); await fail(); return; }
      const dlChecksum = await runCaptured('powershell', ['-NoProfile', '-Command',
        `Invoke-WebRequest -UseBasicParsing https://releases.openclaw.sh/install.ps1.sha256 -OutFile '${psChecksumFile}'`
      ], { windowsHide: true } as cp.SpawnOptions);
      if (dlChecksum.code === 0) {
        const verifyR = await runCaptured('powershell', ['-NoProfile', '-Command',
          `$expected = (Get-Content '${psChecksumFile}').Split(' ')[0]; ` +
          `$actual = (Get-FileHash -Algorithm SHA256 '${psScript}').Hash.ToLower(); ` +
          `if ($expected -ne $actual) { Write-Error "Checksum mismatch: expected $expected got $actual"; exit 1 }`
        ], { windowsHide: true } as cp.SpawnOptions);
        if (verifyR.code !== 0) {
          tee('⚠ Installer script integrity check failed — aborting.\n');
          try { fs.unlinkSync(psScript); } catch {}
          try { fs.unlinkSync(psChecksumFile); } catch {}
          await fail(); return;
        }
        tee('  ✓ Installer integrity verified (SHA-256)\n');
      } else {
        tee('Warning: could not fetch checksum — proceeding with unverified installer.\n');
      }
      try { fs.unlinkSync(psChecksumFile); } catch {}
      const r = await runCaptured('powershell', [
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psScript,
      ], { windowsHide: true } as cp.SpawnOptions);
      try { fs.unlinkSync(psScript); } catch {}
      if (r.code === 0) { await succeed(); return; }
    } else {
      tee('Downloading install script...\n');
      const tmpScript = path.join(os.tmpdir(), `occ-install-${Date.now()}.sh`);
      const tmpChecksum = path.join(os.tmpdir(), `occ-install-${Date.now()}.sha256`);
      const dlScript = await runCaptured('curl', ['-fsSL', 'https://openclaw.ai/install.sh', '-o', tmpScript]);
      if (dlScript.code !== 0) { tee('Failed to download installer script.\n'); await fail(); return; }
      const dlChecksum = await runCaptured('curl', ['-fsSL', INSTALL_CHECKSUM_URL, '-o', tmpChecksum]);
      if (dlChecksum.code === 0) {
        // Rewrite checksum file to reference actual tmp filename, then verify
        const checksumContent = fs.readFileSync(tmpChecksum, 'utf-8').trim();
        const expectedHash = checksumContent.split(/\s+/)[0];
        const scriptName = path.basename(tmpScript);
        fs.writeFileSync(tmpChecksum, `${expectedHash}  ${scriptName}\n`);
        const verifyR = await runCaptured('bash', ['-c',
          `cd "${path.dirname(tmpScript)}" && (sha256sum -c '${tmpChecksum}' 2>/dev/null || shasum -a 256 -c '${tmpChecksum}')`
        ]);
        if (verifyR.code !== 0) {
          tee('⚠ Installer script integrity check failed — aborting.\n');
          try { fs.unlinkSync(tmpScript); } catch {}
          try { fs.unlinkSync(tmpChecksum); } catch {}
          await fail(); return;
        }
        tee('  ✓ Installer integrity verified (SHA-256)\n');
      } else {
        tee('Warning: could not fetch checksum — proceeding with unverified installer.\n');
      }
      try { fs.unlinkSync(tmpChecksum); } catch {}
      const r1 = await runCaptured('bash', [tmpScript]);
      if (r1.code === 0) {
        try { fs.unlinkSync(tmpScript); } catch {}
        await fixOpenclawPermissions();
        await succeed(); return;
      }
      if (isPermError(fullLog)) {
        tee('\nPermission error in installer — elevated access required.\n');
        const ok = await cacheSudo('Enter your system password to complete installation');
        if (!ok) { tee('Incorrect password or cancelled.\n'); try { fs.unlinkSync(tmpScript); } catch {} failCancelled(); return; }
        tee('Retrying with elevated permissions...\n');
        const r2 = await runCaptured('sudo', ['-E', 'bash', tmpScript]);
        try { fs.unlinkSync(tmpScript); } catch {}
        if (r2.code === 0) {
          await fixOpenclawPermissions();
          await succeed(); return;
        }
      }
      try { fs.unlinkSync(tmpScript); } catch {}
    }

    await fail();
  }

  private async _runSetup(data: { provider: string; apiKey: string; port: string }): Promise<void> {
    const post = (msg: object) => { try { this._panel.webview.postMessage(msg); } catch {} };
    const wizardPost = (text: string, done: boolean, ok: boolean) => {
      writeLog(text);
      post({ type: 'wizardLog', text, done, ok });
    };
    const env = this._host.buildExecEnv();

    if (process.platform !== 'win32') {
      const nodeResult = await this._host.exec('node', ['--version'], { env: env as Record<string, string | undefined>, timeout: 5000 });
      const nodeVerRaw = nodeResult.stdout.trim();
      const nodeMinor = parseInt((nodeVerRaw.match(/^v?(\d+)/) || [])[1] || '0', 10);
      if (nodeMinor < 22) {
        const nvmSh = path.join(os.homedir(), '.nvm', 'nvm.sh');
        if (fs.existsSync(nvmSh)) {
          wizardPost(`Node.js ${nodeVerRaw || 'unknown'} detected — openclaw requires v22+. Installing Node.js 22 via nvm...\n`, false, false);
          const nvmCode = await this._host.execStream(
            'bash',
            ['-c', `. "${nvmSh}" && nvm install 22 && nvm use 22 && nvm alias default 22`],
            { env: env as Record<string, string | undefined> },
            (d) => wizardPost(d, false, false),
            (d) => wizardPost(d, false, false),
          );
          if (nvmCode === 0) {
            const nvmVersionsDir = path.join(os.homedir(), '.nvm', 'versions', 'node');
            const v22dirs = fs.existsSync(nvmVersionsDir)
              ? fs.readdirSync(nvmVersionsDir).filter(v => /^v?22/.test(v))
              : [];
            if (v22dirs.length > 0) {
              const v22bin = path.join(nvmVersionsDir, v22dirs[0], 'bin');
              env.PATH = [v22bin, env.PATH || ''].filter(Boolean).join(':');
              (env as Record<string, string | undefined>).Path = env.PATH;
            }
            wizardPost('  ✓ Node.js 22 ready.\n', false, false);
          } else {
            wizardPost('  ⚠️  Node.js 22 install via nvm failed. Setup may fail.\n', false, false);
          }
        } else {
          wizardPost(`⚠️  Node.js ${nodeVerRaw || 'v20'} is active but openclaw requires v22+.\n  Please install Node.js 22 (e.g. via https://nodejs.org) and restart OCCode.\n`, true, false);
          return;
        }
      }
    }

    const cliPath = await this._host.findOpenClawPath() ?? 'openclaw';
    const port = data.port && /^\d+$/.test(data.port) ? data.port : '18789';
    const isFree = data.provider === 'free';

    const providerFlags: Record<string, string[]> = {
      free: [
        '--auth-choice', 'custom-api-key',
        '--custom-base-url', 'https://occ.mba.sh/v1',
        '--custom-api-key', data.apiKey,
        '--custom-model-id', 'occ-legacy',
        '--custom-compatibility', 'openai',
      ],
      anthropic:   ['--auth-choice', 'apiKey',             '--anthropic-api-key',   data.apiKey],
      openai:      ['--auth-choice', 'openai-api-key',     '--openai-api-key',      data.apiKey],
      openrouter:  ['--auth-choice', 'openrouter-api-key', '--openrouter-api-key', data.apiKey],
      gemini:      ['--auth-choice', 'gemini-api-key',     '--gemini-api-key',      data.apiKey],
      ollama: [
        '--auth-choice', 'custom-api-key',
        '--custom-base-url', data.apiKey || 'http://localhost:11434',
        '--custom-api-key', 'ollama',
        '--custom-model-id', 'llama3',
        '--custom-compatibility', 'openai',
      ],
    };
    const flags = providerFlags[data.provider];
    if (!flags) {
      wizardPost('Unknown provider selected.\n', true, false);
      return;
    }

    const args = [
      'onboard',
      '--non-interactive', '--accept-risk',
      '--flow', 'quickstart',
      '--gateway-auth', 'token',
      '--gateway-port', port,
      '--skip-channels', '--skip-skills', '--skip-health',
      ...flags,
    ];

    writeLog(`\n=== _runSetup START provider=${data.provider} port=${port} ===\n`);
    wizardPost(isFree ? 'Installing Inference for MoltPilot...\nInstalling Inference for your new OpenClaw...\n' : 'Installing Inference for your new OpenClaw...\n', false, false);

    let exitCode: number;
    try {
      exitCode = await this._host.execStream(
        cliPath, args,
        {
          env: env as Record<string, string | undefined>,
          timeout: 120_000,
          ...(process.platform === 'win32' ? { shell: true, windowsHide: true } : {}),
        },
        (d) => wizardPost(d, false, false),
        (d) => wizardPost(d, false, false),
      );
    } catch (err) {
      wizardPost(`Error: ${String(err)}\n`, true, false);
      return;
    }

    const ok = exitCode === 0;
    writeLog(`=== _runSetup END code=${exitCode} ===\n`);
    wizardPost(ok ? '\n✅ Setup complete!\n' : `\nSetup exited with code ${exitCode}.\n`, true, ok);

    if (ok) {
      if (isFree) {
        try {
          const occDir = path.join(os.homedir(), '.occ');
          if (!fs.existsSync(occDir)) { fs.mkdirSync(occDir, { recursive: true }); }
          fs.writeFileSync(
            path.join(occDir, 'moltpilot-tier.json'),
            JSON.stringify({ tier: 'free', grantedAt: new Date().toISOString(), limitUsd: 1.00 }),
          );
        } catch { /* non-fatal */ }
        try {
          const cfg = await this._host.readConfig() as Record<string, unknown>;
          const patchModel = (obj: unknown): boolean => {
            if (!obj || typeof obj !== 'object') return false;
            if (Array.isArray(obj)) {
              for (const item of obj) { if (patchModel(item)) return true; }
              return false;
            }
            const o = obj as Record<string, unknown>;
            if (o['id'] === OCC_LEGACY_MODEL_ID) {
              o['name']          = OCC_LEGACY_MODEL_NAME;
              o['reasoning']     = false;
              o['input']         = ['text'];
              o['cost']          = { ...OCC_LEGACY_COST };
              o['contextWindow'] = OCC_LEGACY_CONTEXT_WINDOW;
              o['maxTokens']     = OCC_LEGACY_MAX_TOKENS;
              return true;
            }
            for (const v of Object.values(o)) { patchModel(v); }
            return false;
          };
          patchModel(cfg);
          await this._host.writeConfig(cfg);
        } catch { /* non-fatal */ }
      }
      setTimeout(() => {
        void this._showStatusPanel();
        if (isFree) {
          void vscode.commands.executeCommand('openclaw.openWorkspace');
        }
        setTimeout(() => {
          void vscode.commands.executeCommand('void.openChatWithMessage',
            'Run `openclaw gateway start` to start the OpenClaw gateway.',
            'agent');
        }, 1000);
      }, 1500);
    }
  }

  private _getHtml(
    isInstalled: boolean,
    iconUri: string,
    occUser: { email: string; picture: string | null; balance_usd: number; api_keys?: { moltpilotKey?: string; occKey?: string } | null } | null = null
  ): string {
    let userAreaHtml: string;
    if (!occUser) {
      userAreaHtml = `<button class="sign-in-btn" onclick="signIn()">Sign In</button>`;
    } else {
      const initial = (occUser.email || '?')[0].toUpperCase();
      const safeEmail = occUser.email.replace(/"/g, '&quot;').replace(/</g, '&lt;');
      const avatarImg = occUser.picture
        ? `<img src="${occUser.picture}" alt="" referrerpolicy="no-referrer" />`
        : initial;
      userAreaHtml = `
        <div class="user-popover-wrap">
          <button class="user-avatar-btn" title="${safeEmail}" onclick="toggleUserPopover(event)">${avatarImg}</button>
          <div class="user-popover" id="user-popover">
            <div class="user-popover-header">
              <div class="user-popover-avatar">${avatarImg}</div>
              <div class="user-popover-email">${safeEmail}</div>
            </div>
            <div class="user-popover-actions">
              <a class="user-popover-action" href="#" onclick="openDashboard();return false;">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
                Open Dashboard
              </a>
            </div>
            <div class="user-popover-divider"></div>
            <button class="user-popover-signout" onclick="signOut()">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              Log Out
            </button>
          </div>
        </div>`;
    }

    const providers = [
      { id: 'anthropic',  label: 'Anthropic Claude', hint: 'console.anthropic.com/settings/keys', placeholder: 'sk-ant-...' },
      { id: 'openai',     label: 'OpenAI',           hint: 'platform.openai.com/api-keys',        placeholder: 'sk-...' },
      { id: 'openrouter', label: 'OpenRouter',       hint: 'openrouter.ai/settings/keys',         placeholder: 'sk-or-...' },
      { id: 'gemini',     label: 'Google Gemini',    hint: 'aistudio.google.com/apikey',          placeholder: 'AIza...' },
    ];

    const providerCards = providers.map(p =>
      `<button class="prov-card" data-id="${p.id}" data-placeholder="${p.placeholder}" data-hint="${p.hint}" onclick="pickProvider(this)">
        <span class="prov-label">${p.label}</span>
        <span class="prov-hint">${p.hint}</span>
      </button>`
    ).join('\n      ');

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
      min-height: 100vh; padding: 32px 20px 40px; text-align: center;
    }

    /* ── Header ── */
    .header-bar {
      position: fixed; top: 12px; right: 12px; z-index: 200;
      display: flex; align-items: center; gap: 8px;
    }
    .user-avatar-btn {
      width: 28px; height: 28px; border-radius: 50%;
      background: #dc2828; color: #fff;
      font-size: 11px; font-weight: 700;
      border: 1.5px solid rgba(255,255,255,0.15);
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      overflow: hidden; transition: opacity 0.15s;
    }
    .user-avatar-btn img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
    .user-avatar-btn:hover { opacity: 0.85; }
    .sign-in-btn {
      font-size: 11.5px; font-weight: 600; color: #dc2828;
      background: rgba(220,40,40,0.08); border: 1px solid rgba(220,40,40,0.22);
      padding: 4px 10px; border-radius: 6px; cursor: pointer; transition: background 0.15s;
    }
    .sign-in-btn:hover { background: rgba(220,40,40,0.16); }
    .user-popover-wrap { position: relative; }
    .user-popover {
      display: none; position: absolute; top: calc(100% + 8px); right: 0;
      background: #1e1e1e; border: 1px solid rgba(255,255,255,0.1);
      border-radius: 14px; min-width: 220px;
      box-shadow: 0 12px 32px rgba(0,0,0,0.6); overflow: hidden; z-index: 300;
    }
    .user-popover.open { display: block; }
    .user-popover-header {
      display: flex; flex-direction: column; align-items: center;
      padding: 18px 16px 12px; border-bottom: 1px solid rgba(255,255,255,0.07);
    }
    .user-popover-avatar {
      width: 48px; height: 48px; border-radius: 50%;
      background: #dc2828; color: #fff; font-size: 18px; font-weight: 700;
      display: flex; align-items: center; justify-content: center;
      margin-bottom: 8px; overflow: hidden;
    }
    .user-popover-avatar img { width: 100%; height: 100%; object-fit: cover; }
    .user-popover-email { font-size: 12px; color: #ddd; word-break: break-all; text-align: center; }
    .user-popover-actions { padding: 4px 0; }
    .user-popover-action {
      display: flex; align-items: center; gap: 10px;
      width: 100%; padding: 9px 16px;
      background: none; border: none; color: #ccc; font-size: 13px; font-family: inherit;
      text-align: left; cursor: pointer; text-decoration: none; transition: background 0.12s, color 0.12s;
    }
    .user-popover-action:hover { background: rgba(255,255,255,0.06); color: #fff; }
    .user-popover-divider { height: 1px; background: rgba(255,255,255,0.07); }
    .user-popover-signout {
      display: flex; align-items: center; gap: 10px;
      width: 100%; padding: 9px 16px;
      background: none; border: none; color: #888; font-size: 13px; font-family: inherit;
      text-align: left; cursor: pointer; transition: background 0.12s, color 0.12s;
    }
    .user-popover-signout:hover { background: rgba(255,255,255,0.06); color: #fff; }

    /* ── Logo + title ── */
    .logo { width: 56px; height: 56px; filter: drop-shadow(0 4px 12px rgba(220,40,40,0.3)); margin-bottom: 8px; }
    .setup-title { font-size: 20px; font-weight: 700; color: #fff; margin-bottom: 4px; }
    .setup-sub { font-size: 12px; color: #555; margin-bottom: 28px; }

    /* ── Step timeline ── */
    .steps {
      display: flex; align-items: flex-start; gap: 0;
      margin-bottom: 28px; width: min(420px, 96vw);
    }
    .step-item {
      display: flex; flex-direction: column; align-items: center; flex: 1;
      position: relative;
    }
    .step-item:not(:last-child)::after {
      content: '';
      position: absolute; top: 13px; left: calc(50% + 16px);
      width: calc(100% - 32px); height: 1px;
      background: #2b2b2b;
    }
    .step-item.done:not(:last-child)::after { background: #dc2828; }
    .step-dot {
      width: 26px; height: 26px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; font-weight: 700; margin-bottom: 6px;
      flex-shrink: 0; position: relative; z-index: 1;
    }
    .step-item.done .step-dot { background: #dc2828; color: #fff; border: 2px solid #dc2828; }
    .step-item.active .step-dot { background: transparent; border: 2px solid #dc2828; color: #dc2828; }
    .step-item.pending .step-dot { background: transparent; border: 2px solid #2b2b2b; color: #444; }
    .step-label-text { font-size: 10px; color: #555; text-align: center; line-height: 1.3; display: flex; flex-direction: column; align-items: center; }
    .step-item.done .step-label-text { color: #dc2828; }
    .step-item.active .step-label-text { color: #e0e0e0; }

    /* ── Action panels ── */
    .panel { width: min(440px, 96vw); }
    .panel-title { font-size: 15px; font-weight: 600; color: #fff; margin-bottom: 6px; }
    .panel-desc { font-size: 12px; color: #888; margin-bottom: 20px; line-height: 1.5; }

    /* ── Buttons ── */
    .btn-primary {
      background: #dc2828; border: none; color: #fff;
      font-size: 14px; font-weight: 600; padding: 10px 28px; border-radius: 8px;
      cursor: pointer; display: inline-flex; align-items: center; gap: 8px;
      transition: background 0.15s; white-space: nowrap;
    }
    .btn-primary:hover { background: #b91c1c; }
    .btn-primary:disabled { background: #7a1515; cursor: not-allowed; }
    .btn-link {
      background: none; border: none; color: #555; font-size: 12px;
      font-family: inherit; cursor: pointer; padding: 4px 0;
      transition: color 0.15s; text-decoration: underline; text-underline-offset: 2px;
    }
    .btn-link:hover { color: #aaa; }
    .btn-back {
      background: transparent; border: 1px solid #333; color: #888;
      font-size: 13px; padding: 8px 18px; border-radius: 6px; cursor: pointer; font-family: inherit;
    }
    .btn-back:hover { background: rgba(255,255,255,0.05); }
    @keyframes spin { to { transform: rotate(360deg); } }
    .btn-spin {
      display: inline-block; width: 13px; height: 13px;
      border: 2px solid rgba(255,255,255,0.25); border-top-color: #fff;
      border-radius: 50%; animation: spin 0.65s linear infinite; flex-shrink: 0;
    }

    /* ── Provider cards ── */
    .prov-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; }
    .prov-card {
      background: rgba(255,255,255,0.03); border: 1px solid #2b2b2b;
      border-radius: 8px; padding: 14px 12px; cursor: pointer;
      text-align: left; transition: border-color 0.15s, background 0.15s;
      display: flex; flex-direction: column; gap: 4px;
    }
    .prov-card:hover { border-color: #444; background: rgba(255,255,255,0.05); }
    .prov-card.selected { border-color: #dc2828; background: rgba(220,40,40,0.08); }
    .prov-label { font-size: 13px; font-weight: 600; color: #e0e0e0; }
    .prov-hint { font-size: 11px; color: #666; }
    .field-label { font-size: 11px; color: #888; margin-bottom: 5px; text-align: left; }
    .key-input {
      width: 100%; background: #111; border: 1px solid #2b2b2b; border-radius: 6px;
      color: #e0e0e0; font-size: 13px; padding: 9px 12px; outline: none;
      margin-bottom: 6px; box-sizing: border-box; font-family: monospace;
    }
    .key-input:focus { outline: none; border-color: #dc2828; }
    .key-hint { font-size: 11px; color: #555; margin-bottom: 16px; text-align: left; }
    .port-row { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; }
    .port-label { font-size: 12px; color: #888; white-space: nowrap; }
    .port-input {
      width: 90px; background: #111; border: 1px solid #2b2b2b; border-radius: 6px;
      color: #e0e0e0; font-size: 13px; padding: 7px 10px; outline: none; box-sizing: border-box;
    }
    .port-input:focus { outline: none; border-color: #dc2828; }
    .btn-row { display: flex; gap: 10px; justify-content: flex-end; }

    /* ── Log panel ── */
    .log-wrap {
      display: none; width: min(480px, 96vw); margin-top: 4px;
    }
    .log-wrap.visible { display: block; }
    .log-box {
      background: #0d0d0d; border: 1px solid #222; border-radius: 8px;
      padding: 12px 14px; height: 200px; overflow-y: auto;
      font-family: 'SF Mono', 'Fira Mono', 'Consolas', monospace;
      font-size: 11px; line-height: 1.6; text-align: left; color: #888;
      scroll-behavior: smooth;
    }
    .log-line { white-space: pre-wrap; word-break: break-all; }
    .log-line.ok   { color: #4ade80; }
    .log-line.err  { color: #f87171; }
    .log-line.warn { color: #fbbf24; }
    .log-status {
      font-size: 12px; color: #555; margin-top: 8px; text-align: center;
    }
    .log-status.done { color: #4ade80; }
    .log-status.failed { color: #f87171; }
    @keyframes dots { 0%,100%{content:''} 33%{content:'.'} 66%{content:'..'} }
    .dots::after { content: ''; animation: dots 1.2s steps(1) infinite; }

    /* ── MoltPilot help button ── */
    .molt-help {
      display: none; margin-top: 16px;
      background: rgba(167,139,250,0.1); border: 1px solid rgba(167,139,250,0.3);
      color: #a78bfa; font-size: 13px; font-weight: 600;
      padding: 10px 20px; border-radius: 8px; cursor: pointer; font-family: inherit;
      transition: background 0.15s;
    }
    .molt-help.visible { display: inline-flex; align-items: center; gap: 8px; }
    .molt-help:hover { background: rgba(167,139,250,0.2); }

    /* ── Password modal ── */
    .modal-overlay {
      display: none; position: fixed; inset: 0;
      background: rgba(0,0,0,0.7); z-index: 500;
      align-items: center; justify-content: center;
    }
    .modal-overlay.open { display: flex; }
    .modal-box {
      background: #1e1e1e; border: 1px solid rgba(255,255,255,0.12);
      border-radius: 16px; padding: 28px 28px 24px; width: min(360px, 92vw);
      box-shadow: 0 24px 60px rgba(0,0,0,0.7); text-align: left;
    }
    .modal-title { font-size: 15px; font-weight: 700; color: #fff; margin-bottom: 6px; }
    .modal-desc { font-size: 12px; color: #888; margin-bottom: 18px; line-height: 1.5; }
    .modal-input {
      width: 100%; background: #111; border: 1px solid #333; border-radius: 8px;
      color: #e0e0e0; font-size: 14px; padding: 10px 14px; outline: none;
      box-sizing: border-box; margin-bottom: 16px; letter-spacing: 0.1em;
    }
    .modal-input:focus { outline: none; border-color: #dc2828; }
    .modal-btns { display: flex; gap: 10px; justify-content: flex-end; }
    .modal-cancel {
      background: transparent; border: 1px solid #333; color: #888;
      font-size: 13px; padding: 8px 18px; border-radius: 6px; cursor: pointer; font-family: inherit;
    }
    .modal-cancel:hover { background: rgba(255,255,255,0.05); }
    .modal-confirm {
      background: #dc2828; border: none; color: #fff;
      font-size: 13px; font-weight: 600; padding: 8px 20px; border-radius: 6px;
      cursor: pointer; font-family: inherit; transition: background 0.15s;
    }
    .modal-confirm:hover { background: #b91c1c; }
  </style>
</head>
<body>
  <!-- Header -->
  <div class="header-bar">${userAreaHtml}</div>

  <!-- Logo + title -->
  <img class="logo" src="${iconUri}" alt="OpenClaw" />
  <div class="setup-title">Set up OpenClaw</div>
  <div class="setup-sub">Follow the steps below to get started</div>

  <!-- Step timeline -->
  <div class="steps" id="steps-timeline">
    <div class="step-item ${isInstalled ? 'done' : 'active'}" id="step-install">
      <div class="step-dot">${isInstalled ? '✓' : '1'}</div>
      <div class="step-label-text">Install<br>OpenClaw</div>
    </div>
    <div class="step-item ${isInstalled ? 'active' : 'pending'}" id="step-configure">
      <div class="step-dot">2</div>
      <div class="step-label-text">Configure<br>AI Model</div>
    </div>
    <div class="step-item pending" id="step-ready">
      <div class="step-dot">3</div>
      <div class="step-label-text">Ready</div>
    </div>
  </div>

  <!-- Panel A: Install (shown when not installed) -->
  <div class="panel" id="panel-install" style="display:${isInstalled ? 'none' : 'flex'};flex-direction:column;align-items:center;gap:12px;">
    <button class="btn-primary" id="btn-install" onclick="startInstall()">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      Install OpenClaw
    </button>
    <button class="btn-link" onclick="goBackToSelection()">← Choose differently</button>
  </div>

  <!-- Panel: Xcode CLI required (macOS only) -->
  <div class="panel" id="panel-xcode-required" style="display:none;flex-direction:column;align-items:center;gap:16px;max-width:360px;text-align:center;">
    <div style="font-size:36px;">🛠️</div>
    <div class="panel-title" style="font-size:15px;font-weight:600;">Xcode Command Line Tools Required</div>
    <div class="panel-desc" style="color:#a0a0a0;font-size:13px;line-height:1.55;">
      Node.js and OpenClaw need Xcode CLI Tools to run on macOS.
      This is a one-time setup — Apple ships it free.
    </div>
    <div style="background:#1e1e1e;border:1px solid #333;border-radius:8px;padding:16px;width:100%;text-align:left;font-size:12px;line-height:1.8;">
      <div style="color:#a0a0a0;margin-bottom:8px;font-weight:600;text-transform:uppercase;font-size:11px;letter-spacing:.05em;">Steps</div>
      <div><span style="color:#7c8cf8;">1.</span> Open <strong>Terminal</strong></div>
      <div><span style="color:#7c8cf8;">2.</span> Run: <code style="background:#2a2a2a;padding:2px 6px;border-radius:4px;color:#e2e8f0;">xcode-select --install</code></div>
      <div><span style="color:#7c8cf8;">3.</span> Follow the system dialog</div>
      <div><span style="color:#7c8cf8;">4.</span> Return here and click <strong>Retry</strong></div>
    </div>
    <button class="btn-primary" onclick="retryAfterXcode()">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg>
      Retry Installation
    </button>
  </div>

  <!-- Panel B: Configure — Step B0 -->
  <div class="panel" id="panel-cfg-b0" style="display:none;flex-direction:column;align-items:center;gap:12px;">
    <div class="panel-title">Configure AI Model</div>
    <div class="panel-desc">Choose how you want to power the AI gateway.</div>
    <button class="btn-primary" id="btn-start-free" onclick="chooseFree()">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
      Start Free
    </button>
    <button class="btn-link" onclick="chooseBYOK()">Use my own API key →</button>
  </div>

  <!-- Panel B1: Pick provider (BYOK) -->
  <div class="panel" id="panel-cfg-b1" style="display:none">
    <div class="panel-title" style="margin-bottom:6px;">Choose your AI Provider</div>
    <div class="panel-desc">OpenClaw uses an AI provider to power agent conversations.</div>
    <div class="prov-grid">${providerCards}</div>
    <div class="btn-row">
      <button class="btn-back" onclick="showB0()">← Back</button>
      <button class="btn-primary" id="btn-next1" onclick="showB2()" disabled>Continue →</button>
    </div>
  </div>

  <!-- Panel B2: API key + port (BYOK) -->
  <div class="panel" id="panel-cfg-b2" style="display:none;text-align:left;">
    <div class="panel-title" id="b2-title" style="margin-bottom:6px;text-align:center;">Enter your API Key</div>
    <div class="panel-desc" style="text-align:center;">Stored locally in <code>~/.openclaw/openclaw.json</code>.</div>
    <div class="field-label">API Key</div>
    <input id="api-key" class="key-input" type="password" placeholder="sk-..." autocomplete="off" oninput="validateB2()" />
    <div class="key-hint" id="key-hint">Get your key at <span id="key-link"></span></div>
    <div class="port-row">
      <span class="port-label">Gateway port</span>
      <input id="gw-port" class="port-input" type="text" value="18789" placeholder="18789" />
    </div>
    <div class="btn-row">
      <button class="btn-back" onclick="showB1()">← Back</button>
      <button class="btn-primary" id="btn-run" onclick="runSetup()" disabled>Set Up OpenClaw</button>
    </div>
  </div>

  <!-- Log panel (shared, shown during install or configure) -->
  <div class="log-wrap" id="log-wrap">
    <div class="log-box" id="log-box"></div>
    <div class="log-status dots" id="log-status">Working</div>
    <button class="molt-help" id="molt-help" onclick="askMoltPilot()">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>
      Ask MoltPilot to fix this
    </button>
    <button class="molt-help" id="show-error-logs" onclick="cmd('openLogs')">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
      Show Error Logs
    </button>
    <button class="molt-help" id="retry-install" onclick="retryInstall()">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.36"/></svg>
      Try Again
    </button>
  </div>

  <!-- Password modal -->
  <div class="modal-overlay" id="pwd-modal">
    <div class="modal-box">
      <div class="modal-title">Admin Password Required</div>
      <div class="modal-desc" id="pwd-modal-desc">Installing OpenClaw requires elevated permissions. Enter your system (sudo) password to continue.</div>
      <input id="pwd-input" class="modal-input" type="password" placeholder="Password" autocomplete="off" onkeydown="if(event.key==='Enter')confirmPwd()" />
      <div class="modal-btns">
        <button class="modal-cancel" onclick="cancelPwd()">Cancel</button>
        <button class="modal-confirm" onclick="confirmPwd()">Continue</button>
      </div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const _occUser = ${JSON.stringify(occUser)};
    let fullLog = '';

    function cmd(command) { vscode.postMessage({ command: command }); }

    // ── Host selection back button ──────────────────────────────────
    function goBackToSelection() {
      vscode.postMessage({ command: 'closePanel' });
    }

    // ── User area ──────────────────────────────────────────────────
    function signIn() { vscode.postMessage({ command: 'signIn' }); }
    function openDashboard() { vscode.postMessage({ command: 'openDashboard' }); }
    function signOut() { vscode.postMessage({ command: 'signOut' }); closeUserPopover(); }
    function toggleUserPopover(e) {
      e.stopPropagation();
      var pop = document.getElementById('user-popover');
      if (pop) pop.classList.toggle('open');
    }
    function closeUserPopover() {
      var pop = document.getElementById('user-popover');
      if (pop) pop.classList.remove('open');
    }
    document.addEventListener('click', function() { closeUserPopover(); });

    // ── Auto-configure on pre-installed load ───────────────────────
    ${isInstalled ? `
    (function() {
      var occKey = _occUser && _occUser.api_keys && _occUser.api_keys.occKey;
      setTimeout(function() {
        if (occKey) {
          showLog('Setting up with OCC Legacy inference...\\n');
          setLogStatus('Configuring', 'dots');
          vscode.postMessage({ command: 'runSetup', provider: 'free', apiKey: occKey, port: '18789' });
        } else {
          showLog('Skipping AI configuration — not logged in.\\n');
          setLogStatus('Skipping', 'done');
          setTimeout(function() { vscode.postMessage({ command: 'autoSetupSkipped' }); }, 1500);
        }
      }, 600);
    })();
    ` : ''}

    // ── Install ────────────────────────────────────────────────────
    function startInstall() {
      document.getElementById('panel-install').style.display = 'none';
      document.getElementById('panel-xcode-required').style.display = 'none';
      showLog('Installing OpenClaw...');
      vscode.postMessage({ command: 'openclaw.install' });
    }

    function retryAfterXcode() {
      document.getElementById('panel-xcode-required').style.display = 'none';
      startInstall();
    }

    // ── Configure: choose mode ─────────────────────────────────────
    function chooseFree() {
      document.getElementById('panel-cfg-b0').style.display = 'none';
      showLog('Installing Inference for MoltPilot...\\nInstalling Inference for your new OpenClaw...');
      vscode.postMessage({ command: 'runSetup', provider: 'free', apiKey: (_occUser && _occUser.api_keys && _occUser.api_keys.occKey) || '', port: '18789' });
    }

    function chooseBYOK() {
      document.getElementById('panel-cfg-b0').style.display = 'none';
      document.getElementById('panel-cfg-b1').style.display = 'block';
    }

    function showB0() {
      document.getElementById('panel-cfg-b1').style.display = 'none';
      document.getElementById('panel-cfg-b2').style.display = 'none';
      document.getElementById('panel-cfg-b0').style.display = 'flex';
    }

    var selectedProvider = null;
    function pickProvider(btn) {
      document.querySelectorAll('.prov-card').forEach(function(c) { c.classList.remove('selected'); });
      btn.classList.add('selected');
      selectedProvider = btn.dataset.id;
      document.getElementById('btn-next1').disabled = false;
    }

    function showB1() {
      document.getElementById('panel-cfg-b2').style.display = 'none';
      document.getElementById('panel-cfg-b1').style.display = 'block';
    }

    function showB2() {
      if (!selectedProvider) return;
      var card = document.querySelector('.prov-card.selected');
      document.getElementById('b2-title').textContent = card.querySelector('.prov-label').textContent + ' API Key';
      document.getElementById('api-key').placeholder = card.dataset.placeholder;
      document.getElementById('key-link').textContent = card.dataset.hint;
      document.getElementById('panel-cfg-b1').style.display = 'none';
      document.getElementById('panel-cfg-b2').style.display = 'block';
      document.getElementById('api-key').focus();
    }

    function validateB2() {
      document.getElementById('btn-run').disabled = document.getElementById('api-key').value.trim().length < 8;
    }

    function runSetup() {
      var apiKey = document.getElementById('api-key').value.trim();
      var port = document.getElementById('gw-port').value.trim() || '18789';
      if (!apiKey || !selectedProvider) return;
      document.getElementById('panel-cfg-b2').style.display = 'none';
      showLog('Installing Inference for your new OpenClaw...');
      vscode.postMessage({ command: 'runSetup', provider: selectedProvider, apiKey: apiKey, port: port });
    }

    // ── Log helpers ────────────────────────────────────────────────
    function showLog(initialMsg) {
      var wrap = document.getElementById('log-wrap');
      wrap.classList.add('visible');
      appendLog(initialMsg);
    }

    function stripAnsi(s) {
      return s.replace(/\\x1b\\[[0-9;]*[A-Za-z]/g, '');
    }

    function appendLog(text) {
      var clean = stripAnsi(text);
      fullLog += clean;
      var box = document.getElementById('log-box');
      var lines = clean.split('\\n');
      lines.forEach(function(line) {
        if (!line.trim()) return;
        var el = document.createElement('div');
        var isOk   = line.includes('✅') || line.includes('✓') || /successfully|installed to/i.test(line);
        var isErr  = line.includes('❌') || /\\bError\\b|\\bfailed\\b|\\bFAIL\\b/.test(line);
        var isWarn = line.includes('⚠');
        el.className = 'log-line' + (isOk ? ' ok' : isErr ? ' err' : isWarn ? ' warn' : '');
        el.textContent = line;
        box.appendChild(el);
      });
      box.scrollTop = box.scrollHeight;
    }

    function setLogStatus(msg, cls) {
      var s = document.getElementById('log-status');
      s.textContent = msg;
      s.className = 'log-status ' + (cls || '');
    }

    // ── MoltPilot help ─────────────────────────────────────────────
    function askMoltPilot() {
      vscode.postMessage({ command: 'void.openChatWithMessage', args: ['Setup failed. Here is the full log:\\n\\n\`\`\`\\n' + fullLog.trim() + '\\n\`\`\`\\n\\nPlease diagnose what went wrong and provide steps to fix it.'] });
      vscode.postMessage({ command: 'void.sidebar.open' });
    }

    function showMoltHelp() {
      document.getElementById('molt-help').classList.add('visible');
      document.getElementById('show-error-logs').classList.add('visible');
    }

    function showRetryButton() {
      document.getElementById('retry-install').classList.add('visible');
    }

    function retryInstall() {
      document.getElementById('log-box').innerHTML = '';
      fullLog = '';
      setLogStatus('Installing', 'dots');
      document.getElementById('molt-help').classList.remove('visible');
      document.getElementById('show-error-logs').classList.remove('visible');
      document.getElementById('retry-install').classList.remove('visible');
      vscode.postMessage({ command: 'openclaw.install' });
    }

    // ── Password modal ─────────────────────────────────────────────
    function confirmPwd() {
      var pwd = document.getElementById('pwd-input').value;
      document.getElementById('pwd-modal').classList.remove('open');
      document.getElementById('pwd-input').value = '';
      vscode.postMessage({ command: 'sudoPassword', password: pwd });
    }

    function cancelPwd() {
      document.getElementById('pwd-modal').classList.remove('open');
      document.getElementById('pwd-input').value = '';
      vscode.postMessage({ command: 'sudoPassword', password: undefined });
    }

    // ── Messages from extension host ──────────────────────────────
    window.addEventListener('message', function(e) {
      var d = e.data;

      if (d.type === 'installLog') {
        appendLog(d.text || '');
      }

      if (d.type === 'xcodeRequired') {
        document.getElementById('log-wrap').classList.remove('visible');
        document.getElementById('panel-install').style.display = 'none';
        document.getElementById('panel-xcode-required').style.display = 'flex';
      }

      if (d.type === 'installState') {
        if (d.state === 'running') {
          setLogStatus('Installing', 'dots');
          document.getElementById('molt-help').classList.remove('visible');
          document.getElementById('show-error-logs').classList.remove('visible');
          document.getElementById('retry-install').classList.remove('visible');
        } else if (d.state === 'cancelled') {
          setLogStatus('Wrong password or cancelled', 'failed');
          showRetryButton();
        } else if (d.state === 'done') {
          setLogStatus('✅ Installed successfully!', 'done');
          document.getElementById('step-install').className = 'step-item done';
          document.getElementById('step-configure').className = 'step-item active';
          setTimeout(function() {
            vscode.postMessage({ command: 'verifyCliBeforeSetup' });
          }, 2000);
        } else if (d.state === 'failed') {
          setLogStatus('Installation failed', 'failed');
          showMoltHelp();
        }
      }

      if (d.type === 'proceedAutoSetup') {
        document.getElementById('log-wrap').classList.remove('visible');
        document.getElementById('log-box').innerHTML = '';
        fullLog = '';
        setLogStatus('', '');
        var occKey = _occUser && _occUser.api_keys && _occUser.api_keys.occKey;
        if (occKey) {
          showLog('Setting up with OCC Legacy inference...\\n');
          setLogStatus('Configuring', 'dots');
          vscode.postMessage({ command: 'runSetup', provider: 'free', apiKey: occKey, port: '18789' });
        } else {
          showLog('Skipping AI configuration — not logged in.\\n');
          setLogStatus('Skipping', 'done');
          setTimeout(function() { vscode.postMessage({ command: 'autoSetupSkipped' }); }, 1500);
        }
      }

      if (d.type === 'wizardLog') {
        if (!d.done) {
          appendLog(d.text || '');
        } else {
          if (d.ok) {
            setLogStatus('✅ Setup complete!', 'done');
            document.getElementById('step-configure').className = 'step-item done';
            document.getElementById('step-ready').className = 'step-item done';
          } else {
            appendLog(d.text || '');
            setLogStatus('Setup failed', 'failed');
            showMoltHelp();
          }
        }
      }

      if (d.type === 'requestPassword') {
        document.getElementById('pwd-modal').classList.add('open');
        setTimeout(function() { document.getElementById('pwd-input').focus(); }, 50);
      }
    });
  </script>
</body>
</html>`;
  }
}
