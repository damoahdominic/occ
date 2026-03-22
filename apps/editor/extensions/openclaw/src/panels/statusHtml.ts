// Auto-extracted from home.ts _getHtml — pure function, no this. references.
// Shared by HomePanel and StatusPanelController.

export type OccUser = {
  email: string;
  picture: string | null;
  balance_usd: number;
  api_keys?: { moltpilotKey?: string; occKey?: string } | null;
};

export function renderStatusHtml(
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
    const buttonLabel = isInstalled ? 'Open Web Control' : 'Install OpenClaw';
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
    .app-wip-maintainer { font-size: 11px; color: #555; margin: 0 0 14px; line-height: 1.5; }
    .app-wip-maintainer a { color: #666; text-decoration: none; border-bottom: 1px solid #444; }
    .app-wip-maintainer a:hover { color: #999; border-bottom-color: #666; }
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
            { label: 'Chat',     emoji: 'speech-balloon_1f4ac.png',     maintainer: null },
            { label: 'Channels', emoji: 'satellite-antenna_1f4e1.png', maintainer: null },
            { label: 'Agents',   emoji: 'briefcase_1f4bc.png',         maintainer: null },
            { label: 'Models',   emoji: 'alembic_2697-fe0f.png',       maintainer: null },
            { label: 'Skills',   emoji: 'high-voltage_26a1.png',       maintainer: null },
            { label: 'Security', emoji: 'shield_1f6e1-fe0f.png',       maintainer: { name: 'Fletcher Frimpong', url: 'https://github.com/FletcherFrimpong' } },
            { label: 'Memory',   emoji: 'floppy-disk_1f4be.png',       maintainer: null },
            { label: 'Empire',   emoji: 'crown_1f451.png',             maintainer: null },
            { label: 'Social',   emoji: 'handshake_1f91d.png',         maintainer: null },
          ].map(app => {
            const mName = app.maintainer ? app.maintainer.name.replace(/'/g, '\\x27') : '';
            const mUrl  = app.maintainer ? app.maintainer.url.replace(/'/g, '\\x27')  : '';
            return `
          <div class="app-tile" onclick="showWipModal('${app.label}', '${emojiBaseUri}/${app.emoji}', '${mName}', '${mUrl}')">
            <div class="app-tile-icon"><img src="${emojiBaseUri}/${app.emoji}" alt="${app.label}" style="width:22px;height:22px;object-fit:contain;filter:grayscale(100%) brightness(0.75);pointer-events:none;" /></div>
            <span class="app-tile-label">${app.label}</span>
          </div>`;
          }).join('')}
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
      <p id="app-wip-maintainer" class="app-wip-maintainer"></p>
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
    <button id="btn-primary" class="btn-primary" onclick="cmd('openclaw.configure')">${icSettings}Open Web Control</button>
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
    function openMaintainerLink(el) {
      vscode.postMessage({ command: 'openUrl', url: el.dataset.url });
      return false;
    }
    function showWipModal(appName, emojiSrc, maintainerName, maintainerUrl) {
      const msg = 'I want to contribute to the ' + appName + ' app on OCC.';
      document.getElementById('app-wip-title').textContent = appName + ' — Coming Soon';
      document.getElementById('app-wip-copy-text').textContent = msg;
      const icon = document.getElementById('app-wip-icon');
      if (icon) { icon.src = emojiSrc; icon.alt = appName; }
      const el = document.getElementById('app-wip-maintainer');
      if (el) {
        if (maintainerName) {
          el.innerHTML = 'Maintained by <a href="#" data-url="' + maintainerUrl + '" onclick="return openMaintainerLink(this);">' + maintainerName + '</a>';
        } else {
          el.innerHTML = 'Interested in maintaining this app? <a href="#" data-url="mailto:team@mba.sh" onclick="return openMaintainerLink(this);">team@mba.sh</a>';
        }
      }
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
