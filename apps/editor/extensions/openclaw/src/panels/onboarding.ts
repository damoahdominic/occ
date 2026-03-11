import * as vscode from 'vscode';

/**
 * First-run onboarding panel.
 * Shows once on first launch — choose AI preference + theme.
 * Completely separate from OCC Home.
 * After completion it marks occ.onboardingDone = true and opens OCC Home.
 */
export class OnboardingPanel {
  private static _panel: vscode.WebviewPanel | undefined;
  private static readonly ONBOARDING_DONE_KEY = 'occ.onboardingDone';
  private static readonly AI_PREFERENCE_KEY = 'occ.aiPreference';

  /** Show onboarding if it hasn't been completed yet. Returns true if shown. */
  public static showIfNeeded(
    context: vscode.ExtensionContext,
    extensionUri: vscode.Uri,
  ): boolean {
    const done = context.globalState.get<boolean>(OnboardingPanel.ONBOARDING_DONE_KEY) ?? false;
    if (done) { return false; }
    OnboardingPanel._show(context, extensionUri);
    return true;
  }

  /** Force-show (e.g. from a "Redo onboarding" command). */
  public static show(context: vscode.ExtensionContext, extensionUri: vscode.Uri): void {
    OnboardingPanel._show(context, extensionUri);
  }

  private static _show(context: vscode.ExtensionContext, extensionUri: vscode.Uri): void {
    if (OnboardingPanel._panel) {
      OnboardingPanel._panel.reveal();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'occOnboarding',
      'Welcome to OCC',
      vscode.ViewColumn.One,
      { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')] },
    );
    OnboardingPanel._panel = panel;

    const iconUri = panel.webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, 'media', 'icon.png'),
    );
    panel.webview.html = OnboardingPanel._getHtml(iconUri.toString());

    panel.webview.onDidReceiveMessage(async msg => {
      if (msg.command === 'setTheme') {
        await vscode.workspace.getConfiguration('workbench').update(
          'colorTheme', msg.theme as string, vscode.ConfigurationTarget.Global,
        );
      } else if (msg.command === 'occOnboarding') {
        const aiPreference = msg.aiPreference as string | undefined;
        if (aiPreference) {
          await context.globalState.update(OnboardingPanel.AI_PREFERENCE_KEY, aiPreference);
        }
        await context.globalState.update(OnboardingPanel.ONBOARDING_DONE_KEY, true);
        panel.dispose();
        // Open OCC Home after a short delay so the panel close animation finishes.
        setTimeout(() => {
          vscode.commands.executeCommand('openclaw.home');
        }, 200);
      }
    });

