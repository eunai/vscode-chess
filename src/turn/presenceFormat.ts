/**
 * Pure formatters for the Presence's dynamic text fragments — the move deadline
 * and data Freshness. No `vscode` dependency and no clock reads: callers pass an
 * already-computed millisecond delta, so the output is deterministic and unit
 * testable. `PresenceState.from` composes these into the rendered label/tooltip.
 */

/**
 * Format the time remaining until a move deadline as **at most two units, no
 * seconds** (`"2d 3h"`, `"1h 10m"`, `"47m"`). A non-positive remaining time
 * clamps to `"due now"` — never a negative value, never "overdue". A positive
 * sub-minute remainder shows the smallest unit (`"1m"`) rather than `"0m"`.
 *
 * @param remainingMs `move_by` minus now, in milliseconds.
 */
export function formatDeadline(remainingMs: number): string {
  if (remainingMs <= 0) return "due now";
  const totalMinutes = Math.max(1, Math.floor(remainingMs / 60_000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * Format the age of the latest Confirmation as a **single coarse unit**
 * (`"just now"` under a minute, then `"4m ago"` / `"2h ago"` / `"1d ago"`). An
 * absent Confirmation (no poll has verified the displayed state yet) yields
 * `"checking..."`. The caller decides whether to prefix `"last confirmed "` —
 * `"checking..."` stands alone.
 *
 * @param ageMs now minus the Confirmation's `confirmedAt`, in milliseconds, or
 *   `undefined` when there is no Confirmation yet.
 */
export function formatFreshness(ageMs: number | undefined): string {
  if (ageMs === undefined) return "checking...";
  if (ageMs < 60_000) return "just now";
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
