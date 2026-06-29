import assert from "node:assert/strict";
import { SidebarStore } from "./SidebarStore";
import { EMPTY_BOARD_FEN, STARTING_FEN } from "./SidebarModel";
import type { DailyGame } from "../poller/GamesParser";
import type { PollStatus } from "../poller/Poller";
import type { TokenAuthority } from "./TokenAuthority";

function makeAuthority(): TokenAuthority {
  const cache = new Map<string, string>();
  let n = 0;
  return {
    mint: (id) => {
      if (!cache.has(id)) cache.set(id, `tok-${n++}`);
      return cache.get(id)!;
    },
  };
}

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
  confirmedAt: 0,
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
    store.update({ kind: "notFound", confirmedAt: 0 }, true); // must clear last-known
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

  it("UG4 → glow: a transient rebuild keeps every awaiting board glowing (recomputed from games)", () => {
    const store = new SidebarStore();
    const alice: DailyGame = {
      ...awaitingGame,
      url: "https://www.chess.com/game/daily/a",
      opponent: "alice",
    };
    const bob: DailyGame = {
      ...awaitingGame,
      url: "https://www.chess.com/game/daily/b",
      opponent: "bob",
    };
    const status: PollStatus = {
      kind: "counted",
      games: [bob, alice],
      count: 2,
      mostUrgent: alice,
      confirmedAt: 0,
    };

    store.update(status, true);
    const model = store.update({ kind: "transient" }, true); // rebuild from games, not a stale re-send

    const aliceBoard = model.boards.find((b) => b.opponent === "alice");
    assert.ok(aliceBoard);
    assert.ok(aliceBoard.glow > 0, "glow persists across a transient blip");
    assert.strictEqual(model.boards.filter((b) => b.awaiting).length, 2);
    assert.strictEqual(model.note?.kind, "retry");
  });

  // --- S2/S3: glow recomputes from a fresh injected `now` on every tick ---
  const HOUR = 3_600_000;
  const T1 = 1_700_000_000_000;
  /** An awaiting game whose deadline is T1 + 40h — inside the ramp window at T1. */
  const awaitingSoon: DailyGame = { ...awaitingGame, moveBy: (T1 + 40 * HOUR) / 1000 };

  it("ST-COUNTED-ADV: a repeat counted (same games) at a later now → strictly higher awaiting glow", () => {
    let t = T1;
    const store = new SidebarStore(() => t);
    const glow1 = store.update(counted([awaitingSoon]), true).boards[0]!.glow;
    t = T1 + 10 * HOUR; // 10h closer to the deadline
    const glow2 = store.update(counted([awaitingSoon]), true).boards[0]!.glow;
    assert.ok(glow2 > glow1, `${glow2} should exceed ${glow1} as the deadline nears`);
  });

  it("ST-ADV: a transient rebuilds from last-known games at a fresh now → glow ramps while disconnected", () => {
    let t = T1;
    const store = new SidebarStore(() => t);
    const glow1 = store.update(counted([awaitingSoon]), true).boards[0]!.glow;
    t = T1 + 10 * HOUR;
    const model = store.update({ kind: "transient" }, true);
    assert.strictEqual(model.note?.kind, "retry");
    assert.ok(
      model.boards[0]!.glow > glow1,
      "glow keeps ramping from the known deadline while disconnected"
    );
  });

  it("clears last-known when the username is removed", () => {
    const store = new SidebarStore();
    store.update(counted([awaitingGame]), true);
    store.update(undefined, false); // username cleared
    const model = store.update({ kind: "transient" }, true);
    assert.strictEqual(model.boards[0]?.fen, EMPTY_BOARD_FEN);
  });

  // --- S2: token-map retention (resolveToken) ---

  it("SS-RET1: resolveToken after counted update returns the correct action for a game in the status", () => {
    const auth = makeAuthority();
    const store = new SidebarStore(() => Date.now(), auth);
    const model = store.update(counted([awaitingGame]), true);
    const token = model.boards[0]?.action?.token;
    assert.ok(token, "board must carry an action token after update with authority");
    const action = store.resolveToken(token);
    assert.ok(action !== undefined, "resolveToken must return the action");
    assert.strictEqual(action.kind, "openUrl");
    assert.strictEqual(action.url, awaitingGame.url);
  });

  it("SS-RET2: resolveToken after transient still resolves last-known tokens (RETAIN)", () => {
    const auth = makeAuthority();
    const store = new SidebarStore(() => Date.now(), auth);
    const model = store.update(counted([awaitingGame]), true);
    const token = model.boards[0]?.action?.token;
    assert.ok(token);
    store.update({ kind: "transient" }, true); // token map must be RETAINED
    const action = store.resolveToken(token);
    assert.ok(
      action !== undefined,
      "stale boards remain activatable across a transient (DESIGN.md)"
    );
    assert.strictEqual(action.kind, "openUrl");
    assert.strictEqual(action.url, awaitingGame.url);
  });

  it("SS-RET3: resolveToken after notFound → undefined (token map cleared)", () => {
    const auth = makeAuthority();
    const store = new SidebarStore(() => Date.now(), auth);
    const model = store.update(counted([awaitingGame]), true);
    const token = model.boards[0]?.action?.token;
    assert.ok(token);
    store.update({ kind: "notFound", confirmedAt: 0 }, true);
    assert.strictEqual(store.resolveToken(token), undefined);
  });

  it("SS-RET4: resolveToken after counted with 0 games → undefined (token map cleared)", () => {
    const auth = makeAuthority();
    const store = new SidebarStore(() => Date.now(), auth);
    const model = store.update(counted([awaitingGame]), true);
    const token = model.boards[0]?.action?.token;
    assert.ok(token);
    store.update(counted([]), true); // 0 games → clear
    assert.strictEqual(store.resolveToken(token), undefined);
  });

  it("SS-RET5: resolveToken without an authority → always undefined (DR9 backward-compat)", () => {
    const store = new SidebarStore(); // no authority
    store.update(counted([awaitingGame]), true);
    assert.strictEqual(store.resolveToken("any-token"), undefined);
  });

  // --- S3: Settings-token retention per placeholder state ---

  it("SS-SET1: resolveToken after a no-username update returns the openSettings action", () => {
    const auth = makeAuthority();
    const store = new SidebarStore(() => Date.now(), auth);
    const model = store.update(undefined, false); // no username configured
    const token = model.boards[0]?.action?.token;
    assert.ok(token, "the no-username placeholder must carry a Settings action token");
    assert.strictEqual(store.resolveToken(token)?.kind, "openSettings");
  });

  it("SS-SET2: resolveToken after a notFound update returns the openSettings action", () => {
    const auth = makeAuthority();
    const store = new SidebarStore(() => Date.now(), auth);
    const model = store.update({ kind: "notFound", confirmedAt: 0 }, true);
    const token = model.boards[0]?.action?.token;
    assert.ok(token, "the unknown-user placeholder must carry a Settings action token");
    assert.strictEqual(store.resolveToken(token)?.kind, "openSettings");
  });

  it("SS-SET3: a Settings token fails closed once the state changes (no-username → notFound)", () => {
    const auth = makeAuthority();
    const store = new SidebarStore(() => Date.now(), auth);
    const noUserToken = store.update(undefined, false).boards[0]?.action?.token;
    assert.ok(noUserToken);
    const unknownUserToken = store.update({ kind: "notFound", confirmedAt: 0 }, true).boards[0]
      ?.action?.token;
    assert.ok(unknownUserToken);
    assert.notStrictEqual(noUserToken, unknownUserToken, "distinct identities → distinct tokens");
    assert.strictEqual(
      store.resolveToken(noUserToken),
      undefined,
      "the stale no-username token no longer resolves after the state moves to notFound"
    );
    assert.strictEqual(store.resolveToken(unknownUserToken)?.kind, "openSettings");
  });

  it("SS-SET4: idle and a no-data transient placeholder carry no action token", () => {
    const auth = makeAuthority();
    const store = new SidebarStore(() => Date.now(), auth);
    const idle = store.update(counted([]), true).boards[0];
    assert.ok(idle);
    assert.strictEqual("action" in idle, false, "idle zero-games placeholder carries no action");

    const fresh = new SidebarStore(() => Date.now(), auth);
    const transient = fresh.update({ kind: "transient" }, true).boards[0]; // no last-known → empty
    assert.ok(transient);
    assert.strictEqual(
      "action" in transient,
      false,
      "no-data transient placeholder carries no action"
    );
  });

  it("SS-SET5: Settings token fails closed on notFound→transient with no last-known games", () => {
    // Regression for the adversarially-confirmed gap: the retain-across-transient
    // rule must NOT preserve a Settings token whose carrying board renders inert.
    const auth = makeAuthority();
    const store = new SidebarStore(() => Date.now(), auth);
    const notFoundModel = store.update({ kind: "notFound", confirmedAt: 0 }, true);
    const token = notFoundModel.boards[0]?.action?.token;
    assert.ok(token, "notFound board carries a Settings action token");
    assert.strictEqual(store.resolveToken(token)?.kind, "openSettings");

    // A transient with no last-known games → board renders inert, token must not resolve.
    const transientModel = store.update({ kind: "transient" }, true);
    assert.strictEqual(
      "action" in (transientModel.boards[0] ?? {}),
      false,
      "transient (no last-known) board is inert"
    );
    assert.strictEqual(
      store.resolveToken(token),
      undefined,
      "stale Settings token does not resolve after notFound→transient with no last-known games"
    );
  });

  it("MT7: transient re-sends last-known boards with the Move Trail (lastMove) intact", () => {
    const store = new SidebarStore();
    const withTrail: DailyGame = {
      ...awaitingGame,
      url: "https://www.chess.com/game/daily/trail",
      opponent: "ada",
      lastMove: ["e2", "e4"],
    };
    store.update(counted([withTrail]), true); // last-known boards carry the trail
    const model = store.update({ kind: "transient" }, true); // re-send must preserve it
    const board = model.boards.find((b) => b.opponent === "ada");
    assert.deepStrictEqual(board?.lastMove, ["e2", "e4"], "trail persists across a transient blip");
    assert.strictEqual(model.note?.kind, "retry");
  });
});
