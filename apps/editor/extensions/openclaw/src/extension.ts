import * as vscode from 'vscode';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as https from 'https';
import { HomePanel } from './panels/home';
import { StatusPanel } from './panels/status';
import { ConfigPanel, stopConfigProxy } from './panels/config';

const CONFIG_URL = 'http://localhost:18789/';

/** Returns true if the OpenClaw web server is reachable. */
function isWebServerReachable(): Promise<boolean> {
  return new Promise(resolve => {
    const req = http.get(CONFIG_URL, { timeout: 3000 }, res => {
      res.resume();
      resolve(res.statusCode !== undefined && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

type PinnedContainer = {
  id: string;
  pinned: boolean;
  visible: boolean;
  order?: number;
};

/**
 * Writes a complete, authoritative activity-bar container list that keeps
 * only Explorer and Search visible and hides everything else (SCM, Debug,
 * Extensions, Remote Explorer, etc.).
 *
 * Writing a FULL list — rather than patching the existing one — is the only
 * reliable way to override VS Code's built-in defaults on fresh installs where
 * `pinnedViewContainers` is empty.
 */
async function hideActivityBarItems(
  context: vscode.ExtensionContext,
): Promise<void> {
  // Bumped to V5 — disables git entirely so SCM button never appears.
  const APPLIED_KEY = 'activityBarHiddenConfiguredV5';
  if (context.globalState.get<boolean>(APPLIED_KEY, false)) {
    return;
  }

  try {
    const config = vscode.workspace.getConfiguration();

    // Disable git entirely — users don't need it and it causes the SCM button
    // to reappear even after hiding it via pinnedViewContainers.
    await config.update('git.enabled', false, vscode.ConfigurationTarget.Global);
    await config.update('git.decorations.enabled', false, vscode.ConfigurationTarget.Global);

    // Complete authoritative list of all standard VS Code activity-bar containers.
    // Only Explorer and Search stay visible; everything else is hidden.
    const authoritative: PinnedContainer[] = [
      { id: 'workbench.view.explorer',   pinned: true,  visible: true,  order: 0 },
      { id: 'workbench.view.search',     pinned: true,  visible: true,  order: 1 },
      { id: 'workbench.view.scm',        pinned: false, visible: false, order: 2 },
      { id: 'workbench.view.debug',      pinned: false, visible: false, order: 3 },
      { id: 'workbench.view.extensions', pinned: false, visible: false, order: 4 },
      { id: 'workbench.view.remote',     pinned: false, visible: false, order: 5 },
    ];

    // Preserve any extra containers the user may have added (e.g. third-party
    // extensions) so we don't accidentally remove them.
    const existing =
      config.get<PinnedContainer[]>('workbench.activityBar.pinnedViewContainers') ?? [];
    const knownIds = new Set(authoritative.map(c => c.id));
    for (const c of existing) {
      if (!knownIds.has(c.id)) {
        authoritative.push({ ...c });
      }
    }

    await config.update(
      'workbench.activityBar.pinnedViewContainers',
      authoritative,
      vscode.ConfigurationTarget.Global,
    );

    await context.globalState.update(APPLIED_KEY, true);
  } catch {
    // Non-fatal — settings.json defaults already cover most cases.
  }
}

/**
 * Opens ~/.openclaw as a named workspace — but only if OpenClaw is already installed.
 *
 * Strategy:
 *  - ~/.occ is OCcode's internal state directory. It is never opened as a workspace.
 *  - ~/.openclaw is OpenClaw's directory, created by OpenClaw after it installs.
 *    We open it as the workspace so users can browse their config files.
 *    If it doesn't exist yet (pre-install), we do nothing.
 *  - The .code-workspace file lives in ~/.occ so we don't pollute ~/.openclaw.
 *    The workspace file points at ~/.openclaw as the folder using an absolute path.
 */
const WORKSPACE_FILENAME = 'My OpenClaw Workspace.code-workspace';

async function openOpenClawFolder(): Promise<void> {
  // Ensure ~/.occ exists — OCcode's internal state directory.
  const occPath = path.join(os.homedir(), '.occ');
  if (!fs.existsSync(occPath)) {
    fs.mkdirSync(occPath, { recursive: true });
  }

  // Only open the workspace if OpenClaw is already installed.
  const openclawPath = path.join(os.homedir(), '.openclaw');
  if (!fs.existsSync(openclawPath)) {
    return; // OpenClaw not installed yet — nothing to open.
  }

  // Workspace file lives in ~/.occ, points at ~/.openclaw as the folder.
  const workspaceFilePath = path.join(occPath, WORKSPACE_FILENAME);
  if (!fs.existsSync(workspaceFilePath)) {
    fs.writeFileSync(
      workspaceFilePath,
      JSON.stringify(
        {
          folders: [{ path: openclawPath }],
          settings: {
            'files.exclude': { '*.code-workspace': true },
          },
        },
        null,
        '\t',
      ),
    );
  }

  // If we're already inside this workspace, nothing more to do.
  const workspaceFileUri = vscode.Uri.file(workspaceFilePath);
  if (vscode.workspace.workspaceFile?.fsPath === workspaceFileUri.fsPath) {
    return;
  }

  // Open the workspace — reloads the window once, then VS Code remembers it.
  await vscode.commands.executeCommand('vscode.openFolder', workspaceFileUri);
}


// ── Inference balance status bar ──────────────────────────────────────────────
const BACKEND_BALANCE_KEY = 'occBackendBalanceV1'; // cached backend balance — persists across restarts
const OCC_JWT_KEY = 'occJwtV1'; // JWT stored directly in extension storage — no renderer IPC needed

function initBalanceBar(context: vscode.ExtensionContext): (amount?: number) => void {
  // Restore cached backend balance so status bar shows the correct value immediately on startup
  const cachedBackendBalance = context.globalState.get<number | null>(BACKEND_BALANCE_KEY, null);
  let backendBalance: number | null = cachedBackendBalance;
  let displayedBalance: number | null = cachedBackendBalance; // tracks what's visually shown
  let animTimer: ReturnType<typeof setInterval> | undefined;
  let backendPollTimer: ReturnType<typeof setInterval> | undefined;
  let countdownTimer: ReturnType<typeof setInterval> | undefined;

  // Burn rate tracking — keep last 3 readings to compute $/ms spend rate
  const readings: Array<{ balance: number; time: number }> = [];
  let burnRatePerMs = 0;

  const bar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 16);
  bar.command = 'openclaw.balance.details';
  bar.name = 'OCC Credits';
  context.subscriptions.push(bar);

  function renderBalance(value: number, counting = false): void {
    bar.text = `$(credit-card) $${value.toFixed(4)}${counting && burnRatePerMs > 0 ? ' ▼' : ''}`;
    const tip = new vscode.MarkdownString(undefined, true);
    tip.isTrusted = true;
    tip.appendMarkdown(`**OCC Credits**\n\n**$${value.toFixed(4)}** remaining\n\n_[Get More Credits](https://occ.mba.sh/credits)_`);
    bar.color = value > 1 ? undefined : value > 0.2
      ? new vscode.ThemeColor('statusBarItem.warningForeground')
      : new vscode.ThemeColor('statusBarItem.errorForeground');
    bar.backgroundColor = value > 1 ? undefined : value > 0.2
      ? new vscode.ThemeColor('statusBarItem.warningBackground')
      : new vscode.ThemeColor('statusBarItem.errorBackground');
    bar.tooltip = tip;
    bar.show();
  }

  function stopCountdown(): void {
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = undefined; }
  }

  function startCountdown(): void {
    stopCountdown();
    if (burnRatePerMs <= 0 || displayedBalance === null) return;
    countdownTimer = setInterval(() => {
      if (displayedBalance === null) return;
      displayedBalance = Math.max(0, displayedBalance - burnRatePerMs * 250);
      renderBalance(displayedBalance, true);
    }, 250);
  }

  function animateTo(from: number, to: number): void {
    stopCountdown(); // pause countdown while animating to real value
    if (animTimer !== undefined) { clearInterval(animTimer); }
    const DURATION = 380;
    const STEP = 1000 / 60;
    const start = Date.now();
    animTimer = setInterval(() => {
      const elapsed = Date.now() - start;
      const t = Math.min(elapsed / DURATION, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const current = from + (to - from) * eased;
      displayedBalance = current;
      renderBalance(current);
      if (t >= 1) {
        clearInterval(animTimer!);
        animTimer = undefined;
        displayedBalance = to;
        renderBalance(to);
        // Resume countdown after animation settles
        startCountdown();
      }
    }, STEP);
  }

  function updateBurnRate(newBalance: number): void {
    const now = Date.now();
    readings.push({ balance: newBalance, time: now });
    if (readings.length > 3) readings.shift();
    if (readings.length >= 2) {
      const oldest = readings[0];
      const newest = readings[readings.length - 1];
      const delta = oldest.balance - newest.balance; // positive = spending
      const elapsed = newest.time - oldest.time;
      burnRatePerMs = elapsed > 0 && delta > 0 ? delta / elapsed : 0;
    }
  }

  async function fetchAndUpdateBackendBalance(): Promise<void> {
    try {
      // Read JWT from extension's own globalState first.
      // FALLBACK: if extension globalState has no JWT (e.g. user signed in before this session
      // synced, or the extension was reloaded), read from occLegacyJwt in VS Code settings and
      // backfill extension globalState so future reads work without IPC.
      let jwt = context.globalState.get<string>(OCC_JWT_KEY, '');
      if (!jwt) {
        try {
          const legacyJwt = await vscode.commands.executeCommand<string>('occ.auth.getLegacyJwt');
          if (legacyJwt) {
            jwt = legacyJwt;
            await context.globalState.update(OCC_JWT_KEY, jwt);
          }
        } catch { /* renderer not ready yet — will retry on next poll */ }
      }

      if (!jwt) {
        // Truly not signed in — hide bar entirely and clear any cached balance
        if (backendPollTimer) { clearInterval(backendPollTimer); backendPollTimer = undefined; }
        if (animTimer !== undefined) { clearInterval(animTimer); animTimer = undefined; }
        stopCountdown();
        backendBalance = null;
        displayedBalance = null;
        readings.length = 0;
        burnRatePerMs = 0;
        void context.globalState.update(BACKEND_BALANCE_KEY, null);
        bar.hide();
        return;
      }

      const r = await fetch('https://occ.mba.sh/api/v1/me', { headers: { Authorization: `Bearer ${jwt}` } });
      if (r.ok) {
        const data = await r.json() as { balance_usd: number; api_keys?: { moltpilotKey?: string; occKey?: string } | null };
        const newBalance = Number(data.balance_usd) || 0;
        // Sync per-user moltpilot key to the renderer settings service so ocFreeModel works
        const moltpilotKey = data.api_keys?.moltpilotKey ?? '';
        // Sync JWT to renderer settings so the condition (occLegacyJwt && occMoltpilotKey) passes
        // in voidSettingsService.ts — without this, ocFreeModel clears endpoint/apiKey
        vscode.commands.executeCommand('occ.auth.setLegacyJwt', jwt);
        vscode.commands.executeCommand('occ.auth.setMoltpilotKey', moltpilotKey);
        updateBurnRate(newBalance);
        const prev = displayedBalance ?? newBalance;
        backendBalance = newBalance;
        void context.globalState.update(BACKEND_BALANCE_KEY, newBalance);
        animateTo(prev, newBalance);
        // Self-healing: restart the poll timer after every successful fetch so the
        // interval resets cleanly and polling survives network blips or missed starts.
        startBackendPolling();
      } else if (r.status === 401) {
        // JWT expired or invalid — clear it, clear moltpilot key, and hide bar
        void context.globalState.update(OCC_JWT_KEY, '');
        vscode.commands.executeCommand('occ.auth.setMoltpilotKey', '');
        if (backendPollTimer) { clearInterval(backendPollTimer); backendPollTimer = undefined; }
        stopCountdown();
        backendBalance = null;
        displayedBalance = null;
        readings.length = 0;
        burnRatePerMs = 0;
        void context.globalState.update(BACKEND_BALANCE_KEY, null);
        bar.hide();
      }
    } catch { /* network error — keep current display, next poll will retry */ }
  }

  function startBackendPolling(): void {
    if (backendPollTimer) clearInterval(backendPollTimer);
    backendPollTimer = setInterval(() => void fetchAndUpdateBackendBalance(), 5_000);
  }

  // Show immediately if we have a cached balance (signed-in returning user)
  if (backendBalance !== null) {
    renderBalance(backendBalance);
  }

  // Fetch immediately on startup — also attempt JWT fallback from renderer settings.
  // Small delay so the renderer (IVoidSettingsService) finishes loading before we call
  // occ.auth.getLegacyJwt, which reads from it.
  setTimeout(() => void fetchAndUpdateBackendBalance(), 2000);

  context.subscriptions.push(
    vscode.commands.registerCommand('openclaw.balance.spend', (_amount?: number) => {
      // no-op when signed in (backend tracks balance); kept for API compatibility
    }),
    vscode.commands.registerCommand('openclaw.balance.details', () => {
      if (backendBalance !== null) {
        vscode.window.showInformationMessage(
          `OCC Credits · $${backendBalance.toFixed(4)} remaining`,
          'Get More Credits'
        ).then(sel => {
          if (sel === 'Get More Credits') {
            vscode.env.openExternal(vscode.Uri.parse('https://occ.mba.sh/credits'));
          }
        });
      }
    }),
    // Called whenever JWT changes (sign-in or sign-out) — refreshes display immediately.
    // Also used by openclaw.jwt.set as the trigger after updating extension storage.
    vscode.commands.registerCommand('openclaw.balance.refresh', () => {
      void fetchAndUpdateBackendBalance();
    }),
    // Called from the renderer (sidebarActions.ts occ.auth.setLegacyJwt) to sync the JWT
    // into extension-host storage so fetchAndUpdateBackendBalance can read it without IPC.
    vscode.commands.registerCommand('openclaw.jwt.set', async (token: string) => {
      await context.globalState.update(OCC_JWT_KEY, token ?? '');
      void fetchAndUpdateBackendBalance();
    }),

    // Smoke test: verifies JWT, moltpilot key, OCC key, balance, and inference tracking.
    // Results open in a new editor tab (Output panel removed from this fork).
    vscode.commands.registerCommand('openclaw.smokeTest', async () => {
      const lines: string[] = [];
      const log = (msg: string) => lines.push(msg);

      log('=== OCC Smoke Test ===');
      log(`Time: ${new Date().toISOString()}`);
      log('');

      // 1. JWT
      let jwt = context.globalState.get<string>(OCC_JWT_KEY, '');
      log(`[1] JWT in extension globalState (occJwtV1): ${jwt ? 'OK present (' + jwt.substring(0, 20) + '...)' : 'MISSING'}`);
      // Check what the renderer has for occLegacyJwt — this is what voidSettingsService reads
      try {
        const legacyJwt = await vscode.commands.executeCommand<string>('occ.auth.getLegacyJwt');
        log(`    occLegacyJwt in renderer settings: ${legacyJwt ? 'OK present (' + legacyJwt.substring(0, 20) + '...)' : 'MISSING <-- this causes MoltPilot to use shared key!'}`);
        if (!jwt && legacyJwt) { jwt = legacyJwt; await context.globalState.update(OCC_JWT_KEY, jwt); }
      } catch { log('    occLegacyJwt check: renderer not ready'); }

      if (!jwt) { lines.push('\nNot signed in — cannot proceed.'); }
      else {
        // 2. /api/v1/me — balance + keys (before)
        log('\n[2] Calling occ.mba.sh/api/v1/me (before)...');
        let balanceBefore = 0;
        let moltpilotKey = '';
        let occKey = '';
        try {
          const r = await fetch('https://occ.mba.sh/api/v1/me', { headers: { Authorization: `Bearer ${jwt}` } });
          if (r.ok) {
            const d = await r.json() as { balance_usd: number; email?: string; api_keys?: { moltpilotKey?: string; occKey?: string } | null };
            balanceBefore = Number(d.balance_usd) || 0;
            moltpilotKey = d.api_keys?.moltpilotKey ?? '';
            occKey = d.api_keys?.occKey ?? '';
            log(`    Status: 200 OK`);
            log(`    Email:        ${d.email ?? '(not returned)'}`);
            log(`    Balance:      $${balanceBefore.toFixed(6)}`);
            log(`    MoltpilotKey: ${moltpilotKey ? 'OK ' + moltpilotKey.substring(0, 12) + '...' : 'MISSING'}`);
            log(`    OccKey:       ${occKey ? 'OK ' + occKey.substring(0, 12) + '...' : 'MISSING'}`);
          } else {
            log(`    HTTP ${r.status} -- JWT may be expired`);
          }
        } catch (e) { log(`    Network error: ${e}`); }

        const inferenceTest = async (label: string, key: string): Promise<void> => {
          log(`\n[${label}] Inference test with ${label} (model: occ-legacy)...`);
          try {
            const resp = await fetch('https://inference.mba.sh/v1/chat/completions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
              body: JSON.stringify({ model: 'occ-legacy', stream: false, messages: [{ role: 'user', content: 'Say: SMOKE_OK' }], max_tokens: 20 }),
            });
            const rawText = await resp.text();
            log(`    HTTP ${resp.status}`);
            log(`    Raw (first 500): ${rawText.substring(0, 500)}`);
            if (resp.ok) {
              try {
                const d = JSON.parse(rawText) as { choices?: Array<{ message?: { content?: string }; text?: string }> };
                log(`    Reply: ${(d.choices?.[0]?.message?.content ?? d.choices?.[0]?.text ?? '(no content)').trim()}`);
              } catch { log(`    (response is not JSON — likely SSE stream)`); }
            }
          } catch (e) { log(`    Network error: ${e}`); }
        };

        // 3. MoltPilot key
        if (moltpilotKey) { await inferenceTest('MoltPilot key', moltpilotKey); }
        else { log('\n[3] SKIP -- no MoltpilotKey'); }

        // 4. OCC key
        if (occKey) { await inferenceTest('OCC key', occKey); }
        else { log('\n[4] SKIP -- no occKey returned by API'); }

        // 5. Re-check balance after inference calls
        log('\n[5] Re-checking balance (after 10s to allow backend to settle)...');
        await new Promise(res => setTimeout(res, 10_000));
        try {
          const r = await fetch('https://occ.mba.sh/api/v1/me', { headers: { Authorization: `Bearer ${jwt}` } });
          if (r.ok) {
            const d = await r.json() as { balance_usd: number };
            const balanceAfter = Number(d.balance_usd) || 0;
            const delta = balanceBefore - balanceAfter;
            log(`    Balance before: $${balanceBefore.toFixed(6)}`);
            log(`    Balance after:  $${balanceAfter.toFixed(6)}`);
            log(`    Delta: ${delta > 0 ? '-$' + delta.toFixed(6) + ' -- usage IS tracked' : delta === 0 ? '$0 -- no change yet (check again in 30s)' : '+$' + Math.abs(delta).toFixed(6) + ' -- balance went up?'}`);
          }
        } catch (e) { log(`    Network error: ${e}`); }
      }

      log('\n=== Done ===');

      // Open results in a new editor tab
      const doc = await vscode.workspace.openTextDocument({ content: lines.join('\n'), language: 'plaintext' });
      await vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.ViewColumn.One });
    }),

    { dispose: () => { if (backendPollTimer) clearInterval(backendPollTimer); stopCountdown(); } },
  );

  return () => {}; // spend is a no-op — kept so call sites don't break
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // Inference balance bar (shown at bottom-right, tracks $1.00 free budget).
  const spendBalance = initBalanceBar(context);

  // Apply hidden activity bar items on first activation on this machine.
  await hideActivityBarItems(context);

  // Open ~/.openclaw as "My OpenClaw Workspace" (may reload the window once).
  await openOpenClawFolder();

  // Deep-link URI handler: occode://openclaw.home/auth?token=<jwt>
  // Scheme "occode" is set in product.json "urlProtocol": "occode".
  // OCC.MBA.SH fires this redirect after the user signs up / logs in.
  context.subscriptions.push(
    vscode.window.registerUriHandler({
      handleUri(uri: vscode.Uri) {
        if (uri.path === '/auth') {
          const params = new URLSearchParams(uri.query);
          const token = params.get('token');
          if (token) {
            // Store JWT in extension-host storage immediately (no renderer IPC needed).
            void context.globalState.update(OCC_JWT_KEY, token).then(() => {
              // Also sync to renderer settings service (for chat / other renderer consumers).
              vscode.commands.executeCommand('occ.auth.setLegacyJwt', token);
            });
          }
        }
      },
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('openclaw.home', () => {
      HomePanel.createOrShow(context.extensionUri);
    }),
    vscode.commands.registerCommand('openclaw.configure', async () => {
      const reachable = await isWebServerReachable();
      if (reachable) {
        await ConfigPanel.createOrShow();
      } else {
        // Web server not running — ask the AI to start it
        const message =
          `The OpenClaw web configuration server is not running at ${CONFIG_URL}.\n\n` +
          `Please start it now by running the OpenClaw gateway in the terminal:\n` +
          `\`\`\`\nopenclaw gateway start\n\`\`\`\n\n` +
          `Once it is running, I will be able to open the configuration UI at ${CONFIG_URL} inside the editor.`;
        await vscode.commands.executeCommand('void.openChatWithMessage', message);
        spendBalance();
      }
    }),
    vscode.commands.registerCommand('openclaw.aiFixConfig', () => {
      const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
      let configContent: string;
      try {
        configContent = fs.readFileSync(configPath, 'utf-8');
      } catch {
        vscode.window.showErrorMessage(
          'openclaw.json not found at ~/.openclaw/openclaw.json. Please create it first.',
        );
        return;
      }
      const message =
        `Please review my openclaw.json configuration below, identify any issues ` +
        `(syntax errors, missing required fields, invalid values, etc.), ` +
        `and provide a corrected version with an explanation of what you changed.\n\n` +
        `\`\`\`json\n${configContent}\n\`\`\``;
      vscode.commands.executeCommand('void.openChatWithMessage', message);
      spendBalance();
    }),
    vscode.commands.registerCommand('openclaw.install', () => {
      void HomePanel.runInstall(
        context.extensionUri,
        process.platform,
        process.arch,
        process.env.SHELL ?? '',
      );
    }),
    vscode.commands.registerCommand('openclaw.openWorkspace', () => {
      void openOpenClawFolder();
    }),
    vscode.commands.registerCommand('openclaw.status', () => {
      StatusPanel.createOrShow(context.extensionUri);
    }),
    vscode.commands.registerCommand('openclaw.configureTUI', async () => {
      // On Windows, Electron may not inherit the full user PATH, so resolve the
      // openclaw binary the same way the home panel does (via HomePanel._findOpenClawPath).
      // Fall back to the plain shell command if the panel hasn't been created yet.
      const terminal = vscode.window.createTerminal({
        name: 'OpenClaw Configure',
        location: vscode.TerminalLocation.Editor,
      });
      terminal.show();
      if (process.platform === 'win32') {
        // Use `cmd /c openclaw configure` so Windows resolves .cmd shims correctly
        terminal.sendText('cmd /c openclaw configure', true);
      } else {
        terminal.sendText('openclaw configure', true);
      }
    }),
  );

  // ── Anonymous install ping (fires once per install, no personal data) ──
  const PING_KEY = 'aptabasePingedV1';
  if (!context.globalState.get<boolean>(PING_KEY)) {
    void context.globalState.update(PING_KEY, true);
    const osName = process.platform === 'darwin' ? 'macOS' : process.platform === 'win32' ? 'Windows' : 'Linux';
    const version = vscode.extensions.getExtension('openclaw.home')?.packageJSON?.version ?? 'unknown';
    fetch('https://api.aptabase.com/v0/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'App-Key': 'A-US-4013869858',
      },
      body: JSON.stringify({
        timestamp: new Date().toISOString(),
        sessionId: Math.random().toString(36).slice(2),
        eventName: 'install',
        systemProps: {
          osName,
          appVersion: version,
          sdkVersion: 'manual-1.0',
        },
        props: {},
      }),
    }).catch(() => {}); // silent — never block the app
  }

  // ── System status for MoltPilot system prompt ──────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('openclaw.getSystemStatus', async (): Promise<{
      installed: boolean;
      gatewayRunning: boolean;
      hasAgents: boolean;
      agentNames: string[];
      hasAiModel: boolean;
      hasChannels: boolean;
      channelNames: string[];
    }> => {
      const homedir = os.homedir();
      const configPath = path.join(homedir, '.openclaw', 'openclaw.json');
      const installed = fs.existsSync(configPath);

      let config: Record<string, unknown> = {};
      if (installed) {
        try { config = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch {}
      }

      // Determine gateway port
      const port = (() => {
        const p = config['port'] ?? config['gateway_port'] ?? config['gatewayPort'];
        if (p === undefined) return 18789;
        const n = Number(p);
        return Number.isFinite(n) && n > 0 && n < 65536 ? n : 18789;
      })();

      // Check if gateway is reachable
      const gatewayRunning = await new Promise<boolean>(resolve => {
        const req = http.get(`http://localhost:${port}/`, { timeout: 2000 }, res => {
          res.resume();
          resolve(res.statusCode !== undefined && res.statusCode < 500);
        });
        req.on('error', () => resolve(false));
        req.on('timeout', () => { req.destroy(); resolve(false); });
      });

      // Check if an AI provider/model is configured
      const hasAiModel = installed && !!(
        config['auth_choice'] || config['openai_api_key'] || config['anthropic_api_key'] ||
        config['openrouter_api_key'] || config['gemini_api_key'] || config['api_key'] ||
        config['custom_api_key'] || config['model'] || config['provider']
      );

      // Check connected messaging channels (openclaw.json may have a 'channels' object)
      const channelsRaw = config['channels'];
      let channelNames: string[] = [];
      if (channelsRaw && typeof channelsRaw === 'object' && !Array.isArray(channelsRaw)) {
        channelNames = Object.entries(channelsRaw as Record<string, unknown>)
          .filter(([, v]) => {
            if (!v) return false;
            // If the channel is an object, require enabled !== false
            if (typeof v === 'object' && (v as Record<string, unknown>)['enabled'] === false) return false;
            return true;
          })
          .map(([k]) => k);
      }
      const hasChannels = channelNames.length > 0;

      // Check if agents are configured — read AGENTS.md from workspace dir
      const workspaceDir = (() => {
        const fallback = path.join(homedir, '.openclaw', 'workspace');
        try {
          const ws = config['workspace'];
          if (typeof ws === 'string' && ws.trim()) {
            return ws.startsWith('~') ? path.join(homedir, ws.slice(1)) : ws;
          }
        } catch {}
        return fallback;
      })();

      let agentNames: string[] = [];
      try {
        const content = fs.readFileSync(path.join(workspaceDir, 'AGENTS.md'), 'utf-8');
        // Parse agent names from markdown headings (# or ##), skip generic "Agents" title
        agentNames = content.split('\n')
          .filter(l => /^#{1,2}\s+\S/.test(l))
          .map(l => l.replace(/^#{1,2}\s+/, '').trim())
          .filter(n => n.length > 0 && !/^agents?$/i.test(n));
      } catch {}
      const hasAgents = agentNames.length > 0;

      return { installed, gatewayRunning, hasAgents, agentNames, hasAiModel, hasChannels, channelNames };
    }),
  );

  // ── Walkthrough commands ────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('occ.onboarding.chooseMoltPilot', async () => {
      await context.globalState.update('occ.aiPreference', 'moltpilot');
      vscode.env.openExternal(vscode.Uri.parse('https://occ.mba.sh/signup?ref=occ-editor'));
    }),

    vscode.commands.registerCommand('occ.onboarding.chooseBYOK', async () => {
      const providers = ['Anthropic Claude', 'OpenAI', 'OpenRouter', 'Google Gemini', 'Ollama'];
      const pick = await vscode.window.showQuickPick(providers, {
        placeHolder: 'Which provider would you like to use?',
      });
      if (pick) {
        await context.globalState.update('occ.aiPreference', pick.toLowerCase().replace(/\s+/g, '-'));
        vscode.window.showInformationMessage(
          `${pick} selected — you'll enter your API key when you install OpenClaw from OCC Home.`,
        );
      }
    }),

    vscode.commands.registerCommand('occ.onboarding.darkTheme', async () => {
      await vscode.workspace.getConfiguration('workbench').update(
        'colorTheme', 'OpenClaw Dark', vscode.ConfigurationTarget.Global,
      );
    }),

    vscode.commands.registerCommand('occ.onboarding.lightTheme', async () => {
      await vscode.workspace.getConfiguration('workbench').update(
        'colorTheme', 'OpenClaw Light', vscode.ConfigurationTarget.Global,
      );
    }),
  );

  // Auto-show OCC Home on startup (after activation settles).
  setTimeout(() => {
    HomePanel.createOrShow(context.extensionUri);
  }, 500);
}

export function deactivate() {
  stopConfigProxy();
}
