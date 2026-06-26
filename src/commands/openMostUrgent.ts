import type * as vscode from "vscode";
import { openGameUrl, type OpenUrl } from "./openGameUrl";
import type { DailyGame } from "../poller/GamesParser";

/** The command both the Presence (count click) and the Turn Notice run to open
 * the Most Urgent Game. One shared open path keeps the two surfaces consistent. */
export const OPEN_MOST_URGENT_COMMAND = "vscodeChess.openMostUrgent";

/** vscode.Uri-based opener — the seam used by extension.ts and the integration
 * test API. Kept here for extension.ts's `_setOpenExternalForTest` seam. */
export type OpenExternal = (target: vscode.Uri) => Thenable<boolean>;

/** The `vscodeChess.openMostUrgent` handler. Opens the most-urgent Daily Game
 * in the browser via the shared `openGameUrl` helper (DR4). A missing target
 * is a no-op; URL validation and rejection live in `openGameUrl`. */
export function makeOpenMostUrgent(
  getMostUrgent: () => DailyGame | undefined,
  openUrl: OpenUrl,
  logger: Pick<vscode.LogOutputChannel, "warn">
): () => Promise<void> {
  return async () => {
    const game = getMostUrgent();
    if (game === undefined) {
      return;
    }
    await openGameUrl(game.url, openUrl, logger);
  };
}
