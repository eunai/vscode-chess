import * as vscode from "vscode";
import type { SidebarPresenter } from "./SidebarPresenter";
import type { RenderMessage } from "./contract";
import { onWebviewMessage } from "./webviewMessage";
import { OPEN_MOST_URGENT_COMMAND } from "../commands/openMostUrgent";

export const VIEW_CONTAINER_ID = "vscodeChess";
export const BOARDS_VIEW_ID = "vscodeChess.boards";

/**
 * The thin vscode wrapper around {@link SidebarPresenter}: it resolves the
 * WebviewView, builds the nonce-locked HTML that loads the bundled webview
 * script + CSS, and wires the view lifecycle (ready handshake, visibility,
 * disposal) to the presenter. All render decisions live in the presenter/store;
 * this class owns only the vscode plumbing.
 */
export class BoardsViewProvider implements vscode.WebviewViewProvider {
  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly presenter: SidebarPresenter
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    const { webview } = webviewView;
    webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "dist")],
    };
    webview.html = this.html(webview);

    webview.onDidReceiveMessage((message: unknown) =>
      onWebviewMessage(message, {
        ready: () => this.presenter.ready(),
        // Intent only — the host owns the open and the game URL.
        openMostUrgent: () => void vscode.commands.executeCommand(OPEN_MOST_URGENT_COMMAND),
      })
    );
    webviewView.onDidChangeVisibility(() => {
      this.presenter.setVisible(webviewView.visible);
    });
    webviewView.onDidDispose(() => {
      this.presenter.detach();
    });

    // Wire the post channel. First delivery is the ready → render handshake
    // (the webview's listener may not be registered yet at resolve time).
    this.presenter.attach({
      postMessage: (message: RenderMessage) => void webview.postMessage(message),
    });
  }

  private html(webview: vscode.Webview): string {
    const nonce = makeNonce();
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "dist", "webview.js")
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "dist", "webview.css")
    );
    const csp = [
      "default-src 'none'",
      `script-src 'nonce-${nonce}'`,
      `style-src ${webview.cspSource}`,
      `img-src ${webview.cspSource} data:`,
      `font-src ${webview.cspSource}`,
    ].join("; ");

    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link href="${styleUri.toString()}" rel="stylesheet" />
    <title>Daily Games</title>
  </head>
  <body>
    <div id="app"></div>
    <script nonce="${nonce}" src="${scriptUri.toString()}"></script>
  </body>
</html>`;
  }
}

function makeNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
