import * as vscode from "vscode";
import type { DailyGame } from "../poller/GamesParser";

export type OpenExternal = (target: vscode.Uri) => Thenable<boolean>;

/** Validate that a game URL points at a Chess.com game page before it is ever
 * handed to the browser. Crash-early on untrusted data (R3): only
 * `https://www.chess.com/...` URLs are accepted; anything else is rejected. */
export function isChessComGameUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  return url.protocol === "https:" && url.hostname === "www.chess.com";
}

/** The `vscodeChess.openMostUrgent` handler. Opens the most-urgent Daily Game
 * in the browser after shape-validating its URL; a missing target or a
 * non-conforming URL is rejected, not opened. */
export function makeOpenMostUrgent(
  getMostUrgent: () => DailyGame | undefined,
  openExternal: OpenExternal,
  logger: vscode.LogOutputChannel
): () => Promise<void> {
  return async () => {
    const game = getMostUrgent();
    if (game === undefined) {
      return;
    }
    if (!isChessComGameUrl(game.url)) {
      logger.warn("openMostUrgent: rejected a non-chess.com game URL");
      return;
    }
    await openExternal(vscode.Uri.parse(game.url));
  };
}
