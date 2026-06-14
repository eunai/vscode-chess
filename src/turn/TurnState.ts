import type { DailyGame } from "../poller/GamesParser";

export interface TurnStateResult {
  count: number;
  mostUrgent: DailyGame | undefined;
}

export function from(games: DailyGame[]): TurnStateResult {
  const awaiting = games.filter((g) => g.turn === g.playerColor);
  if (awaiting.length === 0) {
    return { count: 0, mostUrgent: undefined };
  }
  const mostUrgent = awaiting.reduce((a, b) => (a.moveBy <= b.moveBy ? a : b));
  return { count: awaiting.length, mostUrgent };
}
