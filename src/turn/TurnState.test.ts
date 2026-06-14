import assert from "node:assert/strict";
import { from } from "./TurnState";
import type { DailyGame } from "../poller/GamesParser";

const base: DailyGame = {
  fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  turn: "white",
  moveBy: 1_718_573_923,
  url: "https://www.chess.com/game/daily/1",
  opponent: "playertwo",
  playerColor: "white",
};

describe("TurnState.from()", () => {
  it("counts one awaiting game and returns it as mostUrgent", () => {
    const result = from([base]);
    assert.strictEqual(result.count, 1);
    assert.strictEqual(result.mostUrgent, base);
  });

  it("does not count a game where turn !== playerColor, even when moveBy is present", () => {
    const opponentsTurn: DailyGame = { ...base, turn: "black", playerColor: "white" };
    const result = from([opponentsTurn]);
    assert.strictEqual(result.count, 0);
    assert.strictEqual(result.mostUrgent, undefined);
  });

  it("returns the game with the smallest moveBy as mostUrgent", () => {
    const urgent: DailyGame = { ...base, url: "https://www.chess.com/game/daily/2", moveBy: 1_000 };
    const later: DailyGame = { ...base, url: "https://www.chess.com/game/daily/3", moveBy: 9_000 };
    const result = from([later, urgent]);
    assert.strictEqual(result.count, 2);
    assert.strictEqual(result.mostUrgent, urgent);
  });

  it("returns count 0 and no mostUrgent when given an empty list", () => {
    const result = from([]);
    assert.strictEqual(result.count, 0);
    assert.strictEqual(result.mostUrgent, undefined);
  });
});
