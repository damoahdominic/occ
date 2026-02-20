import * as vscode from "vscode";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { resolveConfigPath, overrideConfigPath } from "./config-path";

type ChannelAccount = {
  id: string;
  title: string;
  status: "connected" | "needs-relink";
};

type ChannelSummary = {
  channel: string;
  description: string;
  accounts: ChannelAccount[];
};

type ControlCenterData = {
  agents: { id: string }[];
  channels: ChannelSummary[];
  automation: { cronJobs: { status: "enabled" | "paused" }[] };
  maintenance: { doctor: { status: "healthy" | "warning" | "error" } };
};

function sanitizeJson5(input: string) {
  return input
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/,\s*(\}|\])/g, "$1");
}

function readOpenClawConfig(configPath: string) {
  try {
    const contents = fs.readFileSync(configPath, "utf-8");
    return JSON.parse(sanitizeJson5(contents));
  } catch (error) {
    console.warn("OpenClaw Config: unable to read openclaw.json", error);
    return null;
  }
}

function readOpenClawConfigRaw(configPath: string) {
  try {
    return fs.readFileSync(configPath, "utf-8");
  } catch (error) {
    console.warn("OpenClaw Config: unable to read raw openclaw.json", error);
    return "";
  }
}

function buildControlCenterData(configPath: string): ControlCenterData {
  const resolvedPath =
    configPath || path.join(os.homedir(), ".openclaw", "openclaw.json");
  const rawConfig = readOpenClawConfig(resolvedPath);
  const agents = rawConfig?.agents?.list ?? [];
  const channelsConfig = rawConfig?.channels ?? {};

  const channels: ChannelSummary[] = Object.entries(channelsConfig).map(
    ([channelKey]: [string, any]) => ({
      channel: channelKey,
      description: `${channelKey} surface configuration`,
      accounts: [
        {
          id: `${channelKey}-primary`,
          title: `${channelKey} · Primary`,
          status: "connected",
        },
      ],
    })
  );

  if (channels.length === 0) {
    channels.push({
      channel: "whatsapp",
      description: "WhatsApp surface configuration",
      accounts: [
        {
          id: "whatsapp-primary",
          title: "WhatsApp · Primary",
          status: "needs-relink",
        },
      ],
    });
  }

  return {
    agents: agents.map((agent: any) => ({ id: agent.id ?? "agent" })),
    channels,
    automation: {
      cronJobs: rawConfig?.automation?.cronJobs ?? [],
    },
    maintenance: {
      doctor: {
        status: rawConfig?.doctor?.status ?? "warning",
      },
    },
  };
}

function getNonce() {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i += 1) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

export class ConfigPanel {
  public static currentPanel: ConfigPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  public static overrideConfigPath(p: string | undefined) {
    overrideConfigPath(p);
    if (ConfigPanel.currentPanel) {
      void ConfigPanel.currentPanel._update();
    }
  }

