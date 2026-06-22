import { deriveLastMove } from "./lastMove";

export type PlayerColor = "white" | "black";

export interface DailyGame {
  fen: string;
  turn: PlayerColor;
  moveBy: number;
  url: string;
  opponent: string;
  playerColor: PlayerColor;
  /**
   * Host-derived [from, to] of the most recent move — drives the Move Trail.
   * Omitted (never undefined) when the game has no usable pgn; the raw pgn is
   * never stored on the game (carry-light).
   */
  lastMove?: [string, string];
  /**
   * Game start time (Unix seconds) from the payload's `start_time` — drives the
   * oldest-first Sidebar Board ordering. **Best-effort:** omitted (never
   * `undefined`, mirroring `lastMove`) when the field is missing or non-numeric.
   * Ordering is cosmetic, so a missing value never throws or fails a poll.
   */
  startTime?: number;
}

function urlTail(profileUrl: string): string {
  return new URL(profileUrl).pathname.split("/").pop() ?? "";
}

function isPlayerColor(value: unknown): value is PlayerColor {
  return value === "white" || value === "black";
}

/**
 * Syntactic FEN validation for untrusted Chess.com payloads. Validates shape,
 * not legality (no check/repetition/turn reasoning): six fields, eight ranks
 * each describing exactly eight squares with legal glyphs, a `w`/`b` side to
 * move, and well-formed castling / en-passant / clock tokens. Throws on any
 * malformed input so a bad board crashes early in the data layer rather than
 * reaching the webview.
 */
function assertSyntacticFen(fen: string): void {
  const fields = fen.split(" ");
  if (fields.length !== 6) {
    throw new Error(`Invalid FEN: expected 6 fields, got ${fields.length}`);
  }
  const [placement, side, castling, enPassant, halfmove, fullmove] = fields as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];

  const ranks = placement.split("/");
  if (ranks.length !== 8) {
    throw new Error(`Invalid FEN: piece placement must have 8 ranks, got ${ranks.length}`);
  }
  for (const rank of ranks) {
    let squares = 0;
    for (const ch of rank) {
      if (ch >= "1" && ch <= "8") {
        squares += ch.charCodeAt(0) - "0".charCodeAt(0);
      } else if (/[prnbqk]/i.test(ch)) {
        squares += 1;
      } else {
        throw new Error(`Invalid FEN: illegal character '${ch}' in piece placement`);
      }
    }
    if (squares !== 8) {
      throw new Error(`Invalid FEN: rank '${rank}' does not describe 8 squares`);
    }
  }

  if (side !== "w" && side !== "b") {
    throw new Error("Invalid FEN: side to move must be 'w' or 'b'");
  }
  if (castling !== "-" && !/^[KQkq]+$/.test(castling)) {
    throw new Error("Invalid FEN: malformed castling field");
  }
  if (enPassant !== "-" && !/^[a-h][1-8]$/.test(enPassant)) {
    throw new Error("Invalid FEN: malformed en passant field");
  }
  if (!/^\d+$/.test(halfmove)) {
    throw new Error("Invalid FEN: malformed halfmove clock");
  }
  if (!/^[1-9]\d*$/.test(fullmove)) {
    throw new Error("Invalid FEN: malformed fullmove number");
  }
}

export function parse(rawJson: unknown, configuredUsername: string): DailyGame[] {
  if (
    typeof rawJson !== "object" ||
    rawJson === null ||
    !Array.isArray((rawJson as Record<string, unknown>)["games"])
  ) {
    throw new Error("Invalid Chess.com response: missing games array");
  }

  const { games } = rawJson as { games: unknown[] };
  const result: DailyGame[] = [];

  for (const entry of games) {
    if (typeof entry !== "object" || entry === null) {
      throw new Error("Invalid game entry: not an object");
    }
    const g = entry as Record<string, unknown>;

    if (g["time_class"] !== "daily") {
      continue;
    }

    if (typeof g["fen"] !== "string" || g["fen"].length === 0) {
      throw new Error("Game missing required field: fen");
    }
    assertSyntacticFen(g["fen"]);
    if (!isPlayerColor(g["turn"])) {
      throw new Error("Game missing required field: turn");
    }
    if (typeof g["move_by"] !== "number") {
      throw new Error("Game missing required field: move_by");
    }
    if (typeof g["url"] !== "string" || g["url"].length === 0) {
      throw new Error("Game missing required field: url");
    }
    if (typeof g["white"] !== "string" || typeof g["black"] !== "string") {
      throw new Error("Game missing required fields: white/black");
    }

    const whiteUser = urlTail(g["white"]);
    const blackUser = urlTail(g["black"]);
    const lower = configuredUsername.toLowerCase();

    let playerColor: PlayerColor;
    let opponent: string;

    if (whiteUser.toLowerCase() === lower) {
      playerColor = "white";
      opponent = blackUser;
    } else if (blackUser.toLowerCase() === lower) {
      playerColor = "black";
      opponent = whiteUser;
    } else {
      throw new Error(`Configured username "${configuredUsername}" not found in game player URLs`);
    }

    // Best-effort, per board: a missing/malformed pgn yields undefined and is
    // omitted — never thrown — so one bad game's trail can't abort the loop or
    // downgrade the cycle. Only [from, to] is kept; the raw pgn is discarded.
    const lastMove = typeof g["pgn"] === "string" ? deriveLastMove(g["pgn"]) : undefined;
    const game: DailyGame = {
      fen: g["fen"],
      turn: g["turn"],
      moveBy: g["move_by"],
      url: g["url"],
      opponent,
      playerColor,
    };
    if (lastMove) {
      game.lastMove = lastMove;
    }
    // Best-effort: `start_time` drives ordering only, so a missing/non-numeric
    // value is omitted (never thrown), exactly like a missing `pgn`/lastMove.
    if (typeof g["start_time"] === "number") {
      game.startTime = g["start_time"];
    }
    result.push(game);
  }

  return result;
}
