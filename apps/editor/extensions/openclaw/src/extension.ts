import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as https from 'https';
import { HomePanel } from './panels/home';
import { StatusPanel } from './panels/status';
import { setActiveOpenClawWorkspaceFolder } from './panels/statusController';
import { stopConfigProxy, getDashboardUrl } from './panels/config';
import { HostRegistry } from './hosts/registry';
import { HostManager } from './hosts/manager';
import { HostStatusBarItem } from './hosts/statusbar';
import { HostTreeProvider } from './hosts/tree';
import type { OpenClawCoreAPI } from './hosts/types';

const DEFAULT_GATEWAY_PORT = 18789;

function getConfiguredGatewayPort(): number {
  try {
    const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
    const raw = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(raw) as Record<string, unknown>;
    const gateway = config['gateway'] as Record<string, unknown> | undefined;
    const p = gateway?.['port'] ?? config['port'] ?? config['gateway_port'] ?? config['gatewayPort'];
    const n = typeof p === 'string' ? parseInt(p, 10) : typeof p === 'number' ? p : NaN;
    return Number.isFinite(n) && n > 0 && n < 65536 ? n : DEFAULT_GATEWAY_PORT;
  } catch {
    return DEFAULT_GATEWAY_PORT;
  }
}

// ── Window host binding ─────────────────────────────────────────────────────

/** Describes which host this VS Code window is currently bound to. */
export interface WindowHostBinding {
  type: 'local' | 'docker' | 'ssh';
  hostId: string;
  port: number;
  label: string;
}

const WINDOW_HOST_KEY = 'occ.windowHost';

function registerWindowHostCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('occ.window.setHost', (binding: WindowHostBinding) => {
      void context.workspaceState.update(WINDOW_HOST_KEY, binding);
    }),
    vscode.commands.registerCommand('occ.window.clearHost', () => {
      void context.workspaceState.update(WINDOW_HOST_KEY, undefined);
    }),
    /** Returns the current WindowHostBinding for this window, or null. */
    vscode.commands.registerCommand('occ.window.getHost', () => {
      return context.workspaceState.get<WindowHostBinding>(WINDOW_HOST_KEY) ?? null;
    }),
  );
}

/**
 * Smart routing for the "OCC Home" command.
 * Priority: stored window binding → detected state → install wizard.
 */
function routeHome(extensionUri: vscode.Uri, context: vscode.ExtensionContext, forcePicker = false): void {
  // When forcePicker is set (e.g. after disconnect) always show the host picker — never auto-route.
  if (forcePicker) {
    HomePanel.createOrShow(extensionUri, true);
    return;
  }

  // 1. If this window already has a binding, honour it.
  const binding = context.workspaceState.get<WindowHostBinding>(WINDOW_HOST_KEY);
  if (binding?.type === 'local') {
    void vscode.commands.executeCommand('openclaw.host.setup.local');
    return;
  }
  if (binding?.type === 'docker') {
    void vscode.commands.executeCommand('openclaw.host.setup.docker');
    return;
  }

  // 2. No binding — detect installed hosts and route.
  const isLocalInstalled = fs.existsSync(
    path.join(os.homedir(), '.openclaw', 'openclaw.json')
  );

  let isDockerRunning = false;
  try {
    const result = cp.spawnSync(
      'docker',
      ['ps', '--filter', 'name=^/occ-openclaw$', '--format', '{{.Status}}'],
      { timeout: 3000, windowsHide: true },
    );
    const st = (result.stdout?.toString() ?? '').trim();
    isDockerRunning = st.length > 0 && st.toLowerCase().startsWith('up');
  } catch { /* docker not available */ }

  if (isLocalInstalled && isDockerRunning) {
    HomePanel.createOrShow(extensionUri);          // hosts overview — user picks
  } else if (isLocalInstalled) {
    void vscode.commands.executeCommand('openclaw.host.setup.local');
  } else if (isDockerRunning) {
    void vscode.commands.executeCommand('openclaw.host.setup.docker');
  } else {
    HomePanel.createOrShow(extensionUri);          // install wizard
  }
}

