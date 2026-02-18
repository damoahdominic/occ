import * as vscode from "vscode";
import { getControlCenterData } from "@occode/control-center/data";
import { renderControlCenterHtml } from "./control-center-webview";
import { resolveConfigPath, overrideConfigPath } from "./config-path";

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
      ConfigPanel.currentPanel._panel.reveal();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      "openclawConfig",
      "OpenClaw Control Center",
      vscode.ViewColumn.Two,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
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
    const data = getControlCenterData(configPath);
    this._panel.webview.html = renderControlCenterHtml(
      this._panel.webview,
      this._extensionUri,
      data
    );
  }
}
