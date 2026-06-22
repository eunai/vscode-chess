import assert from "node:assert/strict";
import { byAgeThenUrl, byMoveByThenAge } from "./dailyGameOrder";
import type { DailyGame } from "./GamesParser";

function game(overrides: Partial<DailyGame> = {}): DailyGame {
  return {
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    turn: "white",
    moveBy: 1_000_000_000,
    url: "https://www.chess.com/game/daily/1",
    opponent: "opp",
    playerColor: "white",
    ...overrides,
  };
}

describe("dailyGameOrder", () => {
  describe("byAgeThenUrl", () => {
    it("orders by startTime ascending (oldest first)", () => {
      const older = game({ startTime: 100, url: "https://www.chess.com/game/daily/z" });
      const newer = game({ startTime: 200, url: "https://www.chess.com/game/daily/a" });
      assert.ok(byAgeThenUrl(older, newer) < 0);
      assert.ok(byAgeThenUrl(newer, older) > 0);
    });

    it("O4: equal startTime falls back to url ascending", () => {
      const a = game({ startTime: 100, url: "https://www.chess.com/game/daily/a" });
      const b = game({ startTime: 100, url: "https://www.chess.com/game/daily/b" });
      assert.ok(byAgeThenUrl(a, b) < 0);
      assert.ok(byAgeThenUrl(b, a) > 0);
    });

    it("O3: a defined startTime sorts before a missing one (missing goes last)", () => {
      const dated = game({ startTime: 100, url: "https://www.chess.com/game/daily/z" });
      const undated = game({ startTime: undefined, url: "https://www.chess.com/game/daily/a" });
      assert.ok(byAgeThenUrl(dated, undated) < 0);
      assert.ok(byAgeThenUrl(undated, dated) > 0);
    });

    it("both missing startTime → url ascending", () => {
      const a = game({ startTime: undefined, url: "https://www.chess.com/game/daily/a" });
      const b = game({ startTime: undefined, url: "https://www.chess.com/game/daily/b" });
      assert.ok(byAgeThenUrl(a, b) < 0);
    });

    it("is a stable total order — sorting a shuffled list is deterministic", () => {
      const g = (s: number | undefined, u: string) =>
        game({ startTime: s, url: `https://www.chess.com/game/daily/${u}` });
      const list = [g(300, "x"), g(undefined, "b"), g(100, "y"), g(100, "a"), g(undefined, "a")];
      const sorted = [...list].sort(byAgeThenUrl).map((x) => x.url);
      assert.deepStrictEqual(sorted, [
        "https://www.chess.com/game/daily/a", // startTime 100, url a
        "https://www.chess.com/game/daily/y", // startTime 100, url y
        "https://www.chess.com/game/daily/x", // startTime 300
        "https://www.chess.com/game/daily/a", // missing, url a
        "https://www.chess.com/game/daily/b", // missing, url b
      ]);
    });
  });

  describe("byMoveByThenAge", () => {
    it("orders by moveBy ascending (soonest deadline first)", () => {
      const soon = game({ moveBy: 100 });
      const later = game({ moveBy: 200 });
      assert.ok(byMoveByThenAge(soon, later) < 0);
    });

    it("TT1: equal moveBy → oldest startTime, then url", () => {
      const old = game({ moveBy: 100, startTime: 10, url: "https://www.chess.com/game/daily/z" });
      const young = game({ moveBy: 100, startTime: 20, url: "https://www.chess.com/game/daily/a" });
      assert.ok(byMoveByThenAge(old, young) < 0, "older startTime wins on a moveBy tie");

      const t1 = game({ moveBy: 100, startTime: 10, url: "https://www.chess.com/game/daily/a" });
      const t2 = game({ moveBy: 100, startTime: 10, url: "https://www.chess.com/game/daily/b" });
      assert.ok(byMoveByThenAge(t1, t2) < 0, "url breaks a full tie");
    });

    it("selecting [...].sort(byMoveByThenAge)[0] is input-order-independent", () => {
      const a = game({ moveBy: 5, startTime: 10, url: "https://www.chess.com/game/daily/a" });
      const b = game({ moveBy: 5, startTime: 10, url: "https://www.chess.com/game/daily/b" });
      const c = game({ moveBy: 3, startTime: 99, url: "https://www.chess.com/game/daily/c" });
      const order1 = [a, b, c].slice().sort(byMoveByThenAge)[0];
      const order2 = [c, b, a].slice().sort(byMoveByThenAge)[0];
      const order3 = [b, a, c].slice().sort(byMoveByThenAge)[0];
      assert.strictEqual(order1, c);
      assert.strictEqual(order2, c);
      assert.strictEqual(order3, c);
    });
  });
});