/** Returns true if the OpenClaw web server is reachable. */
function isWebServerReachable(portOverride?: number): Promise<boolean> {
  const port = portOverride ?? getConfiguredGatewayPort();
  const url = `http://localhost:${port}/`;
  return new Promise(resolve => {
    const req = http.get(url, { timeout: 3000 }, res => {
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
  // Bumped to V8 — also disables debug-auto-launch and merge-conflict.
  const APPLIED_KEY = 'activityBarHiddenConfiguredV8';
  if (context.globalState.get<boolean>(APPLIED_KEY, false)) {
    return;
  }

  try {
    const config = vscode.workspace.getConfiguration();

    // Disable git entirely — users don't need it and it causes the SCM button
    // to reappear even after hiding it via pinnedViewContainers.
    await config.update('git.enabled', false, vscode.ConfigurationTarget.Global);
    await config.update('git.decorations.enabled', false, vscode.ConfigurationTarget.Global);

    // Disable built-in extensions that are missing compiled output in this fork
    // and throw "Cannot find module" activation errors in the notification area.
    for (const ext of [
      'vscode.git-base', 'vscode.git', 'vscode.github',
      'vscode.typescript-language-features', 'vscode.emmet',
      'vscode.debug-auto-launch', 'vscode.merge-conflict',
    ]) {
      try {
        await vscode.commands.executeCommand('workbench.extensions.disableExtension', ext);
      } catch { /* non-fatal */ }
    }

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

async function openOpenClawFolder(context?: vscode.ExtensionContext): Promise<void> {
  // Ensure ~/.occ exists — OCcode's internal state directory.
  const occPath = path.join(os.homedir(), '.occ');
  if (!fs.existsSync(occPath)) {
    fs.mkdirSync(occPath, { recursive: true });
  }

  // Only open the workspace if OpenClaw is already installed.
  const openclawPath = path.join(os.homedir(), '.openclaw');
  if (!fs.existsSync(openclawPath)) {
    // OpenClaw not installed — clean up any stale workspace file so VS Code
    // doesn't keep opening the workspace with a missing folder on next restart.
    const staleWorkspaceFile = path.join(occPath, WORKSPACE_FILENAME);
    try { if (fs.existsSync(staleWorkspaceFile)) { fs.unlinkSync(staleWorkspaceFile); } } catch { /* non-fatal */ }
    return;
  }

  // Workspace file lives in ~/.occ, points at ~/.openclaw as the folder.
  const workspaceFilePath = path.join(occPath, WORKSPACE_FILENAME);
  let needsWrite = !fs.existsSync(workspaceFilePath);
  if (!needsWrite) {
    try {
      const parsed = JSON.parse(fs.readFileSync(workspaceFilePath, 'utf-8'));
      if (!Array.isArray(parsed?.folders) || parsed.folders.length === 0) {
        needsWrite = true;
      }
    } catch {
      needsWrite = true;
    }
  }
  if (needsWrite) {
    fs.writeFileSync(
      workspaceFilePath,
      JSON.stringify(
        {
          folders: [{ path: openclawPath }],
          settings: {
            'files.exclude': { '*.code-workspace': true },
            'workbench.sideBar.visible': false,
          },
        },
        null,
        '\t',
      ),
    );
  }

  // If we're already inside this workspace, nothing more to do — except ensure
  // the workspace folder reflects the current host (not a stale Docker folder).
  const workspaceFileUri = vscode.Uri.file(workspaceFilePath);
  if (vscode.workspace.workspaceFile?.fsPath === workspaceFileUri.fsPath) {
    const binding = context?.workspaceState.get<{ type: string }>(WINDOW_HOST_KEY);
    if (binding?.type !== 'docker') {
      // Not bound to Docker — ensure ~/.openclaw is shown, not occ-state-dir.
      setActiveOpenClawWorkspaceFolder(openclawPath);
    }
    return;
  }

  // Open the workspace — reloads the window once, then VS Code remembers it.
  await vscode.commands.executeCommand('vscode.openFolder', workspaceFileUri);
}


// ── Inference balance status bar ──────────────────────────────────────────────
const BACKEND_BALANCE_KEY = 'occBackendBalanceV1'; // cached backend balance — persists across restarts
const OCC_JWT_KEY = 'occJwtV1'; // JWT stored in SecretStorage (OS keychain) — encrypted at rest

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
    // Keep popover in sync with the footer at the same cadence (250ms countdown + animation ticks)
    try { HomePanel.currentPanel?.postBalanceUpdate(value); } catch { /* non-fatal */ }
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
      let jwt = (await context.secrets.get(OCC_JWT_KEY)) ?? '';
      if (!jwt) {
        try {
          const legacyJwt = await vscode.commands.executeCommand<string>('occ.auth.getLegacyJwt');
          if (legacyJwt) {
            jwt = legacyJwt;
            await context.secrets.store(OCC_JWT_KEY, jwt);
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
        const data = await r.json() as { balance_usd: number; email?: string; picture?: string | null; api_keys?: { moltpilotKey?: string; occKey?: string } | null };
        const newBalance = Number(data.balance_usd) || 0;
        const moltpilotKey = data.api_keys?.moltpilotKey ?? '';
        // Guard: only sync back if the JWT wasn't cleared while the fetch was in-flight.
        // Without this check, an in-flight poll completing after sign-out would re-log the user in.
        const currentJwt = (await context.secrets.get(OCC_JWT_KEY)) ?? '';
        if (currentJwt !== jwt) { return; }
        // Sync JWT + keys to renderer settings so ocFreeModel works
        vscode.commands.executeCommand('occ.auth.setLegacyJwt', jwt);
        vscode.commands.executeCommand('occ.auth.setMoltpilotKey', moltpilotKey);
        // Cache user profile for the accounts button avatar
        vscode.commands.executeCommand('occ.auth.setUserInfo', data.email ?? '', data.picture ?? '');
        updateBurnRate(newBalance);
        const prev = displayedBalance ?? newBalance;
        backendBalance = newBalance;
        void context.globalState.update(BACKEND_BALANCE_KEY, newBalance);
        animateTo(prev, newBalance);
        // Self-healing: restart the poll timer after every successful fetch so the
        // interval resets cleanly and polling survives network blips or missed starts.
        startBackendPolling();

        // Report OS platform to backend once per install so the admin dashboard has reliable data.
        const OS_REPORTED_KEY = 'occ.osPlatformReported';
        if (!context.globalState.get<boolean>(OS_REPORTED_KEY)) {
          const platformMap: Record<string, string> = { darwin: 'macOS', win32: 'Windows', linux: 'Linux' };
          const osPlatform = platformMap[process.platform] || process.platform;
          fetch('https://occ.mba.sh/api/v1/me/platform', {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ os_platform: osPlatform }),
          }).then(resp => {
            if (resp.ok) { void context.globalState.update(OS_REPORTED_KEY, true); }
          }).catch(() => { /* will retry next poll cycle */ });
        }
      } else if (r.status === 401) {
        // JWT expired or invalid — clear it, clear moltpilot key, and hide bar
        void context.secrets.delete(OCC_JWT_KEY);
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
      if (token) { await context.secrets.store(OCC_JWT_KEY, token); } else { await context.secrets.delete(OCC_JWT_KEY); }
      // Stop polling immediately on sign-out so no more in-flight fetches can re-set the JWT
      if (!token && backendPollTimer) {
        clearInterval(backendPollTimer);
        backendPollTimer = undefined;
      }
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
      let jwt = (await context.secrets.get(OCC_JWT_KEY)) ?? '';
      log(`[1] JWT in SecretStorage (occJwtV1): ${jwt ? 'OK present [redacted]' : 'MISSING'}`);
      // Check what the renderer has for occLegacyJwt — this is what voidSettingsService reads
      try {
        const legacyJwt = await vscode.commands.executeCommand<string>('occ.auth.getLegacyJwt');
        log(`    occLegacyJwt in renderer settings: ${legacyJwt ? 'OK present [redacted]' : 'MISSING <-- this causes MoltPilot to use shared key!'}`);
        if (!jwt && legacyJwt) { jwt = legacyJwt; await context.secrets.store(OCC_JWT_KEY, jwt); }
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
            log(`    MoltpilotKey: ${moltpilotKey ? 'OK [redacted]' : 'MISSING'}`);
            log(`    OccKey:       ${occKey ? 'OK [redacted]' : 'MISSING'}`);
          } else {
            log(`    HTTP ${r.status} -- JWT may be expired`);
          }
        } catch (e) { log(`    Network error: ${e}`); }

        const inferenceTest = async (label: string, key: string): Promise<void> => {
          log(`\n[${label}] Inference test with ${label} (model: occ-legacy)...`);
          try {
            const resp = await fetch('https://occ.mba.sh/v1/chat/completions', {
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

async function ensureLinuxProtocolHandler(context: vscode.ExtensionContext): Promise<void> {
  try {
    if (process.platform !== 'linux') return;

    const HANDLER_KEY = 'occ.linuxProtocolHandlerRegisteredFor';
    const appRoot = vscode.env.appRoot;

    // Dev mode: launch via shell script so the full dev environment is set up correctly.
    // Production: invoke the binary directly.
    const devLauncher = path.resolve(appRoot, '../../launch-editor.sh');
    const execPath = process.env['VSCODE_DEV'] && fs.existsSync(devLauncher)
      ? devLauncher
      : process.execPath;

    const stored = context.globalState.get<string>(HANDLER_KEY, '');
    if (stored === execPath) return; // already registered for this executable

    const product = JSON.parse(
      fs.readFileSync(path.join(appRoot, 'product.json'), 'utf-8')
    ) as { applicationName: string; urlProtocol: string; nameLong: string; linuxIconName: string; linuxDescription: string };

    // 1. Write ~/.local/share/applications/occ-url-handler.desktop
    const appsDir = path.join(os.homedir(), '.local', 'share', 'applications');
    fs.mkdirSync(appsDir, { recursive: true });

    const desktopContent = [
      '[Desktop Entry]',
      `Name=${product.nameLong} - URL Handler`,
      `Comment=${product.linuxDescription}`,
      'GenericName=Text Editor',
      `Exec="${execPath}" --open-url %U`,
      `Icon=${product.linuxIconName}`,
      'Type=Application',
      'NoDisplay=true',
      'StartupNotify=true',
      'Categories=Utility;TextEditor;Development;IDE;',
      `MimeType=x-scheme-handler/${product.urlProtocol};`,
      'Keywords=vscode;',
      '',
    ].join('\n');

    fs.writeFileSync(
      path.join(appsDir, `${product.applicationName}-url-handler.desktop`),
      desktopContent, 'utf-8'
    );

    // 2. Update ~/.config/mimeapps.list
    const mimeappsPath = path.join(os.homedir(), '.config', 'mimeapps.list');
    const mimeEntry = `x-scheme-handler/${product.urlProtocol}=${product.applicationName}-url-handler.desktop`;

    let mimeContent = '';
    try { mimeContent = fs.readFileSync(mimeappsPath, 'utf-8'); } catch { /* new file */ }

    function ensureMimeSection(content: string, section: string, entry: string): string {
      const header = `[${section}]`;
      const keyPrefix = entry.split('=')[0] + '=';
      if (!content.includes(header)) {
        return content + (content.endsWith('\n') || content === '' ? '' : '\n') + `${header}\n${entry}\n`;
      }
      const lines = content.split('\n');
      const secIdx = lines.findIndex(l => l.trim() === header);
      for (let i = secIdx + 1; i < lines.length; i++) {
        if (lines[i].startsWith('[')) { lines.splice(secIdx + 1, 0, entry); return lines.join('\n'); }
        if (lines[i].startsWith(keyPrefix)) { lines[i] = entry; return lines.join('\n'); }
      }
      lines.splice(secIdx + 1, 0, entry);
      return lines.join('\n');
    }

    mimeContent = ensureMimeSection(mimeContent, 'Default Applications', mimeEntry);
    mimeContent = ensureMimeSection(mimeContent, 'Added Associations', mimeEntry);
    fs.mkdirSync(path.dirname(mimeappsPath), { recursive: true });
    fs.writeFileSync(mimeappsPath, mimeContent, 'utf-8');

    // 3. Refresh desktop database (fire-and-forget, silently ignored if not available)
    cp.spawn('update-desktop-database', [appsDir], { stdio: 'ignore', detached: true }).unref();

    // 4. Persist so we skip on next launch
    await context.globalState.update(HANDLER_KEY, execPath);
  } catch {
    // Silent failure — non-critical
  }
}

export async function activate(context: vscode.ExtensionContext): Promise<OpenClawCoreAPI> {
  // ── One-time migration: move JWT from globalState → SecretStorage ────────────
  const legacyJwt = context.globalState.get<string>(OCC_JWT_KEY, '');
  if (legacyJwt) {
    await context.secrets.store(OCC_JWT_KEY, legacyJwt);
    await context.globalState.update(OCC_JWT_KEY, undefined);
  }

  // ── Linux dev: auto-register occode:// protocol handler ──────────────────────
  void ensureLinuxProtocolHandler(context);

  // ── MultiHost: HostRegistry + HostManager ───────────────────────────────────
  const hostRegistry = new HostRegistry();
  await hostRegistry.init();
  const hostManager = new HostManager(hostRegistry);
  context.subscriptions.push(hostRegistry, hostManager);

  // (OPENCLAW HOSTS tree view and status bar removed — window-level binding used instead)

  // Host management commands
  context.subscriptions.push(
    vscode.commands.registerCommand('openclaw.pickHost', async () => {
      const id = await hostManager.showHostPicker();
      if (id) { await hostManager.setActiveHost(id); }
    }),
    vscode.commands.registerCommand('openclaw.setActiveHost', async (id: string) => {
      await hostManager.setActiveHost(id);
    }),
    vscode.commands.registerCommand('openclaw.refreshHost', async () => {
      const activeId = hostRegistry.getActiveHostId();
      await hostManager.refreshHost(activeId);
    }),
  );

  // Inference balance bar (shown at bottom-right, tracks $1.00 free budget).
  const spendBalance = initBalanceBar(context);

  // Apply hidden activity bar items on first activation on this machine.
  await hideActivityBarItems(context);

  // Open ~/.openclaw as "My OpenClaw Workspace" (may reload the window once).
  await openOpenClawFolder(context);

  // Close the Explorer sidebar on startup — the user opens it explicitly when needed.
  // Use a short delay so the workbench has finished restoring its layout first.
  setTimeout(() => {
    vscode.commands.executeCommand('workbench.action.closeSidebar');
  }, 500);

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
            // Store JWT in SecretStorage (OS keychain) — encrypted at rest.
            void context.secrets.store(OCC_JWT_KEY, token).then(() => {
              // Also sync to renderer settings service (for chat / other renderer consumers).
              vscode.commands.executeCommand('occ.auth.setLegacyJwt', token);
            });
          }
        }
      },
    }),
  );

  registerWindowHostCommands(context);

  context.subscriptions.push(
    vscode.commands.registerCommand('openclaw.home', () => {
      routeHome(context.extensionUri, context);
    }),
    // Always shows the host picker regardless of what is installed — used after disconnect.
    vscode.commands.registerCommand('openclaw.home.picker', () => {
      routeHome(context.extensionUri, context, true);
    }),
    // Host-specific setup commands — invoked by routeHome() and the host picker in HomePanel.
    // Each sets the window binding for this host type then opens the home panel,
    // which renders the appropriate dashboard or setup wizard based on the binding.
    vscode.commands.registerCommand('openclaw.host.setup.local', async () => {
      const existing = context.workspaceState.get<WindowHostBinding>(WINDOW_HOST_KEY);
      if (!existing || existing.type !== 'local') {
        await context.workspaceState.update(WINDOW_HOST_KEY, {
          type: 'local', hostId: 'local:main', port: getConfiguredGatewayPort(), label: 'Local',
        } satisfies WindowHostBinding);
      }
      HomePanel.createOrShow(context.extensionUri);
    }),
    vscode.commands.registerCommand('openclaw.host.setup.docker', async () => {
      const existing = context.workspaceState.get<WindowHostBinding>(WINDOW_HOST_KEY);
      if (!existing || existing.type !== 'docker') {
        await context.workspaceState.update(WINDOW_HOST_KEY, {
          type: 'docker', hostId: 'docker:occ-openclaw', port: DEFAULT_GATEWAY_PORT, label: 'Docker',
        } satisfies WindowHostBinding);
      }
      HomePanel.createOrShow(context.extensionUri);
    }),
    vscode.commands.registerCommand('openclaw.host.setup.ssh', () => {
      // SSH host details are entered via the home panel UI — open it and let the panel drive.
      HomePanel.createOrShow(context.extensionUri);
    }),
    vscode.commands.registerCommand('openclaw.configure', async () => {
      const windowHostBinding = context.workspaceState.get<WindowHostBinding>(WINDOW_HOST_KEY);

      // ── Docker path ───────────────────────────────────────────────────────
      if (windowHostBinding?.type === 'docker') {
        const container = windowHostBinding.hostId.replace(/^docker:/, '') || 'occ-openclaw';
        const hostPort = windowHostBinding.port; // e.g. 18790
        const containerPort = 18789;

        // 1. Start the gateway inside the container (detached — safe if already running)
        cp.spawn('docker', ['exec', '-d', container, 'openclaw', 'gateway', 'run'], {
          windowsHide: true,
          detached: true,
        }).unref();

        // 2. Give it a moment to start, then get the tokenized dashboard URL
        await new Promise<void>(r => setTimeout(r, 2000));

        const dashResult = cp.spawnSync(
          'docker',
          ['exec', container, 'openclaw', 'dashboard', '--no-open'],
          { timeout: 10000, windowsHide: true, encoding: 'utf-8' },
        );
        let rawUrl = (dashResult.stdout as string ?? '').trim();

        if (rawUrl) {
          // Rewrite the internal container port to the host-mapped port
          const url = rawUrl
            .replace(new RegExp(`localhost:${containerPort}`, 'g'), `localhost:${hostPort}`)
            .replace(new RegExp(`127\\.0\\.0\\.1:${containerPort}`, 'g'), `127.0.0.1:${hostPort}`);
          await vscode.env.openExternal(vscode.Uri.parse(url));
        } else {
          // dashboard command failed — open plain URL as fallback
          await vscode.env.openExternal(vscode.Uri.parse(`http://localhost:${hostPort}/`));
        }
        return;
      }

      // ── Local / SSH path ──────────────────────────────────────────────────
      const effectivePort = windowHostBinding ? windowHostBinding.port : getConfiguredGatewayPort();
      const reachable = await isWebServerReachable(effectivePort);
      if (reachable) {
        const url = getDashboardUrl()?.url ?? `http://localhost:${effectivePort}/`;
        await vscode.env.openExternal(vscode.Uri.parse(url));
      } else {
        const configUrl = `http://localhost:${effectivePort}/`;
        const message =
          `The OpenClaw web configuration server is not running at ${configUrl}.\n\n` +
          `Please start it now by running the OpenClaw gateway in the terminal:\n` +
          `\`\`\`\nopenclaw gateway start\n\`\`\`\n\n` +
          `Once it is running, the configuration UI will open at ${configUrl} in your browser.`;
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
      // Delegate to LocalSetupPanel via the host setup command
      void vscode.commands.executeCommand('openclaw.host.setup.local');
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

  // ── openclaw.runWithSudo — secure sudo tool for MoltPilot ──────────────────
  // Shows a native password dialog (no terminal prompt), pipes to sudo -S.
  // Called by the run_with_sudo builtin tool in toolsService.ts.
  context.subscriptions.push(
    vscode.commands.registerCommand('openclaw.runWithSudo', async (command: string, reason: string): Promise<{ result: string; exitCode: number }> => {
      const password = await vscode.window.showInputBox({
        password: true,
        prompt: `MoltPilot needs elevated access — ${reason}`,
        placeHolder: 'Enter your system password',
        ignoreFocusOut: true,
      });
      if (!password) return { result: 'User cancelled the password prompt.', exitCode: 1 };

      return new Promise(resolve => {
        const child = cp.spawn('sudo', ['-S', 'bash', '-c', command], {
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        child.stdin?.write(password + '\n');
        child.stdin?.end();
        let out = '';
        child.stdout?.on('data', (d: Buffer) => { out += d.toString(); });
        child.stderr?.on('data', (d: Buffer) => { out += d.toString(); });
        child.on('close', (code: number) => resolve({ result: out.trim() || '(no output)', exitCode: code ?? 1 }));
        child.on('error', (err: Error) => resolve({ result: err.message, exitCode: 1 }));
      });
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
      hostType: 'local' | 'docker' | 'ssh' | null;
      containerName: string | null;
      gatewayPort: number;
    }> => {
      // Resolve window-level host binding first
      const windowHost = context.workspaceState.get<WindowHostBinding>(WINDOW_HOST_KEY) ?? null;
      const homedir = os.homedir();
      const configPath = path.join(homedir, '.openclaw', 'openclaw.json');
      const installed = fs.existsSync(configPath);

      let config: Record<string, unknown> = {};
      if (installed) {
        try { config = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch {}
      }

      // Determine gateway port — for Docker/SSH hosts use the window binding's port directly
      const port = (() => {
        if (windowHost?.type === 'docker' || windowHost?.type === 'ssh') {
          return windowHost.port;
        }
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

      const hostType = windowHost?.type ?? 'local';
      const containerName = (windowHost?.type === 'docker' || windowHost?.type === 'ssh')
        ? (windowHost.hostId ?? null)
        : null;

      return { installed, gatewayRunning, hasAgents, agentNames, hasAiModel, hasChannels, channelNames, hostType, containerName, gatewayPort: port };
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
    routeHome(context.extensionUri, context);
  }, 500);

  // Return OpenClawCoreAPI so adapter extensions can register their adapters.
  return hostManager;
}

export function deactivate() {
  stopConfigProxy();
}
