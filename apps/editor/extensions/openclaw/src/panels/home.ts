import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as os from 'os';
import * as path from 'path';

type GatewayStatus = 'checking' | 'running' | 'stopped' | 'starting' | 'stopping' | 'restarting' | 'errored' | 'ai-fixing';

// ── Persistent diagnostics log ────────────────────────────────────────────────
const LOG_PATH     = path.join(os.homedir(), '.openclaw', 'occ-home.log');
const LOG_MAX_BYTES = 512 * 1024; // 500 KB — rotate when exceeded

/**
 * Append timestamped text to ~/.openclaw/occ-home.log.
 * Creates the file (and directory) on first use. Rotates by dropping the
 * oldest half of lines when the file exceeds LOG_MAX_BYTES. Never throws.
 */
// Strip ANSI/VT escape sequences (e.g. colour codes from npm/openclaw output)
const _ansiRe = /\x1b(\[[0-9;]*[A-Za-z]|[^[])/g;

function writeLog(text: string): void {
  try {
    const dir = path.dirname(LOG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    // Rotate if oversized
    if (fs.existsSync(LOG_PATH) && fs.statSync(LOG_PATH).size > LOG_MAX_BYTES) {
      const lines = fs.readFileSync(LOG_PATH, 'utf-8').split('\n');
      fs.writeFileSync(LOG_PATH, lines.slice(Math.floor(lines.length / 2)).join('\n'), 'utf-8');
    }
    const ts = new Date().toISOString();
    const clean = text.replace(_ansiRe, '');
    // Stamp every non-empty line; leave blank lines unstamped
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

/**
 * Resolves the directory where OpenClaw stores its workspace files
 * (AGENTS.md, IDENTITY.md, USER.md, TOOLS.md, MEMORY.md, SOUL.md, HEARTBEAT.md).
 *
 * Reads the `workspace` field from ~/.openclaw/openclaw.json if present.
 * Falls back to ~/.openclaw/workspace/ if the field is absent or unreadable.
 * Expands a leading ~ to the home directory.
 */
function getOpenClawWorkspaceDir(): string {
  const fallback = path.join(os.homedir(), '.openclaw', 'workspace');
  try {
    const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
    const raw = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(raw) as Record<string, unknown>;
    const ws = config['workspace'];
    if (typeof ws === 'string' && ws.trim()) {
      return ws.startsWith('~')
        ? path.join(os.homedir(), ws.slice(1))
        : ws;
    }
  } catch {
    // openclaw.json missing or unreadable — use fallback
  }
  return fallback;
}

export class HomePanel {
  public static currentPanel: HomePanel | undefined;
  private static _installTerminal: vscode.Terminal | undefined;
  /** Resolves with the password (or undefined on cancel) when the webview modal submits. */
  private static _pendingPasswordResolve: ((pwd: string | undefined) => void) | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];
  private _commandAction: 'start' | 'stop' | 'restart' | null = null;
  private _sidebarOpen = false; // tracks chat sidebar open state across webview reloads
  private _pollingTimer: ReturnType<typeof setInterval> | undefined;
  private readonly _outputChannel: vscode.OutputChannel;
  private _lastInstalledState: boolean | undefined;
  private _pollTick = 0;
  private _lastJwt = '';
  private _lastInstalledVersion: string | null = null;
  private _autoUpdateTriggered = false; // fire at most once per panel session
  private _uninstallCloseSidebarTimer: ReturnType<typeof setTimeout> | undefined;
  private _uninstallCloseWatcher: ReturnType<typeof setInterval> | undefined;

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._outputChannel = vscode.window.createOutputChannel('OpenClaw Gateway');
    const iconUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'icon.png')
    );
    this._panel.webview.html = this._getLoadingHtml(iconUri.toString());
    void this._update();
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    // Re-check installation whenever the panel becomes visible again.
    this._panel.onDidChangeViewState(e => {
      if (e.webviewPanel.visible) { void this._update(); }
    }, null, this._disposables);
    // Watch ~/.openclaw/openclaw.json for when OpenClaw first initialises.
    const configWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(vscode.Uri.file(path.join(os.homedir(), '.openclaw')), 'openclaw.json'),
      false, true, false,
    );
    configWatcher.onDidCreate(() => void this._update(), null, this._disposables);
    configWatcher.onDidDelete(() => void this._update(), null, this._disposables);
    this._disposables.push(configWatcher);
    // Also watch home dir for ~/.openclaw itself being created (npm install done).
    const homeWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(vscode.Uri.file(os.homedir()), '.openclaw'),
      false, true, false,
    );
    homeWatcher.onDidCreate(() => void this._update(), null, this._disposables);
    homeWatcher.onDidDelete(() => void this._update(), null, this._disposables);
    this._disposables.push(homeWatcher);
    this._panel.webview.onDidReceiveMessage(msg => {
      if (msg.command === 'gatewayAction') {
        void this._handleGatewayAction(msg.action as 'start' | 'stop' | 'restart');
      } else if (msg.command === 'checkVersion') {
        void this._checkLatestVersion();
      } else if (msg.command === 'runUpdate') {
        void vscode.commands.executeCommand(
          'void.openChatWithMessage',
          'Please run `openclaw update` to upgrade OpenClaw to the latest version.',
          'agent',
        );
      } else if (msg.command === 'runSetup') {
        void this._runSetup(msg as { command: string; provider: string; apiKey: string; port: string });
      } else if (msg.command === 'autoSetupSkipped') {
        setTimeout(() => {
          HomePanel.refresh();
          void vscode.commands.executeCommand('openclaw.openWorkspace');
          setTimeout(() => {
            vscode.commands.executeCommand('void.openChatWithMessage',
              'Run `openclaw gateway start` to start the OpenClaw gateway.',
              'agent');
          }, 1000);
        }, 500);
      } else if (msg.command === 'verifyCliBeforeSetup') {
        // After install, verify the CLI is actually findable before auto-configuring.
        void this._testOpenClawCli().then(result => {
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
            void this._update();
          }
        });
      } else if (msg.command === 'sudoPassword') {
        // Password modal submitted or cancelled from the webview.
        HomePanel._pendingPasswordResolve?.(msg.password as string | undefined);
        HomePanel._pendingPasswordResolve = undefined;
      } else if (msg.command === 'toggleChat') {
        const cmd = this._sidebarOpen ? 'void.sidebar.close' : 'void.sidebar.open';
        void vscode.commands.executeCommand(cmd).then(async () => {
          // Let the sidebar finish opening/closing, then read real state.
          await new Promise(r => setTimeout(r, 150));
          this._sidebarOpen = await vscode.commands.executeCommand<boolean>('void.sidebar.isVisible').then(v => !!v, () => this._sidebarOpen);
          try { this._panel.webview.postMessage({ type: 'chatState', open: this._sidebarOpen }); } catch {}
        });
      } else if (msg.command === 'signIn') {
        void vscode.env.openExternal(vscode.Uri.parse('https://occ.mba.sh/login?ref=occ-editor'));
      } else if (msg.command === 'openDashboard') {
        void vscode.env.openExternal(vscode.Uri.parse('https://occ.mba.sh/dashboard'));
      } else if (msg.command === 'signOut') {
        // Clear JWT, moltpilot key, and extension-host globalState
        void vscode.commands.executeCommand('occ.auth.setLegacyJwt', '');
        void vscode.commands.executeCommand('occ.auth.setMoltpilotKey', '');
        void vscode.commands.executeCommand('openclaw.jwt.set', '');
      } else if (msg.command === 'openUrl') {
        vscode.env.openExternal(vscode.Uri.parse(msg.url as string));
      } else if (msg.command === 'openConfigFile') {
        const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
        vscode.commands.executeCommand('vscode.open', vscode.Uri.file(configPath));
      } else if (msg.command === 'openLogs') {
        if (!fs.existsSync(LOG_PATH)) {
          vscode.window.showInformationMessage('No log file yet — logs are created when install or setup runs.');
        } else {
          vscode.commands.executeCommand('vscode.open', vscode.Uri.file(LOG_PATH));
        }
      } else if (msg.command === 'openWorkspaceFile') {
        const allowed = new Set(['AGENTS.md', 'IDENTITY.md', 'USER.md', 'MEMORY.md', 'SOUL.md', 'HEARTBEAT.md']);
        const file = msg.file as string;
        if (!allowed.has(file)) return;
        const workspaceDir = getOpenClawWorkspaceDir();
        const filePath = path.join(workspaceDir, file);
        if (!fs.existsSync(filePath)) {
          if (file === 'MEMORY.md') {
            // Auto-create MEMORY.md with a scaffolded long-term agent memory template
            const scaffold = [
              '# Agent Long-Term Memory',
              '',
              'This file is the persistent long-term memory for the AI agent embedded in OCcode.',
              'The agent reads this file at the start of every session to recall important context,',
              'preferences, and decisions made in previous conversations.',
              '',
              '---',
              '',
              '## About This File',
              '',
              '- **Purpose**: Stores facts, decisions, and context that should persist across agent sessions.',
              '- **Owner**: You — edit freely to add, update, or remove entries.',
              '- **Format**: Plain Markdown. Keep entries concise and well-organised.',
              '',
              '## User Preferences',
              '',
              '<!-- Add preferences the agent should always follow, e.g.:',
              '- Prefer TypeScript over JavaScript',
              '- Always use tabs for indentation',
              '-->',
              '',
              '## Project Context',
              '',
              '<!-- Record important architectural decisions, repo layout notes, or recurring patterns. -->',
              '',
              '## Recurring Solutions',
              '',
              '<!-- Document fixes for problems that come up repeatedly. -->',
              '',
              '## Notes',
              '',
              '<!-- Anything else the agent should remember long-term. -->',
            ].join('\n');
            fs.mkdirSync(workspaceDir, { recursive: true });
            fs.writeFileSync(filePath, scaffold, 'utf8');
          } else {
            vscode.window.showWarningMessage(
              `${file} not found in ${workspaceDir}. OpenClaw may not have initialised its workspace yet.`
            );
            return;
          }
        }
        vscode.commands.executeCommand('vscode.open', vscode.Uri.file(filePath));
      } else if (msg.command === 'openclaw.uninstall') {
        void this._runUninstall();
      } else if (msg.command === 'openclaw.setupBetterMemory') {
        void this._runCassSetup();
      } else if (msg.command === 'void.openChatWithMessage') {
        const args = msg.args as string[];
        if (args && args.length > 0) {
          void vscode.commands.executeCommand('void.openChatWithMessage', args[0], 'agent');
        }
      } else if (msg.command) {
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
      'openclawHome', 'OCC Home', vscode.ViewColumn.One,
      { enableScripts: true, localResourceRoots: [
        vscode.Uri.joinPath(extensionUri, 'media'),
        vscode.Uri.joinPath(extensionUri, '..', '..', 'void_icons', 'emojis'),
      ] }
    );
    HomePanel.currentPanel = new HomePanel(panel, extensionUri);
  }

  /** Push a live balance update to the webview popover — called from extension.ts balance poller. */
  public postBalanceUpdate(amount: number): void {
    try { this._panel.webview.postMessage({ type: 'balanceUpdate', amount }); } catch { /* non-fatal */ }
  }

  /** Re-run CLI detection and redraw — called after install completes. */
  public static refresh(): void {
    if (HomePanel.currentPanel) {
      void HomePanel.currentPanel._update();
    }
  }

  /**
   * Fully silent install — no terminal is ever opened.
   * Output is streamed line-by-line to the home panel webview.
   * If sudo is needed, a VS Code password dialog is shown.
   * On any failure the AI is invoked immediately with full context.
   */
  public static async runInstall(
    extensionUri: vscode.Uri,
    platform: string,
    arch: string,
    shell: string,
  ): Promise<void> {
    HomePanel.createOrShow(extensionUri);
    const panel = HomePanel.currentPanel;
    if (!panel) return;

    const post = (msg: object) => { try { panel._panel.webview.postMessage(msg); } catch {} };
    let fullLog = '';
    const tee = (text: string) => { fullLog += text; post({ type: 'installLog', text }); writeLog(text); };

    writeLog(`\n=== runInstall START platform=${platform} arch=${arch} ===\n`);
    post({ type: 'installState', state: 'running' });

    const env = panel._buildExecEnv();
    const isPermError = (s: string) => /EACCES|permission denied|EPERM|not permitted|Need sudo access|needs to be an Administrator/i.test(s);

    // Quick command check helper (no output, just exit code)
    const cmdExists = (cmd: string): Promise<boolean> =>
      new Promise(resolve =>
        cp.exec(cmd, { env, timeout: 5000, windowsHide: true }, err => resolve(!err))
      );

    // Spawn a command silently and stream output to the panel.
    const runCaptured = (cmd: string, args: string[], opts: cp.SpawnOptions = {}): Promise<{ code: number }> =>
      new Promise(resolve => {
        const child = cp.spawn(cmd, args, { env, stdio: ['ignore', 'pipe', 'pipe'], ...opts });
        child.stdout?.on('data', (d: Buffer) => tee(d.toString()));
        child.stderr?.on('data', (d: Buffer) => tee(d.toString()));
        child.on('close', code => resolve({ code: code ?? 1 }));
        child.on('error', err => { tee(`\nError: ${err.message}\n`); resolve({ code: 1 }); });
      });

    // Ask for sudo password via in-webview modal, cache with `sudo -S -v`, return success.
    const cacheSudo = async (_prompt: string): Promise<boolean> => {
      const password = await new Promise<string | undefined>(resolve => {
        HomePanel._pendingPasswordResolve = resolve;
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

    // Fix ~/.openclaw ownership after any sudo-based install.
    // Uses `sudo -n` (non-interactive) which succeeds as long as the cached sudo session
    // from cacheSudo() is still valid (~15 min default). Safe to call even when sudo
    // wasn't used — chown is a no-op when the directory is already user-owned.
    const fixOpenclawPermissions = async () => {
      if (platform === 'win32') return;
      const openclawDir = path.join(os.homedir(), '.openclaw');
      if (!fs.existsSync(openclawDir)) return;
      try {
        const username = os.userInfo().username;
        tee('Fixing .openclaw folder ownership...\n');
        await runCaptured('sudo', ['-n', 'chown', '-R', `${username}:${username}`, openclawDir]);
        await runCaptured('chmod', ['700', openclawDir]);
        tee('✅  Permissions set (700, owned by you)\n');
      } catch { /* non-fatal */ }
    };

    const failCancelled = () => {
      post({ type: 'installState', state: 'cancelled' });
    };

    const fail = async () => {
      writeLog('=== runInstall END failed ===\n');
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

    const succeed = async () => {
      tee('\n✅  Installed successfully!\n');
      writeLog('=== runInstall END ok ===\n');
      post({ type: 'installState', state: 'done' });
      // Webview drives the post-install navigation via autoSetupSkipped or wizardLog done
    };

    // ══════════════════════════════════════════════════════════════════════════
    // PREREQUISITE CHECKS + PROACTIVE SUDO — run BEFORE any install attempt
    // ══════════════════════════════════════════════════════════════════════════
    tee('Checking prerequisites...\n');

    if (platform === 'darwin') {
      // macOS: check Xcode Command Line Tools
      const xcodeOk = await new Promise<boolean>(resolve =>
        cp.exec('xcode-select -p', { env, timeout: 5000 }, (err, stdout) => {
          resolve(!err && !!stdout?.toString().trim());
        })
      );
      if (!xcodeOk) {
        tee('  ⚠ Xcode Command Line Tools not installed.\n');
        tee('  Installing Xcode Command Line Tools (this may show a system dialog)...\n');
        await runCaptured('xcode-select', ['--install']);
        tee('  ⏳ Please complete the Xcode tools installation in the system dialog,\n');
        tee('     then restart OCCode and try again.\n');
        await fail(); return;
      }
      tee('  ✓ Xcode Command Line Tools\n');
    }

    if (platform === 'win32') {
      // Windows: check Node.js exists; auto-install if missing (no UAC required)
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
        // Pre-compute the inner folder name (avoids | pipe which cmd.exe would intercept)
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

        // Make new Node.js dir visible to all subsequent commands in this install run
        env.PATH = [installDir, env.PATH || ''].filter(Boolean).join(';');
        (env as any).Path = env.PATH;

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

    // Proactive sudo detection (macOS / Linux only)
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
        // No npm — will need to install Node.js, likely needs sudo
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

    // ── Step 1: try npm install -g openclaw ───────────────────────────────────
    if (npmOk) {
      tee('Installing openclaw via npm...\n');
      const spawnOpts: cp.SpawnOptions = platform === 'win32' ? { shell: true, windowsHide: true } : {};
      const npmArgs = ['install', '-g', 'openclaw'];
      const r1 = sudoCached
        ? await runCaptured('sudo', ['-E', 'npm', ...npmArgs])
        : await runCaptured('npm', npmArgs, spawnOpts);
      if (r1.code === 0) {
        if (sudoCached) await fixOpenclawPermissions();
        await succeed(); return;
      }
      // If sudo wasn't cached and we hit permission error, ask now (fallback)
      if (!sudoCached && platform !== 'win32' && isPermError(fullLog)) {
        tee('\nPermission error — elevated access required.\n');
        const ok = await cacheSudo('Enter your system password to install OpenClaw');
        if (!ok) { tee('Incorrect password or cancelled.\n'); failCancelled(); return; }
        sudoCached = true;
        tee('Retrying with elevated permissions...\n');
        const r2 = await runCaptured('sudo', ['-E', 'npm', 'install', '-g', 'openclaw']);
        if (r2.code === 0) {
          await fixOpenclawPermissions();
          await succeed(); return;
        }
      }
      tee('\nnpm install did not succeed — trying full installer script...\n');
    } else if (platform !== 'win32') {

      // ── Unix: npm not found — silent Node.js install (no terminal) ──────────
      // Step A: try nvm (no sudo, no password needed)
      const nvmSh = path.join(os.homedir(), '.nvm', 'nvm.sh');
      if (fs.existsSync(nvmSh)) {
        tee('nvm detected — installing Node.js LTS...\n');
        const nvmR = await runCaptured('bash', ['-c',
          `. "${nvmSh}" && nvm install --lts && nvm use --lts && npm install -g openclaw`
        ]);
        if (nvmR.code === 0) { await fixOpenclawPermissions(); await succeed(); return; }
        tee('nvm install failed — falling back to system install...\n');
      }

      // Step B: ensure sudo is cached (may already be from proactive check above)
      if (!sudoCached) {
        tee('\nNode.js is required. Your password is needed once to install it.\n');
        const sudoOk = await cacheSudo('Enter your password to install Node.js');
        if (!sudoOk) { tee('Incorrect password or cancelled.\n'); failCancelled(); return; }
        sudoCached = true;
      }

      if (platform === 'darwin') {
        // macOS: download official Node.js universal pkg, install silently with cached sudo
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
        // Linux: detect package manager and install Node.js LTS via nodesource
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

      // Step C: npm is now installed — find it and install openclaw
      tee('Installing OpenClaw...\n');
      const npmCandidates = ['/usr/local/bin/npm', '/usr/bin/npm'];
      const npmBin = npmCandidates.find(p => fs.existsSync(p)) ?? 'npm';
      const npmR1 = await runCaptured(npmBin, ['install', '-g', 'openclaw']);
      if (npmR1.code === 0) { await fixOpenclawPermissions(); await succeed(); return; }
      // Global prefix dir may be root-owned — retry with cached sudo
      if (isPermError(fullLog)) {
        const npmR2 = await runCaptured('sudo', ['-n', npmBin, 'install', '-g', 'openclaw']);
        if (npmR2.code === 0) { await fixOpenclawPermissions(); await succeed(); return; }
      }
      await fail(); return;

    } else {
      tee('npm not found — running full installer script...\n');
    }

    // ── Step 2: full install script ── (npm found but failed, or Windows no npm)
    if (platform === 'win32') {
      tee('Running PowerShell installer...\n');
      const psArgs = [
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
        `$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; ` +
        `Invoke-WebRequest -UseBasicParsing https://openclaw.ai/install.ps1 | Invoke-Expression`,
      ];
      const r = await runCaptured('powershell', psArgs, { windowsHide: true } as cp.SpawnOptions);
      if (r.code === 0) { await succeed(); return; }
    } else {
      // npm was found but install failed — try the openclaw installer script
      tee('Running install script...\n');
      const r1 = await runCaptured('bash', ['-c', 'curl -fsSL https://openclaw.ai/install.sh | bash']);
      if (r1.code === 0) {
        await fixOpenclawPermissions();
        await succeed(); return;
      }
      if (isPermError(fullLog)) {
        tee('\nPermission error in installer — elevated access required.\n');
        const ok = await cacheSudo('Enter your system password to complete installation');
        if (!ok) { tee('Incorrect password or cancelled.\n'); failCancelled(); return; }
        tee('Retrying with elevated permissions...\n');
        const r2 = await runCaptured('sudo', ['-E', 'bash', '-c', 'curl -fsSL https://openclaw.ai/install.sh | bash']);
        if (r2.code === 0) {
          await fixOpenclawPermissions();
          await succeed(); return;
        }
      }
    }

    await fail();
  }

  public dispose() {
    HomePanel.currentPanel = undefined;
    this._stopPolling();
    if (this._uninstallCloseWatcher !== undefined) {
      clearInterval(this._uninstallCloseWatcher);
      this._uninstallCloseWatcher = undefined;
    }
    if (this._uninstallCloseSidebarTimer !== undefined) {
      clearTimeout(this._uninstallCloseSidebarTimer);
      this._uninstallCloseSidebarTimer = undefined;
    }
    this._outputChannel.dispose();
    this._panel.dispose();
    this._disposables.forEach(d => d.dispose());
  }

  private async _update() {
    const openclawDir = path.join(os.homedir(), '.openclaw');
    const dirExists = fs.existsSync(openclawDir);

    // Silently fix ownership if ~/.openclaw was created as root (e.g. after a sudo install).
    // sudo -n is non-interactive — only succeeds if a sudo session is still cached; otherwise a no-op.
    if (dirExists && process.platform !== 'win32') {
      try {
        const stat = fs.statSync(openclawDir);
        if (stat.uid !== process.getuid!()) {
          const username = os.userInfo().username;
          cp.exec(`sudo -n chown -R ${username}:${username} ${openclawDir} && chmod 700 ${openclawDir}`);
        }
      } catch { /* non-fatal */ }
    }

    const cliCheck = await this._testOpenClawCli();
    writeLog(`[cli-check] ok=${cliCheck.ok} cmd="${cliCheck.command}" output="${(cliCheck.output ?? '').trim()}"\n`);
    const configFile = path.join(os.homedir(), '.openclaw', 'openclaw.json');
    const isConfigured = fs.existsSync(configFile);
    const isInstalled = isConfigured; // config file is the sole source of truth — a leftover binary without config is not "installed"
    this._lastInstalledState = isInstalled;
    this._lastInstalledVersion = cliCheck.ok ? (cliCheck.output ?? '').trim() : null;
    const iconUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'icon.png')
    );
    const occJwt = await vscode.commands.executeCommand<string>('occ.auth.getLegacyJwt').then(r => r ?? '', () => '');
    this._lastJwt = occJwt;

    // Fetch user info from extension host (avoids CORS — webview origin is vscode-webview://)
    let occUser: { email: string; picture: string | null; balance_usd: number; api_keys?: { moltpilotKey?: string; occKey?: string } | null } | null = null;
    if (occJwt) {
      try {
        const r = await fetch('https://occ.mba.sh/api/v1/me', {
          headers: { Authorization: `Bearer ${occJwt}` },
        });
        if (r.ok) occUser = await r.json() as { email: string; picture: string | null; balance_usd: number; api_keys?: { moltpilotKey?: string; occKey?: string } | null };
      } catch { /* network error — leave null */ }
    }

    // Show unified setup view when OpenClaw is not fully configured yet.
    if (!isConfigured) {
      this._panel.webview.html = this._getSetupHtml(isInstalled, iconUri.toString(), occUser);
      this._autoUpdateTriggered = false; // reset so check fires when they reach the dashboard
    } else {
      const emojiBaseUri = this._panel.webview.asWebviewUri(
        vscode.Uri.joinPath(this._extensionUri, '..', '..', 'void_icons', 'emojis')
      ).toString();
      // Read AI model info from openclaw.json
      let aiModelName = '';
      try {
        const raw = fs.readFileSync(configFile, 'utf-8');
        const cfg = JSON.parse(raw) as Record<string, unknown>;
        const primaryModel = (cfg as Record<string, Record<string, Record<string, Record<string, string>>>>)
          ?.agents?.defaults?.model?.primary ?? '';
        if (primaryModel) {
          const slashIdx = primaryModel.indexOf('/');
          const providerId = slashIdx >= 0 ? primaryModel.slice(0, slashIdx) : '';
          const modelId    = slashIdx >= 0 ? primaryModel.slice(slashIdx + 1) : primaryModel;
          const providers = (cfg as Record<string, Record<string, Record<string, Record<string, { id: string; name?: string; input?: string[] }[]>>>>)
            ?.models?.providers ?? {};
          const providerModels = providers[providerId]?.models ?? [];
          const modelDef = providerModels.find((m: { id: string; name?: string; input?: string[] }) => m.id === modelId);
          aiModelName = modelDef?.name ?? primaryModel;
        }
      } catch { /* openclaw.json unreadable or missing fields */ }

      this._panel.webview.html = this._getHtml(isInstalled, dirExists, cliCheck, iconUri.toString(), occJwt, occUser, emojiBaseUri, aiModelName);
      // One-shot version check: fires the first time the user lands on the full dashboard.
      // If the installed version is outdated, MoltPilot auto-starts the update.
      if (!this._autoUpdateTriggered) {
        this._autoUpdateTriggered = true;
        setTimeout(() => void this._autoUpdateIfOutdated(), 3000);
      }
    }
    // Kick off gateway status polling now that the webview is ready.
    this._startPolling();
    // Auto-check version on every load so the banner is always current.
    // Small delay so the webview JS finishes loading before the postMessage arrives.
    if (isInstalled) {
      setTimeout(() => {
        try { this._panel.webview.postMessage({ type: 'autoCheckVersion' }); } catch {}
        void this._checkLatestVersion();
      }, 800);
    }
  }

  // ── Gateway status helpers ─────────────────────────────────────────────────

  /**
   * Reads the gateway port from ~/.openclaw/openclaw.json.
   * Falls back to 18789 if the file is missing or the field is absent.
   */
  private _getConfiguredPort(): number {
    try {
      const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
      const raw = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(raw) as Record<string, unknown>;
      const gateway = config['gateway'] as Record<string, unknown> | undefined;
      const p = gateway?.['port'] ?? config['port'] ?? config['gateway_port'] ?? config['gatewayPort'];
      const n = typeof p === 'string' ? parseInt(p, 10) : typeof p === 'number' ? p : NaN;
      return Number.isFinite(n) && n > 0 && n < 65536 ? n : 18789;
    } catch {
      return 18789;
    }
  }

  /** Raw HTTP probe against the configured port — no _commandAction guard. Used by the polling loop. */
  private _checkGatewayStatusRaw(): Promise<GatewayStatus> {
    const port = this._getConfiguredPort();
    return new Promise(resolve => {
      const req = http.get(`http://localhost:${port}/`, { timeout: 2000 }, res => {
        res.resume();
        resolve(res.statusCode !== undefined && res.statusCode < 500 ? 'running' : 'errored');
      });
      req.on('error', (err: NodeJS.ErrnoException) => {
        resolve(err.code === 'ECONNREFUSED' ? 'stopped' : 'errored');
      });
      req.on('timeout', () => { req.destroy(); resolve('stopped'); });
    });
  }

  private async _checkGatewayStatus(): Promise<GatewayStatus> {
    if (this._commandAction) {
      return this._commandAction === 'start' ? 'starting'
           : this._commandAction === 'stop'  ? 'stopping'
           : 'restarting';
    }
    return this._checkGatewayStatusRaw();
  }

  /**
   * Fast synchronous check — ~/.openclaw/openclaw.json is the single
   * definitive signal that OpenClaw is installed and initialised.
   */
  private _quickInstallCheck(): boolean {
    // Config file is the sole source of truth — no config means not installed,
    // even if the binary is still on PATH.
    return fs.existsSync(path.join(os.homedir(), '.openclaw', 'openclaw.json'));
  }

  private _startPolling(): void {
    this._stopPolling();
    this._pollTick = 0;
    const tick = async () => {
      if (!HomePanel.currentPanel) return;
      this._pollTick++;

      // Every 2 ticks (~4s): quick existsSync check on known binary paths.
      // No process spawn — just cheap stat calls. If the result differs from
      // the last known state, do a full _update() to confirm and re-render.
      if (this._pollTick % 2 === 0) {
        const nowInstalled = this._quickInstallCheck();
        if (nowInstalled !== this._lastInstalledState) {
          void this._update();
          return;
        }
      }

      // Every 15 ticks (~30s): re-fetch CLI version fresh via login shell — no cache.
      // Always push the latest value and refresh the update banner.
      if (this._pollTick % 15 === 0) {
        void this._testOpenClawCli().then(result => {
          const current = result.ok ? (result.output ?? '').trim() : null;
          const changed = current !== this._lastInstalledVersion;
          this._lastInstalledVersion = current;
          // Always push fresh version to the CLI row span.
          try {
            this._panel.webview.postMessage({ type: 'cliVersion', text: current ?? 'not found', ok: result.ok });
          } catch {}
          // Refresh the update banner whenever the version changed.
          if (changed) {
            try { this._panel.webview.postMessage({ type: 'autoCheckVersion' }); } catch {}
            void this._checkLatestVersion();
          }
        });
      }

      const [status, aiRunning, sidebarVisible, jwt] = await Promise.all([
        this._checkGatewayStatus(),
        vscode.commands.executeCommand<boolean>('void.getIsRunning').then(v => !!v, () => false),
        vscode.commands.executeCommand<boolean>('void.sidebar.isVisible').then(v => !!v, () => this._sidebarOpen),
        vscode.commands.executeCommand<string>('occ.auth.getLegacyJwt').then(r => r ?? '', () => ''),
      ]);
      this._sidebarOpen = sidebarVisible;
      // Don't overwrite the intermediary status while a gateway command is in progress.
      if (!this._commandAction) {
        try { this._panel.webview.postMessage({ type: 'gatewayStatus', status }); } catch {}
      }
      try { this._panel.webview.postMessage({ type: 'aiRunning', running: aiRunning }); } catch {}
      try { this._panel.webview.postMessage({ type: 'chatState', open: this._sidebarOpen }); } catch {}
      // Full re-render if JWT changed (e.g. deep-link auth arrived while panel was open).
      // We do a full _update() so the extension host fetches /api/v1/me fresh (avoids webview CORS).
      if (jwt !== this._lastJwt) {
        void this._update();
        return;
      }
    };
    void tick();
    this._pollingTimer = setInterval(tick, 2000);
  }

  private _stopPolling(): void {
    if (this._pollingTimer !== undefined) {
      clearInterval(this._pollingTimer);
      this._pollingTimer = undefined;
    }
  }

  /**
   * Polls the actual gateway HTTP status until the expected state is reached
   * or the timeout expires. Streams live status updates to the webview while
   * waiting so the UI stays accurate (still "Starting…" etc.).
   */
  private async _handleGatewayAction(action: 'start' | 'stop' | 'restart'): Promise<void> {
    const intermediary: GatewayStatus =
      action === 'start' ? 'starting' : action === 'stop' ? 'stopping' : 'restarting';
    const expectedState: GatewayStatus = action === 'stop' ? 'stopped' : 'running';

    this._commandAction = action;
    try { this._panel.webview.postMessage({ type: 'gatewayStatus', status: intermediary }); } catch {}

    // Hand off to AI — it will run the command and handle any errors
    const verb = action === 'restart' ? 'restart' : action;
    const osInfo = `${process.platform} ${os.release()} (${process.arch})`;
    const port = this._getConfiguredPort();
    const portCheckCmd = process.platform === 'win32'
      ? `netstat -ano | findstr :${port}`
      : `lsof -iTCP:${port} -sTCP:LISTEN -n -P 2>/dev/null || ss -tlnp 2>/dev/null | grep :${port}`;
    const aiMessage = [
      `Please ${verb} the OpenClaw gateway.`,
      '',
      `Run the following command in your terminal:`,
      '```',
      `openclaw gateway ${action}`,
      '```',
      '',
      `Environment: ${osInfo}`,
      `Configured gateway port: ${port}`,
      '',
      `After running the command, verify the gateway has reached the expected state by checking`,
      `whether port ${port} is ${expectedState === 'running' ? 'actively listening' : 'no longer listening'}:`,
      '```',
      portCheckCmd,
      '```',
      '',
      `The gateway is confirmed ${expectedState === 'running' ? 'running' : 'stopped'} when port ${port} ` +
      `${expectedState === 'running' ? 'shows an active LISTEN entry' : 'shows no LISTEN entry'}.`,
      `If the command fails or the port does not reach the expected state, diagnose and fix the issue.`,
    ].join('\n');

    await vscode.commands.executeCommand('void.openChatWithMessage', aiMessage, 'agent');
    void vscode.commands.executeCommand('openclaw.balance.spend');

    // Poll in the background until gateway reaches expected state
    this._pollUntilState(expectedState, intermediary);
  }

  private _pollUntilState(expected: GatewayStatus, intermediary: GatewayStatus, maxWaitMs = 180000): void {
    const deadline = Date.now() + maxWaitMs;
    const tick = async () => {
      if (Date.now() > deadline) {
        this._commandAction = null;
        try { this._panel.webview.postMessage({ type: 'gatewayStatus', status: await this._checkGatewayStatus() }); } catch {}
        return;
      }
      // Use raw status check, bypassing _commandAction guard
      const status = await this._checkGatewayStatusRaw();
      if (status === expected) {
        this._commandAction = null;
        try { this._panel.webview.postMessage({ type: 'gatewayStatus', status }); } catch {}
      } else {
        try { this._panel.webview.postMessage({ type: 'gatewayStatus', status: intermediary }); } catch {}
        setTimeout(tick, 4000);
      }
    };
    setTimeout(tick, 4000);
  }

  // ── Version check ──────────────────────────────────────────────────────────

  /** Fetches the latest openclaw version from the npm registry. */
  private _fetchLatestVersion(): Promise<string | null> {
    return new Promise(resolve => {
      // Try npm registry first — openclaw is published there.
      const req = https.get(
        { hostname: 'registry.npmjs.org', path: '/openclaw/latest', headers: { Accept: 'application/json' } },
        res => {
          let data = '';
          res.on('data', (c: Buffer) => (data += c));
          res.on('end', () => {
            try { resolve(JSON.parse(data).version ?? null); } catch { resolve(null); }
          });
        },
      );
      req.setTimeout(6000, () => { req.destroy(); resolve(null); });
      req.on('error', () => resolve(null));
    });
  }

  private async _checkLatestVersion(): Promise<void> {
    const post = (html: string) => {
      try { this._panel.webview.postMessage({ type: 'versionResult', html }); } catch {}
    };

    const [cliCheck, latest] = await Promise.all([
      this._testOpenClawCli(),
      this._fetchLatestVersion(),
    ]);

    if (!latest) {
      post(`<span style="color:#888">Could not reach version server — check your connection.</span>`);
      return;
    }

    const installed = cliCheck.ok ? (cliCheck.output ?? '').trim() : null;

    if (!installed) {
      post(`<span style="color:#60a5fa">Latest: <strong>${latest}</strong> — OpenClaw CLI not detected locally.</span>`);
      return;
    }

    // Extract the bare version number from any format:
    // "OpenClaw 2026.3.12 (6472949)" → "2026.3.12"
    // "v2026.3.12" → "2026.3.12"
    // "2026.3.12-beta.1" → "2026.3.12"
    const norm = (v: string) => {
      const match = v.match(/\d+\.\d+(?:\.\d+)*/);
      return match ? match[0] : v.replace(/^v/i, '').split(/[-+(]/)[0].trim();
    };
    if (norm(installed) === norm(latest)) {
      post(`<span style="color:#4ade80">✓ Up to date &mdash; <strong>${installed}</strong></span>`);
    } else {
      post(
        `<span style="color:#fbbf24">Update available: <strong>${latest}</strong> &mdash; you have <strong>${installed}</strong>.</span>` +
        `<button onclick="runUpdate()" style="margin-top:10px;display:flex;align-items:center;gap:6px;background:#f59e0b;color:#000;border:none;border-radius:6px;padding:7px 14px;font-size:13px;font-weight:600;cursor:pointer;width:100%;justify-content:center;" ` +
        `onmouseover="this.style.background='#fbbf24'" onmouseout="this.style.background='#f59e0b'">` +
        `⬆ Update to ${latest} →</button>`,
      );
    }
  }

  private async _autoUpdateIfOutdated(): Promise<void> {
    try {
      const [cliCheck, latest] = await Promise.all([
        this._testOpenClawCli(),
        this._fetchLatestVersion(),
      ]);
      if (!cliCheck.ok || !latest) return;
      const norm = (v: string) => { const m = v.match(/\d+\.\d+(?:\.\d+)*/); return m ? m[0] : v.replace(/^v/i, '').split(/[-+(]/)[0].trim(); };
      const installed = (cliCheck.output ?? '').trim();
      if (norm(installed) === norm(latest)) return; // already up to date
      void vscode.commands.executeCommand(
        'void.openChatWithMessage',
        `OpenClaw is installed but version ${installed} is not the latest (${latest}). Please update it now.\n\n` +
        `Run: openclaw update --yes --non-interactive\n\n` +
        `If that command is not available, use: npm install -g openclaw@latest\n\n` +
        `After updating, verify with: openclaw --version`,
        'agent',
      );
    } catch { /* best-effort */ }
  }

  private _getLoadingHtml(iconUri: string): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    html { font-size: 16px; }
    body {
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
      background: #1a1a1a;
      color: #e0e0e0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: clamp(16px, 5vw, 48px) clamp(12px, 4vw, 32px);
      text-align: center;
    }
    .logo {
      width: clamp(56px, 14vw, 96px);
      height: clamp(56px, 14vw, 96px);
      margin-bottom: clamp(14px, 3vw, 24px);
      filter: drop-shadow(0 4px 12px rgba(220, 40, 40, 0.3));
      animation: pulse 2s ease-in-out infinite;
      flex-shrink: 0;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; filter: drop-shadow(0 4px 12px rgba(220, 40, 40, 0.3)); }
      50% { opacity: 0.75; filter: drop-shadow(0 4px 20px rgba(220, 40, 40, 0.6)); }
    }
    h1 {
      font-size: clamp(16px, 4.5vw, 28px);
      font-weight: 700;
      margin-bottom: clamp(4px, 1vw, 8px);
      color: #fff;
      line-height: 1.2;
      word-break: break-word;
    }
    h1 .accent { color: #dc2828; }
    .tagline {
      color: #888;
      font-size: clamp(11px, 2.5vw, 14px);
      margin-bottom: clamp(24px, 6vw, 40px);
      max-width: 40ch;
      line-height: 1.5;
    }
    .spinner-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: clamp(10px, 2.5vw, 16px);
    }
    .spinner {
      width: clamp(24px, 6vw, 36px);
      height: clamp(24px, 6vw, 36px);
      border: 3px solid rgba(220, 40, 40, 0.15);
      border-top-color: #dc2828;
      border-radius: 50%;
      animation: spin 0.75s linear infinite;
      flex-shrink: 0;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .loading-text {
      font-size: clamp(11px, 2.5vw, 13px);
      color: #666;
      letter-spacing: 0.02em;
    }
    .loading-dots::after {
      content: '';
      animation: dots 1.5s steps(4, end) infinite;
    }
    @keyframes dots {
      0%   { content: ''; }
      25%  { content: '.'; }
      50%  { content: '..'; }
      75%  { content: '...'; }
      100% { content: ''; }
    }
  </style>
</head>
<body>
  <img class="logo" src="${iconUri}" alt="OpenClaw" />
  <h1>Welcome to OpenClaw <span class="accent">Code</span></h1>
  <p class="tagline">AI Powered Harness for OpenClaw</p>
  <div class="spinner-wrap">
    <div class="spinner"></div>
    <span class="loading-text">Checking environment<span class="loading-dots"></span></span>
  </div>
</body>
</html>`;
  }

  // ── Setup wizard ───────────────────────────────────────────────────────────

  private async _runSetup(data: { provider: string; apiKey: string; port: string }): Promise<void> {
    const post = (msg: object) => { try { this._panel.webview.postMessage(msg); } catch {} };
    const wizardPost = (text: string, done: boolean, ok: boolean) => {
      writeLog(text);
      post({ type: 'wizardLog', text, done, ok });
    };
    const env = this._buildExecEnv();
    const cliPath = await this._findOpenClawPath() ?? 'openclaw';
    const port = data.port && /^\d+$/.test(data.port) ? data.port : '18789';
    const isFree = data.provider === 'free';

    // Map provider choice to openclaw flags.
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

    await new Promise<void>(resolve => {
      const child = cp.spawn(cliPath, args, {
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        ...(process.platform === 'win32' ? { shell: true, windowsHide: true } : {}),
      });
      child.stdout?.on('data', (d: Buffer) => wizardPost(d.toString(), false, false));
      child.stderr?.on('data', (d: Buffer) => wizardPost(d.toString(), false, false));
      child.on('close', code => {
        const ok = code === 0;
        writeLog(`=== _runSetup END code=${code} ===\n`);
        wizardPost(ok ? '\n✅ Setup complete!\n' : `\nSetup exited with code ${code}.\n`, true, ok);
        if (ok) {
          if (isFree) {
            // Write local free-tier marker (no remote enforcement).
            try {
              const occDir = path.join(os.homedir(), '.occ');
              if (!fs.existsSync(occDir)) fs.mkdirSync(occDir, { recursive: true });
              fs.writeFileSync(
                path.join(occDir, 'moltpilot-tier.json'),
                JSON.stringify({ tier: 'free', grantedAt: new Date().toISOString(), limitUsd: 1.00 }),
              );
            } catch { /* non-fatal */ }
            // Patch openclaw.json to inject correct cost/context metadata for occ-legacy.
            // openclaw onboard writes the model with null/zero values; we fix them here.
            try {
              const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
              const raw = fs.readFileSync(configPath, 'utf-8');
              const cfg = JSON.parse(raw) as Record<string, unknown>;
              // Recursively find any model object with id === OCC_LEGACY_MODEL_ID and patch it.
              const patchModel = (obj: unknown): boolean => {
                if (!obj || typeof obj !== 'object') return false;
                if (Array.isArray(obj)) {
                  for (const item of obj) {
                    if (patchModel(item)) return true;
                  }
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
              fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
            } catch { /* non-fatal — openclaw.json may not exist yet */ }
          }
          setTimeout(() => {
            HomePanel.refresh();
            if (isFree) {
              vscode.commands.executeCommand('openclaw.openWorkspace');
            }
            // Give the dashboard time to render, then open a new chat asking AI to start the gateway
            setTimeout(() => {
              vscode.commands.executeCommand('void.openChatWithMessage',
                'Run `openclaw gateway start` to start the OpenClaw gateway.',
                'agent');
            }, 1000);
          }, 1500);
        }
        resolve();
      });
      child.on('error', err => {
        wizardPost(`Error: ${err.message}\n`, true, false);
        resolve();
      });
    });
  }

  // ── Uninstall ──────────────────────────────────────────────────────────────
  private _schedulePostUninstallClose(): void {
    if (this._uninstallCloseWatcher !== undefined) return;

    const maxWaitMs = 90_000;
    const pollMs = 2_000;
    const closeDelayMs = 3_000;
    const started = Date.now();
    let wasRunning = false;

    this._uninstallCloseWatcher = setInterval(async () => {
      if (Date.now() - started > maxWaitMs) {
        clearInterval(this._uninstallCloseWatcher);
        this._uninstallCloseWatcher = undefined;
        return;
      }

      const isRunning = await vscode.commands.executeCommand<boolean>('void.getIsRunning')
        .then(v => !!v, () => false);

      if (isRunning) { wasRunning = true; return; }
      if (!wasRunning) return;

      clearInterval(this._uninstallCloseWatcher);
      this._uninstallCloseWatcher = undefined;
      this._uninstallCloseSidebarTimer = setTimeout(() => {
        this._uninstallCloseSidebarTimer = undefined;
        vscode.commands.executeCommand('void.sidebar.close');
      }, closeDelayMs);
    }, pollMs);
  }

  // AI-only: hand everything to MoltPilot immediately.
  // MoltPilot is instructed to stop all running OpenClaw processes first
  // (to release lock files), then perform full uninstall using run_with_sudo
  // where elevation is required.

  private async _runUninstall(): Promise<void> {
    const post = (msg: object) => { try { this._panel.webview.postMessage(msg); } catch {} };

    post({ type: 'uninstallLog', text: 'Handing off to AI for uninstall…\n', done: true, ok: true });

    setTimeout(() => {
      post({ type: 'uninstallDone' });
      vscode.commands.executeCommand(
        'void.openChatWithMessage',
        'Uninstall OpenClaw. No sudo.\n1. cd $HOME\n2. pkill -9 -f openclaw\n3. openclaw uninstall --all --yes --non-interactive\nConfirm each step ran OK, then tell the user it\'s done.',
        'agent',
      );
      this._schedulePostUninstallClose();
      // Workspace cleanup (removing ~/.openclaw folder and .code-workspace file) is handled
      // by openOpenClawFolder() on the next startup — manipulating workspace state here
      // triggers VS Code to modify/reload the workspace, which can cause the extension to
      // re-activate and open a duplicate OCC Home tab.
    }, 1200);
  }

  private async _runCassSetup(): Promise<void> {
    const post = (msg: object) => { try { this._panel.webview.postMessage(msg); } catch {} };
    const home = os.homedir();
    const env = this._buildExecEnv();
    const isWin = process.platform === 'win32';

    const runCmd = (cmd: string, args: string[], opts: cp.SpawnOptions = {}): Promise<{ code: number; output: string }> =>
      new Promise(resolve => {
        const child = cp.spawn(cmd, args, { env, stdio: ['ignore', 'pipe', 'pipe'], ...opts });
        let out = '';
        child.stdout?.on('data', (d: Buffer) => { const s = d.toString(); out += s; post({ type: 'wizardLog', text: s, done: false, ok: false }); });
        child.stderr?.on('data', (d: Buffer) => { const s = d.toString(); out += s; post({ type: 'wizardLog', text: s, done: false, ok: false }); });
        child.on('close', code => resolve({ code: code ?? 1, output: out }));
        child.on('error', err => resolve({ code: 1, output: err.message }));
      });

    post({ type: 'wizardLog', text: 'Setting up CASS (Coding Agent Session Search)...\n\n', done: false, ok: false });

    // ══════════════════════════════════════════════════════════════════════════
    // Phase 1 — Deterministic: detect platform, download & stage the binary
    // ══════════════════════════════════════════════════════════════════════════

    // ── Step 1: Detect platform ───────────────────────────────────────────────
    post({ type: 'wizardLog', text: '① Detecting platform...\n', done: false, ok: false });
    const isMac = process.platform === 'darwin';
    const isArm = process.arch === 'arm64';

    let assetName: string;
    if (isWin) {
      assetName = 'cass-windows-amd64.zip';
    } else if (isMac) {
      assetName = 'cass-darwin-arm64.tar.gz';
    } else {
      assetName = isArm ? 'cass-linux-arm64.tar.gz' : 'cass-linux-amd64.tar.gz';
    }
    post({ type: 'wizardLog', text: `   Platform: ${process.platform}/${process.arch} → ${assetName}\n`, done: false, ok: false });

    // ── Step 2: Download the binary ───────────────────────────────────────────
    post({ type: 'wizardLog', text: '\n② Downloading CASS v0.2.2 binary...\n', done: false, ok: false });
    const occDir = path.join(home, '.occ');
    const stagingDir = path.join(occDir, 'cass-staging');
    if (!fs.existsSync(occDir)) fs.mkdirSync(occDir, { recursive: true });
    try { fs.rmSync(stagingDir, { recursive: true, force: true }); } catch {}
    fs.mkdirSync(stagingDir, { recursive: true });

    const downloadPath = path.join(occDir, assetName);
    try { fs.unlinkSync(downloadPath); } catch {}

    const downloadUrl = `https://github.com/Dicklesworthstone/coding_agent_session_search/releases/download/v0.2.2/${assetName}`;
    const downloadOk = await new Promise<boolean>(resolve => {
      const file = fs.createWriteStream(downloadPath);
      const download = (url: string) => {
        const mod = url.startsWith('https') ? require('https') : require('http');
        mod.get(url, (res: any) => {
          if (res.statusCode === 301 || res.statusCode === 302) {
            download(res.headers.location);
            return;
          }
          if (res.statusCode !== 200) { resolve(false); return; }
          res.pipe(file);
          file.on('finish', () => { file.close(); resolve(true); });
        }).on('error', () => resolve(false));
      };
      download(downloadUrl);
    });

    if (!downloadOk) {
      post({ type: 'wizardLog', text: '\n❌ Failed to download CASS binary. Check your internet connection.\n', done: true, ok: false });
      return;
    }
    post({ type: 'wizardLog', text: '   Downloaded.\n', done: false, ok: false });

    // ── Step 3: Extract to staging dir ────────────────────────────────────────
    post({ type: 'wizardLog', text: '\n③ Extracting to staging directory...\n', done: false, ok: false });

    if (isWin) {
      await runCmd('powershell', ['-NoProfile', '-Command', `Expand-Archive -Path '${downloadPath}' -DestinationPath '${stagingDir}' -Force`], { shell: true });
    } else {
      await runCmd('tar', ['-xzf', downloadPath, '-C', stagingDir]);
    }

    // Clean up the downloaded archive
    try { fs.unlinkSync(downloadPath); } catch {}

    // Verify the binary exists in staging
    const stagedBinary = isWin
      ? path.join(stagingDir, 'cass.exe')
      : path.join(stagingDir, 'cass');

    // The binary might be nested — try to find it
    if (!fs.existsSync(stagedBinary)) {
      const findBinary = (dir: string, name: string): string | null => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.isFile() && entry.name === name) return path.join(dir, entry.name);
          if (entry.isDirectory()) {
            const r = findBinary(path.join(dir, entry.name), name);
            if (r) return r;
          }
        }
        return null;
      };
      const found = findBinary(stagingDir, isWin ? 'cass.exe' : 'cass');
      if (found) {
        fs.copyFileSync(found, stagedBinary);
      } else {
        post({ type: 'wizardLog', text: '\n❌ Could not find CASS binary in the downloaded archive.\n', done: true, ok: false });
        return;
      }
    }

    post({ type: 'wizardLog', text: `   ✅ Binary staged at ${stagedBinary}\n`, done: false, ok: false });

    // ══════════════════════════════════════════════════════════════════════════
    // Phase 2 — Hand off to MoltPilot for AI-assisted installation
    // ══════════════════════════════════════════════════════════════════════════

    post({ type: 'wizardLog', text: '\n✅ Download complete — handing off to MoltPilot for installation...\n', done: true, ok: true });

    const binaryName = isWin ? 'cass.exe' : 'cass';
    const handoffMessage = isWin
      ? `CASS binary has been downloaded and staged at ~/.occ/cass-staging/${binaryName}.

Please complete the installation:
1. Create ~/.occ/bin/ if it doesn't exist and move the binary there
2. Add ~/.occ/bin/ to the user's PATH if not already present
3. Run \`cass health --json\` to verify it works
4. Run \`cass index --full --json\` to build the initial index
5. Update ~/.openclaw/agents/main/AGENTS.md with a CASS section if not already present — add instructions to use \`cass search "<topic>" --robot --limit 5\` before starting tasks
6. Restart the OpenClaw gateway with \`openclaw gateway restart\`
7. Run a smoke test: \`cass search "test" --robot --limit 1\`

The binary is already downloaded — do NOT re-download or compile anything.`
      : `CASS binary has been downloaded and staged at ~/.occ/cass-staging/${binaryName}.

Please complete the installation:
1. Create ~/.local/bin/ if it doesn't exist and move the binary there
2. Make it executable: chmod +x ~/.local/bin/cass
3. Run \`cass health --json\` to verify it works
4. Run \`cass index --full --json\` to build the initial index
5. Update ~/.openclaw/agents/main/AGENTS.md with a CASS section if not already present — add instructions to use \`cass search "<topic>" --robot --limit 5\` before starting tasks
6. Restart the OpenClaw gateway with \`openclaw gateway restart\`
7. Run a smoke test: \`cass search "test" --robot --limit 1\`

The binary is already downloaded — do NOT re-download or compile anything.`;

    setTimeout(() => {
      vscode.commands.executeCommand('void.openChatWithMessage', handoffMessage, 'agent');
    }, 1200);

    // Refresh panel
    setTimeout(() => HomePanel.refresh(), 2500);
  }


  private _getSetupHtml(
    isInstalled: boolean,
    iconUri: string,
    occUser: { email: string; picture: string | null; balance_usd: number; api_keys?: { moltpilotKey?: string; occKey?: string } | null } | null = null
  ): string {
    // Render user area statically (avoids JS innerHTML escaping issues)
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
    <div class="panel-title">Install OpenClaw</div>
    <div class="panel-desc">OpenClaw CLI is required to run the AI gateway on this machine.</div>
    <button class="btn-primary" id="btn-install" onclick="startInstall()">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      Install OpenClaw
    </button>
  </div>

  <!-- Panel B: Configure — Step B0: no longer shown (auto-configured on install) -->
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
    <button class="molt-help" id="show-error-logs" onclick="cmd('openLogs');closeMoreMenu&&closeMoreMenu()">
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
    // When openclaw is already installed but not yet configured,
    // skip panel-cfg-b0 and auto-run setup immediately.
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
      showLog('Installing OpenClaw...');
      vscode.postMessage({ command: 'openclaw.install' });
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
      // Reset log and status, hide all action buttons, restart install
      document.getElementById('log-box').innerHTML = '';
      fullLog = '';
      setLogStatus('Installing', 'dots');
      document.getElementById('molt-help').classList.remove('visible');
      document.getElementById('show-error-logs').classList.remove('visible');
      document.getElementById('retry-install').classList.remove('visible');
      vscode.postMessage({ command: 'openclaw.install' });
    }

    // ── Password modal ─────────────────────────────────────────────
    var _pwdModalMode = 'install'; // 'install' | 'uninstall'
    function confirmPwd() {
      var pwd = document.getElementById('pwd-input').value;
      document.getElementById('pwd-modal').classList.remove('open');
      document.getElementById('pwd-input').value = '';
      if (_pwdModalMode === 'uninstall') {
        _pwdModalMode = 'install';
        if (pwd) { vscode.postMessage({ command: 'openclaw.uninstall', password: pwd }); }
      } else {
        vscode.postMessage({ command: 'sudoPassword', password: pwd });
      }
    }

    function cancelPwd() {
      _pwdModalMode = 'install';
      document.getElementById('pwd-modal').classList.remove('open');
      document.getElementById('pwd-input').value = '';
      vscode.postMessage({ command: 'sudoPassword', password: undefined });
    }

    // ── Messages from extension host ──────────────────────────────
    window.addEventListener('message', function(e) {
      var d = e.data;

      // Install log stream
      if (d.type === 'installLog') {
        appendLog(d.text || '');
      }

      // Install lifecycle
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
          // Advance timeline: mark install done, configure active
          document.getElementById('step-install').className = 'step-item done';
          document.getElementById('step-configure').className = 'step-item active';
          // Verify CLI is findable before auto-configuring (2s for PATH to settle)
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
          showLog('Setting up with OCC Legacy inference...\n');
          setLogStatus('Configuring', 'dots');
          vscode.postMessage({ command: 'runSetup', provider: 'free', apiKey: occKey, port: '18789' });
        } else {
          showLog('Skipping AI configuration — not logged in.\n');
          setLogStatus('Skipping', 'done');
          setTimeout(function() { vscode.postMessage({ command: 'autoSetupSkipped' }); }, 1500);
        }
      }

      // Configure (wizard) log stream
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

      // Password request (from install sudo prompt)
      if (d.type === 'requestPassword') {
        document.getElementById('pwd-modal').classList.add('open');
        setTimeout(function() { document.getElementById('pwd-input').focus(); }, 50);
      }
    });
  </script>
</body>
</html>`;
  }

  private _getWizardHtml(iconUri: string, occUser: { email: string; picture: string | null; balance_usd: number; api_keys?: { moltpilotKey?: string; occKey?: string } | null } | null = null): string {
    // Render user area statically (avoids JS innerHTML escaping issues)
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
      min-height: 100vh; padding: 20px; text-align: center;
    }
    /* ── Header bar ──────────────────────────────────────────────── */
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
    /* User popover */
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
    /* ── Logo ──────────────────────────────────────────────────────── */
    .logo { width: 64px; height: 64px; filter: drop-shadow(0 4px 12px rgba(220,40,40,0.3)); }
    /* ── Buttons ───────────────────────────────────────────────────── */
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
    @keyframes spin { to { transform: rotate(360deg); } }
    .btn-spin {
      display: inline-block; width: 13px; height: 13px;
      border: 2px solid rgba(255,255,255,0.25); border-top-color: #fff;
      border-radius: 50%; animation: spin 0.65s linear infinite; flex-shrink: 0;
    }
    /* ── Provider cards (BYOK) ─────────────────────────────────────── */
    .step { width: min(480px, 96vw); text-align: left; }
    .step-label { font-size: 11px; color: #555; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 10px; text-align: center; }
    h2 { font-size: 15px; font-weight: 600; color: #fff; margin-bottom: 6px; text-align: center; }
    .step-desc { font-size: 12px; color: #888; margin-bottom: 20px; line-height: 1.5; text-align: center; }
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
    .field-label { font-size: 11px; color: #888; margin-bottom: 5px; }
    .key-input {
      width: 100%; background: #111; border: 1px solid #2b2b2b; border-radius: 6px;
      color: #e0e0e0; font-size: 13px; padding: 9px 12px; outline: none;
      margin-bottom: 6px; box-sizing: border-box; font-family: monospace;
    }
    .key-input:focus { outline: none; border-color: #dc2828; }
    .key-hint { font-size: 11px; color: #555; margin-bottom: 20px; }
    .port-row { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; }
    .port-label { font-size: 12px; color: #888; white-space: nowrap; }
    .port-input {
      width: 90px; background: #111; border: 1px solid #2b2b2b; border-radius: 6px;
      color: #e0e0e0; font-size: 13px; padding: 7px 10px; outline: none; box-sizing: border-box;
    }
    .port-input:focus { outline: none; border-color: #dc2828; }
    .btn-row { display: flex; gap: 10px; justify-content: flex-end; }
    .btn-back {
      background: transparent; border: 1px solid #333; color: #888;
      font-size: 13px; padding: 8px 18px; border-radius: 6px; cursor: pointer;
    }
    .btn-back:hover { background: rgba(255,255,255,0.05); }
    /* Running step */
    .run-status {
      font-size: 12px; color: #555; margin-top: 12px;
      max-width: 280px; text-align: center; line-height: 1.5;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .run-status.done { color: #4ade80; white-space: normal; }
    .run-status.failed { color: #f87171; white-space: normal; }
    @keyframes dots { 0%,100%{content:''} 33%{content:'.'} 66%{content:'..'} 100%{content:'...'} }
    .dots::after { content: ''; animation: dots 1.2s steps(1) infinite; }
  </style>
</head>
<body>
  <!-- Header: user area -->
  <div class="header-bar">
    ${userAreaHtml}
  </div>

  <!-- Step 0: minimal — just logo + Start Free button -->
  <div id="step0" style="display:flex;flex-direction:column;align-items:center;gap:24px;">
    <img class="logo" src="${iconUri}" alt="OpenClaw" />
    <div style="display:flex;flex-direction:column;align-items:center;gap:10px;">
      <button class="btn-primary" id="btn-start-free" onclick="chooseFree()">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
        Start Free
      </button>
      <button class="btn-link" onclick="chooseBYOK()">Use my own API key →</button>
    </div>
  </div>

  <!-- Step 1: Choose provider (BYOK only) -->
  <div id="step1" class="step" style="display:none">
    <p class="step-label">Step 1 of 2</p>
    <h2>Choose your AI Provider</h2>
    <p class="step-desc">OpenClaw uses an AI provider to power agent conversations.<br>You can change this later with <code>openclaw configure</code>.</p>
    <div class="prov-grid">
      ${providerCards}
    </div>
    <div class="btn-row">
      <button class="btn-back" onclick="goStep0()">← Back</button>
      <button class="btn-primary" id="btn-next1" onclick="goStep2()" disabled>Continue →</button>
    </div>
  </div>

  <!-- Step 2: API key + port (BYOK only) -->
  <div id="step2" class="step" style="display:none">
    <p class="step-label">Step 2 of 2</p>
    <h2 id="step2-title">Enter your API Key</h2>
    <p class="step-desc" id="step2-desc">Your API key is stored locally in <code>~/.openclaw/openclaw.json</code>.</p>
    <p class="field-label">API Key</p>
    <input id="api-key" class="key-input" type="password" placeholder="sk-..." autocomplete="off" oninput="validateStep2()" />
    <p class="key-hint" id="key-hint">Get your key at <span id="key-link"></span></p>
    <div class="port-row">
      <span class="port-label">Gateway port</span>
      <input id="gw-port" class="port-input" type="text" value="18789" placeholder="18789" />
    </div>
    <div class="btn-row">
      <button class="btn-back" onclick="goStep1()">← Back</button>
      <button class="btn-primary" id="btn-run" onclick="runSetup()" disabled>Set Up OpenClaw</button>
    </div>
  </div>

  <!-- Step 3: Running -->
  <div id="step3" style="display:none;flex-direction:column;align-items:center;gap:16px;">
    <img class="logo" src="${iconUri}" alt="OpenClaw" />
    <p style="font-size:13px;color:#888"><span class="dots">Setting up</span></p>
    <p class="run-status" id="run-status"></p>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let selectedProvider = null;
    const _occUser = ${JSON.stringify(occUser)};

    // ── User area ─────────────────────────────────────────────────
    function signIn() { vscode.postMessage({ command: 'signIn' }); }
    function openDashboard() { vscode.postMessage({ command: 'openDashboard' }); }
    function signOut() { vscode.postMessage({ command: 'signOut' }); closeUserPopover(); }
    function toggleUserPopover(e) {
      e.stopPropagation();
      const pop = document.getElementById('user-popover');
      if (pop) pop.classList.toggle('open');
    }
    function closeUserPopover() {
      const pop = document.getElementById('user-popover');
      if (pop) pop.classList.remove('open');
    }
    document.addEventListener('click', () => closeUserPopover());

    // ── Wizard steps ──────────────────────────────────────────────
    function goStep0() {
      document.getElementById('step1').style.display = 'none';
      document.getElementById('step2').style.display = 'none';
      document.getElementById('step0').style.display = 'flex';
    }

    function chooseFree() {
      document.getElementById('step0').style.display = 'none';
      document.getElementById('step3').style.display = 'flex';
      vscode.postMessage({ command: 'runSetup', provider: 'free', apiKey: (_occUser && _occUser.api_keys && _occUser.api_keys.occKey) || '', port: '18789' });
    }

    function chooseBYOK() {
      document.getElementById('step0').style.display = 'none';
      document.getElementById('step1').style.display = 'block';
    }

    function pickProvider(btn) {
      document.querySelectorAll('.prov-card').forEach(function(c) { c.classList.remove('selected'); });
      btn.classList.add('selected');
      selectedProvider = btn.dataset.id;
      document.getElementById('btn-next1').disabled = false;
    }

    function goStep2() {
      if (!selectedProvider) return;
      var card = document.querySelector('.prov-card.selected');
      document.getElementById('step2-title').textContent = card.querySelector('.prov-label').textContent + ' API Key';
      document.getElementById('api-key').placeholder = card.dataset.placeholder;
      document.getElementById('key-link').textContent = card.dataset.hint;
      document.getElementById('step1').style.display = 'none';
      document.getElementById('step2').style.display = 'block';
      document.getElementById('api-key').focus();
    }

    function goStep1() {
      document.getElementById('step2').style.display = 'none';
      document.getElementById('step1').style.display = 'block';
    }

    function validateStep2() {
      const key = document.getElementById('api-key').value.trim();
      document.getElementById('btn-run').disabled = key.length < 8;
    }

    function runSetup() {
      const apiKey = document.getElementById('api-key').value.trim();
      const port = document.getElementById('gw-port').value.trim() || '18789';
      if (!apiKey || !selectedProvider) return;
      document.getElementById('step2').style.display = 'none';
      const s3 = document.getElementById('step3');
      s3.style.display = 'flex';
      vscode.postMessage({ command: 'runSetup', provider: selectedProvider, apiKey, port });
    }

    const statusEl = document.getElementById('run-status');

    window.addEventListener('message', e => {
      if (e.data.type === 'wizardLog') {
        if (e.data.done) {
          statusEl.className = 'run-status ' + (e.data.ok ? 'done' : 'failed');
          statusEl.textContent = e.data.ok ? "You're all set." : 'Something went wrong. The AI will help fix it.';
        } else {
          const line = (e.data.text || '').split('\\n').map(function(l) { return l.trim(); }).filter(Boolean).pop();
          if (line) { statusEl.className = 'run-status'; statusEl.textContent = line; }
        }
      }
    });
  </script>
</body>
</html>`;
  }

  private _getHtml(
    isInstalled: boolean,
    dirExists: boolean,
    cliCheck: { ok: boolean; output?: string; error?: string; command: string },
    iconUri: string,
    occJwt: string = '',
    occUser: { email: string; picture: string | null; balance_usd: number; api_keys?: { moltpilotKey?: string; occKey?: string } | null } | null = null,
    emojiBaseUri: string = '',
    aiModelName = ''
  ): string {
    // Render user area statically (avoids JS innerHTML escaping / runtime errors)
    let userAreaHtml: string;
    if (!occUser) {
      userAreaHtml = `<button class="sign-in-btn" onclick="signIn()">Sign In</button>`;
    } else {
      const initial = (occUser.email || '?')[0].toUpperCase();
      const safeEmail = occUser.email.replace(/"/g, '&quot;').replace(/</g, '&lt;');
      const avatarImg = occUser.picture
        ? `<img src="${occUser.picture}" alt="" referrerpolicy="no-referrer" />`
        : initial;
      const popoverAvatar = occUser.picture
        ? `<img src="${occUser.picture}" alt="" referrerpolicy="no-referrer" />`
        : initial;
      const balance = '$' + parseFloat(String(occUser.balance_usd || 0)).toFixed(2);
      const keysHtml = (occUser.api_keys && occUser.api_keys.occKey) ? `
          <div class="user-popover-keys">
            <div class="user-popover-keys-title">API Key</div>
            <div class="user-key-row">
              <span class="user-key-label">OpenClaw</span>
              <span class="user-key-value" id="key-occ" data-full="${occUser.api_keys.occKey}">${occUser.api_keys.occKey.slice(0,8)}···${occUser.api_keys.occKey.slice(-4)}</span>
              <button class="user-key-copy" onclick="copyKey('key-occ',this)" title="Copy">⎘</button>
            </div>
          </div>
          <div class="user-popover-divider"></div>` : '';
      userAreaHtml = `
        <div class="user-popover-wrap" id="user-popover-wrap">
          <button class="user-avatar-btn" title="${safeEmail}" onclick="toggleUserPopover(event)" aria-haspopup="true">${avatarImg}</button>
          <div class="user-popover" id="user-popover">
            <div class="user-popover-header">
              <div class="user-popover-avatar">${popoverAvatar}</div>
              <div class="user-popover-email">${safeEmail}</div>
              <div class="user-popover-balance" id="user-popover-balance">${balance} credits</div>
            </div>
            <div class="user-popover-actions">
              <a class="user-popover-action" href="#" onclick="openDashboard();return false;">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
                Open Dashboard
              </a>
            </div>
            <div class="user-popover-divider"></div>
            ${keysHtml}
            <button class="user-popover-signout" onclick="signOut()">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              Sign out
            </button>
          </div>
        </div>`;
    }

    const statusIcon = isInstalled ? '✅' : '⚠️';
    const statusText = isInstalled ? 'OpenClaw detected' : 'OpenClaw not found';
    const statusClass = isInstalled ? 'detected' : 'not-found';
    const buttonLabel = isInstalled ? 'Configure OpenClaw' : 'Install OpenClaw';
    const buttonCommand = isInstalled ? 'openclaw.configure' : 'openclaw.install';
    const dirText = dirExists ? 'found' : 'missing';
    const dirClass = dirExists ? 'ok' : 'warn';
    const cliText = cliCheck.ok ? (cliCheck.output || 'ok') : (cliCheck.output || cliCheck.error || 'not found');
    const cliClass = cliCheck.ok ? 'ok' : 'warn';
    const cliHint = cliCheck.ok ? '' : ` (tried: ${cliCheck.command})`;

    // ── Lucide icons (inline SVG, no CDN needed) ──────────────────────────────
    const ic = (d: string, size = 13, opacity = '0.55') =>
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;opacity:${opacity}">${d}</svg>`;
    const icFolder   = ic('<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>');
    const icTerminal = ic('<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>');
    const icServer   = ic('<rect width="20" height="8" x="2" y="2" rx="2"/><rect width="20" height="8" x="2" y="14" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>');
    const icBot      = ic('<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>');
    const icChip     = ic('<path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><path d="M7 7h.01"/>', 13);
    // Button icons — slightly larger, full opacity
    const icSettings = ic('<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>', 15, '0.9');
    const icDownload = ic('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>', 15, '0.9');
    const icRefreshCw = ic('<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>', 14, '0.85');
    const icTerminalBtn = ic('<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>', 15, '0.9');
    const icBtnPrimary = isInstalled ? icSettings : icDownload;

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    html { font-size: 16px; }
    body {
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
      background: #1a1a1a;
      color: #e0e0e0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      min-height: 100vh;
      padding: 70px clamp(12px, 4vw, 24px) 20px;
      text-align: center;
    }

    /* ── Hero ──────────────────────────────────────────────────── */
    .logo {
      width: 96px;
      height: 96px;
      margin-bottom: 8px;
      filter: drop-shadow(0 4px 12px rgba(220, 40, 40, 0.3));
      flex-shrink: 0;
    }
    h1 {
      font-size: clamp(14px, 4vw, 22px);
      font-weight: 700;
      margin-bottom: 2px;
      color: #fff;
      line-height: 1.2;
      word-break: break-word;
    }
    h1 .accent { color: #dc2828; }
    .tagline {
      color: #666;
      font-size: clamp(10px, 2vw, 11px);
      margin-bottom: 12px;
      line-height: 1.4;
    }

    /* ── Status badge ──────────────────────────────────────────── */
    .status {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: clamp(10px, 2vw, 12px);
      margin-bottom: 10px;
      padding: 4px 10px;
      border-radius: 5px;
      background: rgba(255,255,255,0.04);
      max-width: 95vw;
    }
    .status.detected { color: #4ade80; }
    .status.not-found { color: #facc15; }

    /* ── Checks card ───────────────────────────────────────────── */
    .checks {
      width: min(520px, 96vw);
      background: rgba(255,255,255,0.03);
      border: 1px solid #2b2b2b;
      border-radius: 8px;
      padding: 6px clamp(10px, 3vw, 16px);
      margin-top: 20px;
      margin-bottom: 10px;
      font-size: clamp(11px, 2.5vw, 12px);
    }
    .check-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      padding: 4px 0;
      border-bottom: 1px solid #2b2b2b;
    }
    .check-row:last-child { border-bottom: none; }
    .check-row-clickable { cursor: pointer; border-radius: 6px; padding: 4px 6px; margin: 0 -6px; transition: background 0.15s; }
    .check-row-clickable:hover { background: rgba(255,255,255,0.05); }
    .check-row-clickable:hover .label { color: #ddd; }
    .check-row .row-icon {
      display: flex;
      align-items: center;
      flex-shrink: 0;
      color: #9a9a9a;
    }
    .check-row .label {
      color: #9a9a9a;
      text-align: left;
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .check-row .value {
      flex: 0 0 auto;
      text-align: right;
      white-space: nowrap;
    }
    .check-row .value.ok { color: #4ade80; }
    .check-row .value.warn { color: #facc15; }

    /* ── Gateway status row ─────────────────────────────────────── */
    .gw-cell {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }
    .gw-spinner {
      width: 11px;
      height: 11px;
      border: 2px solid rgba(96,165,250,0.2);
      border-top-color: #60a5fa;
      border-radius: 50%;
      animation: gw-spin 0.7s linear infinite;
      display: none;
      flex-shrink: 0;
    }
    .gw-spinner.ai {
      border-color: rgba(167,139,250,0.2);
      border-top-color: #a78bfa;
    }
    @keyframes gw-spin { to { transform: rotate(360deg); } }

    /* ── MoltPilot row ──────────────────────────────────────────── */
    .molt-cell {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }
    @keyframes molt-pulse {
      0%, 100% { opacity: 1; }
      50%       { opacity: 0.4; }
    }
    @keyframes molt-sparkle {
      0%   { opacity: 0; transform: scale(0.6) rotate(-15deg); }
      30%  { opacity: 1; transform: scale(1.2) rotate(10deg); }
      60%  { opacity: 0.7; transform: scale(0.9) rotate(-5deg); }
      100% { opacity: 0; transform: scale(0.6) rotate(20deg); }
    }
    .molt-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #666;
      flex-shrink: 0;
      display: inline-block;
    }
    .molt-dot.working {
      background: #a78bfa;
      animation: molt-pulse 1.2s ease-in-out infinite;
    }
    #molt-sparkle {
      display: none;
      font-size: 13px;
      line-height: 1;
      animation: molt-sparkle 1.4s ease-in-out infinite;
    }
    #molt-sparkle.visible { display: inline-block; }
    #molt-text { max-width: none; overflow: visible; }
    .molt-chat-btn {
      display: inline-flex; align-items: center; gap: 3px;
      background: transparent; border: none; cursor: pointer;
      color: #555; padding: 2px 5px; border-radius: 4px;
      font-size: 10px; font-family: inherit; line-height: 1;
      transition: color 0.15s, background 0.15s;
      vertical-align: middle; margin-left: 4px; white-space: nowrap;
    }
    .molt-chat-btn:hover { color: #ccc; background: rgba(255,255,255,0.07); }
    .molt-chat-btn.open { color: #bbb; }
    .molt-chat-btn.open:hover { color: #ddd; background: rgba(255,255,255,0.06); }
    .gw-btn {
      font-size: clamp(10px, 2vw, 11px);
      padding: 2px 9px;
      border-radius: 4px;
      border: 1px solid currentColor;
      cursor: pointer;
      background: transparent;
      line-height: 1.5;
      transition: background 0.12s;
      display: none;
    }
    .gw-btn:disabled { opacity: 0.35; cursor: not-allowed; }
    .gw-stop    { color: #f87171; }
    .gw-stop:not(:disabled):hover    { background: rgba(248,113,113,0.15); }
    .gw-start   { color: #4ade80; }
    .gw-start:not(:disabled):hover   { background: rgba(74,222,128,0.15); }
    .gw-restart { color: #fbbf24; }
    .gw-restart:not(:disabled):hover { background: rgba(251,191,36,0.15); }

    /* ── Buttons ───────────────────────────────────────────────── */
    .btn-group {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      width: min(320px, 96vw);
      margin-top: 12px;
    }
    .btn-primary {
      background: #dc2828;
      color: #fff;
      border: none;
      padding: 9px 22px;
      border-radius: 8px;
      font-size: clamp(12px, 3vw, 14px);
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s, transform 0.1s;
      width: fit-content;
      white-space: nowrap;
      display: inline-flex;
      align-items: center;
      gap: 7px;
    }
    .btn-primary svg { flex-shrink: 0; }
    .btn-primary:hover { background: #b91c1c; }
    .btn-primary:active { transform: scale(0.98); }
    .btn-primary:disabled { background: #7a1515; cursor: not-allowed; transform: none; }
    @keyframes btn-spin { to { transform: rotate(360deg); } }
    .btn-spin {
      display: inline-block;
      width: 13px; height: 13px;
      border: 2px solid rgba(255,255,255,0.25);
      border-top-color: #fff;
      border-radius: 50%;
      animation: btn-spin 0.65s linear infinite;
      flex-shrink: 0;
    }
    .btn-secondary {
      background: transparent;
      color: #aaa;
      border: 1px solid #444;
      padding: 7px 16px;
      border-radius: 8px;
      font-size: clamp(11px, 2.5vw, 12px);
      cursor: pointer;
      transition: border-color 0.15s, color 0.15s, transform 0.1s;
      width: fit-content;
      white-space: nowrap;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .btn-secondary svg { flex-shrink: 0; }
    .btn-secondary:hover { border-color: #888; color: #ddd; }
    .btn-secondary:active { transform: scale(0.98); }

    /* ── Workspace file pills ──────────────────────────────────── */
    .pills-row {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 5px;
      margin-top: 8px;
    }
    .pill {
      font-size: clamp(9px, 2vw, 11px);
      font-family: var(--vscode-editor-font-family, monospace);
      padding: 3px 10px;
      border-radius: 999px;
      border: 1px solid rgba(220,40,40,0.35);
      color: #dc2828;
      background: rgba(220,40,40,0.08);
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.12s, border-color 0.12s;
      user-select: none;
    }
    .pill:hover {
      background: rgba(220,40,40,0.18);
      border-color: rgba(220,40,40,0.7);
    }

    /* ── Header bar (user avatar + more options) ────────────────── */
    .header-bar {
      position: fixed;
      top: 12px;
      right: 12px;
      z-index: 200;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .user-avatar-btn {
      width: 28px; height: 28px; border-radius: 50%;
      background: #dc2828; color: #fff;
      font-size: 11px; font-weight: 700; letter-spacing: 0.02em;
      border: 1.5px solid rgba(255,255,255,0.15);
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
      transition: opacity 0.15s, border-color 0.15s;
      overflow: hidden;
    }
    .user-avatar-btn img {
      width: 100%; height: 100%; object-fit: cover; border-radius: 50%;
    }
    .user-avatar-btn:hover { opacity: 0.85; border-color: rgba(255,255,255,0.3); }
    .sign-in-btn {
      font-size: 11.5px; font-weight: 600; color: #dc2828;
      background: rgba(220,40,40,0.08);
      border: 1px solid rgba(220,40,40,0.22);
      padding: 4px 10px; border-radius: 6px; cursor: pointer;
      transition: background 0.15s;
    }
    .sign-in-btn:hover { background: rgba(220,40,40,0.16); }
    /* ── Apps grid button ────────────────────────────────────────── */
    .apps-grid-btn {
      width: 28px; height: 28px; border-radius: 6px;
      background: transparent;
      border: none;
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
      transition: background 0.15s;
      color: #aaa;
    }
    .apps-grid-btn:hover { background: rgba(255,255,255,0.08); color: #fff; }
    .apps-grid-btn svg { display: block; }
    .apps-panel {
      display: none; position: absolute;
      top: calc(100% + 8px); right: 0;
      background: #1e1e1e; border: 1px solid rgba(255,255,255,0.1);
      border-radius: 14px; width: 256px;
      box-shadow: 0 12px 32px rgba(0,0,0,0.6);
      z-index: 300; padding: 16px;
    }
    .apps-panel.open { display: block; }
    .apps-panel-title {
      font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em;
      color: #555; margin-bottom: 14px; text-align: center;
    }
    .apps-grid {
      display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;
    }
    .app-tile {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 7px; padding: 12px 6px;
      border-radius: 10px; border: 1px solid rgba(255,255,255,0.07);
      background: rgba(255,255,255,0.03);
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
    }
    .app-tile:hover { background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.15); }
    .app-tile-icon {
      width: 34px; height: 34px; border-radius: 8px;
      background: rgba(255,255,255,0.06);
      display: flex; align-items: center; justify-content: center;
    }
    .app-tile-icon svg { opacity: 0.35; }
    .app-tile-label { font-size: 10px; color: #555; text-align: center; white-space: nowrap; }
    .apps-panel-wrap { position: relative; }
    /* User popover — Google-style account card */
    .user-popover {
      display: none; position: absolute;
      top: calc(100% + 8px); right: 0;
      background: #1e1e1e; border: 1px solid rgba(255,255,255,0.1);
      border-radius: 14px; min-width: 240px;
      box-shadow: 0 12px 32px rgba(0,0,0,0.6);
      overflow: hidden;
      z-index: 300;
    }
    .user-popover.open { display: block; }
    .user-popover-header {
      display: flex; flex-direction: column; align-items: center;
      padding: 20px 16px 14px; border-bottom: 1px solid rgba(255,255,255,0.07);
    }
    .user-popover-avatar {
      width: 56px; height: 56px; border-radius: 50%;
      background: #dc2828; color: #fff;
      font-size: 20px; font-weight: 700;
      display: flex; align-items: center; justify-content: center;
      margin-bottom: 10px; overflow: hidden; flex-shrink: 0;
      border: 2px solid rgba(255,255,255,0.1);
    }
    .user-popover-avatar img { width: 100%; height: 100%; object-fit: cover; }
    .user-popover-email {
      font-size: 12.5px; color: #ddd; font-weight: 500;
      margin-bottom: 4px; word-break: break-all; text-align: center;
    }
    .user-popover-balance {
      font-size: 12px; color: #4ade80; font-weight: 600;
      background: rgba(74,222,128,0.1); border: 1px solid rgba(74,222,128,0.2);
      padding: 2px 10px; border-radius: 20px; margin-top: 2px;
    }
    .user-popover-actions {
      padding: 8px 0;
    }
    .user-popover-action {
      display: flex; align-items: center; gap: 10px;
      width: 100%; padding: 9px 16px;
      background: none; border: none;
      color: #ccc; font-size: 13px; font-family: inherit;
      text-align: left; cursor: pointer; text-decoration: none;
      transition: background 0.12s, color 0.12s;
    }
    .user-popover-action:hover { background: rgba(255,255,255,0.06); color: #fff; }
    .user-popover-divider {
      height: 1px; background: rgba(255,255,255,0.07); margin: 0;
    }
    .user-popover-signout {
      display: flex; align-items: center; gap: 10px;
      width: 100%; padding: 9px 16px;
      background: none; border: none;
      color: #888; font-size: 13px; font-family: inherit;
      text-align: left; cursor: pointer;
      transition: background 0.12s, color 0.12s;
    }
    .user-popover-signout:hover { background: rgba(255,255,255,0.06); color: #fff; }
    .user-popover-keys { padding: 10px 16px 6px; }
    .user-popover-keys-title { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #555; margin-bottom: 8px; }
    .user-key-row { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
    .user-key-label { font-size: 11px; color: #777; min-width: 58px; }
    .user-key-value { font-size: 11px; font-family: monospace; color: #bbb; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
    .user-key-copy { background: none; border: 1px solid rgba(255,255,255,0.1); color: #888; border-radius: 4px; padding: 1px 5px; font-size: 11px; cursor: pointer; flex-shrink: 0; }
    .user-key-copy:hover { background: rgba(255,255,255,0.08); color: #ccc; }
    .user-key-endpoint { display: none; }
    /* ── More Options menu ──────────────────────────────────────── */
    .more-menu-wrap {
      position: relative;
    }
    .more-menu-btn {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      color: #aaa;
      font-size: 12px;
      font-weight: 500;
      padding: 5px 11px;
      border-radius: 6px;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s, color 0.15s;
    }
    .more-menu-btn:hover {
      background: rgba(255,255,255,0.1);
      border-color: rgba(255,255,255,0.2);
      color: #fff;
    }
    .more-menu-dropdown {
      display: none;
      position: absolute;
      top: calc(100% + 6px);
      right: 0;
      background: #252525;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 10px;
      min-width: 280px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.55);
      overflow: hidden;
    }
    .more-menu-search-wrap {
      padding: 10px 10px 6px;
      border-bottom: 1px solid rgba(255,255,255,0.07);
    }
    .more-menu-search {
      width: 100%;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 6px;
      color: #ddd;
      font-size: 12px;
      font-family: inherit;
      padding: 6px 10px 6px 30px;
      outline: none;
      box-sizing: border-box;
      transition: border-color 0.15s;
    }
    .more-menu-search::placeholder { color: #555; }
    .more-menu-search:focus { outline: none; border-color: #dc2626; }
    .more-menu-search-icon {
      position: absolute;
      left: 20px;
      top: 50%;
      transform: translateY(-50%);
      pointer-events: none;
      color: #555;
    }
    .more-menu-search-wrap { position: relative; }
    .more-menu-items-list { max-height: 320px; overflow-y: auto; }
    .more-menu-items-list::-webkit-scrollbar { width: 4px; }
    .more-menu-items-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
    .more-menu-no-results { padding: 12px 14px; font-size: 12px; color: #555; text-align: center; display: none; }
    .more-menu-dropdown.open { display: block; }
    .more-menu-section {
      padding: 5px 0;
    }
    .more-menu-section + .more-menu-section {
      border-top: 1px solid rgba(255,255,255,0.07);
    }
    .more-menu-section-label {
      padding: 5px 13px 3px;
      font-size: 10px;
      color: #555;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      font-weight: 600;
    }
    .more-menu-item {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 7px 13px;
      background: none;
      border: none;
      color: #bbb;
      font-size: 12.5px;
      font-family: inherit;
      text-align: left;
      cursor: pointer;
      transition: background 0.1s, color 0.1s;
    }
    .more-menu-item:hover {
      background: rgba(255,255,255,0.06);
      color: #fff;
    }
    .more-menu-item.has-submenu {
      justify-content: space-between;
    }
    .more-menu-item.has-submenu .submenu-arrow {
      font-size: 10px; color: #555; flex-shrink: 0;
      transition: transform 0.15s;
    }
    .more-menu-submenu-wrap.open .submenu-arrow { transform: rotate(90deg); }
    .more-menu-submenu {
      display: none;
      background: rgba(255,255,255,0.03);
      border-top: 1px solid rgba(255,255,255,0.06);
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    .more-menu-submenu-wrap.open .more-menu-submenu { display: block; }
    .more-menu-submenu .more-menu-item { padding-left: 30px; color: #999; }
    .more-menu-item-danger { color: #f87171; }
    .more-menu-item-danger:hover { background: rgba(248,113,113,0.08); color: #fca5a5; }

    /* ── Not-installed minimal layout ─────────────────────────── */
    body.not-installed {
      justify-content: center;
      padding: 20px;
    }
    .not-installed-wrap {
      display: flex; flex-direction: column; align-items: center;
      gap: 28px; text-align: center;
    }
    .not-installed-wrap .logo { width: 64px; height: 64px; margin-bottom: 0; }

    /* ── Narrow panel adjustments (< 300px) ────────────────────── */
    @media (max-width: 299px) {
      .check-row {
        flex-direction: column;
        align-items: flex-start;
        gap: 2px;
      }
      .check-row .label,
      .check-row .value {
        max-width: 100%;
        white-space: normal;
        overflow: visible;
        text-overflow: clip;
      }
    }

    /* ── Confirm modal ──────────────────────────────────────────── */
    .confirm-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.78);
      z-index: 500;
      align-items: center;
      justify-content: center;
    }
    .confirm-overlay.visible { display: flex; }
    .confirm-card {
      background: #1e1e1e;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 14px;
      padding: 32px 28px 24px;
      width: min(340px, 92vw);
      text-align: center;
      box-shadow: 0 24px 64px rgba(0,0,0,0.8);
    }
    .confirm-card h3 { font-size: 17px; font-weight: 600; margin: 0 0 10px; color: #eee; }
    .confirm-card p { font-size: 13px; color: #888; margin: 0 0 24px; line-height: 1.5; }
    .confirm-actions { display: flex; gap: 10px; justify-content: center; }
    .confirm-btn-cancel {
      flex: 1; padding: 9px 0; border-radius: 8px;
      background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
      color: #aaa; font-size: 13px; font-family: inherit; cursor: pointer;
      transition: background 0.15s;
    }
    .confirm-btn-cancel:hover { background: rgba(255,255,255,0.1); color: #fff; }
    .confirm-btn-confirm {
      flex: 1; padding: 9px 0; border-radius: 8px;
      background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.35);
      color: #f87171; font-size: 13px; font-family: inherit; font-weight: 600; cursor: pointer;
      transition: background 0.15s;
    }
    .confirm-btn-confirm:hover { background: rgba(239,68,68,0.25); color: #fca5a5; }
    /* ── App WIP modal ──────────────────────────────────────────── */
    .app-wip-overlay {
      display: none; position: fixed; inset: 0;
      background: rgba(0,0,0,0.78); z-index: 500;
      align-items: center; justify-content: center;
    }
    .app-wip-overlay.visible { display: flex; }
    .app-wip-card {
      background: #1e1e1e; border: 1px solid rgba(255,255,255,0.1);
      border-radius: 16px; padding: 28px 24px 22px;
      width: min(360px, 92vw); text-align: center;
      box-shadow: 0 24px 64px rgba(0,0,0,0.8);
    }
    .app-wip-emoji { font-size: 32px; margin-bottom: 12px; }
    .app-wip-card h3 { font-size: 16px; font-weight: 600; color: #eee; margin: 0 0 8px; }
    .app-wip-card p { font-size: 12.5px; color: #777; margin: 0 0 16px; line-height: 1.55; }
    .app-wip-copy-wrap {
      display: flex; align-items: center; gap: 6px;
      background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
      border-radius: 8px; padding: 8px 10px; margin-bottom: 18px; text-align: left;
    }
    .app-wip-copy-text { font-size: 12px; color: #bbb; font-family: monospace; flex: 1; word-break: break-all; }
    .app-wip-copy-btn {
      background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12);
      color: #aaa; border-radius: 6px; padding: 4px 8px; font-size: 11px;
      cursor: pointer; flex-shrink: 0; font-family: inherit; transition: background 0.15s;
    }
    .app-wip-copy-btn:hover { background: rgba(255,255,255,0.14); color: #fff; }
    .app-wip-actions { display: flex; gap: 8px; }
    .app-wip-btn-cancel {
      flex: 1; padding: 9px 0; border-radius: 8px;
      background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
      color: #777; font-size: 13px; font-family: inherit; cursor: pointer; transition: background 0.15s;
    }
    .app-wip-btn-cancel:hover { background: rgba(255,255,255,0.09); color: #aaa; }
    .app-wip-btn-community {
      flex: 2; padding: 9px 0; border-radius: 8px;
      background: rgba(220,40,40,0.15); border: 1px solid rgba(220,40,40,0.3);
      color: #f87171; font-size: 13px; font-family: inherit; font-weight: 600; cursor: pointer; transition: background 0.15s;
    }
    .app-wip-btn-community:hover { background: rgba(220,40,40,0.25); color: #fca5a5; }
    /* ── Password modal ─────────────────────────────────────────── */
    .pwd-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.72);
      z-index: 100;
      align-items: center;
      justify-content: center;
    }
    .pwd-overlay.visible { display: flex; }
    .pwd-card {
      background: #242424;
      border: 1px solid #383838;
      border-radius: 12px;
      padding: 28px 28px 24px;
      width: min(380px, 92vw);
      text-align: left;
      box-shadow: 0 24px 64px rgba(0,0,0,0.7);
    }
    .pwd-card h2 {
      font-size: 15px;
      font-weight: 600;
      color: #fff;
      margin-bottom: 6px;
    }
    .pwd-card p {
      font-size: 12px;
      color: #888;
      margin-bottom: 18px;
      line-height: 1.5;
    }
    .pwd-input {
      width: 100%;
      background: #1a1a1a;
      border: 1px solid #3a3a3a;
      border-radius: 6px;
      color: #e0e0e0;
      font-size: 14px;
      padding: 9px 12px;
      outline: none;
      margin-bottom: 18px;
      letter-spacing: 0.1em;
      box-sizing: border-box;
    }
    .pwd-input:focus { outline: none; border-color: #dc2828; }
    .pwd-actions {
      display: flex;
      gap: 10px;
      justify-content: flex-end;
    }
    .pwd-cancel {
      background: transparent;
      border: 1px solid #444;
      color: #aaa;
      font-size: 13px;
      padding: 7px 18px;
      border-radius: 6px;
      cursor: pointer;
    }
    .pwd-cancel:hover { background: rgba(255,255,255,0.06); }
    .pwd-submit {
      background: #dc2828;
      border: none;
      color: #fff;
      font-size: 13px;
      font-weight: 600;
      padding: 7px 20px;
      border-radius: 6px;
      cursor: pointer;
    }
    .pwd-submit:hover { background: #b91c1c; }
  </style>
</head>
<body${isInstalled ? '' : ' class="not-installed"'}>
  <!-- Header bar: more options (left) + user avatar (right) -->
  <div class="header-bar">
    <!-- More Options menu (left of avatar) -->
    ${isInstalled ? `<div class="more-menu-wrap" id="more-menu-wrap">
      <button class="more-menu-btn" onclick="toggleMoreMenu(event)" aria-haspopup="true" aria-expanded="false">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        Search Actions
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <div class="more-menu-dropdown" id="more-menu-dropdown" role="menu">
        <div class="more-menu-search-wrap">
          <svg class="more-menu-search-icon" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input class="more-menu-search" id="more-menu-search-input" type="text" placeholder="Search actions…" oninput="filterMoreMenu(this.value)" onclick="event.stopPropagation()" autocomplete="off" spellcheck="false" />
        </div>
        <div class="more-menu-items-list" id="more-menu-items-list">
        <div class="more-menu-no-results" id="more-menu-no-results">No results</div>
        <div class="more-menu-section">
          <div class="more-menu-section-label">TUI</div>
          <button class="more-menu-item" role="menuitem" data-search="configure tui" onclick="cmd('openclaw.configureTUI');closeMoreMenu()">${icTerminalBtn}Configure</button>
        </div>
        <div class="more-menu-section">
          <div class="more-menu-section-label">Scripts</div>
          <div class="more-menu-submenu-wrap" id="submenu-wrap-scripts">
            <button class="more-menu-item has-submenu" role="menuitem" data-search="better scripts" onclick="toggleSubmenu('submenu-wrap-scripts',event)">
              <span style="display:flex;align-items:center;gap:8px;">
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
                Better Scripts
              </span>
              <span class="submenu-arrow">▶</span>
            </button>
            <div class="more-menu-submenu">
              <button class="more-menu-item" role="menuitem" data-search="setup better memory" onclick="cmd('openclaw.setupBetterMemory');closeMoreMenu()">
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4.03 3-9 3S3 13.66 3 12"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/></svg>
                Setup Better Memory
              </button>
            </div>
          </div>
        </div>
        <div class="more-menu-section">
          <div class="more-menu-section-label">Diagnostics</div>
          <button class="more-menu-item" role="menuitem" data-search="open logs diagnostics debug" onclick="cmd('openLogs');closeMoreMenu()">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            Open Logs
          </button>
        </div>
        <div class="more-menu-section">
          <button class="more-menu-item more-menu-item-danger" role="menuitem" data-search="uninstall openclaw" onclick="closeMoreMenu();showConfirm()">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
            Uninstall OpenClaw
          </button>
        </div>
        </div><!-- end more-menu-items-list -->
      </div>
    </div>` : ''}

    <!-- Apps grid button (installed only) -->
    ${isInstalled ? `<div class="apps-panel-wrap" id="apps-panel-wrap"` : `<div class="apps-panel-wrap" id="apps-panel-wrap" style="display:none"`}>
      <button class="apps-grid-btn" onclick="toggleAppsPanel(event)" title="OCC Apps" aria-haspopup="true">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="5" cy="5" r="2"/><circle cx="12" cy="5" r="2"/><circle cx="19" cy="5" r="2"/>
          <circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
          <circle cx="5" cy="19" r="2"/><circle cx="12" cy="19" r="2"/><circle cx="19" cy="19" r="2"/>
        </svg>
      </button>
      <div class="apps-panel" id="apps-panel">
        <div class="apps-panel-title">OCC Apps</div>
        <div class="apps-grid">
          ${[
            { label: 'Chat',     icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',     emoji: 'speech-balloon_1f4ac.png' },
            { label: 'Channels', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.26h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.83a16 16 0 0 0 6 6l.83-.83a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>', emoji: 'satellite-antenna_1f4e1.png' },
            { label: 'Agents',   icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M9 11V7a3 3 0 0 1 6 0v4"/><circle cx="12" cy="16" r="1" fill="currentColor"/></svg>',   emoji: 'briefcase_1f4bc.png' },
            { label: 'Models',   icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4.03 3-9 3S3 13.66 3 12"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/></svg>',   emoji: 'alembic_2697-fe0f.png' },
            { label: 'Skills',   icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',   emoji: 'high-voltage_26a1.png' },
            { label: 'Security', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>', emoji: 'shield_1f6e1-fe0f.png' },
            { label: 'Memory',   icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',   emoji: 'floppy-disk_1f4be.png' },
            { label: 'Empire',   icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 20h20M4 20V10l8-7 8 7v10"/><path d="M10 20v-5h4v5"/></svg>',   emoji: 'crown_1f451.png' },
            { label: 'Social',   icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>',   emoji: 'handshake_1f91d.png' },
          ].map(app => `
          <div class="app-tile" onclick="showWipModal('${app.label}', '${emojiBaseUri}/${app.emoji}')">
            <div class="app-tile-icon"><img src="${emojiBaseUri}/${app.emoji}" alt="${app.label}" style="width:22px;height:22px;object-fit:contain;filter:grayscale(100%) brightness(0.75);pointer-events:none;" /></div>
            <span class="app-tile-label">${app.label}</span>
          </div>`).join('')}
        </div>
      </div>
    </div>

    <!-- User avatar / sign-in (rendered server-side) -->
    <div id="user-area" style="position:relative;">${userAreaHtml}</div>
  </div>

  <!-- App WIP modal -->
  <div id="app-wip-overlay" class="app-wip-overlay">
    <div class="app-wip-card">
      <img id="app-wip-icon" src="" alt="" style="width:64px;height:64px;object-fit:contain;margin-bottom:4px;" />
      <h3 id="app-wip-title">Under Development</h3>
      <p>This app isn't ready yet — but you can help build it.<br>Copy the message below and post it in the MBA community.</p>
      <div class="app-wip-copy-wrap">
        <span class="app-wip-copy-text" id="app-wip-copy-text">I want to contribute to [App]</span>
        <button class="app-wip-copy-btn" onclick="copyWipMessage()">Copy</button>
      </div>
      <div class="app-wip-actions">
        <button class="app-wip-btn-cancel" onclick="closeWipModal()">Close</button>
        <button class="app-wip-btn-community" onclick="openCommunity()">Join Community →</button>
      </div>
    </div>
  </div>

  <!-- Confirm modal (uninstall) -->
  <div id="confirm-overlay" class="confirm-overlay">
    <div class="confirm-card">
      <h3>Uninstall OpenClaw?</h3>
      <p>This will remove the CLI, stop the gateway, and clean up all config files. This cannot be undone.</p>
      <div class="confirm-actions">
        <button class="confirm-btn-cancel" onclick="closeConfirm()">Cancel</button>
        <button class="confirm-btn-confirm" onclick="confirmUninstall()">Yes, uninstall</button>
      </div>
    </div>
  </div>

  <!-- Password modal (shown on sudo permission error) -->
  <div id="pwd-overlay" class="pwd-overlay">
    <div class="pwd-card">
      <h2>🔐 Administrator Password Required</h2>
      <p>OpenClaw needs elevated permissions to install globally.<br>Your password is used once and never stored.</p>
      <input id="pwd-input" class="pwd-input" type="password" placeholder="Enter your system password" autocomplete="current-password" />
      <div class="pwd-actions">
        <button class="pwd-cancel" onclick="cancelPwd()">Cancel</button>
        <button class="pwd-submit" onclick="submitPwd()">Continue</button>
      </div>
    </div>
  </div>

  <!-- Uninstall full-panel state -->
  <div id="cass-progress-overlay" style="display:none;position:fixed;inset:0;background:#0e0e0e;z-index:1100;flex-direction:column;align-items:center;justify-content:center;gap:0;">
    <button onclick="document.getElementById('cass-progress-overlay').style.display='none';" style="position:absolute;top:16px;right:16px;background:none;border:none;color:#555;font-size:20px;cursor:pointer;line-height:1;padding:4px 8px;" title="Close">&times;</button>
    <div style="display:flex;flex-direction:column;align-items:center;gap:20px;width:min(420px,92vw);">      <div style="position:relative;width:56px;height:56px;">        <div id="cass-spinner" style="position:absolute;inset:-8px;border:2px solid rgba(100,100,255,0.15);border-top-color:rgba(100,100,255,0.7);border-radius:50%;animation:spin 1.1s linear infinite;"></div>        <img src="${iconUri}" style="width:56px;height:56px;border-radius:12px;display:block;" />      </div>      <div style="text-align:center;">        <div style="font-size:16px;font-weight:600;color:#fff;margin-bottom:4px;">Setting up Better Memory</div>        <div id="cass-status-line" style="font-size:12px;color:#666;">Starting…</div>      </div>      <pre id="cass-log" style="width:100%;background:#111;border:1px solid #1e1e1e;border-radius:8px;padding:12px 14px;font-size:11px;color:#888;line-height:1.6;min-height:100px;max-height:260px;overflow-y:auto;white-space:pre-wrap;word-break:break-all;font-family:monospace;"></pre>    </div>  </div>
  <div id="uninstall-progress-overlay" style="display:none;position:fixed;inset:0;background:#0e0e0e;z-index:1100;flex-direction:column;align-items:center;justify-content:center;gap:0;">
    <div style="display:flex;flex-direction:column;align-items:center;gap:20px;width:min(420px,92vw);">
      <!-- Icon + spinner row -->
      <div style="position:relative;width:56px;height:56px;">
        <div id="uninstall-spinner" style="position:absolute;inset:-8px;border:2px solid rgba(220,40,40,0.15);border-top-color:rgba(220,40,40,0.7);border-radius:50%;animation:spin 1.1s linear infinite;"></div>
        <img src="${iconUri}" style="width:56px;height:56px;border-radius:12px;display:block;" />
      </div>
      <!-- Title -->
      <div style="text-align:center;">
        <div style="font-size:16px;font-weight:600;color:#fff;margin-bottom:4px;">Uninstalling OpenClaw</div>
        <div id="uninstall-status-line" style="font-size:12px;color:#666;">Preparing…</div>
      </div>
      <!-- Log -->
      <pre id="uninstall-log" style="width:100%;background:#111;border:1px solid #1e1e1e;border-radius:8px;padding:12px 14px;font-size:11px;color:#888;line-height:1.6;min-height:100px;max-height:200px;overflow-y:auto;white-space:pre-wrap;word-break:break-all;font-family:monospace;"></pre>
      <!-- Hand-off message (hidden until done) -->
      <div id="uninstall-handoff" style="display:none;font-size:11px;color:#555;text-align:center;">MoltPilot is verifying the cleanup in the background…</div>
    </div>
  </div>
  ${isInstalled ? `
  <img class="logo" src="${iconUri}" alt="OpenClaw" />
  <h1>Welcome to OpenClaw <span class="accent">Code</span></h1>
  <div class="checks">
    <div class="check-row ${dirClass === 'ok' ? 'check-row-clickable' : ''}" ${dirClass === 'ok' ? 'onclick="cmd(\'openConfigFile\')" title="Open openclaw.json"' : ''}>
      <span class="row-icon">${icFolder}</span>
      <span class="label">Config (~/.openclaw/openclaw.json)</span>
      <span class="value ${dirClass}">${dirText}</span>
    </div>
    <div class="check-row">
      <span class="row-icon">${icTerminal}</span>
      <span class="label">CLI (openclaw --version)</span>
      <span id="cli-version-value" class="value ${cliClass}">${cliText}${cliHint}</span>
    </div>
    <div class="check-row">
      <span class="row-icon">${icServer}</span>
      <span class="label">Gateway</span>
      <span class="gw-cell">
        <span id="gw-spinner" class="gw-spinner"></span>
        <span id="gw-text" class="value" style="color:#666">Checking…</span>
        <button id="gw-btn" class="gw-btn" disabled></button>
      </span>
    </div>
    ${aiModelName ? `
    <div class="check-row">
      <span class="row-icon">${icChip}</span>
      <span class="label">AI Model</span>
      <span class="value" style="font-size:11px;">${aiModelName}</span>
    </div>` : ''}
    <div class="check-row">
      <span class="row-icon">${icBot}</span>
      <span class="label">MoltPilot</span>
      <span class="molt-cell">
        <span id="molt-sparkle">✨</span>
        <span id="molt-dot" class="molt-dot"></span>
        <span id="molt-text" class="value" style="color:#666">Idle</span>
        <button id="molt-chat-btn" class="molt-chat-btn" title="Open AI chat" onclick="toggleChat()">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <span class="btn-lbl">Open chat</span>
        </button>
      </span>
    </div>
  </div>
  <div class="pills-row">
    ${['AGENTS.md','IDENTITY.md','USER.md','MEMORY.md','SOUL.md','HEARTBEAT.md'].map(f =>
      `<span class="pill" onclick="openFile('${f}')">${f}</span>`
    ).join('\n    ')}
  </div>
  <div class="btn-group">
    <button id="btn-primary" class="btn-primary" onclick="cmd('openclaw.configure')">${icSettings}Configure OpenClaw</button>
    <button class="btn-secondary" id="btn-version" onclick="checkVersion()">${icRefreshCw}Check for Updates</button>
    <div id="version-result" style="display:none;font-size:clamp(10px,2vw,12px);margin-top:2px;line-height:1.5;max-width:min(320px,94vw);text-align:center;"></div>
  </div>
  ` : `
  <div class="not-installed-wrap">
    <img class="logo" src="${iconUri}" alt="OpenClaw" />
    <div style="display:flex;flex-direction:column;align-items:center;gap:10px;">
      <button id="btn-primary" class="btn-primary" onclick="cmd('openclaw.install')">${icDownload}Install OpenClaw</button>
      <div id="install-status" style="display:none;font-size:11px;color:#666;text-align:center;max-width:260px;line-height:1.4;"></div>
    </div>
  </div>
  `}

  <script>
    const vscode = acquireVsCodeApi();
    function cmd(c) {
      if (c === 'openclaw.setupBetterMemory') { var o = document.getElementById('cass-progress-overlay'); if (o) o.style.display = 'flex'; }
      if (c === 'openclaw.install') {
        const btn = document.getElementById('btn-primary');
        if (btn && !btn.disabled) {
          btn.disabled = true;
          btn.innerHTML = '<span class="btn-spin"></span>Installing…';
        }
      }
      vscode.postMessage({ command: c });
    }
    function openFile(name) { vscode.postMessage({ command: 'openWorkspaceFile', file: name }); }

    // ── User area functions (user area HTML rendered server-side) ─────────────
    function signIn() { vscode.postMessage({ command: 'signIn' }); }
    function openDashboard() { vscode.postMessage({ command: 'openDashboard' }); }
    function signOut() { vscode.postMessage({ command: 'signOut' }); }
    function copyKey(id, btn) {
      var el = document.getElementById(id);
      if (!el) return;
      var full = el.dataset.full;
      navigator.clipboard.writeText(full).then(function() {
        var orig = btn.textContent;
        btn.textContent = '✓';
        setTimeout(function() { btn.textContent = orig; }, 1500);
      }).catch(function() {});
    }

    function toggleUserPopover(e) {
      e.stopPropagation();
      closeAppsPanel(); closeMoreMenu();
      var pop = document.getElementById('user-popover');
      if (pop) pop.classList.toggle('open');
    }
    function closeUserPopover() {
      var pop = document.getElementById('user-popover');
      if (pop) pop.classList.remove('open');
    }

    // ── More Options menu ─────────────────────────────────────────
    function toggleMoreMenu(e) {
      e.stopPropagation();
      closeAppsPanel(); closeUserPopover();
      const dd = document.getElementById('more-menu-dropdown');
      const btn = e.currentTarget;
      if (!dd) return;
      const isOpen = dd.classList.toggle('open');
      btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      if (isOpen) setTimeout(() => { const inp = document.getElementById('more-menu-search-input'); if (inp) inp.focus(); }, 50);
    }
    function closeMoreMenu() {
      const dd = document.getElementById('more-menu-dropdown');
      const btn = document.querySelector('.more-menu-btn');
      if (dd) dd.classList.remove('open');
      if (btn) btn.setAttribute('aria-expanded', 'false');
      const input = document.getElementById('more-menu-search-input');
      if (input) { input.value = ''; filterMoreMenu(''); }
    }
    function showWipModal(appName, emojiSrc) {
      const msg = 'I want to contribute to the ' + appName + ' app on OCC.';
      document.getElementById('app-wip-title').textContent = appName + ' — Coming Soon';
      document.getElementById('app-wip-copy-text').textContent = msg;
      const icon = document.getElementById('app-wip-icon');
      if (icon) { icon.src = emojiSrc; icon.alt = appName; }
      document.getElementById('app-wip-overlay').classList.add('visible');
      closeAppsPanel();
    }
    function closeWipModal() {
      document.getElementById('app-wip-overlay').classList.remove('visible');
    }
    function copyWipMessage() {
      const text = document.getElementById('app-wip-copy-text').textContent;
      navigator.clipboard.writeText(text).then(() => {
        const btn = document.querySelector('.app-wip-copy-btn');
        if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = 'Copy'; }, 2000); }
      });
    }
    function openCommunity() {
      vscode.postMessage({ command: 'openUrl', url: 'https://mba.sh' });
      closeWipModal();
    }
    function showConfirm() {
      const el = document.getElementById('confirm-overlay');
      if (el) el.classList.add('visible');
    }
    function closeConfirm() {
      const el = document.getElementById('confirm-overlay');
      if (el) el.classList.remove('visible');
    }
    function confirmUninstall() {
      closeConfirm();
      cmd('openclaw.uninstall');
    }
    function toggleSubmenu(id, e) {
      e.stopPropagation();
      const wrap = document.getElementById(id);
      if (wrap) wrap.classList.toggle('open');
    }
    function filterMoreMenu(query) {
      const q = query.toLowerCase().trim();
      const items = document.querySelectorAll('#more-menu-items-list [data-search]');
      const sections = document.querySelectorAll('#more-menu-items-list .more-menu-section');
      let anyVisible = false;
      items.forEach(el => {
        const match = !q || el.getAttribute('data-search').includes(q);
        el.closest('.more-menu-submenu-wrap')
          ? el.closest('.more-menu-submenu-wrap').style.display = match ? '' : 'none'
          : el.style.display = match ? '' : 'none';
        if (match) anyVisible = true;
      });
      // Auto-open submenu parents when a child matches
      document.querySelectorAll('#more-menu-items-list .more-menu-submenu-wrap').forEach(wrap => {
        const childMatches = Array.from(wrap.querySelectorAll('[data-search]')).some(el =>
          !q || el.getAttribute('data-search').includes(q));
        if (q && childMatches) wrap.classList.add('open');
      });
      // Hide empty sections
      sections.forEach(sec => {
        const visibleItems = Array.from(sec.querySelectorAll('[data-search]')).some(el =>
          (el.closest('.more-menu-submenu-wrap') ? el.closest('.more-menu-submenu-wrap').style.display !== 'none' : el.style.display !== 'none'));
        sec.style.display = visibleItems ? '' : 'none';
      });
      const noResults = document.getElementById('more-menu-no-results');
      if (noResults) noResults.style.display = anyVisible ? 'none' : 'block';
    }
    function toggleAppsPanel(e) {
      e.stopPropagation();
      closeMoreMenu(); closeUserPopover();
      const panel = document.getElementById('apps-panel');
      if (panel) panel.classList.toggle('open');
    }
    function closeAppsPanel() {
      const panel = document.getElementById('apps-panel');
      if (panel) panel.classList.remove('open');
    }
    document.addEventListener('click', () => { closeMoreMenu(); closeUserPopover(); closeAppsPanel(); });

    // ── Gateway status ────────────────────────────────────────────
    const GW = {
      running:    { label: 'Running',              color: '#4ade80', btnLabel: 'Stop',    btnClass: 'gw-stop',    action: 'stop',    spin: false, aiSpin: false },
      stopped:    { label: 'Stopped',              color: '#facc15', btnLabel: 'Start',   btnClass: 'gw-start',   action: 'start',   spin: false, aiSpin: false },
      errored:    { label: 'Errored',              color: '#f87171', btnLabel: 'Restart', btnClass: 'gw-restart', action: 'restart', spin: false, aiSpin: false },
      starting:   { label: 'Starting…',           color: '#60a5fa', btnLabel: null,      btnClass: '',           action: null,      spin: true,  aiSpin: false },
      stopping:   { label: 'Stopping…',           color: '#60a5fa', btnLabel: null,      btnClass: '',           action: null,      spin: true,  aiSpin: false },
      restarting: { label: 'Restarting…',         color: '#60a5fa', btnLabel: null,      btnClass: '',           action: null,      spin: true,  aiSpin: false },
      checking:   { label: 'Checking…',           color: '#666',    btnLabel: null,      btnClass: '',           action: null,      spin: true,  aiSpin: false },
      'ai-fixing':{ label: 'AI Copilot fixing…',  color: '#a78bfa', btnLabel: null,      btnClass: '',           action: null,      spin: true,  aiSpin: true  },
    };

    const gwSpinner = document.getElementById('gw-spinner');
    const gwText    = document.getElementById('gw-text');
    const gwBtn     = document.getElementById('gw-btn');

    // Show spinner while checking on load (only if gateway row is in DOM).
    if (gwSpinner) gwSpinner.style.display = 'inline-block';


    function updateGateway(status) {
      if (!gwSpinner || !gwText || !gwBtn) return;
      const cfg = GW[status] || GW.checking;
      gwSpinner.style.display = cfg.spin ? 'inline-block' : 'none';
      gwSpinner.classList.toggle('ai', !!cfg.aiSpin);
      gwText.textContent  = cfg.label;
      gwText.style.color  = cfg.color;
      if (cfg.btnLabel) {
        gwBtn.textContent    = cfg.btnLabel;
        gwBtn.dataset.action = cfg.action;
        gwBtn.className      = 'gw-btn ' + cfg.btnClass;
        gwBtn.disabled       = false;
        gwBtn.style.display  = 'inline-flex';
      } else {
        gwBtn.disabled      = true;
        gwBtn.style.display = 'none';
      }
    }

    if (gwBtn) {
      gwBtn.addEventListener('click', () => {
        const action = gwBtn.dataset.action;
        if (!action) return;
        gwBtn.disabled = true;
        vscode.postMessage({ command: 'gatewayAction', action });
      });
    }

    // ── MoltPilot status ──────────────────────────────────────────
    const moltDot     = document.getElementById('molt-dot');
    const moltText    = document.getElementById('molt-text');
    const moltSparkle = document.getElementById('molt-sparkle');
    const moltChatBtn = document.getElementById('molt-chat-btn');
    let _moltRunning  = false;

    function updateMoltPilot(running) {
      if (!moltDot || !moltText || !moltSparkle) return;
      if (_moltRunning === running) return;
      _moltRunning = running;
      moltDot.classList.toggle('working', running);
      moltSparkle.classList.toggle('visible', running);
      moltText.textContent = running ? 'Running' : 'Idle';
      moltText.style.color = running ? '#a78bfa' : '#666';
    }

    function applyChatState(open) {
      if (!moltChatBtn) return;
      moltChatBtn.classList.toggle('open', open);
      const lbl = moltChatBtn.querySelector('.btn-lbl');
      if (lbl) lbl.textContent = open ? 'Close chat' : 'Open chat';
      moltChatBtn.title = open ? 'Close AI chat' : 'Open AI chat';
    }

    function toggleChat() {
      vscode.postMessage({ command: 'toggleChat' });
    }

    // ── Version check ─────────────────────────────────────────────
    function checkVersion() {
      const btn = document.getElementById('btn-version');
      const res = document.getElementById('version-result');
      if (btn) { btn.disabled = true; btn.textContent = 'Checking…'; }
      if (res) { res.style.display = 'none'; res.innerHTML = ''; }
      vscode.postMessage({ command: 'checkVersion' });
    }

    function runUpdate() {
      vscode.postMessage({ command: 'runUpdate' });
    }

    // ── Password modal ────────────────────────────────────────────
    const pwdOverlay = document.getElementById('pwd-overlay');
    const pwdInput   = document.getElementById('pwd-input');
    function showPwd() {
      pwdInput.value = '';
      pwdOverlay.classList.add('visible');
      setTimeout(() => pwdInput.focus(), 50);
    }
    function cancelPwd() {
      pwdOverlay.classList.remove('visible');
      vscode.postMessage({ command: 'sudoPassword', password: undefined });
    }
    function submitPwd() {
      const pwd = pwdInput.value;
      pwdOverlay.classList.remove('visible');
      vscode.postMessage({ command: 'sudoPassword', password: pwd || undefined });
    }
    // Allow Enter key to submit, Escape to cancel.
    pwdInput.addEventListener('keydown', e => {
      if (e.key === 'Enter')  { e.preventDefault(); submitPwd(); }
      if (e.key === 'Escape') { e.preventDefault(); cancelPwd(); }
    });

    const installStatus = document.getElementById('install-status');

    // ── Uninstall full-panel state ────────────────────────────────
    function showUninstallProgress() {
      const overlay = document.getElementById('uninstall-progress-overlay');
      if (overlay) overlay.style.display = 'flex';
    }
    function updateUninstallLog(text, done, ok) {
      const log = document.getElementById('uninstall-log');
      if (log) {
        log.textContent += text;
        log.scrollTop = log.scrollHeight;
        // Update the status line with the last non-empty line
        const lines = text.split('\\n').map(l => l.trim()).filter(Boolean);
        if (lines.length) {
          const statusEl = document.getElementById('uninstall-status-line');
          if (statusEl) statusEl.textContent = lines[lines.length - 1];
        }
      }
      if (done) {
        const spinner = document.getElementById('uninstall-spinner');
        if (spinner) spinner.style.animation = 'none';
        const statusEl = document.getElementById('uninstall-status-line');
        if (statusEl) { statusEl.textContent = ok ? 'Done' : 'Finished with errors'; statusEl.style.color = ok ? '#4ade80' : '#f87171'; }
      }
    }

    window.addEventListener('message', e => {
      if (e.data.type === 'uninstallLog') {
        updateUninstallLog(e.data.text || '', e.data.done, e.data.ok);
      } else if (e.data.type === 'uninstallDone') {
        // Show hand-off message, then hide — MoltPilot continues in background
        const handoff = document.getElementById('uninstall-handoff');
        if (handoff) handoff.style.display = 'block';
        setTimeout(() => {
          const overlay = document.getElementById('uninstall-progress-overlay');
          if (overlay) overlay.style.display = 'none';
        }, 1800);
      } else if (e.data.type === 'requestPassword') {
        showPwd();
      } else if (e.data.type === 'installLog' && installStatus) {
        // Show the latest non-empty line of install output as muted status text.
        const lines = (e.data.text || '').split('\\n').map(l => l.trim()).filter(Boolean);
        if (lines.length) {
          installStatus.textContent = lines[lines.length - 1];
          installStatus.style.display = 'block';
        }
      } else if (e.data.type === 'installState' && installStatus) {
        if (e.data.state === 'done') {
          installStatus.style.display = 'none';
        } else if (e.data.state === 'failed') {
          installStatus.textContent = 'Installation failed — see AI chat for details.';
          installStatus.style.color = '#f87171';
          installStatus.style.display = 'block';
        }
      } else if (e.data.type === 'gatewayStatus') {
        updateGateway(e.data.status);
        if (e.data.status === 'ai-fixing') {
          updateMoltPilot(true);
        }
      } else if (e.data.type === 'aiRunning') {
        updateMoltPilot(e.data.running);
      } else if (e.data.type === 'chatState') {
        applyChatState(e.data.open);
      } else if (e.data.type === 'versionResult') {
        const btn = document.getElementById('btn-version');
        const res = document.getElementById('version-result');
        if (btn) { btn.disabled = false; btn.innerHTML = '${icRefreshCw}Check for Updates'; }
        if (res) {
          res.innerHTML = e.data.html;
          res.style.display = 'block';
          res.style.opacity = '1';
          res.style.transition = '';
          // Only auto-dismiss "up to date" messages — keep update banners visible
          if (e.data.html && e.data.html.includes('4ade80')) {
            clearTimeout(res._fadeTimer);
            res._fadeTimer = setTimeout(function() {
              res.style.transition = 'opacity 1.2s ease';
              res.style.opacity = '0';
              setTimeout(function() { res.style.display = 'none'; res.innerHTML = ''; }, 1200);
            }, 5000);
          }
        }
      } else if (e.data.type === 'cliVersion') {
        const el = document.getElementById('cli-version-value');
        if (el) {
          el.textContent = e.data.text;
          el.className = 'value ' + (e.data.ok ? 'ok' : 'warn');
        }
      } else if (e.data.type === 'autoCheckVersion') {
        const btn = document.getElementById('btn-version');
        const res = document.getElementById('version-result');
        if (btn) { btn.disabled = true; btn.textContent = 'Checking…'; }
        if (res) { res.style.display = 'none'; res.innerHTML = ''; }
      } else if (e.data.type === 'balanceUpdate') {
        var balEl = document.getElementById('user-popover-balance');
        if (balEl) balEl.textContent = (typeof e.data.amount === 'number' ? e.data.amount.toFixed(2) : e.data.amount) + ' credits';
      } else if (e.data.type === 'wizardLog') {
        var cassOverlay = document.getElementById('cass-progress-overlay');
        if (cassOverlay && cassOverlay.style.display === 'none') cassOverlay.style.display = 'flex';
        var cassLog = document.getElementById('cass-log');
        var cassStatus = document.getElementById('cass-status-line');
        if (cassLog && e.data.text) { cassLog.textContent += e.data.text; cassLog.scrollTop = cassLog.scrollHeight; }
        if (e.data.done) {
          var spinner = document.getElementById('cass-spinner');
          if (spinner) spinner.style.animation = 'none';
          if (e.data.ok) {
            if (cassStatus) { cassStatus.textContent = 'Done!'; cassStatus.style.color = '#4ade80'; }
            setTimeout(function() { if (cassOverlay) cassOverlay.style.display = 'none'; }, 2000);
          } else {
            if (cassStatus) { cassStatus.textContent = 'Handing off to AI…'; cassStatus.style.color = '#facc15'; }
            var fullLog = cassLog ? cassLog.textContent : '';
            setTimeout(function() {
              if (cassOverlay) cassOverlay.style.display = 'none';
              vscode.postMessage({ command: 'void.openChatWithMessage', args: ['Better Memory (CASS) setup failed. Here is the full log:\\n\\n' + fullLog.trim() + '\\n\\nPlease diagnose what went wrong, fix it, and complete the setup.'] });
            }, 1500);
          }
        } else if (cassStatus && e.data.text) {
          var lines = (e.data.text || '').split('\\n').filter(Boolean);
          if (lines.length) cassStatus.textContent = lines[lines.length - 1].trim();
        }
      }
    });
  </script>
</body>
</html>`;
  }

  private async _testOpenClawCli(): Promise<{ ok: boolean; output?: string; error?: string; command: string }> {
    if (process.platform === 'win32') {
      // ── 1. Find openclaw.mjs (checks npm prefix + version-manager paths) ──────
      const mjs = await this._findWindowsOpenClawMjs();
      if (mjs) {
        // ── 2. Find node.exe (PATH-first, then nvm/Volta/scoop, then hardcoded) ──
        const nodeExe = await this._findWindowsNodeExe();
        if (nodeExe) {
          return this._spawnNodeMjs(nodeExe, mjs, `"${nodeExe}" "${mjs}" --version`);
        }
      }

      // ── 3. .cmd / .exe shim fallback (npm prefix + scoop shims) ──────────────
      const cmdPath = await this._findWindowsOpenClawCmd();
      if (cmdPath) {
        return new Promise(resolve => {
          cp.execFile(
            'cmd.exe', ['/c', cmdPath, '--version'],
            { timeout: 30000, windowsHide: true, maxBuffer: 1024 * 1024 },
            (error, stdout, stderr) => {
              if (error) {
                const timedOut = (error as any).signal === 'SIGTERM' || error.code == null;
                resolve({
                  ok: false,
                  error: timedOut ? 'Timed out' : (stderr?.toString().trim() || `Exit ${error.code}`),
                  command: `${cmdPath} --version`,
                });
              } else {
                resolve({ ok: true, output: (stdout || stderr || '').toString().trim(), command: `${cmdPath} --version` });
              }
            }
          );
        });
      }

      return { ok: false, error: 'openclaw not found', command: 'openclaw --version' };
    }

    // ── Mac / Linux ──────────────────────────────────────────────────────────────
    // Strategy: source nvm/nvm.sh first so the nvm-managed binary takes priority
    // over any stale system install (e.g. /usr/local/bin/openclaw). Falls back to
    // enumerating ~/.nvm/versions/node/*/bin/openclaw (newest version first),
    // then the existing path-based search.
    const home = os.homedir();
    const nvmSh = path.join(home, '.nvm', 'nvm.sh');

    // 1. Try sourcing nvm so it activates the default alias / current version.
    if (fs.existsSync(nvmSh)) {
      const nvmCmd = `bash -c '. "${nvmSh}" 2>/dev/null && openclaw --version 2>&1'`;
      const nvmResult = await new Promise<{ ok: boolean; output?: string; error?: string; command: string }>(resolve => {
        cp.exec(nvmCmd, { timeout: 10000, maxBuffer: 1024 * 1024 }, (error, stdout) => {
          const out = (stdout || '').toString().trim();
          // Extract just the version line (ignores nvm banner noise)
          const line = out.split('\n').find(l => /\d/.test(l) && !l.startsWith('nvm') && !l.startsWith('Now')) || '';
          if (!error && line) {
            resolve({ ok: true, output: line.trim(), command: nvmCmd });
          } else {
            resolve({ ok: false, error: out || error?.message || 'not found', command: nvmCmd });
          }
        });
      });
      if (nvmResult.ok) return nvmResult;
    }

    // 2. Enumerate ~/.nvm/versions/node/*/bin/openclaw — newest node version first.
    const nvmVersionsDir = path.join(home, '.nvm', 'versions', 'node');
    if (fs.existsSync(nvmVersionsDir)) {
      const nodeVersions = fs.readdirSync(nvmVersionsDir)
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true })); // newest first
      for (const ver of nodeVersions) {
        const candidate = path.join(nvmVersionsDir, ver, 'bin', 'openclaw');
        if (fs.existsSync(candidate)) {
          const result = await new Promise<{ ok: boolean; output?: string; error?: string; command: string }>(resolve => {
            cp.execFile(candidate, ['--version'], { timeout: 10000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
              const out = (stdout || stderr || '').toString().trim();
              if (error || !out) resolve({ ok: false, error: out || error?.message, command: `${candidate} --version` });
              else resolve({ ok: true, output: out, command: `${candidate} --version` });
            });
          });
          if (result.ok) return result;
        }
      }
    }

    // 3. Fall back to path-based search.
    const cliPath = await this._findOpenClawPath();
    if (!cliPath) {
      return { ok: false, error: 'openclaw not found', command: 'openclaw --version' };
    }
    return new Promise(resolve => {
      cp.execFile(
        cliPath, ['--version'],
        { timeout: 15000, maxBuffer: 1024 * 1024, env: this._buildExecEnv() },
        (error, stdout, stderr) => {
          if (error) {
            resolve({ ok: false, error: stderr?.toString().trim() || error.message || `Exit ${(error as any).code}`, command: `${cliPath} --version` });
          } else {
            resolve({ ok: true, output: (stdout || stderr || '').toString().trim(), command: `${cliPath} --version` });
          }
        }
      );
    });
  }

  /**
   * Finds openclaw.mjs in the npm global prefix (dynamic) and common
   * version-manager install paths so any Node setup is covered.
   */
  private async _findWindowsOpenClawMjs(): Promise<string | undefined> {
    const home = os.homedir();
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');

    // Ask npm where its global prefix lives — covers custom prefixes / nvm / fnm
    const prefixResult = await this._runCommand('npm config get prefix', 3000);
    const npmPrefix = (prefixResult.stdout || '').trim().replace(/['"]/g, '');

    const candidates = [
      npmPrefix ? path.join(npmPrefix, 'node_modules', 'openclaw', 'openclaw.mjs') : '',
      path.join(appData, 'npm', 'node_modules', 'openclaw', 'openclaw.mjs'),
      // scoop (nodejs / nodejs-lts)
      path.join(home, 'scoop', 'apps', 'nodejs', 'current', 'node_modules', 'openclaw', 'openclaw.mjs'),
      path.join(home, 'scoop', 'apps', 'nodejs-lts', 'current', 'node_modules', 'openclaw', 'openclaw.mjs'),
      // Volta
      path.join(localAppData, 'Volta', 'tools', 'image', 'packages', 'openclaw', 'lib', 'node_modules', 'openclaw', 'openclaw.mjs'),
    ].filter(Boolean);

    return candidates.find(p => fs.existsSync(p));
  }

  /**
   * Finds the real node.exe for Windows.
   * Strategy: PATH lookup first (handles nvm-windows, fnm, Volta shims, winget,
   * and standard installs), then version-manager directories, then hardcoded paths.
   */
  private async _findWindowsNodeExe(): Promise<string | undefined> {
    const home = os.homedir();
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
    const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');

    // 1. PATH lookup — most reliable; works for nvm-windows, fnm, Volta shims,
    //    winget, and standard installers without any special-casing.
    try {
      const found = await new Promise<string>((resolve, reject) =>
        cp.exec('where node.exe', { timeout: 3000, windowsHide: true }, (err, stdout) =>
          err ? reject(err) : resolve(stdout.trim().split(/\r?\n/)[0]?.trim() || '')
        )
      );
      // Skip if the path belongs to VSCodium / VS Code / Electron (wrong node)
      if (found && fs.existsSync(found) && !/vscodium|vscode|electron/i.test(found)) {
        return found;
      }
    } catch {}

    // 2. nvm-windows — %NVM_HOME%\<version>\node.exe
    const nvmHome = process.env.NVM_HOME;
    if (nvmHome && fs.existsSync(nvmHome)) {
      try {
        const versions = fs.readdirSync(nvmHome)
          .filter(e => /^\d+\.\d+\.\d+$/.test(e))
          .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
        for (const v of versions.slice(0, 5)) {
          const p = path.join(nvmHome, v, 'node.exe');
          if (fs.existsSync(p)) return p;
        }
      } catch {}
    }

    // 3. Volta — %LOCALAPPDATA%\Volta\tools\image\node\<version>\node.exe
    const voltaNodeDir = path.join(localAppData, 'Volta', 'tools', 'image', 'node');
    if (fs.existsSync(voltaNodeDir)) {
      try {
        const versions = fs.readdirSync(voltaNodeDir)
          .filter(e => /^\d+\.\d+\.\d+$/.test(e))
          .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
        for (const v of versions.slice(0, 5)) {
          const p = path.join(voltaNodeDir, v, 'node.exe');
          if (fs.existsSync(p)) return p;
        }
      } catch {}
    }

    // 4. scoop (nodejs / nodejs-lts)
    for (const app of ['nodejs', 'nodejs-lts']) {
      const p = path.join(home, 'scoop', 'apps', app, 'current', 'node.exe');
      if (fs.existsSync(p)) return p;
    }

    // 5. Standard installer, chocolatey, winget fallbacks
    const hardcoded = [
      path.join(programFiles, 'nodejs', 'node.exe'),
      'C:\\Program Files\\nodejs\\node.exe',
      'C:\\Program Files (x86)\\nodejs\\node.exe',
      path.join(localAppData, 'Programs', 'nodejs', 'node.exe'),
      'C:\\ProgramData\\chocolatey\\bin\\node.exe',
      'C:\\tools\\nodejs\\node.exe',
    ];
    return hardcoded.find(p => fs.existsSync(p));
  }

  /**
   * Finds openclaw.cmd / .exe shim using the npm global prefix (dynamic)
   * and common fallback locations including scoop shims.
   */
  private async _findWindowsOpenClawCmd(): Promise<string | undefined> {
    const home = os.homedir();
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');

    const prefixResult = await this._runCommand('npm config get prefix', 3000);
    const npmPrefix = (prefixResult.stdout || '').trim().replace(/['"]/g, '');

    const candidates = [
      npmPrefix ? path.join(npmPrefix, 'openclaw.cmd') : '',
      npmPrefix ? path.join(npmPrefix, 'openclaw.exe') : '',
      path.join(appData, 'npm', 'openclaw.cmd'),
      path.join(appData, 'npm', 'openclaw.exe'),
      // scoop shims
      path.join(home, 'scoop', 'shims', 'openclaw.cmd'),
      path.join(home, 'scoop', 'shims', 'openclaw.exe'),
    ].filter(Boolean);

    return candidates.find(p => fs.existsSync(p));
  }

  /** Spawns `<nodeExe> <mjs> --version` and resolves with the result. */
  private _spawnNodeMjs(
    nodeExe: string,
    mjs: string,
    display: string
  ): Promise<{ ok: boolean; output?: string; error?: string; command: string }> {
    return new Promise(resolve => {
      const child = cp.spawn(nodeExe, [mjs, '--version'], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', d => (stdout += d));
      child.stderr?.on('data', d => (stderr += d));
      const timer = setTimeout(() => child.kill('SIGTERM'), 30000);
      child.on('close', (code, signal) => {
        clearTimeout(timer);
        if (signal === 'SIGTERM' || code === null) {
          resolve({ ok: false, error: 'Timed out after 30s', command: display });
        } else if (code !== 0) {
          resolve({ ok: false, error: stderr.trim() || `Exit ${code}`, command: display });
        } else {
          resolve({ ok: true, output: (stdout || stderr).trim(), command: display });
        }
      });
      child.on('error', err => {
        clearTimeout(timer);
        resolve({ ok: false, error: err.message, command: display });
      });
    });
  }

  private async _findOpenClawPath(): Promise<string | undefined> {
    const cfgPath = vscode.workspace.getConfiguration('openclaw').get<string>('cliPath');
    if (cfgPath && fs.existsSync(cfgPath)) return cfgPath;

    const envPath = process.env.OPENCLAW_CLI;
    if (envPath && fs.existsSync(envPath)) return envPath;

    if (process.platform === 'win32') {
      const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
      const candidates = [
        path.join(appData, 'npm', 'openclaw.cmd'),
        path.join(appData, 'npm', 'openclaw.exe'),
        path.join(appData, 'npm', 'openclaw.bat'),
        path.join(appData, 'npm', 'openclaw.ps1'),
      ];
      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) return candidate;
      }
    }

    if (process.platform === 'win32') {
      for (const probe of ['openclaw.cmd', 'openclaw.exe', 'openclaw.bat', 'openclaw.ps1', 'openclaw']) {
        const result = await this._runCommand(`where ${probe}`, 2000);
        if (!result.error && !result.notFound) {
          const out = (result.stdout || '').trim();
          if (out) {
            const candidates = out
              .split(/\r?\n/)
              .map(l => l.trim().replace(/^"+|"+$/g, ''))
              .filter(Boolean);
            for (const candidate of candidates) {
              const resolved = this._resolveWindowsCliPath(candidate);
              if (fs.existsSync(resolved)) return resolved;
            }
          }
        }
      }
    } else {
      const result = await this._runCommand('which openclaw', 2000);
      if (!result.error && !result.notFound) {
        const out = (result.stdout || '').trim();
        if (out) {
          const candidates = out
            .split(/\r?\n/)
            .map(l => l.trim().replace(/^"+|"+$/g, ''))
            .filter(Boolean);
          for (const candidate of candidates) {
            const resolved = this._resolveWindowsCliPath(candidate);
            if (fs.existsSync(resolved)) return resolved;
          }
        }
      }
    }

    const npmCandidates = await this._getNpmGlobalCliCandidates();
    for (const candidate of npmCandidates) {
      if (fs.existsSync(candidate)) return candidate;
    }

    const fallback = this._getCandidateCliPaths();
    for (const candidate of fallback) {
      if (fs.existsSync(candidate)) return candidate;
    }

    return undefined;
  }

  private _getCandidateCliPaths(): string[] {
    const home = os.homedir();
    if (process.platform === 'win32') {
      const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
      const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
      const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
      return [
        path.join(appData, 'npm', 'openclaw.cmd'),
        path.join(appData, 'npm', 'openclaw.exe'),
        path.join(appData, 'npm', 'openclaw.bat'),
        path.join(appData, 'npm', 'openclaw.ps1'),
        path.join(localAppData, 'Programs', 'OpenClaw', 'openclaw.exe'),
        path.join(localAppData, 'OpenClaw', 'openclaw.exe'),
        path.join(programFiles, 'OpenClaw', 'openclaw.exe'),
        path.join(programFiles, 'OpenClaw', 'bin', 'openclaw.exe'),
        path.join(localAppData, 'Microsoft', 'WindowsApps', 'openclaw.exe'),
        path.join(home, '.openclaw', 'bin', 'openclaw.exe'),
      ];
    }
    return [
      '/usr/local/bin/openclaw',
      '/opt/homebrew/bin/openclaw',
      path.join(home, '.local', 'bin', 'openclaw'),
      path.join(home, '.npm-global', 'bin', 'openclaw'),
      path.join(home, '.openclaw', 'bin', 'openclaw'),
    ];
  }

  private async _getNpmGlobalCliCandidates(): Promise<string[]> {
    const result = await this._runCommand('npm config get prefix', 2000);
    const prefix = (result.stdout || '').trim();
    if (!prefix) return [];
    if (process.platform === 'win32') {
      const base = this._resolveWindowsCliPath(path.join(prefix, 'openclaw'));
      return [
        `${base}.cmd`,
        `${base}.exe`,
        `${base}.bat`,
        `${base}.ps1`,
        base,
      ];
    }
    return [path.join(prefix, 'bin', 'openclaw')];
  }

  private _resolveWindowsCliPath(candidate: string) {
    if (process.platform !== 'win32') return candidate;
    const cleaned = candidate.replace(/^"+|"+$/g, '');
    if (fs.existsSync(cleaned)) return cleaned;
    if (path.extname(cleaned)) return cleaned;
    const exts = ['.cmd', '.exe', '.bat', '.ps1'];
    for (const ext of exts) {
      const withExt = `${cleaned}${ext}`;
      if (fs.existsSync(withExt)) return withExt;
    }
    return cleaned;
  }

  private _getPreferredWindowsCmdPath(candidate: string | undefined) {
    if (process.platform !== 'win32') return candidate;
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    const shim = path.join(appData, 'npm', 'openclaw.cmd');
    if (fs.existsSync(shim)) return shim;
    return candidate;
  }

  private _runCommand(cmd: string, timeoutMs: number): Promise<{ stdout: string; stderr: string; error?: string; notFound?: boolean }> {
    const env = this._buildExecEnv();
    return new Promise(resolve => {
      cp.exec(
        cmd,
        { timeout: timeoutMs, windowsHide: true, maxBuffer: 1024 * 1024, env },
        (error, stdout, stderr) => {
          const result = { stdout: stdout?.toString() || '', stderr: stderr?.toString() || '' } as {
            stdout: string;
            stderr: string;
            error?: string;
            notFound?: boolean;
          };
          if (error) {
            result.error = error.message || 'Command failed';
            const text = `${result.stderr}\n${result.error}`.toLowerCase();
            result.notFound =
              (error as any).code === 'ENOENT' ||
              text.includes('not recognized as an internal or external command') ||
              text.includes('command not found');
          }
          resolve(result);
        }
      );
    });
  }

  private _buildExecEnv() {
    const env = { ...process.env };
    const basePath = env.PATH || (env as any).Path || '';
    const extra: string[] = [];
    if (process.platform === 'win32') {
      const appData = env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
      if (appData) extra.push(path.join(appData, 'npm'));
      if (env.ProgramFiles) extra.push(path.join(env.ProgramFiles, 'nodejs'));
      if (env.LOCALAPPDATA) extra.push(path.join(env.LOCALAPPDATA, 'Programs', 'nodejs'));
      const systemRoot = env.SystemRoot || (env as any).WINDIR;
      if (systemRoot) extra.push(path.join(systemRoot, 'System32'));
    } else {
      extra.push('/usr/local/bin', '/opt/homebrew/bin');
      extra.push(path.join(os.homedir(), '.local', 'bin'));
      extra.push(path.join(os.homedir(), '.npm-global', 'bin'));
      extra.push(path.join(os.homedir(), '.openclaw', 'bin'));

      // Add nvm-managed Node.js paths (newest version first)
      const nvmDir = process.env.NVM_DIR || path.join(os.homedir(), '.nvm');
      const nvmVersionsDir = path.join(nvmDir, 'versions', 'node');
      if (fs.existsSync(nvmVersionsDir)) {
        try {
          const versions = fs.readdirSync(nvmVersionsDir)
            .filter(e => /^v?\d+/.test(e))
            .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
          for (const v of versions.slice(0, 3)) {
            extra.push(path.join(nvmVersionsDir, v, 'bin'));
          }
        } catch { /* non-fatal */ }
      }

      // Add fnm paths (popular Node version manager on macOS)
      const fnmDir = path.join(os.homedir(), '.local', 'share', 'fnm', 'node-versions');
      if (fs.existsSync(fnmDir)) {
        try {
          const versions = fs.readdirSync(fnmDir)
            .filter(e => /^v?\d+/.test(e))
            .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
          for (const v of versions.slice(0, 3)) {
            extra.push(path.join(fnmDir, v, 'installation', 'bin'));
          }
        } catch { /* non-fatal */ }
      }

      // Homebrew Node.js (macOS)
      if (process.platform === 'darwin') {
        extra.push('/opt/homebrew/opt/node/bin');
        extra.push('/usr/local/opt/node/bin');
      }
    }
    const sep = process.platform === 'win32' ? ';' : ':';
    env.PATH = [...extra, basePath].filter(Boolean).join(sep);
    (env as any).Path = env.PATH;
    return env;
  }
}
