import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { resolveConfigPath, overrideConfigPath } from './config-path';

function expandHome(p: string) {
  if (!p) return p;
  if (p.startsWith('~')) {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

function normalizePath(p: string) {
  if (!p) return p;
  const expanded = expandHome(p);
  if (process.platform === 'win32') {
    return expanded.replace(/\\/g, '/');
  }
  return expanded;
}

function escapeHtml(input: string) {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/`/g, '&#96;');
}

export class ConfigPanel {
  public static currentPanel: ConfigPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  public static overrideConfigPath(p: string | undefined) {
    overrideConfigPath(p ? normalizePath(p) : undefined);
  }

  private constructor(panel: vscode.WebviewPanel) {
    this._panel = panel;
    this._update();
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage(msg => {
      if (msg.command === 'save') {
        this._saveConfig(msg.config);
      } else if (msg.command === 'refresh') {
        this._update();
      }
    }, null, this._disposables);
  }

  public static createOrShow(extensionUri: vscode.Uri) {
    if (ConfigPanel.currentPanel) {
      ConfigPanel.currentPanel._panel.reveal();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'openclawConfig', 'OpenClaw Configuration', vscode.ViewColumn.Two,
      { enableScripts: true }
    );
    ConfigPanel.currentPanel = new ConfigPanel(panel);
  }

  public dispose() {
    ConfigPanel.currentPanel = undefined;
    this._panel.dispose();
    this._disposables.forEach(d => d.dispose());
  }

  private _readConfig(): Record<string, unknown> {
    try {
      const raw = fs.readFileSync(resolveConfigPath(), 'utf-8');
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  private _saveConfig(config: Record<string, unknown>) {
    try {
      const targetPath = resolveConfigPath();
      const dir = path.dirname(targetPath);
      if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
      fs.writeFileSync(targetPath, JSON.stringify(config, null, 2), 'utf-8');
      vscode.window.showInformationMessage('OpenClaw configuration saved.');
      this._update();
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      vscode.window.showErrorMessage(`Failed to save config: ${errMsg}`);
    }
  }

  private _update() {
    const config = this._readConfig();
    const targetPath = resolveConfigPath();
    this._panel.webview.html = this._getHtml(config, targetPath);
  }

  private _getHtml(config: Record<string, unknown>, configPath: string): string {
    const model =
      (config.model as string) ||
      (((config as any).agents?.defaults?.model?.primary) as string) ||
      '';
    const channels = (config.channels && typeof config.channels === 'object') ? config.channels : {};
    const channelEntries = (channels && typeof channels === 'object')
      ? Object.entries(channels as Record<string, unknown>)
      : [];
    const agentsRaw = (config as any).agents;
    const agentEntries: Array<{ id: string; heartbeat: boolean; key: string }> = [];
    const agentData: Array<{
      key: string;
      id: string;
      workspace?: string;
      model?: string;
      channels?: string[];
      heartbeatEnabled?: boolean;
      heartbeatInterval?: string;
    }> = [];
    if (Array.isArray(agentsRaw)) {
      agentsRaw.forEach((entry, idx) => {
        const id = (entry && (entry.id || entry.agentId || entry.name)) ? String(entry.id || entry.agentId || entry.name) : 'agent';
        const heartbeat = Boolean(entry && entry.heartbeat && entry.heartbeat.enabled);
        const workspace = entry?.workspace || entry?.workspacePath || entry?.path;
        const model = entry?.model || entry?.models?.primary || entry?.models?.default;
        const channels = Array.isArray(entry?.channels) ? entry.channels.map((c: any) => String(c)) : undefined;
        const heartbeatInterval = entry?.heartbeat?.interval || entry?.heartbeat?.cadence || entry?.heartbeat?.schedule;
        const key = `index:${idx}`;
        agentEntries.push({ id, heartbeat, key });
        agentData.push({
          key,
          id,
          workspace,
          model,
          channels,
          heartbeatEnabled: heartbeat,
          heartbeatInterval: heartbeatInterval ? String(heartbeatInterval) : undefined,
        });
      });
    } else if (agentsRaw && typeof agentsRaw === 'object') {
      for (const [key, value] of Object.entries(agentsRaw)) {
        const record = value as any;
        const id = record && (record.id || record.agentId || record.name) ? String(record.id || record.agentId || record.name) : String(key);
        const heartbeat = Boolean(record && record.heartbeat && record.heartbeat.enabled);
        const workspace = record?.workspace || record?.workspacePath || record?.path;
        const model = record?.model || record?.models?.primary || record?.models?.default;
        const channels = Array.isArray(record?.channels) ? record.channels.map((c: any) => String(c)) : undefined;
        const heartbeatInterval = record?.heartbeat?.interval || record?.heartbeat?.cadence || record?.heartbeat?.schedule;
        agentEntries.push({ id, heartbeat, key: String(key) });
        agentData.push({
          key: String(key),
          id,
          workspace,
          model,
          channels,
          heartbeatEnabled: heartbeat,
          heartbeatInterval: heartbeatInterval ? String(heartbeatInterval) : undefined,
        });
      }
    }
    const bindingEntries = Array.isArray((config as any).bindings) ? (config as any).bindings : [];
    const broadcastGroups = Array.isArray((config as any).broadcastGroups) ? (config as any).broadcastGroups : [];
    const channelBlocks = channelEntries.map(([key, value]) => ({
      key,
      value,
    }));
    const channelRows = channelEntries.length
      ? channelEntries.map(([key, value]) => {
        const valueText = typeof value === 'string' ? value : JSON.stringify(value);
        return `
          <div class="channel-row">
            <input class="channel-name" type="text" value="${escapeHtml(key)}" placeholder="e.g. default" />
            <input class="channel-value" type="text" value="${escapeHtml(valueText)}" placeholder="URL, token, or JSON" />
            <button class="icon-btn" title="Remove" onclick="removeRow(this)">x</button>
          </div>
        `;
      }).join('\n')
      : `
        <div class="channel-row">
          <input class="channel-name" type="text" placeholder="e.g. default" />
          <input class="channel-value" type="text" placeholder="URL, token, or JSON" />
          <button class="icon-btn" title="Remove" onclick="removeRow(this)">x</button>
        </div>
      `;

    const agentRows = agentEntries.length
      ? agentEntries.map((agent, index) => `
        <button class="rail-agent${index === 0 ? ' active' : ''}" data-agent="${escapeHtml(agent.key)}">
          <span class="agent-dot ${agent.heartbeat ? 'ok' : 'warn'}"></span>
          <span class="agent-name">${escapeHtml(agent.id)}</span>
          <span class="agent-pill">${agent.heartbeat ? 'heartbeat' : 'paused'}</span>
        </button>
      `).join('\n')
      : `
        <div class="empty-state">No agents found in config.</div>
      `;
    const agentList = agentData.length
      ? agentData.map((agent, index) => `
        <div class="agent${index === 0 ? ' active' : ''}" data-agent="${escapeHtml(agent.key)}">
          <div class="avatar">${escapeHtml(agent.id.slice(0, 2).toUpperCase())}</div>
          <div>
            <div><b>${escapeHtml(agent.id)}</b> <span class="badge">${index === 0 ? 'Primary' : 'Agent'}</span></div>
            <div class="meta">Channels: ${(agent.channels && agent.channels.length) ? escapeHtml(agent.channels.join(', ')) : '—'}</div>
          </div>
          <div class="${agent.heartbeatEnabled ? 'good' : 'warn'}" style="margin-left:auto">${agent.heartbeatEnabled ? 'Active' : 'Needs setup'}</div>
        </div>
      `).join('\n')
      : `<div class="empty-state">No agents found in config.</div>`;
    const channelData = channelBlocks.map((block) => {
      const value = block.value;
      const hasValue = typeof value === 'string'
        ? value.trim().length > 0
        : (value && typeof value === 'object')
          ? Object.keys(value as Record<string, unknown>).length > 0
          : Boolean(value);
      return {
        key: block.key,
        value,
        status: hasValue ? 'Connected' : 'Not connected',
      };
    });
    const channelList = channelData.length
      ? channelData.map((block, index) => {
        const safeKey = escapeHtml(block.key);
        const statusClass = block.status === 'Connected' ? 'good' : 'bad';
        return `
          <div class="agent" data-channel="${safeKey}">
            <div class="avatar">${safeKey.slice(0, 2).toUpperCase()}</div>
            <div>
              <div><b>${safeKey}</b> <span class="badge">${index === 0 ? 'Primary' : 'Channel'}</span></div>
              <div class="meta">Status: ${escapeHtml(block.status)}</div>
            </div>
            <div class="${statusClass}" style="margin-left:auto">${escapeHtml(block.status)}</div>
          </div>
        `;
      }).join('\n')
      : `<div class="empty-state">No channel blocks found in config.</div>`;
    const routingRows = bindingEntries.length
      ? bindingEntries.map((binding: any) => {
        const summary = escapeHtml(JSON.stringify(binding, null, 2));
        return `<div class="routing-row"><pre>${summary}</pre></div>`;
      }).join('\n')
      : `<div class="empty-state">No bindings configured yet.</div>`;
    const broadcastRows = broadcastGroups.length
      ? broadcastGroups.map((group: any) => {
        const summary = escapeHtml(JSON.stringify(group, null, 2));
        return `<div class="routing-row"><pre>${summary}</pre></div>`;
      }).join('\n')
      : `<div class="empty-state">No broadcast groups configured yet.</div>`;

    const configJson = JSON.stringify(config, null, 2);
    const safeConfig = escapeHtml(configJson);
    const safeConfigPath = escapeHtml(configPath);
    const safeModel = escapeHtml(model);
    const agentCount = agentEntries.length;
    const channelCount = channelEntries.length;
    const serializedAgents = JSON.stringify(agentData).replace(/</g, '\\u003c').replace(/`/g, '\\u0060');
    const serializedChannels = JSON.stringify(channelData).replace(/</g, '\\u003c').replace(/`/g, '\\u0060');

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: "Space Grotesk", var(--vscode-font-family, sans-serif);
      background: radial-gradient(circle at 20% 15%, #2c1515, #121212 48%, #0d0d0f 90%);
      color: #e6e6e6;
      padding: 24px;
    }
    .shell {
      display: grid;
      grid-template-columns: 220px 1fr;
      gap: 18px;
      max-width: 1200px;
      margin: 0 auto;
    }
    .rail {
      background: rgba(12,12,12,0.75);
      border: 1px solid #242424;
      border-radius: 18px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-height: 720px;
    }
    .rail-title {
      font-size: 14px;
      letter-spacing: 0.08em;
      color: #ff8a8a;
      text-transform: uppercase;
      margin-bottom: 8px;
    }
    .rail-item {
      background: transparent;
      border: 1px solid transparent;
      color: #c7c7c7;
      padding: 10px 12px;
      border-radius: 12px;
      font-size: 13px;
      text-align: left;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .rail-item:hover {
      border-color: #2f2f2f;
      color: #fff;
    }
    .rail-item.active {
      background: rgba(255,75,75,0.12);
      border-color: rgba(255,75,75,0.35);
      color: #fff;
    }
    .rail-section {
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid #1f1f1f;
    }
    .rail-agent {
      display: flex;
      align-items: center;
      gap: 8px;
      background: transparent;
      border: 1px solid #262626;
      color: #cfcfcf;
      padding: 8px 10px;
      border-radius: 10px;
      font-size: 12px;
      cursor: pointer;
    }
    .rail-agent.active {
      background: rgba(255,255,255,0.04);
      border-color: rgba(255,75,75,0.4);
    }
    .agent-dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: #facc15;
      box-shadow: 0 0 8px rgba(250, 204, 21, 0.6);
    }
    .agent-dot.ok { background: #4ade80; box-shadow: 0 0 8px rgba(74, 222, 128, 0.6); }
    .agent-dot.warn { background: #facc15; }
    .agent-name { flex: 1; text-align: left; }
    .agent-pill {
      font-size: 10px;
      background: #1f1f1f;
      border: 1px solid #333;
      padding: 2px 6px;
      border-radius: 999px;
      color: #bdbdbd;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 18px;
    }
    .title-block h1 {
      font-size: 26px;
      color: #fff;
      margin-bottom: 4px;
    }
    .title-block p {
      color: #b6b6b6;
      font-size: 13px;
    }
    .path-pill {
      background: rgba(15,15,15,0.7);
      border: 1px solid #2b2b2b;
      color: #bdbdbd;
      padding: 8px 12px;
      border-radius: 999px;
      font-size: 12px;
    }
    .toolbar {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      align-items: center;
    }
    .pill {
      font-size: 11px;
      padding: 6px 10px;
      border-radius: 999px;
      background: rgba(255,255,255,0.06);
      color: #d6d6d6;
      border: 1px solid #2a2a2a;
    }
    .banner {
      display: none;
      margin-bottom: 16px;
      padding: 12px 14px;
      border-radius: 12px;
      border: 1px solid rgba(255, 75, 75, 0.4);
      background: rgba(255, 75, 75, 0.12);
      color: #ffd1d1;
      font-size: 12px;
    }
    .banner.show { display: block; }
    .card {
      background: rgba(20,20,20,0.75);
      border: 1px solid #2b2b2b;
      border-radius: 12px;
      padding: 18px;
      margin-bottom: 16px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.35);
    }
    .section-title {
      font-size: 14px;
      font-weight: 700;
      color: #f5f5f5;
      margin-bottom: 8px;
    }
    .section-hint {
      font-size: 12px;
      color: #9a9a9a;
      margin-bottom: 12px;
    }
    label {
      display: block;
      font-size: 12px;
      color: #bdbdbd;
      margin-bottom: 6px;
      margin-top: 10px;
      font-weight: 600;
    }
    input, textarea, select {
      width: 100%;
      background: #1f1f1f;
      border: 1px solid #3a3a3a;
      color: #f0f0f0;
      padding: 10px 12px;
      border-radius: 8px;
      font-family: var(--vscode-editor-font-family, sans-serif);
      font-size: 14px;
    }
    input:focus, textarea:focus, select:focus {
      outline: none;
      border-color: #ff4b4b;
      box-shadow: 0 0 0 2px rgba(255, 75, 75, 0.15);
    }
    textarea { min-height: 160px; resize: vertical; }
    .actions { margin-top: 16px; display: flex; gap: 10px; flex-wrap: wrap; }
    button {
      padding: 10px 18px;
      border-radius: 8px;
      border: none;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }
    .chips { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
    .chip {
      background: #1f1f1f;
      color: #e0e0e0;
      border: 1px solid #3a3a3a;
      padding: 6px 10px;
      border-radius: 999px;
      font-size: 12px;
      cursor: pointer;
    }
    .chip:hover { border-color: #ff4b4b; color: #fff; }
    .btn-save { background: #ff4b4b; color: #fff; }
    .btn-save:hover { background: #dc2828; }
    .btn-secondary { background: #2c2c2c; color: #cfcfcf; border: 1px solid #3a3a3a; }
    .btn-secondary:hover { background: #3a3a3a; }
    .btn-ghost { background: transparent; color: #d0d0d0; border: 1px solid #3a3a3a; }
    .btn-ghost:hover { border-color: #ff4b4b; color: #fff; }
    .btn-gradient {
      background: linear-gradient(135deg, #6ee7ff, #9d7bff);
      color: #08101a;
      font-weight: 700;
    }
    .btn-gradient:hover { opacity: 0.9; }
    .channel-row {
      display: grid;
      grid-template-columns: 1fr 2fr auto;
      gap: 8px;
      margin-bottom: 8px;
    }
    .icon-btn {
      background: #2b2b2b;
      border: 1px solid #3a3a3a;
      color: #bdbdbd;
      padding: 0 10px;
      border-radius: 8px;
      height: 40px;
    }
    .icon-btn:hover { background: #3a3a3a; color: #fff; }
    .hint {
      font-size: 12px;
      color: #8c8c8c;
      margin-top: 6px;
    }
    .error {
      display: none;
      background: rgba(255, 75, 75, 0.1);
      border: 1px solid rgba(255, 75, 75, 0.4);
      color: #ff9b9b;
      padding: 10px 12px;
      border-radius: 8px;
      margin-bottom: 12px;
      font-size: 12px;
    }
    .error.show { display: block; }
    details {
      margin-top: 10px;
      border: 1px dashed #3a3a3a;
      border-radius: 8px;
      padding: 10px 12px;
      background: rgba(10,10,10,0.5);
    }
    summary {
      cursor: pointer;
      font-weight: 600;
      color: #cfcfcf;
      font-size: 13px;
    }
    .note {
      margin-top: 12px;
      font-size: 11px;
      color: #7a7a7a;
    }
    .tab-pane { display: none; }
    .tab-pane.active { display: block; }
    .grid-2 {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
    }
    .grid-3 {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
    }
    .stat-card {
      border: 1px solid #2b2b2b;
      border-radius: 12px;
      padding: 12px;
      background: rgba(15,15,15,0.7);
    }
    .stat-card h3 {
      font-size: 12px;
      color: #bdbdbd;
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .stat-card .value {
      font-size: 20px;
      color: #fff;
      font-weight: 700;
    }
    .tag {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      color: #cfcfcf;
      border: 1px solid #323232;
      padding: 4px 8px;
      border-radius: 999px;
      background: rgba(255,255,255,0.04);
    }
    .empty-state {
      font-size: 12px;
      color: #8c8c8c;
      padding: 10px;
      border: 1px dashed #2b2b2b;
      border-radius: 10px;
    }
    .matrix {
      border: 1px solid #2b2b2b;
      border-radius: 12px;
      padding: 12px;
      background: rgba(12,12,12,0.7);
      font-size: 12px;
      color: #bdbdbd;
      min-height: 120px;
    }
    .routing-row {
      border: 1px solid #2b2b2b;
      border-radius: 10px;
      padding: 10px;
      margin-bottom: 8px;
      background: rgba(18,18,18,0.7);
      font-size: 12px;
      color: #cfcfcf;
    }
    .routing-row pre {
      white-space: pre-wrap;
      word-break: break-word;
      font-family: var(--vscode-editor-font-family, monospace);
    }
    .detail-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }
    .detail-row {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .toggle-row {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .console {
      background: #0f0f10;
      border: 1px solid #2a2a2a;
      border-radius: 12px;
      padding: 12px;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 12px;
      color: #bdbdbd;
      min-height: 140px;
    }
    .content-grid {
      display: grid;
      grid-template-columns: 1.2fr 1fr;
      gap: 16px;
    }
    .panel {
      background: rgba(20,20,20,0.75);
      border: 1px solid #2b2b2b;
      border-radius: 16px;
      padding: 16px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.25);
    }
    .toolbar {
      display: flex;
      gap: 10px;
      align-items: center;
      margin-bottom: 12px;
    }
    .search {
      flex: 1;
      background: #1b1f2a;
      border-radius: 10px;
      padding: 8px 10px;
      color: #9aa3b6;
      font-size: 12px;
      border: 1px solid #2b3040;
    }
    .agent-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .agent {
      display: flex;
      gap: 12px;
      background: #1b2030;
      border-radius: 14px;
      padding: 12px;
      align-items: center;
      cursor: pointer;
      border: 1px solid transparent;
    }
    .agent.active {
      border-color: rgba(255, 75, 75, 0.4);
      background: #20263a;
    }
    .avatar {
      width: 36px;
      height: 36px;
      border-radius: 12px;
      background: #2b3348;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      color: #dfe6f4;
    }
    .meta {
      font-size: 12px;
      color: #8b93a7;
    }
    .badge {
      font-size: 11px;
      padding: 4px 8px;
      border-radius: 999px;
      background: #2a3145;
      color: #b9c0d1;
    }
    .good { color: #24d18a; }
    .warn { color: #f6c343; }
    .bad { color: #ff6b6b; }
    .tabs {
      display: flex;
      gap: 10px;
      margin-bottom: 10px;
    }
    .tab {
      padding: 6px 10px;
      border-radius: 999px;
      background: #1c2232;
      color: #8b93a7;
      font-size: 12px;
      cursor: pointer;
    }
    .tab.active {
      background: #232a3d;
      color: #e7ecf6;
    }
    .section {
      background: #1b2030;
      border-radius: 14px;
      padding: 12px;
      margin-bottom: 10px;
    }
    .row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;
      color: #8b93a7;
      margin-bottom: 6px;
    }
    .row:last-child { margin-bottom: 0; }
    .toggle {
      width: 36px;
      height: 20px;
      border-radius: 999px;
      background: #2a3145;
      position: relative;
    }
    .toggle:after {
      content: "";
      position: absolute;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #6ee7ff;
      top: 2px;
      left: 18px;
    }
    .flow {
      margin-top: 16px;
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
    }
    .flow .step {
      background: #1b2030;
      border-radius: 12px;
      padding: 10px;
      font-size: 11px;
      color: #8b93a7;
    }
    .flow .step b { color: #e7ecf6; }
    @media (max-width: 960px) {
      .shell { grid-template-columns: 1fr; }
      .rail { min-height: auto; }
      .grid-2, .grid-3, .content-grid, .flow { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <aside class="rail">
      <div class="rail-title">Configure</div>
      <button class="rail-item active" data-tab="agents">Agent Manager</button>
      <button class="rail-item" data-tab="routing">Routing Studio</button>
      <button class="rail-item" data-tab="channels">Channel Controls</button>
      <button class="rail-item" data-tab="automation">Automation Center</button>
      <button class="rail-item" data-tab="maintenance">Maintenance & Plugins</button>
      <button class="rail-item" data-tab="console">Command Console</button>
      <div class="rail-section">
        <div class="section-title">Agents</div>
        ${agentRows}
      </div>
    </aside>

    <main>
      <div class="header">
        <div class="title-block">
          <h1>OpenClaw Configuration</h1>
          <p>Schema-true control center for agents, routing, channels, and ops.</p>
        </div>
        <div class="toolbar">
          <span class="pill">Agents: ${agentCount}</span>
          <span class="pill">Channels: ${channelCount}</span>
          <div class="path-pill">Config: <code>${safeConfigPath}</code></div>
          <button class="btn-save" onclick="save()">Save</button>
          <button class="btn-secondary" onclick="refresh()">Reload</button>
        </div>
      </div>

      <div id="restartBanner" class="banner">
        Changes saved. Gateway restart recommended to apply updates.
      </div>

      <div id="error" class="error"></div>

      <section id="tab-agents" class="tab-pane active">
        <div class="content-grid">
          <div class="card">
            <h3>Agents</h3>
            <div class="toolbar">
              <input class="search" type="text" placeholder="Search by name, role, or channel…" />
              <button class="btn-gradient">+ New Agent</button>
            </div>
            <div class="agent-list" id="agentList">
              ${agentList}
            </div>
            <div class="flow">
              <div class="step"><b>1. Choose template</b><br/>Pick a role or start blank.</div>
              <div class="step"><b>2. Name & personality</b><br/>Tone, style, permissions.</div>
              <div class="step"><b>3. Connect channels</b><br/>Where should they work?</div>
              <div class="step"><b>4. Capabilities</b><br/>Tasks, tools, schedules.</div>
            </div>
          </div>

          <div class="panel">
            <h3>Agent Details</h3>
            <div class="tabs">
              <div class="tab active">Overview</div>
              <div class="tab">Capabilities</div>
              <div class="tab">Channels</div>
              <div class="tab">Access</div>
            </div>
            <div class="section">
              <div><b id="agentTitle">Selected Agent</b> <span class="badge">Primary</span></div>
              <div class="row"><span>Workspace</span><span id="agentWorkspaceDisplay">—</span></div>
              <div class="row"><span>Status</span><span class="good" id="agentStatus">Active</span></div>
            </div>
            <div class="section">
              <div class="row"><span>Daily briefings</span><div class="toggle"></div></div>
              <div class="row"><span>Inbox triage</span><div class="toggle"></div></div>
              <div class="row"><span>Calendar reminders</span><div class="toggle"></div></div>
            </div>
            <div class="section">
              <div class="row"><span>Channels</span><span id="agentChannelDisplay">—</span></div>
              <div class="row"><span>Heartbeat</span><span id="agentHeartbeatDisplay">—</span></div>
            </div>
            <div class="section">
              <label>Agent Model</label>
              <input id="agentModel" type="text" value="" placeholder="e.g. gpt-4o" />
              <label>Workspace Path</label>
              <input id="agentWorkspace" type="text" value="" placeholder="/path/to/workspace" />
              <label>Heartbeat Interval</label>
              <input id="agentHeartbeatInterval" type="text" value="" placeholder="e.g. 5m or cron" />
              <label>Channels</label>
              <input id="agentChannels" type="text" value="" placeholder="comma-separated" />
              <div class="toggle-row" style="margin-top:8px;">
                <input id="agentHeartbeatEnabled" type="checkbox" />
                <span class="section-hint">Heartbeat enabled</span>
              </div>
            </div>
            <div class="section">
              <label>Default Model</label>
              <input id="model" type="text" list="model-list" value="${safeModel}" placeholder="e.g. claude-sonnet-4-20250514" />
              <datalist id="model-list">
                <option value="claude-sonnet-4-20250514"></option>
                <option value="claude-3-5-sonnet"></option>
                <option value="gpt-4o-mini"></option>
                <option value="gpt-4o"></option>
                <option value="o3-mini"></option>
              </datalist>
              <div class="chips">
                <button class="chip" onclick="setModel('claude-sonnet-4-20250514')">claude-sonnet-4-20250514</button>
                <button class="chip" onclick="setModel('claude-3-5-sonnet')">claude-3-5-sonnet</button>
                <button class="chip" onclick="setModel('gpt-4o-mini')">gpt-4o-mini</button>
                <button class="chip" onclick="setModel('gpt-4o')">gpt-4o</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="tab-routing" class="tab-pane">
        <div class="card">
          <div class="section-title">Routing Studio</div>
          <div class="section-hint">Bindings and broadcast groups from openclaw.json.</div>
          <div class="section-title">Bindings</div>
          ${routingRows}
          <div class="section-title" style="margin-top:12px;">Broadcast Groups</div>
          ${broadcastRows}
        </div>
      </section>

      <section id="tab-channels" class="tab-pane">
        <div class="content-grid">
          <div class="card">
            <h3>Channels</h3>
            <div class="toolbar">
              <input class="search" type="text" placeholder="Search by channel, status, or agent…" />
              <button class="btn-gradient">+ Add Channel</button>
            </div>
            <div class="agent-list" id="channelList">
              ${channelList}
            </div>
            <div class="flow">
              <div class="step"><b>1. Choose channel</b><br/>WhatsApp, Telegram, Slack, Email.</div>
              <div class="step"><b>2. Pair or sign in</b><br/>QR scan or token.</div>
              <div class="step"><b>3. Assign agents</b><br/>Who can use it?</div>
              <div class="step"><b>4. Security checks</b><br/>Confirm approvals.</div>
            </div>
          </div>

          <div class="panel">
            <h3>Channel Details</h3>
            <div class="tabs">
              <div class="tab active">Overview</div>
              <div class="tab">Pairing</div>
              <div class="tab">Security</div>
              <div class="tab">Troubleshoot</div>
            </div>
            <div class="section">
              <div><b id="channelTitle">Channel</b> <span class="badge" id="channelBadge">Primary</span></div>
              <div class="row"><span>Status</span><span id="channelStatus" class="good">Connected</span></div>
              <div class="row"><span>Last activity</span><span>—</span></div>
            </div>
            <div class="section">
              <div class="row"><span>Allow external messages</span><div class="toggle"></div></div>
              <div class="row"><span>Require approval for outgoing</span><div class="toggle"></div></div>
              <div class="row"><span>Auto-pause at night</span><div class="toggle"></div></div>
            </div>
            <div class="section">
              <label>Channel JSON</label>
              <textarea id="channelJson" class="channel-json" data-channel-key="" rows="10"></textarea>
            </div>
          </div>
        </div>
      </section>

      <section id="tab-automation" class="tab-pane">
        <div class="card">
          <div class="section-title">Automation Center</div>
          <div class="section-hint">Heartbeat coverage and cron jobs will surface here with edit controls.</div>
          <div class="matrix">Heartbeat grid · Cron timeline · Job builder</div>
        </div>
      </section>

      <section id="tab-maintenance" class="tab-pane">
        <div class="grid-2">
          <div class="card">
            <div class="section-title">Maintenance</div>
            <div class="section-hint">Run doctor, apply migrations, and view pending restarts.</div>
            <div class="matrix">Doctor status · Pending restart</div>
          </div>
          <div class="card">
            <div class="section-title">Plugins</div>
            <div class="section-hint">Plugins list and version status will appear here.</div>
            <div class="matrix">Plugin list · Voice Call setup</div>
          </div>
        </div>

        <details>
          <summary>Advanced (JSON)</summary>
          <p class="section-hint" style="margin-top:8px;">Only edit if you know what you are doing.</p>
          <textarea id="configRaw">${safeConfig}</textarea>
          <div class="actions">
            <button class="btn-secondary" onclick="saveAdvanced()">Save Advanced JSON</button>
          </div>
        </details>
      </section>

      <section id="tab-console" class="tab-pane">
        <div class="card">
          <div class="section-title">Command Console</div>
          <div class="section-hint">Execute OpenClaw CLI commands once command streaming is enabled.</div>
          <label>Command</label>
          <input id="commandInput" type="text" placeholder="openclaw doctor --non-interactive" />
          <div class="actions">
            <button class="btn-ghost" disabled>Run Command</button>
            <button class="btn-secondary" disabled>Dry Run</button>
          </div>
          <div class="console">Command output will stream here.</div>
        </div>
      </section>
    </main>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const errorEl = document.getElementById('error');
    const restartBanner = document.getElementById('restartBanner');
    const AGENTS = ${serializedAgents};
    const CHANNELS = ${serializedChannels};
    let selectedAgentKey = AGENTS.length ? AGENTS[0].key : null;
    let selectedChannelKey = CHANNELS.length ? CHANNELS[0].key : null;

    const tabButtons = Array.from(document.querySelectorAll('.rail-item'));
    const tabPanes = {
      agents: document.getElementById('tab-agents'),
      routing: document.getElementById('tab-routing'),
      channels: document.getElementById('tab-channels'),
      automation: document.getElementById('tab-automation'),
      maintenance: document.getElementById('tab-maintenance'),
      console: document.getElementById('tab-console'),
    };

    function openTab(name) {
      tabButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === name);
      });
      Object.keys(tabPanes).forEach(key => {
        tabPanes[key].classList.toggle('active', key === name);
      });
    }

    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => openTab(btn.dataset.tab));
    });

    const agentButtons = Array.from(document.querySelectorAll('.rail-agent'));
    const agentCards = Array.from(document.querySelectorAll('#agentList .agent'));
    const agentTitle = document.getElementById('agentTitle');
    const agentWorkspaceDisplay = document.getElementById('agentWorkspaceDisplay');
    const agentChannelDisplay = document.getElementById('agentChannelDisplay');
    const agentHeartbeatDisplay = document.getElementById('agentHeartbeatDisplay');
    const agentStatus = document.getElementById('agentStatus');
    const agentWorkspaceInput = document.getElementById('agentWorkspace');
    const agentModelInput = document.getElementById('agentModel');
    const agentHeartbeatIntervalInput = document.getElementById('agentHeartbeatInterval');
    const agentChannelsInput = document.getElementById('agentChannels');
    const agentHeartbeatEnabledInput = document.getElementById('agentHeartbeatEnabled');
    const channelCards = Array.from(document.querySelectorAll('#channelList .agent'));
    const channelTitle = document.getElementById('channelTitle');
    const channelBadge = document.getElementById('channelBadge');
    const channelStatus = document.getElementById('channelStatus');
    const channelJson = document.getElementById('channelJson');

    function getSelectedAgent() {
      if (!selectedAgentKey) return null;
      return AGENTS.find(a => a.key === selectedAgentKey) || null;
    }

    function renderSelectedAgent() {
      const agent = getSelectedAgent();
      if (!agent) {
        if (agentTitle) agentTitle.textContent = 'Selected Agent';
        if (agentWorkspaceDisplay) agentWorkspaceDisplay.textContent = '—';
        if (agentChannelDisplay) agentChannelDisplay.textContent = '—';
        if (agentHeartbeatDisplay) agentHeartbeatDisplay.textContent = '—';
        if (agentStatus) agentStatus.textContent = 'Inactive';
        if (agentWorkspaceInput) agentWorkspaceInput.value = '';
        if (agentModelInput) agentModelInput.value = '';
        if (agentHeartbeatIntervalInput) agentHeartbeatIntervalInput.value = '';
        if (agentChannelsInput) agentChannelsInput.value = '';
        if (agentHeartbeatEnabledInput) agentHeartbeatEnabledInput.checked = false;
        return;
      }
      if (agentTitle) agentTitle.textContent = agent.id || 'Selected Agent';
      if (agentWorkspaceDisplay) agentWorkspaceDisplay.textContent = agent.workspace || '—';
      if (agentChannelDisplay) agentChannelDisplay.textContent = (agent.channels || []).join(', ') || '—';
      if (agentHeartbeatDisplay) agentHeartbeatDisplay.textContent = agent.heartbeatInterval || (agent.heartbeatEnabled ? 'Enabled' : 'Disabled');
      if (agentStatus) {
        agentStatus.textContent = agent.heartbeatEnabled ? 'Active' : 'Needs setup';
        agentStatus.className = agent.heartbeatEnabled ? 'good' : 'warn';
      }
      if (agentWorkspaceInput) agentWorkspaceInput.value = agent.workspace || '';
      if (agentModelInput) agentModelInput.value = agent.model || '';
      if (agentHeartbeatIntervalInput) agentHeartbeatIntervalInput.value = agent.heartbeatInterval || '';
      if (agentChannelsInput) agentChannelsInput.value = (agent.channels || []).join(', ');
      if (agentHeartbeatEnabledInput) agentHeartbeatEnabledInput.checked = Boolean(agent.heartbeatEnabled);
    }

    agentButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        agentButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedAgentKey = btn.dataset.agent || null;
        agentCards.forEach(card => {
          card.classList.toggle('active', card.dataset.agent === selectedAgentKey);
        });
        renderSelectedAgent();
      });
    });

    agentCards.forEach(card => {
      card.addEventListener('click', () => {
        agentCards.forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        selectedAgentKey = card.dataset.agent || null;
        agentButtons.forEach(btn => {
          btn.classList.toggle('active', btn.dataset.agent === selectedAgentKey);
        });
        renderSelectedAgent();
      });
    });

    function getSelectedChannel() {
      if (!selectedChannelKey) return null;
      return CHANNELS.find(c => c.key === selectedChannelKey) || null;
    }

    function renderSelectedChannel() {
      const channel = getSelectedChannel();
      if (!channel) {
        if (channelTitle) channelTitle.textContent = 'Channel';
        if (channelBadge) channelBadge.textContent = 'Channel';
        if (channelStatus) channelStatus.textContent = 'Not connected';
        if (channelJson) {
          channelJson.value = '';
          channelJson.dataset.channelKey = '';
        }
        return;
      }
      if (channelTitle) channelTitle.textContent = channel.key;
      if (channelBadge) channelBadge.textContent = 'Primary';
      if (channelStatus) {
        channelStatus.textContent = channel.status;
        channelStatus.className = channel.status === 'Connected' ? 'good' : 'bad';
      }
      if (channelJson) {
        const valueText = typeof channel.value === 'string' ? channel.value : JSON.stringify(channel.value || {}, null, 2);
        channelJson.value = valueText;
        channelJson.dataset.channelKey = channel.key;
      }
    }

    channelCards.forEach(card => {
      card.addEventListener('click', () => {
        channelCards.forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        selectedChannelKey = card.dataset.channel || null;
        renderSelectedChannel();
      });
    });

    function showError(message) {
      errorEl.textContent = message;
      errorEl.classList.add('show');
    }
    function clearError() {
      errorEl.textContent = '';
      errorEl.classList.remove('show');
    }

    function setModel(value) {
      document.getElementById('model').value = value;
    }

    function refresh() {
      if (restartBanner) restartBanner.classList.remove('show');
      vscode.postMessage({ command:'refresh' });
    }

    function buildChannels() {
      const channels = {};
      CHANNELS.forEach(channel => {
        channels[channel.key] = channel.value || {};
      });
      if (channelJson) {
        const key = channelJson.dataset.channelKey || selectedChannelKey || '';
        const raw = channelJson.value.trim();
        if (key) {
          if (!raw) {
            channels[key] = {};
          } else {
            try {
              channels[key] = JSON.parse(raw);
            } catch (err) {
              showError('Channel ' + key + ' has invalid JSON.');
              throw err;
            }
          }
        }
      }
      return channels;
    }

    function applyAgentUpdates(config) {
      if (!selectedAgentKey) return;
      const agent = getSelectedAgent();
      if (!agent) return;
      const workspace = agentWorkspaceInput ? agentWorkspaceInput.value.trim() : '';
      const model = agentModelInput ? agentModelInput.value.trim() : '';
      const interval = agentHeartbeatIntervalInput ? agentHeartbeatIntervalInput.value.trim() : '';
      const channels = agentChannelsInput
        ? agentChannelsInput.value.split(',').map(s => s.trim()).filter(Boolean)
        : [];
      const heartbeatEnabled = agentHeartbeatEnabledInput ? agentHeartbeatEnabledInput.checked : false;

      if (Array.isArray(config.agents)) {
        const index = Number(selectedAgentKey.split(':')[1] || -1);
        if (index >= 0 && config.agents[index]) {
          const target = config.agents[index];
          if (workspace) target.workspace = workspace;
          if (model) target.model = model;
          if (channels.length) target.channels = channels;
          target.heartbeat = target.heartbeat || {};
          target.heartbeat.enabled = heartbeatEnabled;
          if (interval) target.heartbeat.interval = interval;
        }
      } else if (config.agents && typeof config.agents === 'object') {
        const target = config.agents[selectedAgentKey];
        if (target) {
          if (workspace) target.workspace = workspace;
          if (model) target.model = model;
          if (channels.length) target.channels = channels;
          target.heartbeat = target.heartbeat || {};
          target.heartbeat.enabled = heartbeatEnabled;
          if (interval) target.heartbeat.interval = interval;
        }
      }
    }

    function applyUpdates(config, model, channels) {
      const configEmpty = Object.keys(config).length === 0;
      const hasTopModel = Object.prototype.hasOwnProperty.call(config, 'model');
      const hasTopChannels = Object.prototype.hasOwnProperty.call(config, 'channels');
      const hasAgentsModel =
        config &&
        config.agents &&
        config.agents.defaults &&
        config.agents.defaults.model &&
        Object.prototype.hasOwnProperty.call(config.agents.defaults.model, 'primary');

      if (hasTopModel || configEmpty) {
        config.model = model;
      }
      if (hasTopChannels || configEmpty) {
        config.channels = channels;
      }
      if (hasAgentsModel) {
        config.agents.defaults.model.primary = model;
      }
    }

    function save() {
      clearError();
      const model = document.getElementById('model').value.trim();
      let channels;
      try {
        channels = buildChannels();
      } catch (err) {
        return;
      }
      let config;
      try {
        config = JSON.parse(document.getElementById('configRaw').value);
      } catch (err) {
        config = {};
      }
      applyAgentUpdates(config);
      applyUpdates(config, model, channels);
      document.getElementById('configRaw').value = JSON.stringify(config, null, 2);
      vscode.postMessage({ command: 'save', config });
      if (restartBanner) restartBanner.classList.add('show');
    }

    function saveAdvanced() {
      clearError();
      let config;
      try {
        config = JSON.parse(document.getElementById('configRaw').value);
      } catch (err) {
        showError('Advanced JSON is invalid. Please fix it before saving.');
        return;
      }
      vscode.postMessage({ command: 'save', config });
      if (restartBanner) restartBanner.classList.add('show');
    }

    renderSelectedAgent();
    renderSelectedChannel();
  </script>
</body>
</html>`;
  }
}
