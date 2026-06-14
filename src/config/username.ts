import * as vscode from "vscode";

const SECTION = "vscodeChess";
const KEY = "username";

/** Read the configured Chess.com username, trimmed. Empty string when unset. */
export function readUsername(): string {
  return vscode.workspace.getConfiguration(SECTION).get<string>(KEY, "").trim();
}

/** Subscribe to `vscodeChess.username` changes. The callback receives the new
 * trimmed value whenever it changes. Returns a Disposable. */
export function onUsernameChange(handler: (username: string) => void): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration(`${SECTION}.${KEY}`)) {
      handler(readUsername());
    }
  });
}
