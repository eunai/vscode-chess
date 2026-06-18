import type { DailyGame } from "../poller/GamesParser";
import type { PollStatus } from "../poller/Poller";
import type { SidebarBoard, SidebarNote, SidebarRenderModel } from "./contract";

/** Trusted host placeholder positions (never parsed from a payload). */
export const EMPTY_BOARD_FEN = "8/8/8/8/8/8/8/8 w - - 0 1";
export const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const SETUP_NOTE: SidebarNote = {
  kind: "setup",
  text: "Set your Chess.com username to begin.",
};
const WARNING_NOTE: SidebarNote = {
  kind: "warning",
  text: "Chess.com user not found — check your username.",
};
const RETRY_NOTE: SidebarNote = {
  kind: "retry",
  text: "Reconnecting…",
};

function emptyPlaceholder(): SidebarBoard {
  return {
    fen: EMPTY_BOARD_FEN,
    orientation: "white",
    opponent: null,
    awaiting: false,
    mostUrgent: false,
  };
}

function startingPlaceholder(): SidebarBoard {
  return {
    fen: STARTING_FEN,
    orientation: "white",
    opponent: null,
    awaiting: false,
    mostUrgent: false,
  };
}

function isAwaiting(game: DailyGame): boolean {
  return game.turn === game.playerColor;
}

/**
 * Map a Daily Game to a board. `mostUrgentUrl` is the `url` of the host's Most
 * Urgent Game; the board is flagged by `url` identity (never by list position),
 * so the correct single board glows even when two games share a `moveBy`.
 */
function toBoard(game: DailyGame, mostUrgentUrl: string | undefined): SidebarBoard {
  return {
    fen: game.fen,
    orientation: game.playerColor,
    opponent: game.opponent,
    awaiting: isAwaiting(game),
    mostUrgent: game.url === mostUrgentUrl,
  };
}

/**
 * Order Daily Games for the sidebar: awaiting games first by soonest `moveBy`,
 * then the rest by `url` ascending — a stable identity that keeps a non-awaiting
 * board in the same slot between cycles (calm, no churn). The Most Urgent Game
 * (`mostUrgentUrl`) carries the Urgent Glow regardless of where it sorts.
 */
function orderBoards(games: DailyGame[], mostUrgentUrl: string | undefined): SidebarBoard[] {
  const awaiting = games.filter(isAwaiting).sort((a, b) => a.moveBy - b.moveBy);
  const others = games
    .filter((g) => !isAwaiting(g))
    .sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0));
  return [...awaiting, ...others].map((game) => toBoard(game, mostUrgentUrl));
}

/**
 * Map a poll status (or its absence) plus username configuration to the sidebar
 * render model. The single host-side authority: it owns ordering, orientation,
 * opponent labels, the awaiting marker, placeholder boards, and notes. The
 * sidebar always renders at least one board (ADR 0004); `lastKnownBoards` is the
 * calm fallback re-sent on a transient failure.
 */
function baseModel(
  status: PollStatus | undefined,
  usernameConfigured: boolean,
  lastKnownBoards: SidebarBoard[] | undefined
): SidebarRenderModel {
  if (!usernameConfigured) {
    return { boards: [emptyPlaceholder()], note: SETUP_NOTE };
  }
  if (status === undefined) {
    // Configured, before the first poll status arrives — calm idle placeholder.
    return { boards: [startingPlaceholder()] };
  }
  switch (status.kind) {
    case "counted":
      return status.games.length === 0
        ? { boards: [startingPlaceholder()] }
        : { boards: orderBoards(status.games, status.mostUrgent?.url) };
    case "notFound":
      return { boards: [emptyPlaceholder()], note: WARNING_NOTE };
    case "transient": {
      const boards =
        lastKnownBoards !== undefined && lastKnownBoards.length > 0
          ? lastKnownBoards
          : [emptyPlaceholder()];
      return { boards, note: RETRY_NOTE };
    }
  }
}

/**
 * The sidebar render model, with the bottom Turn Notice attached. The Turn Count
 * is derived from the boards the webview will actually render — the number
 * carrying the Awaiting Marker — so the notice, the markers, and the Presence
 * all mirror one polling result. On a transient failure the re-sent last-known
 * boards carry their awaiting flags, so the count is preserved without a
 * separate signal. The notice is omitted entirely when no game awaits a move.
 */
export function from(
  status: PollStatus | undefined,
  usernameConfigured: boolean,
  lastKnownBoards: SidebarBoard[] | undefined
): SidebarRenderModel {
  const model = baseModel(status, usernameConfigured, lastKnownBoards);
  const count = model.boards.filter((board) => board.awaiting).length;
  return count > 0 ? { ...model, turnNotice: { count } } : model;
}