  public static createOrShow(extensionUri: vscode.Uri) {
    if (ConfigPanel.currentPanel) {
      ConfigPanel.currentPanel.dispose();
    }
    const panel = vscode.window.createWebviewPanel(
      "openclawConfigV2",
      "OpenClaw Configuration",
      vscode.ViewColumn.Two,
      {
        enableScripts: true,
        retainContextWhenHidden: false,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, "media")],
      }
    );
    ConfigPanel.currentPanel = new ConfigPanel(panel, extensionUri);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage((message) => {
      if (message?.command === "refresh") {
        void this._update();
        return;
      }
      if (message?.command === "openclaw.channelAdd") {
        this._openChannelInstallerTerminal();
        return;
      }
      if (message?.command === "openclaw.saveConfig") {
        const configPath = resolveConfigPath();
        const resolvedPath =
          configPath || path.join(os.homedir(), ".openclaw", "openclaw.json");
        try {
          fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
          fs.writeFileSync(resolvedPath, message?.text ?? "", "utf-8");
          this._panel.webview.postMessage({ command: "openclaw.saveResult", ok: true });
        } catch (error) {
          console.warn("OpenClaw Config: unable to write openclaw.json", error);
          this._panel.webview.postMessage({
            command: "openclaw.saveResult",
            ok: false,
            error: (error as Error)?.message ?? "Failed to save config",
          });
        }
        return;
      }
      if (message?.command === "openclaw.runCommand") {
        const input = String(message?.text ?? "").trim();
        if (!input) return;
        const terminal = vscode.window.createTerminal("openclaw command console");
        terminal.show();
        const command = input.startsWith("openclaw") ? input : `openclaw ${input}`;
        terminal.sendText(command, true);
      }
    });
    void this._update();
  }

  public dispose() {
    ConfigPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  private async _update() {
    const configPath = resolveConfigPath();
    const data = buildControlCenterData(configPath);
    const rawConfig = readOpenClawConfigRaw(
      configPath || path.join(os.homedir(), ".openclaw", "openclaw.json")
    );
    this._panel.webview.html = this._getHtml(data, rawConfig);
  }

  private _openChannelInstallerTerminal() {
    const terminal = vscode.window.createTerminal("openclaw channel installer");
    terminal.show();
    terminal.sendText("openclaw channels add", true);
  }

  private _getHtml(data: ControlCenterData, rawConfig: string) {
    const webview = this._panel.webview;
    const nonce = getNonce();
    const serialized = JSON.stringify(data).replace(/</g, "\\u003c");
    const serializedConfig = JSON.stringify(rawConfig || "").replace(/</g, "\\u003c");

    const agentCount = data.agents.length;
    const channelCount = data.channels.length;
    const connectedChannels = data.channels.filter((channel) =>
      channel.accounts.some((account) => account.status === "connected")
    ).length;
    const activeJobs = data.automation.cronJobs.filter((job) => job.status === "enabled").length;
    const doctorStatus = data.maintenance.doctor.status;

    const summaryChips = [
      {
        label: doctorStatus === "healthy" ? "System healthy" : "System needs attention",
        status: doctorStatus === "healthy" ? "good" : doctorStatus === "warning" ? "warn" : "bad",
      },
      {
        label: `${channelCount - connectedChannels} channels pending`,
        status: channelCount - connectedChannels > 0 ? "warn" : "good",
      },
      {
        label: `${agentCount} active agents`,
        status: "accent",
      },
    ];

    const channelCards = data.channels
      .map((channel, index) => {
        const connected = channel.accounts.some((account) => account.status === "connected");
        const needsReview = channel.accounts.some((account) => account.status === "needs-relink");
        const status = connected ? "Connected" : needsReview ? "Needs review" : "Not connected";
        const chipClass = connected ? "chip-good" : needsReview ? "chip-warn" : "chip-bad";
        const accountChips = channel.accounts
          .map((account) => `<span class="pill">${account.title}</span>`)
          .join("");

        return `
          <button class="channel-card ${index === 0 ? "active" : ""}" data-index="${index}">
            <div class="card-row">
              <div>
                <div class="card-title">${channel.channel}</div>
                <div class="card-sub">${channel.description}</div>
              </div>
              <div class="status-chip">
                <span class="dot ${chipClass}"></span>
                <span>${status}</span>
              </div>
            </div>
            <div class="pill-row">${accountChips}</div>
          </button>
        `;
      })
      .join("");

    const chipsHtml = summaryChips
      .map(
        (chip) => `
        <div class="summary-chip">
          <span class="dot ${chip.status === "good" ? "chip-good" : chip.status === "warn" ? "chip-warn" : chip.status === "accent" ? "chip-accent" : "chip-bad"}"></span>
          <span>${chip.label}</span>
        </div>
      `
      )
      .join("");

    const baseStyles = `
      :root {
        color-scheme: dark;
        --accent: #ef4444;
        --accent-hover: #dc2626;
        --bg: #0b0a0a;
        --bg-card: #151111;
        --bg-elevated: #1d1414;
        --border: #3a1f1f;
        --text: #f8f2f2;
        --text-muted: #b9a8a8;
        --chip-good: #22c55e;
        --chip-warn: #f59e0b;
        --chip-bad: #ef4444;
      }
      body {
        margin: 0;
        background: var(--bg);
        color: var(--text);
        font-family: var(--vscode-font-family, "Inter", system-ui, -apple-system, BlinkMacSystemFont, sans-serif);
      }
      * { box-sizing: border-box; }
      #app { min-height: 100vh; }
      .container { max-width: 1440px; margin: 0 auto; padding: 32px 24px; }
      .header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px; }
      .header-title { display: flex; align-items: center; gap: 12px; font-size: 20px; font-weight: 600; }
      .header-dot { height: 10px; width: 10px; border-radius: 999px; background: var(--accent); display: inline-block; }
      .header-pill { border-radius: 999px; background: var(--bg-card); padding: 8px 16px; font-size: 11px; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.06em; }
      .layout { margin-top: 24px; display: grid; gap: 24px; grid-template-columns: 240px minmax(0, 1.7fr) minmax(0, 1fr); }
      .panel { border-radius: 20px; background: var(--bg-card); padding: 20px; box-shadow: 0 20px 40px rgba(0,0,0,0.35); }
      .panel-soft { background: var(--bg-elevated); }
      .page-tabs { margin-top: 16px; display: flex; flex-wrap: wrap; gap: 8px; }
      .page-tab { border: none; cursor: pointer; border-radius: 999px; padding: 6px 12px; font-size: 11px; background: var(--bg-elevated); color: var(--text-muted); }
      .page-tab.active { background: var(--accent); color: #081018; }
      .nav-title { font-size: 11px; text-transform: uppercase; color: var(--text-muted); }
      .nav-item { padding: 10px 12px; border-radius: 12px; font-size: 14px; color: var(--text-muted); }
      .nav-item.active { background: var(--bg-elevated); color: var(--text); }
      .nav-list { margin-top: 12px; display: grid; gap: 8px; }
      .nav-foot { margin-top: 16px; border-radius: 12px; padding: 12px; background: var(--bg-elevated); font-size: 12px; color: var(--text-muted); }
      .channels-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
      .channels-head h1 { margin: 0; font-size: 24px; }
      .channels-head p { margin: 4px 0 0; font-size: 13px; color: var(--text-muted); }
      .btn-primary { border: none; cursor: pointer; background: var(--accent); color: #081018; padding: 10px 16px; border-radius: 10px; font-size: 12px; font-weight: 600; }
      .btn-secondary { border: 1px solid var(--border); background: transparent; color: var(--text-muted); padding: 6px 12px; border-radius: 10px; font-size: 11px; cursor: pointer; }
      .channel-list { margin-top: 20px; display: grid; gap: 12px; }
      .channel-card { width: 100%; text-align: left; border-radius: 18px; border: 1px solid var(--border); background: transparent; padding: 16px; color: inherit; cursor: pointer; transition: background 0.2s ease; }
      .channel-card.active { background: var(--bg-elevated); }
      .card-row { display: flex; justify-content: space-between; gap: 12px; align-items: center; }
      .card-title { font-size: 14px; font-weight: 600; text-transform: capitalize; }
      .card-sub { margin-top: 4px; font-size: 12px; color: var(--text-muted); }
      .status-chip { display: flex; align-items: center; gap: 8px; border-radius: 999px; background: var(--bg-elevated); padding: 6px 10px; font-size: 11px; color: var(--text); }
      .dot { width: 8px; height: 8px; border-radius: 999px; display: inline-block; }
      .chip-good { background: var(--chip-good); }
      .chip-warn { background: var(--chip-warn); }
      .chip-bad { background: var(--chip-bad); }
      .chip-accent { background: var(--accent); }
      .pill-row { margin-top: 12px; display: flex; flex-wrap: wrap; gap: 8px; font-size: 11px; color: var(--text-muted); }
      .pill { padding: 6px 10px; border-radius: 999px; background: var(--bg-card); }
      .steps { margin-top: 20px; border-radius: 18px; padding: 16px; background: var(--bg-elevated); }
      .steps-title { display: flex; align-items: center; justify-content: space-between; font-size: 14px; font-weight: 600; }
      .steps-meta { font-size: 11px; color: var(--text-muted); }
      .steps-list { margin-top: 12px; display: grid; gap: 8px; font-size: 12px; color: var(--text-muted); }
      .steps-item { padding: 8px 12px; border-radius: 12px; background: var(--bg-card); }
      .tabs { margin-top: 16px; display: flex; flex-wrap: wrap; gap: 8px; }
      .tab { border: none; cursor: pointer; border-radius: 999px; padding: 6px 12px; font-size: 11px; background: var(--bg-elevated); color: var(--text-muted); }
      .tab.active { background: var(--accent); color: #081018; }
      .detail-cards { margin-top: 16px; display: grid; gap: 12px; font-size: 12px; color: var(--text-muted); }
      .detail-card { border-radius: 14px; padding: 12px; background: var(--bg-elevated); }
      .detail-card h4 { margin: 0 0 6px; font-size: 13px; color: var(--text); }
      .detail-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .spacing-top { margin-top: 12px; }
      .summary-row { margin-top: 24px; display: flex; flex-wrap: wrap; gap: 8px; }
      .summary-chip { display: flex; align-items: center; gap: 8px; border-radius: 999px; background: var(--bg-elevated); padding: 8px 12px; font-size: 12px; }
      .hidden { display: none; }
      .config-area { margin-top: 16px; display: grid; gap: 12px; }
      .textarea { width: 100%; min-height: 360px; resize: vertical; border-radius: 12px; border: 1px solid var(--border); background: var(--bg-elevated); color: var(--text); padding: 12px; font-size: 12px; line-height: 1.5; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
      .status-line { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-size: 11px; color: var(--text-muted); }
      .status-pill { padding: 4px 8px; border-radius: 999px; background: var(--bg-elevated); }
      .status-pill.ok { color: #0f172a; background: #86efac; }
      .status-pill.err { color: #0f172a; background: #fda4af; }
      .console-box { margin-top: 16px; display: grid; gap: 12px; }
      .console-input { width: 100%; border-radius: 12px; border: 1px solid var(--border); background: var(--bg-elevated); color: var(--text); padding: 10px 12px; font-size: 12px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
      .pill-row.commands { margin-top: 8px; }
      .pill.button { border: none; cursor: pointer; }
      @media (max-width: 1100px) {
        .layout { grid-template-columns: 1fr; }
      }
    `;

    const csp = `default-src 'none'; img-src ${webview.cspSource} https: data:; font-src ${webview.cspSource} https:; style-src 'nonce-${nonce}' ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' ${webview.cspSource}; connect-src ${webview.cspSource} https:`;

    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style nonce="${nonce}">${baseStyles}</style>
    <script nonce="${nonce}">window.__CONTROL_CENTER_DATA__ = ${serialized}; window.__OPENCLAW_RAW__ = ${serializedConfig};</script>
  </head>
  <body>
    <div id="app">
      <div class="container">
        <div class="header">
          <div class="header-title">
            <span class="header-dot"></span>
            <span>Channel Manager</span>
          </div>
          <div class="header-pill">Friendly mode · No JSON needed</div>
        </div>

        <div class="page-tabs">
          <button class="page-tab active" data-page="channels">Channels</button>
          <button class="page-tab" data-page="config">Config JSON</button>
          <button class="page-tab" data-page="console">Command Console</button>
        </div>

        <div class="layout">
          <aside class="panel">
            <div class="nav-title">Control Center</div>
            <div class="nav-list">
              <div class="nav-item">Dashboard</div>
              <div class="nav-item">Agents</div>
              <div class="nav-item active">Channels</div>
              <div class="nav-item">Automation</div>
              <div class="nav-item">Maintenance</div>
            </div>
            <div class="nav-foot">${connectedChannels}/${channelCount} channels connected</div>
          </aside>

          <section class="panel" id="page-channels">
            <div class="channels-head">
              <div>
                <h1>Channels</h1>
                <p>Add, pair, and secure your communication channels with guided steps.</p>
              </div>
              <button class="btn-primary" id="add-channel">Add channel</button>
            </div>

            <div class="channel-list" id="channel-list">
              ${channelCards}
            </div>

            <div class="steps">
              <div class="steps-title">
                <span>Quick pairing steps</span>
                <span class="steps-meta">Add → Pair → Assign → Secure</span>
              </div>
              <div class="steps-list">
                <div class="steps-item">1. Choose a channel</div>
                <div class="steps-item">2. Pair or sign in</div>
                <div class="steps-item">3. Assign agents</div>
                <div class="steps-item">4. Set security defaults</div>
              </div>
            </div>
          </section>

          <aside class="panel" id="page-channels-detail">
            <div class="detail-head">
              <div>
                <div class="card-title" id="detail-title">Channel</div>
                <div class="card-sub">Channel details</div>
              </div>
              <button class="btn-secondary" id="pair-channel">Pair channel</button>
            </div>

            <div class="tabs" id="tab-list">
              <button class="tab active" data-tab="overview">Overview</button>
              <button class="tab" data-tab="pairing">Pairing</button>
              <button class="tab" data-tab="security">Security</button>
              <button class="tab" data-tab="troubleshoot">Troubleshoot</button>
            </div>

            <div class="detail-cards" id="tab-content"></div>
          </aside>

          <section class="panel hidden" id="page-config">
            <div class="channels-head">
              <div>
                <h1>Config JSON</h1>
                <p>Edit your full OpenClaw configuration with inline validation.</p>
              </div>
              <button class="btn-primary" id="save-config">Save config</button>
            </div>

            <div class="config-area">
              <textarea class="textarea" id="config-editor" spellcheck="false"></textarea>
              <div class="status-line">
                <span class="status-pill" id="config-status">Waiting for edits</span>
                <span id="config-error">JSON5 validation active (comments + trailing commas allowed).</span>
              </div>
            </div>
          </section>

          <aside class="panel hidden" id="page-config-detail">
            <div class="detail-head">
              <div>
                <div class="card-title">Validator</div>
                <div class="card-sub">Quick tips</div>
              </div>
            </div>
            <div class="detail-cards">
              <div class="detail-card">
                <h4>Safe defaults</h4>
                <div>Use pairing + allowlist for new channels.</div>
              </div>
              <div class="detail-card">
                <h4>Common errors</h4>
                <div>Missing commas, trailing commas, or invalid quotes.</div>
              </div>
            </div>
          </aside>

          <section class="panel hidden" id="page-console">
            <div class="channels-head">
              <div>
                <h1>Command Console</h1>
                <p>Run OpenClaw commands without leaving OCcode.</p>
              </div>
              <button class="btn-primary" id="run-command">Run</button>
            </div>

            <div class="console-box">
              <input class="console-input" id="command-input" placeholder="doctor --non-interactive" />
              <div class="pill-row commands">
                <button class="pill button" data-command="doctor --non-interactive">doctor</button>
                <button class="pill button" data-command="status">status</button>
                <button class="pill button" data-command="gateway status">gateway status</button>
                <button class="pill button" data-command="channels status --probe">channels status</button>
                <button class="pill button" data-command="logs --follow">logs --follow</button>
              </div>
            </div>
          </section>

          <aside class="panel hidden" id="page-console-detail">
            <div class="detail-head">
              <div>
                <div class="card-title">Tips</div>
                <div class="card-sub">Helpful commands</div>
              </div>
            </div>
            <div class="detail-cards">
              <div class="detail-card">
                <h4>Doctor</h4>
                <div>Runs a full health check of the gateway.</div>
              </div>
              <div class="detail-card">
                <h4>Logs</h4>
                <div>Use logs to watch live activity.</div>
              </div>
            </div>
          </aside>
        </div>

        <div class="summary-row">
          ${chipsHtml}
        </div>
      </div>
    </div>

    <script nonce="${nonce}">
      const vscode = acquireVsCodeApi();
      const data = window.__CONTROL_CENTER_DATA__;
      const rawConfig = window.__OPENCLAW_RAW__ || "";
      let activeIndex = 0;
      let activeTab = "overview";
      let activePage = "channels";

      const detailTitle = document.getElementById("detail-title");
      const tabContent = document.getElementById("tab-content");
      const channelButtons = Array.from(document.querySelectorAll(".channel-card"));
      const tabButtons = Array.from(document.querySelectorAll(".tab"));
      const pageButtons = Array.from(document.querySelectorAll(".page-tab"));
      const pageMap = {
        channels: ["page-channels", "page-channels-detail"],
        config: ["page-config", "page-config-detail"],
        console: ["page-console", "page-console-detail"],
      };

      const configEditor = document.getElementById("config-editor");
      const configStatus = document.getElementById("config-status");
      const configError = document.getElementById("config-error");
      const saveConfig = document.getElementById("save-config");

      const commandInput = document.getElementById("command-input");
      const runCommand = document.getElementById("run-command");
      const commandPills = Array.from(document.querySelectorAll(".pill.button"));

      function channelStatus(channel) {
        const connected = channel.accounts.some((account) => account.status === "connected");
        const needsReview = channel.accounts.some((account) => account.status === "needs-relink");
        if (connected) return "Connected and ready";
        if (needsReview) return "Needs review";
        return "Not connected";
      }

      function renderTab() {
        const channel = data.channels[activeIndex];
        if (!channel) return;
        detailTitle.textContent = channel.channel;

        if (activeTab === "overview") {
          tabContent.innerHTML = \`
            <div class="detail-card">
              <h4>Status</h4>
              <div>\${channelStatus(channel)}</div>
            </div>
            <div class="detail-card">
              <h4>Paired device</h4>
              <div>Primary account</div>
            </div>
            <div class="detail-card">
              <h4>Last activity</h4>
              <div>Last checked a few minutes ago</div>
            </div>
          \`;
          return;
        }

        if (activeTab === "pairing") {
          tabContent.innerHTML = \`
            <div class="detail-card">
              <h4>Pairing</h4>
              <div>Start pairing to connect this channel. A QR code or token will appear in the terminal.</div>
              <button class="btn-primary spacing-top" id="start-pairing">Start pairing</button>
            </div>
            <div class="detail-card">
              <h4>Re-pair warning</h4>
              <div>Re-pairing disconnects the existing device.</div>
            </div>
          \`;
          const startButton = document.getElementById("start-pairing");
          if (startButton) startButton.addEventListener("click", () => vscode.postMessage({ command: "openclaw.channelAdd" }));
          return;
        }

        if (activeTab === "security") {
          tabContent.innerHTML = \`
            <div class="detail-card">
              <h4>Approvals</h4>
              <div>Default to pairing approvals for DMs.</div>
            </div>
            <div class="detail-card">
              <h4>External messaging</h4>
              <div>Keep groups allowlisted to stay safe.</div>
            </div>
            <div class="detail-card">
              <h4>Quiet hours</h4>
              <div>Recommended for off-hours.</div>
            </div>
          \`;
          return;
        }

        tabContent.innerHTML = \`
          <div class="detail-card">
            <h4>Checklist</h4>
            <div>Reconnect, check permissions, confirm device.</div>
          </div>
          <div class="detail-card">
            <h4>Run health check</h4>
            <div>Use the command console for diagnostics.</div>
          </div>
        \`;
      }

      function setActiveChannel(index) {
        activeIndex = index;
        channelButtons.forEach((btn, idx) => {
          btn.classList.toggle("active", idx === index);
        });
        renderTab();
      }

      function setActiveTab(tab) {
        activeTab = tab;
        tabButtons.forEach((btn) => {
          btn.classList.toggle("active", btn.dataset.tab === tab);
        });
        renderTab();
      }

      channelButtons.forEach((btn) => {
        btn.addEventListener("click", () => setActiveChannel(Number(btn.dataset.index)));
      });

      tabButtons.forEach((btn) => {
        btn.addEventListener("click", () => setActiveTab(btn.dataset.tab));
      });

      function showPage(page) {
        activePage = page;
        pageButtons.forEach((btn) => {
          btn.classList.toggle("active", btn.dataset.page === page);
        });
        Object.values(pageMap).flat().forEach((id) => {
          const el = document.getElementById(id);
          if (el) el.classList.add("hidden");
        });
        (pageMap[page] || []).forEach((id) => {
          const el = document.getElementById(id);
          if (el) el.classList.remove("hidden");
        });
      }

      pageButtons.forEach((btn) => {
        btn.addEventListener("click", () => showPage(btn.dataset.page));
      });

      const addChannel = document.getElementById("add-channel");
      if (addChannel) addChannel.addEventListener("click", () => vscode.postMessage({ command: "openclaw.channelAdd" }));
      const pairChannel = document.getElementById("pair-channel");
      if (pairChannel) pairChannel.addEventListener("click", () => vscode.postMessage({ command: "openclaw.channelAdd" }));

      function sanitizeJson5(input) {
        return input
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/(^|[^:])\/\/.*$/gm, "$1")
          .replace(/,\s*(\}|\])/g, "$1");
      }

      function validateConfig() {
        if (!configEditor || !configStatus || !configError) return;
        const value = configEditor.value || "";
        try {
          JSON.parse(sanitizeJson5(value));
          configStatus.textContent = "Valid JSON";
          configStatus.classList.remove("err");
          configStatus.classList.add("ok");
          configError.textContent = "Ready to save.";
        } catch (err) {
          configStatus.textContent = "Invalid JSON";
          configStatus.classList.remove("ok");
          configStatus.classList.add("err");
          configError.textContent = err && err.message ? err.message : "Invalid JSON";
        }
      }

      if (configEditor) {
        configEditor.value = rawConfig || "";
        configEditor.addEventListener("input", validateConfig);
        validateConfig();
      }

      if (saveConfig) {
        saveConfig.addEventListener("click", () => {
          if (!configEditor) return;
          const value = configEditor.value || "";
          vscode.postMessage({ command: "openclaw.saveConfig", text: value });
        });
      }

      window.addEventListener("message", (event) => {
        const message = event.data || {};
        if (message.command !== "openclaw.saveResult") return;
        if (!configStatus || !configError) return;
        if (message.ok) {
          configStatus.textContent = "Saved";
          configStatus.classList.remove("err");
          configStatus.classList.add("ok");
          configError.textContent = "openclaw.json updated.";
        } else {
          configStatus.textContent = "Save failed";
          configStatus.classList.remove("ok");
          configStatus.classList.add("err");
          configError.textContent = message.error || "Failed to save config.";
        }
      });

      if (runCommand) {
        runCommand.addEventListener("click", () => {
          const value = (commandInput && commandInput.value || "").trim();
          if (!value) return;
          vscode.postMessage({ command: "openclaw.runCommand", text: value });
        });
      }

      if (commandInput) {
        commandInput.addEventListener("keydown", (event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          const value = commandInput.value.trim();
          if (!value) return;
          vscode.postMessage({ command: "openclaw.runCommand", text: value });
        });
      }

      commandPills.forEach((pill) => {
        pill.addEventListener("click", () => {
          if (!commandInput) return;
          const cmd = pill.dataset.command || "";
          commandInput.value = cmd;
          commandInput.focus();
        });
      });

      showPage(activePage);
      renderTab();
    </script>
  </body>
</html>`;
  }
}
