import assert from "node:assert/strict";
import { from } from "./PresenceState";
import type { LastKnownTurnSummary } from "./PresenceState";
import type { PollStatus } from "../poller/Poller";
import type { DailyGame } from "../poller/GamesParser";

const NOW = 10_000_000; // fixed ms epoch → deterministic relative text

/** A game whose move deadline is `minutesFromNow` minutes after NOW (move_by is Unix seconds). */
function gameDueIn(minutesFromNow: number): DailyGame {
  return {
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    turn: "white",
    moveBy: NOW / 1000 + minutesFromNow * 60,
    url: "https://www.chess.com/game/daily/x",
    opponent: "rival",
    playerColor: "white",
  };
}

const counted = (
  count: number,
  mostUrgent: DailyGame | undefined,
  confirmedAt: number
): PollStatus => ({ kind: "counted", games: [], count, mostUrgent, confirmedAt });

const notFound: PollStatus = { kind: "notFound", confirmedAt: NOW };
const transient: PollStatus = { kind: "transient" };

describe("PresenceState.from()", () => {
  it("returns unconfigured when no username is set, whatever the poll status", () => {
    assert.deepEqual(from(counted(3, gameDueIn(70), NOW), false, undefined, NOW), {
      kind: "unconfigured",
    });
    assert.deepEqual(from(notFound, false, undefined, NOW), { kind: "unconfigured" });
    assert.deepEqual(from(transient, false, undefined, NOW), { kind: "unconfigured" });
    assert.deepEqual(from(undefined, false, undefined, NOW), { kind: "unconfigured" });
  });

  it("counted(>0) → count carrying the Most Urgent deadline and last-confirmed Freshness", () => {
    const s = from(counted(3, gameDueIn(70), NOW - 4 * 60_000), true, undefined, NOW);
    assert.deepEqual(s, {
      kind: "count",
      count: 3,
      deadlineText: "1h 10m",
      freshnessText: "last confirmed 4m ago",
    });
  });

  it("counted(0) → idle with last-confirmed Freshness", () => {
    assert.deepEqual(from(counted(0, undefined, NOW - 2 * 60_000), true, undefined, NOW), {
      kind: "idle",
      freshnessText: "last confirmed 2m ago",
    });
  });

  it("pre-first-poll (undefined status) → idle with 'checking...'", () => {
    assert.deepEqual(from(undefined, true, undefined, NOW), {
      kind: "idle",
      freshnessText: "checking...",
    });
  });

  it("notFound → badUsername (no Freshness in #68)", () => {
    assert.deepEqual(from(notFound, true, undefined, NOW), { kind: "badUsername" });
  });

  it("transient with a last-known turn summary → carries last-known count + deadline + aging Freshness", () => {
    const lk: LastKnownTurnSummary = {
      count: 3,
      mostUrgent: gameDueIn(70),
      confirmedAt: NOW - 4 * 60_000,
    };
    assert.deepEqual(from(transient, true, lk, NOW), {
      kind: "transient",
      freshnessText: "last confirmed 4m ago",
      lastKnown: { count: 3, deadlineText: "1h 10m" },
    });
  });

  it("transient before any Confirmation → 'checking...' and no last-known clause", () => {
    assert.deepEqual(from(transient, true, undefined, NOW), {
      kind: "transient",
      freshnessText: "checking...",
    });
  });

  it("transient whose last-known was idle (count 0) → Freshness only, no last-known clause", () => {
    const lk: LastKnownTurnSummary = { count: 0, mostUrgent: undefined, confirmedAt: NOW - 90_000 };
    assert.deepEqual(from(transient, true, lk, NOW), {
      kind: "transient",
      freshnessText: "last confirmed 1m ago",
    });
  });

  it("counted Freshness ages with the clock (recompute-at-render, no timer)", () => {
    const confirmedAt = NOW;
    const early = from(counted(0, undefined, confirmedAt), true, undefined, NOW + 1 * 60_000);
    const later = from(counted(0, undefined, confirmedAt), true, undefined, NOW + 9 * 60_000);
    assert.deepEqual(early, { kind: "idle", freshnessText: "last confirmed 1m ago" });
    assert.deepEqual(later, { kind: "idle", freshnessText: "last confirmed 9m ago" });
  });
});
