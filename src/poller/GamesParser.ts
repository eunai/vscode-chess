export type PlayerColor = "white" | "black";

export interface DailyGame {
  fen: string;
  turn: PlayerColor;
  moveBy: number;
  url: string;
  opponent: string;
  playerColor: PlayerColor;
}

function urlTail(profileUrl: string): string {
  return new URL(profileUrl).pathname.split("/").pop() ?? "";
}

function isPlayerColor(value: unknown): value is PlayerColor {
  return value === "white" || value === "black";
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

    result.push({
      fen: g["fen"],
      turn: g["turn"],
      moveBy: g["move_by"],
      url: g["url"],
      opponent,
      playerColor,
    });
  }

  return result;
}
