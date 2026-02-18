import * as vscode from "vscode";
import { getControlCenterData } from "@occode/control-center/data";
import { renderControlCenterHtml } from "./control-center-webview";
import { resolveConfigPath } from "./config-path";

export class StatusPanel {
  public static currentPanel: StatusPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];
  private _pollTimer?: NodeJS.Timeout;
  private static readonly POLL_MS = 15000;

  public static createOrShow(extensionUri: vscode.Uri) {
    if (StatusPanel.currentPanel) {
      StatusPanel.currentPanel._panel.reveal();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "openclawStatus",
      "OpenClaw Status",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, "media")],
      }
    );

    StatusPanel.currentPanel = new StatusPanel(panel, extensionUri);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.onDidChangeViewState((event) => {
      if (event.webviewPanel.visible) {
        void this._update();
        this._startPolling();
      } else {
        this._stopPolling();
      }
    });

    this._panel.webview.onDidReceiveMessage((message) => {
      if (message?.command === "refresh") {
        void this._update();
      }
    });

    void this._update();
    this._startPolling();
  }

  public dispose() {
    StatusPanel.currentPanel = undefined;
    this._stopPolling();
    this._panel.dispose();
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  private _startPolling() {
    if (this._pollTimer) return;
    this._pollTimer = setInterval(() => {
      if (this._panel.visible) {
        void this._update();
      }
    }, StatusPanel.POLL_MS);
  }

  private _stopPolling() {
    if (!this._pollTimer) return;
    clearInterval(this._pollTimer);
    this._pollTimer = undefined;
  }

  private async _update() {
    const configPath = resolveConfigPath();
    const data = getControlCenterData(configPath);
    this._panel.webview.html = renderControlCenterHtml(
      this._panel.webview,
      this._extensionUri,
      data
    );
  }
}
