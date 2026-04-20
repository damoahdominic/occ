import * as vscode from 'vscode';

/**
 * Auth Gate — the first node in the startup user flow (docs/plans/multihost/08-ui-design.md §0 Rule 1).
 *
 * Runs BEFORE gateway detection. If a JWT is present in SecretStorage, it resolves
 * immediately. If the JWT is absent, it opens a webview with "Sign In" and "Sign Up"
 * buttons and waits for either:
 *   - the deep-link URI handler to fire `authCompleted` (JWT just got stored), or
 *   - the user to close the panel (treated as a graceful cancel).
 *
 * The gate deliberately does NOT validate the JWT against /api/v1/me — that is the
 * balance bar's job (extension.ts:405-486), which already clears invalid tokens
 * server-side-401. Our gate only checks for presence.
 */

// ── Shared singletons ──────────────────────────────────────────────────────────

const OCC_JWT_KEY = 'occJwtV1'; // must match extension.ts:317
const SIGN_IN_URL = 'https://occ.mba.sh/login?ref=occ-editor';
const SIGN_UP_URL = 'https://occ.mba.sh/signup?ref=occ-editor';

/**
 * Fires when the deep-link URI handler in extension.ts stores a fresh JWT.
 * The auth gate subscribes to this so it can close its panel and continue.
 *
 * Exposed as a module-level singleton so extension.ts can `emit()` without
 * passing the emitter through activation arguments.
 */
const _authCompletedEmitter = new vscode.EventEmitter<void>();
export const onAuthCompleted: vscode.Event<void> = _authCompletedEmitter.event;

/** Called from the deep-link URI handler in extension.ts after the JWT is stored. */
export function notifyAuthCompleted(): void {
  _authCompletedEmitter.fire();
}

// ── JWT presence check (mirrors balance-bar fallback at extension.ts:411-420) ─

async function readStoredJwt(context: vscode.ExtensionContext): Promise<string> {
  let jwt = (await context.secrets.get(OCC_JWT_KEY)) ?? '';
  if (!jwt) {
    try {
      const legacyJwt = await vscode.commands.executeCommand<string>('occ.auth.getLegacyJwt');
      if (legacyJwt) {
        jwt = legacyJwt;
        await context.secrets.store(OCC_JWT_KEY, jwt);
      }
    } catch {
      // Renderer not ready — treat as no JWT; next activation or balance poll will retry.
    }
  }
  return jwt;
}

// ── Gate panel ────────────────────────────────────────────────────────────────

class AuthGatePanel {
  public static current: AuthGatePanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _disposables: vscode.Disposable[] = [];
  /** Resolved when the panel is disposed — either by auth success or user close. */
  public readonly closed: Promise<void>;
  private _resolveClosed!: () => void;