    panel.onDidDispose(() => { OnboardingPanel._panel = undefined; });
  }

  private static _getHtml(iconUri: string): string {
    const providers = [
      { id: 'anthropic',  label: 'Anthropic Claude', hint: 'console.anthropic.com/settings/keys', placeholder: 'sk-ant-...' },
      { id: 'openai',     label: 'OpenAI',           hint: 'platform.openai.com/api-keys',        placeholder: 'sk-...' },
      { id: 'openrouter', label: 'OpenRouter',       hint: 'openrouter.ai/settings/keys',         placeholder: 'sk-or-...' },
      { id: 'gemini',     label: 'Google Gemini',    hint: 'aistudio.google.com/apikey',          placeholder: 'AIza...' },
    ];

    const providerCards = providers.map(p =>
      `<button class="prov-card" data-id="${p.id}" onclick="pickProvider(this)">
        <span class="prov-label">${p.label}</span>
        <span class="prov-hint">${p.hint}</span>
      </button>`,
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
      min-height: 100vh; padding: 32px 20px; text-align: center;
    }
    .logo { width: 72px; height: 72px; margin-bottom: 16px; filter: drop-shadow(0 4px 12px rgba(220,40,40,0.35)); }
    h1 { font-size: 24px; font-weight: 700; color: #fff; margin-bottom: 4px; }
    h1 .accent { color: #dc2828; }
    .subtitle { color: #888; font-size: 13px; margin-bottom: 36px; }
    .step { width: min(540px, 96vw); }
    h2 { font-size: 17px; font-weight: 600; color: #fff; margin-bottom: 8px; }
    .step-desc { font-size: 12px; color: #888; margin-bottom: 24px; line-height: 1.6; }
    .step-label { font-size: 11px; color: #555; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 12px; }

    /* AI choice cards */
    .tier-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 8px; }
    .tier-card {
      background: rgba(255,255,255,0.03); border: 1px solid #2b2b2b;
      border-radius: 10px; padding: 18px 16px 16px;
      text-align: left; display: flex; flex-direction: column;
      transition: border-color 0.15s, background 0.15s;
    }
    .tier-card:hover { border-color: #444; background: rgba(255,255,255,0.05); }
    .tier-card.free-card { border-color: #2a3d2a; }
    .tier-card.free-card:hover { border-color: #3d6b3d; background: rgba(40,160,80,0.06); }
    .tier-price { font-size: 22px; font-weight: 800; color: #fff; margin-bottom: 3px; }
    .tier-price .tier-unit { font-size: 12px; font-weight: 400; color: #777; }
    .tier-sub { font-size: 11px; color: #555; margin-bottom: 14px; line-height: 1.5; flex: 1; }
    .provider-logos { display: flex; gap: 8px; align-items: center; margin-bottom: 14px; flex-wrap: wrap; }
    .prov-icon {
      width: 28px; height: 28px; border-radius: 6px;
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    .tier-cta {
      padding: 8px 14px; border-radius: 7px;
      font-size: 12px; font-weight: 600; border: none; cursor: pointer; width: 100%;
    }
    .tier-cta.green { background: #16a34a; color: #fff; }
    .tier-cta.green:hover { background: #15803d; }
    .tier-cta.red { background: #dc2828; color: #fff; }
    .tier-cta.red:hover { background: #b91c1c; }

    /* BYOK provider cards */
    .prov-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 24px; }
    .prov-card {
      background: rgba(255,255,255,0.03); border: 1px solid #2b2b2b;
      border-radius: 8px; padding: 14px 12px; cursor: pointer;
      text-align: left; display: flex; flex-direction: column; gap: 4px;
      transition: border-color 0.15s, background 0.15s;
    }
    .prov-card:hover { border-color: #444; background: rgba(255,255,255,0.05); }
    .prov-card.selected { border-color: #dc2828; background: rgba(220,40,40,0.08); }
    .prov-label { font-size: 13px; font-weight: 600; color: #e0e0e0; }
    .prov-hint { font-size: 11px; color: #666; }

    /* Theme cards */
    .theme-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 8px; }
    .theme-card {
      background: transparent; border: 2px solid #2b2b2b; border-radius: 10px;
      padding: 14px 14px 12px; cursor: pointer; text-align: left;
      display: flex; flex-direction: column; gap: 8px;
      transition: border-color 0.15s, background 0.15s;
    }
    .theme-card:hover { border-color: #dc2828; background: rgba(220,40,40,0.05); }
    .theme-preview {
      width: 100%; aspect-ratio: 16/10; border-radius: 6px; overflow: hidden;
      display: flex; flex-direction: column; border: 1px solid rgba(255,255,255,0.06);
    }
    .dark-preview { background: #1a1a1a; }
    .light-preview { background: #f5f5f5; border-color: rgba(0,0,0,0.1); }
    .tp-titlebar { height: 14%; background: #dc2828; flex-shrink: 0; }
    .tp-body { flex: 1; display: flex; overflow: hidden; }
    .tp-sidebar { width: 22%; background: rgba(255,255,255,0.04); border-right: 1px solid rgba(255,255,255,0.06); }
    .light-preview .tp-sidebar { background: #ebebeb; border-right-color: #e0e0e0; }
    .tp-editor { flex: 1; padding: 8% 10%; display: flex; flex-direction: column; gap: 6%; }
    .tp-line { height: 8%; border-radius: 2px; background: rgba(255,255,255,0.12); }
    .light-preview .tp-line { background: rgba(0,0,0,0.12); }
    .tp-line.accent { background: #dc2828; opacity: 0.7; }
    .tp-statusbar { height: 12%; background: #dc2828; flex-shrink: 0; }
    .theme-label { font-size: 13px; font-weight: 600; color: #e0e0e0; }
    .theme-sub { font-size: 11px; color: #555; }

    /* Buttons */
    .btn-row { display: flex; gap: 10px; justify-content: flex-end; margin-top: 4px; }
    .btn-back {
      background: transparent; border: 1px solid #333; color: #888;
      font-size: 13px; padding: 8px 18px; border-radius: 6px; cursor: pointer;
    }
    .btn-back:hover { background: rgba(255,255,255,0.05); }
    .btn-primary {
      background: #dc2828; border: none; color: #fff;
      font-size: 13px; font-weight: 600; padding: 8px 22px; border-radius: 6px; cursor: pointer;
    }
    .btn-primary:hover { background: #b91c1c; }
    .btn-primary:disabled { background: #7a1515; cursor: not-allowed; }
  </style>
</head>
<body>
  <img class="logo" src="${iconUri}" alt="OCC" />
  <h1>Welcome to <span class="accent">OCC</span></h1>
  <p class="subtitle">Let's get you set up in a few quick steps.</p>

  <!-- Step 0: Choose AI -->
  <div id="step0" class="step">
    <h2>Choose your AI</h2>
    <p class="step-desc">How do you want to power your AI assistant?</p>
    <div class="tier-grid">
      <!-- MoltPilot card -->
      <div class="tier-card free-card">
        <div class="tier-price">$5<span class="tier-unit"> free to start</span></div>
        <div class="tier-sub">MoltPilot's AI Brain, powered by MBA.sh.<br>Sign up required. No card needed.</div>
        <button class="tier-cta green" onclick="chooseMoltPilot()">Start Free →</button>
      </div>
      <!-- BYOK card -->
      <div class="tier-card">
        <div class="provider-logos">
          <div class="prov-icon" style="background:#c9b49a;color:#1a1008" title="Anthropic">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M13.827 3.279L20.75 20.5h-3.06l-1.523-4.01H7.833L6.31 20.5H3.25l6.923-17.221zm-.662 4.02l-2.43 6.4h4.86z"/></svg>
          </div>
          <div class="prov-icon" style="background:#fff;color:#000" title="OpenAI">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M22.28 9.28a5.998 5.998 0 0 0-.52-4.93 6.17 6.17 0 0 0-6.6-2.96A6.004 6.004 0 0 0 10.64 0a6.17 6.17 0 0 0-5.88 4.27 5.999 5.999 0 0 0-4 2.91 6.17 6.17 0 0 0 .76 7.22 6 6 0 0 0 .52 4.93 6.17 6.17 0 0 0 6.6 2.96 6 6 0 0 0 4.52 2.39 6.17 6.17 0 0 0 5.89-4.28 5.999 5.999 0 0 0 3.99-2.91 6.17 6.17 0 0 0-.76-7.21zm-9.28 12.98a4.57 4.57 0 0 1-2.93-1.06l.14-.08 4.87-2.81a.8.8 0 0 0 .4-.69v-6.87l2.06 1.19a.07.07 0 0 1 .04.06v5.69a4.6 4.6 0 0 1-4.58 4.57zm-9.87-4.2a4.57 4.57 0 0 1-.55-3.07l.15.09 4.86 2.81a.8.8 0 0 0 .79 0l5.94-3.43v2.38a.07.07 0 0 1-.03.06l-4.92 2.84a4.6 4.6 0 0 1-6.24-1.68zm-1.28-10.7a4.56 4.56 0 0 1 2.38-2l-.01.17v5.62a.8.8 0 0 0 .4.69l5.94 3.43-2.06 1.19a.07.07 0 0 1-.07 0L3.53 13.2a4.6 4.6 0 0 1-.68-6.84zm16.9 3.95l-5.94-3.43 2.06-1.19a.07.07 0 0 1 .07 0l4.92 2.84a4.59 4.59 0 0 1-.71 8.29v-5.79a.8.8 0 0 0-.4-.72zm2.05-3.08l-.15-.09-4.86-2.8a.8.8 0 0 0-.79 0L9.16 9.29V6.91a.07.07 0 0 1 .03-.06l4.92-2.84a4.59 4.59 0 0 1 6.84 4.76v.01zm-12.84 4.22L5.9 10.26a.07.07 0 0 1-.04-.06V4.51a4.59 4.59 0 0 1 7.53-3.52l-.14.08-4.87 2.81a.8.8 0 0 0-.4.69v6.87l-2.05-1.18zm1.11-2.41l2.65-1.53 2.65 1.53v3.05l-2.65 1.53-2.65-1.53V9.84z"/></svg>
          </div>
          <div class="prov-icon" style="background:#6366f1;color:#fff" title="OpenRouter">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="2"/><circle cx="6" cy="12" r="2"/><circle cx="18" cy="19" r="2"/><path d="M8 11.5l8-5M8 12.5l8 5"/></svg>
          </div>
          <div class="prov-icon" style="background:linear-gradient(135deg,#4285f4,#9b59b6);color:#fff" title="Google Gemini">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C9.91 6.55 6.55 9.91 2 12c4.55 2.09 7.91 5.45 10 10 2.09-4.55 5.45-7.91 10-10C17.45 9.91 14.09 6.55 12 2z"/></svg>
          </div>
        </div>
        <div class="tier-sub">Use your own API key. Always free. No account needed.</div>
        <button class="tier-cta red" onclick="chooseBYOK()">Use My Key →</button>
      </div>
    </div>
  </div>

  <!-- Step 1: BYOK — pick provider -->
  <div id="step1" class="step" style="display:none">
    <p class="step-label">Step 1 of 2</p>
    <h2>Choose your AI Provider</h2>
    <p class="step-desc">You can change this any time from OCC Settings.</p>
    <div class="prov-grid">
      ${providerCards}
    </div>
    <div class="btn-row">
      <button class="btn-back" onclick="show('step0','step1')">← Back</button>
      <button class="btn-primary" id="btn-next1" onclick="show('step2','step1')" disabled>Continue →</button>
    </div>
  </div>

  <!-- Step 2: BYOK — confirm (key entry happens later in OCC Home) -->
  <div id="step2" class="step" style="display:none">
    <p class="step-label">Step 2 of 2</p>
    <h2 id="step2-title">Great choice</h2>
    <p class="step-desc">
      Once OCC is ready you'll be prompted to enter your API key and connect
      your provider. You can also change this later at any time.
    </p>
    <div class="btn-row">
      <button class="btn-back" onclick="show('step1','step2')">← Back</button>
      <button class="btn-primary" onclick="showTheme('step2')">Continue →</button>
    </div>
  </div>

  <!-- Theme picker — both paths converge here -->
  <div id="step-theme" class="step" style="display:none">
    <h2>Choose your theme</h2>
    <p class="step-desc">Pick a look for OCC. You can change this any time in Settings.</p>
    <div class="theme-grid">
      <button class="theme-card" onclick="finish('OpenClaw Dark')">
        <div class="theme-preview dark-preview">
          <div class="tp-titlebar"></div>
          <div class="tp-body">
            <div class="tp-sidebar"></div>
            <div class="tp-editor">
              <div class="tp-line" style="width:60%"></div>
              <div class="tp-line accent" style="width:40%"></div>
              <div class="tp-line" style="width:75%"></div>
            </div>
          </div>
          <div class="tp-statusbar"></div>
        </div>
        <div class="theme-label">OCC Dark</div>
        <div class="theme-sub">Dark background · Red accents</div>
      </button>
      <button class="theme-card" onclick="finish('OpenClaw Light')">
        <div class="theme-preview light-preview">
          <div class="tp-titlebar"></div>
          <div class="tp-body">
            <div class="tp-sidebar"></div>
            <div class="tp-editor">
              <div class="tp-line" style="width:60%"></div>
              <div class="tp-line accent" style="width:40%"></div>
              <div class="tp-line" style="width:75%"></div>
            </div>
          </div>
          <div class="tp-statusbar"></div>
        </div>
        <div class="theme-label">OCC Light</div>
        <div class="theme-sub">Light background · Red accents</div>
      </button>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let aiPreference = null;
    let selectedProvider = null;

    function show(showId, hideId) {
      document.getElementById(hideId).style.display = 'none';
      document.getElementById(showId).style.display = '';
    }

    function chooseMoltPilot() {
      aiPreference = 'moltpilot';
      showTheme('step0');
    }

    function chooseBYOK() {
      show('step1', 'step0');
    }

    function pickProvider(btn) {
      document.querySelectorAll('.prov-card').forEach(c => c.classList.remove('selected'));
      btn.classList.add('selected');
      selectedProvider = btn.dataset.id;
      aiPreference = btn.dataset.id;
      document.getElementById('btn-next1').disabled = false;
      const title = btn.querySelector('.prov-label').textContent;
      document.getElementById('step2-title').textContent = title + ' — noted';
      show('step2', 'step1');
    }

    function showTheme(fromStep) {
      document.getElementById(fromStep).style.display = 'none';
      document.getElementById('step-theme').style.display = '';
    }

    function finish(theme) {
      vscode.postMessage({ command: 'setTheme', theme });
      vscode.postMessage({ command: 'occOnboarding', aiPreference });
    }
  </script>
</body>
</html>`;
  }
}
