import type { DailyGame } from "../poller/GamesParser";
import { byMoveByThenAge } from "../poller/dailyGameOrder";

export interface TurnStateResult {
  count: number;
  mostUrgent: DailyGame | undefined;
}

export function from(games: DailyGame[]): TurnStateResult {
  const awaiting = games.filter((g) => g.turn === g.playerColor);
  if (awaiting.length === 0) {
    return { count: 0, mostUrgent: undefined };
  }
  // Soonest move_by; ties broken deterministically (oldest startTime, then url) —
  // sorting (not a seedless reduce) makes the pick input-order-independent.
  const mostUrgent = [...awaiting].sort(byMoveByThenAge)[0];
  return { count: awaiting.length, mostUrgent };
}
