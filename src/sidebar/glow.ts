/**
 * Awaiting Glow intensity from absolute time remaining to a move deadline.
 *
 * The glow on every awaiting Sidebar Board ramps with urgency: faint when the
 * deadline is days away, stronger as it nears. Scaling by **absolute** time
 * remaining (`move_by − now`), not the per-move time control, guarantees the
 * soonest-deadline board is the strongest — the same board a click opens (ADR 0006).
 *
 * The ramp is **by presence** (the webview maps this to opacity/strength of a
 * fixed hue), never by darkening, so a faint glow stays visible on light and dark
 * themes alike.
 *
 * Returns a value in `[GLOW_FLOOR, 1]`:
 * - `remaining ≤ 0` (overdue) → `1` (clamped; multiple overdue games glow equally —
 *   the open target is still chosen deterministically by `TurnState`, not the glow).
 * - `remaining ≥ GLOW_CEILING_MS` (days away) → `GLOW_FLOOR` (a calm, present floor;
 *   when every awaiting deadline is beyond the ceiling, all glow equally faint).
 * - in between → a linear ramp, strictly decreasing in `remaining`.
 */
export const GLOW_FLOOR = 0.15;
export const GLOW_CEILING_MS = 72 * 60 * 60 * 1000; // 3 days

export function glowIntensity(moveBy: number /* unix seconds */, now: number /* ms */): number {
  const remaining = moveBy * 1000 - now;
  if (remaining <= 0) return 1;
  if (remaining >= GLOW_CEILING_MS) return GLOW_FLOOR;
  const t = 1 - remaining / GLOW_CEILING_MS; // 0 at the ceiling → 1 at the deadline
  return GLOW_FLOOR + (1 - GLOW_FLOOR) * t;
}
