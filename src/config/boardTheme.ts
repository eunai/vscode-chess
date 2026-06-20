import * as vscode from "vscode";
import { normalizeBoardTheme, type BoardTheme } from "../sidebar/contract";

const SECTION = "vscodeChess";
const KEY = "boardTheme";

/** Read the configured Board Theme, normalized — any unset or unrecognized
 * value defaults to `editor`. */
export function readBoardTheme(): BoardTheme {
  return normalizeBoardTheme(vscode.workspace.getConfiguration(SECTION).get(KEY));
}

/** Subscribe to `vscodeChess.boardTheme` changes. The callback receives the new
 * normalized value whenever it changes. Returns a Disposable. */
export function onBoardThemeChange(handler: (theme: BoardTheme) => void): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration(`${SECTION}.${KEY}`)) {
      handler(readBoardTheme());
    }
  });
}
