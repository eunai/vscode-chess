import assert from "node:assert/strict";
import { SidebarStore } from "./SidebarStore";
import { EMPTY_BOARD_FEN, STARTING_FEN } from "./SidebarModel";
import type { DailyGame } from "../poller/GamesParser";
import type { PollStatus } from "../poller/Poller";

const awaitingGame: DailyGame = {
  fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  turn: "white",
  moveBy: 1_000_000_000,
  url: "https://www.chess.com/game/daily/1",
  opponent: "ada",
  playerColor: "white",
};

const counted = (games: DailyGame[]): PollStatus => ({
  kind: "counted",
  games,
  count: games.filter((g) => g.turn === g.playerColor).length,
  mostUrgent: undefined,
});

describe("SidebarStore", () => {
  it("latestModel reflects the most recent apply (the replay source)", () => {
    const store = new SidebarStore();
    const model = store.update(counted([awaitingGame]), true);
    assert.strictEqual(store.latestModel, model);
    assert.strictEqual(store.latestModel.boards[0]?.opponent, "ada");
  });

  it("M11: counted(0 games) sets last-known; a following transient re-sends it + retry", () => {
    const store = new SidebarStore();
    store.update(counted([]), true); // last-known becomes the starting placeholder
    const model = store.update({ kind: "transient" }, true);
    assert.strictEqual(model.boards.length, 1);
    assert.strictEqual(model.boards[0]?.fen, STARTING_FEN);
    assert.strictEqual(model.note?.kind, "retry");
  });

  it("M12: notFound clears last-known; a following transient → empty placeholder + retry", () => {
    const store = new SidebarStore();
    store.update(counted([awaitingGame]), true); // last-known = real boards
    store.update({ kind: "notFound" }, true); // must clear last-known
    const model = store.update({ kind: "transient" }, true);
    assert.strictEqual(model.boards.length, 1);
    assert.strictEqual(model.boards[0]?.fen, EMPTY_BOARD_FEN, "no stale real board survives a 404");
    assert.strictEqual(model.note?.kind, "retry");
  });

  it("M13: a fresh start (status undefined) clears last-known — old Player's boards never leak", () => {
    const store = new SidebarStore();
    store.update(counted([awaitingGame]), true); // last-known set for old Player
    store.update(undefined, true); // username changed / fresh — clears
    const model = store.update({ kind: "transient" }, true);
    assert.strictEqual(model.boards[0]?.fen, EMPTY_BOARD_FEN);
    assert.strictEqual(model.note?.kind, "retry");
  });

  it("UG4: transient re-sends last-known boards with the Urgent Glow flag intact", () => {
    const store = new SidebarStore();
    const alice: DailyGame = {
      ...awaitingGame,
      url: "https://www.chess.com/game/daily/a",
      opponent: "alice",
      moveBy: 100,
    };
    const bob: DailyGame = {
      ...awaitingGame,
      url: "https://www.chess.com/game/daily/b",
      opponent: "bob",
      moveBy: 200,
    };
    const status: PollStatus = {
      kind: "counted",
      games: [bob, alice],
      count: 2,
      mostUrgent: alice,
    };

    store.update(status, true); // last-known boards carry the mostUrgent flag
    const model = store.update({ kind: "transient" }, true); // re-send must preserve it

    const aliceBoard = model.boards.find((b) => b.opponent === "alice");
    assert.strictEqual(aliceBoard?.mostUrgent, true, "glow persists across a transient blip");
    assert.strictEqual(model.boards.filter((b) => b.mostUrgent).length, 1);
    assert.strictEqual(model.note?.kind, "retry");
  });

  it("clears last-known when the username is removed", () => {
    const store = new SidebarStore();
    store.update(counted([awaitingGame]), true);
    store.update(undefined, false); // username cleared
    const model = store.update({ kind: "transient" }, true);
    assert.strictEqual(model.boards[0]?.fen, EMPTY_BOARD_FEN);
  });
});
