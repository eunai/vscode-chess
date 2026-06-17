import assert from "node:assert/strict";
import { from, EMPTY_BOARD_FEN, STARTING_FEN } from "./SidebarModel";
import type { DailyGame } from "../poller/GamesParser";
import type { PollStatus } from "../poller/Poller";

/** Build a DailyGame with sensible defaults; override per test. */
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

function counted(games: DailyGame[]): PollStatus {
  const awaiting = games.filter((g) => g.turn === g.playerColor);
  const mostUrgent = awaiting.length
    ? awaiting.reduce((a, b) => (a.moveBy <= b.moveBy ? a : b))
    : undefined;
  return { kind: "counted", games, count: awaiting.length, mostUrgent };
}

describe("SidebarModel.from()", () => {
  // Tracer — the whole host mapping in one shot: order + orient + label + mark.
  it("T0: orders awaiting-first, orients to player color, labels opponent, marks awaiting", () => {
    const awaitingSoon = game({
      url: "https://www.chess.com/game/daily/await-soon",
      turn: "black",
      playerColor: "black", // awaiting (black to move, player black)
      moveBy: 100,
      opponent: "alice",
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1",
    });
    const notAwaiting = game({
      url: "https://www.chess.com/game/daily/zzz",
      turn: "white",
      playerColor: "black", // not awaiting (white to move, player black)
      moveBy: 1,
      opponent: "bob",
    });

    const model = from(counted([notAwaiting, awaitingSoon]), true, undefined);

    assert.strictEqual(model.boards.length, 2);
    const [first, second] = model.boards;
    // Awaiting sorts first despite a larger moveBy than the non-awaiting game.
    assert.strictEqual(first?.opponent, "alice");
    assert.strictEqual(first?.awaiting, true);
    assert.strictEqual(first?.orientation, "black");
    assert.strictEqual(first?.fen, awaitingSoon.fen);
    assert.strictEqual(second?.opponent, "bob");
    assert.strictEqual(second?.awaiting, false);
    assert.strictEqual(model.note, undefined);
  });

  it("M2: non-awaiting games are ordered by url ascending (deterministic)", () => {
    // All non-awaiting (white to move, player black); urls deliberately unsorted.
    const c = game({
      url: "https://www.chess.com/game/daily/c",
      turn: "white",
      playerColor: "black",
      opponent: "c",
    });
    const a = game({
      url: "https://www.chess.com/game/daily/a",
      turn: "white",
      playerColor: "black",
      opponent: "a",
    });
    const b = game({
      url: "https://www.chess.com/game/daily/b",
      turn: "white",
      playerColor: "black",
      opponent: "b",
    });

    const model = from(counted([c, a, b]), true, undefined);

    assert.deepStrictEqual(
      model.boards.map((board) => board.opponent),
      ["a", "b", "c"]
    );
  });

  it("M6: no username → one empty-board placeholder + setup note", () => {
    const model = from(undefined, false, undefined);
    assert.strictEqual(model.boards.length, 1);
    assert.strictEqual(model.boards[0]?.fen, EMPTY_BOARD_FEN);
    assert.strictEqual(model.boards[0]?.opponent, null);
    assert.strictEqual(model.boards[0]?.awaiting, false);
    assert.strictEqual(model.note?.kind, "setup");
  });

  it("M7: notFound → one empty-board placeholder + warning note", () => {
    const model = from({ kind: "notFound" }, true, undefined);
    assert.strictEqual(model.boards.length, 1);
    assert.strictEqual(model.boards[0]?.fen, EMPTY_BOARD_FEN);
    assert.strictEqual(model.note?.kind, "warning");
  });

  it("M8: valid username, zero Daily Games → starting-position placeholder, no note", () => {
    const model = from(counted([]), true, undefined);
    assert.strictEqual(model.boards.length, 1);
    assert.strictEqual(model.boards[0]?.fen, STARTING_FEN);
    assert.strictEqual(model.boards[0]?.opponent, null);
    assert.strictEqual(model.note, undefined);
  });

  it("M9: transient with last-known boards → those exact boards re-sent + retry note", () => {
    const lastKnown: SidebarBoardFixture[] = [
      { fen: "x", orientation: "white", opponent: "ada", awaiting: true },
    ];
    const model = from({ kind: "transient" }, true, lastKnown);
    assert.deepStrictEqual(model.boards, lastKnown);
    assert.strictEqual(model.note?.kind, "retry");
  });

  it("M10: transient with no last-known → empty placeholder + retry note", () => {
    const model = from({ kind: "transient" }, true, undefined);
    assert.strictEqual(model.boards.length, 1);
    assert.strictEqual(model.boards[0]?.fen, EMPTY_BOARD_FEN);
    assert.strictEqual(model.note?.kind, "retry");
  });

  it("TN1: counted with awaiting games → turnNotice mirrors the awaiting count", () => {
    const model = from(
      counted([
        game({ url: "https://www.chess.com/game/daily/1", opponent: "a" }), // awaiting (w to move, player w)
        game({ url: "https://www.chess.com/game/daily/2", opponent: "b" }), // awaiting
        game({ url: "https://www.chess.com/game/daily/3", opponent: "c", turn: "black" }), // not awaiting
      ]),
      true,
      undefined
    );
    assert.strictEqual(model.turnNotice?.count, 2);
  });

  it("TN2: counted with no awaiting games → no turnNotice", () => {
    const model = from(
      counted([game({ turn: "black", playerColor: "white", opponent: "a" })]), // not awaiting
      true,
      undefined
    );
    assert.strictEqual(model.turnNotice, undefined);
  });

  it("TN3: valid username, zero Daily Games → no turnNotice", () => {
    assert.strictEqual(from(counted([]), true, undefined).turnNotice, undefined);
  });

  it("TN4: no username → no turnNotice", () => {
    assert.strictEqual(from(undefined, false, undefined).turnNotice, undefined);
  });

  it("TN5: notFound → no turnNotice", () => {
    assert.strictEqual(from({ kind: "notFound" }, true, undefined).turnNotice, undefined);
  });

  it("TN6: transient re-sends last-known awaiting boards → turnNotice keeps that count", () => {
    const lastKnown: SidebarBoardFixture[] = [
      { fen: "x", orientation: "white", opponent: "ada", awaiting: true },
      { fen: "y", orientation: "black", opponent: "bo", awaiting: true },
      { fen: "z", orientation: "white", opponent: "cy", awaiting: false },
    ];
    const model = from({ kind: "transient" }, true, lastKnown);
    assert.strictEqual(model.turnNotice?.count, 2);
  });

  it("TN7: transient with no last-known → no turnNotice", () => {
    assert.strictEqual(from({ kind: "transient" }, true, undefined).turnNotice, undefined);
  });
});

// Local alias so the M9 fixture reads clearly without importing the contract type.
type SidebarBoardFixture = {
  fen: string;
  orientation: "white" | "black";
  opponent: string | null;
  awaiting: boolean;
};
