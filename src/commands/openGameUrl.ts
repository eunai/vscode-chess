import type * as vscode from "vscode";

/** String-based URL opener — the caller adapts vscode.Uri at the call site. */
export type OpenUrl = (url: string) => Thenable<boolean>;

/** Validate that a game URL points at a Chess.com game page before it is ever
 * handed to the browser. Only `https://www.chess.com/...` URLs are accepted;
 * anything else is rejected. Shared by openMostUrgent and per-board activation
 * so the two paths cannot drift (DR4). */
export function isChessComGameUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  return url.protocol === "https:" && url.hostname === "www.chess.com";
}

/** Open a Chess.com game URL in the external browser.
 * Rejects (logs, returns) if the URL does not match the Chess.com game URL
 * shape. No success log (Q6: no telemetry on the happy path). */
export async function openGameUrl(
  url: string,
  openUrl: OpenUrl,
  logger: Pick<vscode.LogOutputChannel, "warn">
): Promise<void> {
  if (!isChessComGameUrl(url)) {
    logger.warn("rejected a non-chess.com game URL");
    return;
  }
  await openUrl(url);
}
