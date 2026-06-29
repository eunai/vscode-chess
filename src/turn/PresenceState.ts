import type { PollStatus } from "../poller/Poller";
import type { DailyGame } from "../poller/GamesParser";
import { formatDeadline, formatFreshness } from "./presenceFormat";

/**
 * The last `counted` poll's turn summary, retained host-side **only** to render
 * the `count` / `transient` Presence (specifically the `transient` tooltip's
 * last-known clause). This is the render cache — distinct from a poll-level
 * Confirmation: it is cleared on `notFound` / username change and kept across a
 * `transient`, whereas `confirmedAt` on a `notFound` is still a real Confirmation
 * for the Stale Notification Guard (#67).
 */
export interface LastKnownTurnSummary {
  count: number;
  mostUrgent: DailyGame | undefined;
  /** The `confirmedAt` stamp from the `counted` poll that produced this summary. */
  confirmedAt: number;
}

/**
 * The five presentation states the Presence can render. Each carries the
 * already-formatted text fragments `from` derives (deadline, Freshness) so the
 * Presence composes the label/tooltip and computes nothing itself.
 */
export type PresenceState =
  | { kind: "unconfigured" }
  | { kind: "badUsername" }
  | { kind: "idle"; freshnessText: string }
  | { kind: "count"; count: number; deadlineText: string; freshnessText: string }
  | {
      kind: "transient";
      freshnessText: string;
      lastKnown?: { count: number; deadlineText: string };
    };

/** "checking..." stands alone; any real Confirmation age is prefixed "last confirmed ". */
function freshnessSegment(ageMs: number | undefined): string {
  const fresh = formatFreshness(ageMs);
  return fresh === "checking..." ? fresh : `last confirmed ${fresh}`;
}

/** Age of a Confirmation in ms, or undefined when there is no Confirmation. */
function ageOf(confirmedAt: number | undefined, now: number): number | undefined {
  return confirmedAt === undefined ? undefined : now - confirmedAt;
}

/** Remaining ms until a game's move deadline (`move_by` is Unix seconds; `now` is ms). */
function remainingMs(game: DailyGame, now: number): number {
  return game.moveBy * 1000 - now;
}

/**
 * Map a poll status (or its absence, before the first cycle) plus username
 * configuration, the last-known turn summary (render cache), and the current
 * time to exactly one enriched PresenceState. Deadline and Freshness are computed
 * here from `now` so the Presence stays a dumb renderer.
 */
export function from(
  pollStatus: PollStatus | undefined,
  usernameConfigured: boolean,
  lastKnownTurnSummary: LastKnownTurnSummary | undefined,
  now: number
): PresenceState {
  if (!usernameConfigured) {
    return { kind: "unconfigured" };
  }
  if (pollStatus === undefined) {
    // Pre-first-poll: idle with no Confirmation yet.
    return { kind: "idle", freshnessText: freshnessSegment(undefined) };
  }
  switch (pollStatus.kind) {
    case "counted": {
      const freshnessText = freshnessSegment(ageOf(pollStatus.confirmedAt, now));
      if (pollStatus.count > 0) {
        const mu = pollStatus.mostUrgent;
        const deadlineText = mu ? formatDeadline(remainingMs(mu, now)) : "";
        return { kind: "count", count: pollStatus.count, deadlineText, freshnessText };
      }
      return { kind: "idle", freshnessText };
    }
    case "notFound":
      return { kind: "badUsername" };
    case "transient": {
      const lk = lastKnownTurnSummary;
      const freshnessText = freshnessSegment(ageOf(lk?.confirmedAt, now));
      if (lk && lk.count > 0 && lk.mostUrgent) {
        const deadlineText = formatDeadline(remainingMs(lk.mostUrgent, now));
        return { kind: "transient", freshnessText, lastKnown: { count: lk.count, deadlineText } };
      }
      return { kind: "transient", freshnessText };
    }
  }
}