  private constructor(panel: vscode.WebviewPanel) {
    this._panel = panel;
    this.closed = new Promise<void>(resolve => { this._resolveClosed = resolve; });

    this._panel.webview.html = AuthGatePanel._renderHtml();

    this._panel.webview.onDidReceiveMessage(
      (msg: { type?: string }) => {
        if (msg?.type === 'signIn') {
          void vscode.env.openExternal(vscode.Uri.parse(SIGN_IN_URL));
        } else if (msg?.type === 'signUp') {
          void vscode.env.openExternal(vscode.Uri.parse(SIGN_UP_URL));
        }
      },
      null,
      this._disposables,
    );

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  public static show(): AuthGatePanel {
    if (AuthGatePanel.current) {
      AuthGatePanel.current._panel.reveal();
      return AuthGatePanel.current;
    }
    const panel = vscode.window.createWebviewPanel(
      'openclawAuthGate',
      'Sign in to OpenClaw',
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    AuthGatePanel.current = new AuthGatePanel(panel);
    return AuthGatePanel.current;
  }

  /** Close the panel programmatically — triggers onDidDispose, which resolves `closed`. */
  public closeProgrammatically(): void {
    try { this._panel.dispose(); } catch { /* already disposed */ }
  }

  public dispose(): void {
    AuthGatePanel.current = undefined;
    this._resolveClosed();
    this._disposables.forEach(d => { try { d.dispose(); } catch { /* non-fatal */ } });
  }

  // ── HTML ──────────────────────────────────────────────────────────────────

  private static _renderHtml(): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign in to OpenClaw</title>
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    html { font-size: 16px; }
    body {
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
      background: #1a1a1a;
      color: #e0e0e0;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: clamp(16px, 5vw, 48px) clamp(12px, 4vw, 32px);
      text-align: center;
    }
    h1 {
      font-size: clamp(18px, 4.5vw, 28px);
      font-weight: 700;
      margin-bottom: 8px;
      color: #fff;
    }
    h1 .accent { color: #dc2828; }
    .tagline {
      color: #aaa;
      font-size: clamp(12px, 2.5vw, 14px);
      margin-bottom: clamp(20px, 5vw, 32px);
      max-width: 44ch;
      line-height: 1.5;
    }
    .buttons {
      display: flex;
      flex-direction: column;
      gap: 12px;
      width: min(320px, 100%);
      margin-bottom: clamp(18px, 4vw, 28px);
    }
    button {
      font: inherit;
      padding: 12px 20px;
      border-radius: 6px;
      border: none;
      cursor: pointer;
      font-weight: 600;
      font-size: 14px;
      transition: filter 0.15s ease, transform 0.05s ease;
    }
    button:hover { filter: brightness(1.1); }
    button:active { transform: translateY(1px); }
    .primary {
      background: #dc2828;
      color: #fff;
    }
    .secondary {
      background: transparent;
      color: #e0e0e0;
      border: 1px solid #555;
    }
    .waiting {
      display: flex;
      align-items: center;
      gap: 10px;
      color: #888;
      font-size: 12px;
      letter-spacing: 0.02em;
    }
    .spinner {
      width: 14px;
      height: 14px;
      border: 2px solid rgba(220, 40, 40, 0.15);
      border-top-color: #dc2828;
      border-radius: 50%;
      animation: spin 0.75s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .hint {
      margin-top: 14px;
      color: #666;
      font-size: 11px;
      max-width: 44ch;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <h1>Sign in to <span class="accent">OpenClaw</span></h1>
  <p class="tagline">Authenticate first so OpenClaw can connect to your account. Your gateway will be detected right after.</p>

  <div class="buttons">
    <button class="primary" id="signInBtn" type="button">Sign In</button>
    <button class="secondary" id="signUpBtn" type="button">Sign Up</button>
  </div>

  <div class="waiting" role="status" aria-live="polite">
    <div class="spinner" aria-hidden="true"></div>
    <span>Waiting for sign-in...</span>
  </div>

  <p class="hint">Clicking a button opens your browser. After signing in, your browser will redirect back to the editor and this window will close automatically.</p>

  <script>
    (function () {
      const vscode = acquireVsCodeApi();
      document.getElementById('signInBtn').addEventListener('click', function () {
        vscode.postMessage({ type: 'signIn' });
      });
      document.getElementById('signUpBtn').addEventListener('click', function () {
        vscode.postMessage({ type: 'signUp' });
      });
    })();
  </script>
</body>
</html>`;
  }
}

// ── Public entrypoint ────────────────────────────────────────────────────────

/**
 * Initializes the auth gate. Resolves when the user is authenticated or has
 * dismissed the gate. Callers should run gateway detection only after this
 * resolves — even if the user cancelled, we unblock activation so the rest
 * of the extension (hosts, commands, etc.) stays usable.
 */
export async function initAuthGate(
  context: vscode.ExtensionContext,
  _extensionUri: vscode.Uri,
): Promise<void> {
  const jwt = await readStoredJwt(context);
  if (jwt) {
    // Already signed in — skip the gate entirely.
    return;
  }

  const gate = AuthGatePanel.show();

  // Race: either auth completes (deep-link fires) or the user closes the panel.
  let authSub: vscode.Disposable | undefined;
  const authPromise = new Promise<'auth'>(resolve => {
    authSub = onAuthCompleted(() => resolve('auth'));
  });
  const closedPromise = gate.closed.then(() => 'closed' as const);

  const outcome = await Promise.race([authPromise, closedPromise]);
  authSub?.dispose();

  if (outcome === 'auth') {
    // Auth succeeded — close the panel and continue. If it's already closed
    // this is a no-op.
    gate.closeProgrammatically();
    return;
  }

  // Panel closed before auth completed — log a graceful cancel. We still
  // resolve so activation isn't wedged forever; downstream code will render
  // the usual unauthenticated UI (balance bar hidden, etc.).
  console.info('[openclaw] Auth gate dismissed before sign-in completed.');
}
