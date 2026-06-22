import type { DailyGame } from "./GamesParser";

/**
 * Order Daily Games **oldest-first**: by `startTime` ascending, then `url`
 * ascending as a deterministic tiebreak. A game with no `startTime` (best-effort,
 * may be omitted) sorts to the **end**, again `url`-ordered among such games. The
 * single comparator the sidebar ordering and the Most Urgent Game tiebreak share,
 * so board order and the open-target selection never drift.
 */
export function byAgeThenUrl(a: DailyGame, b: DailyGame): number {
  const at = a.startTime;
  const bt = b.startTime;
  if (at !== undefined && bt !== undefined) {
    if (at !== bt) return at - bt;
  } else if (at !== undefined) {
    return -1; // a dated, b undated → a first
  } else if (bt !== undefined) {
    return 1; // a undated, b dated → b first
  }
  return a.url < b.url ? -1 : a.url > b.url ? 1 : 0;
}

/**
 * Most Urgent Game ordering: soonest `moveBy` first, ties broken by
 * {@link byAgeThenUrl} (oldest `startTime`, then `url`). `[...games].sort(this)[0]`
 * is input-order-independent — the topmost awaiting board on a deadline tie.
 */
export function byMoveByThenAge(a: DailyGame, b: DailyGame): number {
  if (a.moveBy !== b.moveBy) return a.moveBy - b.moveBy;
  return byAgeThenUrl(a, b);
}
