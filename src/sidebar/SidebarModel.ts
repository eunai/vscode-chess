import type { DailyGame } from "../poller/GamesParser";
import type { PollStatus } from "../poller/Poller";
import { byAgeThenUrl } from "../poller/dailyGameOrder";
import { glowIntensity } from "./glow";
import type { SidebarBoard, SidebarNote, SidebarRenderModel } from "./contract";
import type { ActionDescriptor } from "./boardActions";

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

/**
 * Settings-placeholder activation descriptors, one per host state that offers a
 * fix. The no-username and unknown-user placeholders carry an action; the idle
 * and transient-empty placeholders never do (they are inert, ADR 0007).
 */
export interface SettingsDescriptors {
  noUsername?: ActionDescriptor;
  unknownUser?: ActionDescriptor;
}

function emptyPlaceholder(action?: ActionDescriptor): SidebarBoard {
  const board: SidebarBoard = {
    fen: EMPTY_BOARD_FEN,
    orientation: "white",
    opponent: null,
    awaiting: false,
    glow: 0,
  };
  // Attach the activation descriptor only when one was provided — so an inert
  // placeholder is structurally identical to one with no action.
  if (action) {
    board.action = { token: action.token, label: action.label };
  }
  return board;
}

function startingPlaceholder(): SidebarBoard {
  return {
    fen: STARTING_FEN,
    orientation: "white",
    opponent: null,
    awaiting: false,
    glow: 0,
  };
}

function isAwaiting(game: DailyGame): boolean {
  return game.turn === game.playerColor;
}

/**
 * Map a Daily Game to a board, computing the **Awaiting Glow** intensity from the
 * current time: an awaiting game carries `glowIntensity(move_by − now)` (stronger
 * as its deadline nears); a non-awaiting game carries `0`. `now` (ms) is injected
 * so the pure model never reads the clock.
 */
function toBoard(game: DailyGame, now: number, descriptor?: ActionDescriptor): SidebarBoard {
  const board: SidebarBoard = {
    fen: game.fen,
    orientation: game.playerColor,
    opponent: game.opponent,
    awaiting: isAwaiting(game),
    glow: isAwaiting(game) ? glowIntensity(game.moveBy, now) : 0,
  };
  // Conditional-omit: carry the Move Trail only when present, so a no-move board
  // is structurally identical to a placeholder (never `lastMove: undefined`).
  if (game.lastMove) {
    board.lastMove = game.lastMove;
  }
  // Attach the activation descriptor only when one was minted for this game.
  if (descriptor) {
    board.action = { token: descriptor.token, label: descriptor.label };
  }
  return board;
}

/**
 * Order Daily Games for the sidebar: awaiting games first, then the rest; **within
 * each group, oldest `startTime` first** (then `url`, missing-`startTime` last) via
 * the shared {@link byAgeThenUrl}. A board keeps its slot between cycles and only
 * moves when a game ends (lower boards shift up) or a new one starts (it joins the
 * bottom of its group) — calm, no churn. Each board's Awaiting Glow is computed
 * from `now`.
 */
function orderBoards(
  games: DailyGame[],
  now: number,
  descriptors: ReadonlyMap<string, ActionDescriptor>
): SidebarBoard[] {
  const awaiting = games.filter(isAwaiting).sort(byAgeThenUrl);
  const others = games.filter((g) => !isAwaiting(g)).sort(byAgeThenUrl);
  return [...awaiting, ...others].map((game) => toBoard(game, now, descriptors.get(game.url)));
}

/**
 * Map a poll status (or its absence) plus username configuration to the sidebar
 * render model. The single host-side authority: it owns ordering, orientation,
 * opponent labels, the Awaiting Glow, placeholder boards, and notes. The sidebar
 * always renders at least one board (ADR 0004). `lastKnownGames` are the last
 * successful Daily Games; a transient failure **rebuilds** boards from them at the
 * current `now` — so the glow keeps ramping while disconnected — rather than
 * re-sending stale boards.
 */
function baseModel(
  status: PollStatus | undefined,
  usernameConfigured: boolean,
  lastKnownGames: DailyGame[] | undefined,
  now: number,
  descriptors: ReadonlyMap<string, ActionDescriptor>,
  settingsDescriptors: SettingsDescriptors
): SidebarRenderModel {
  if (!usernameConfigured) {
    return { boards: [emptyPlaceholder(settingsDescriptors.noUsername)], note: SETUP_NOTE };
  }
  if (status === undefined) {
    // Configured, before the first poll status arrives — calm idle placeholder.
    return { boards: [startingPlaceholder()] };
  }
  switch (status.kind) {
    case "counted":
      return status.games.length === 0
        ? { boards: [startingPlaceholder()] }
        : { boards: orderBoards(status.games, now, descriptors) };
    case "notFound":
      return { boards: [emptyPlaceholder(settingsDescriptors.unknownUser)], note: WARNING_NOTE };
    case "transient": {
      // `undefined` last-known = no successful poll yet (or cleared by notFound /
      // username change) → empty placeholder. An empty array = a zero-games success
      // → the calm starting placeholder, matching the `counted([])` branch. A
      // non-empty array rebuilds the boards at the current `now` (glow keeps ramping).
      if (lastKnownGames === undefined) {
        return { boards: [emptyPlaceholder()], note: RETRY_NOTE };
      }
      const boards =
        lastKnownGames.length > 0
          ? orderBoards(lastKnownGames, now, descriptors)
          : [startingPlaceholder()];
      return { boards, note: RETRY_NOTE };
    }
  }
}

/**
 * The sidebar render model, with the bottom Turn Notice attached. The Turn Count
 * is the number of awaiting boards the webview will render, so the notice, the
 * glow, and the Presence all mirror one polling result. On a transient failure the
 * boards are rebuilt from the last-known games (awaiting flags preserved), so the
 * count is preserved. `now` (ms) is injected for the Awaiting Glow ramp; the notice
 * is omitted entirely when no game awaits a move.
 */
export function from(
  status: PollStatus | undefined,
  usernameConfigured: boolean,
  lastKnownGames: DailyGame[] | undefined,
  now: number,
  descriptors: ReadonlyMap<string, ActionDescriptor> = new Map(),
  settingsDescriptors: SettingsDescriptors = {}
): SidebarRenderModel {
  const model = baseModel(
    status,
    usernameConfigured,
    lastKnownGames,
    now,
    descriptors,
    settingsDescriptors
  );
  const count = model.boards.filter((board) => board.awaiting).length;
  return count > 0 ? { ...model, turnNotice: { count } } : model;
}
