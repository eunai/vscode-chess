import assert from "node:assert/strict";
import { from as fromModel, EMPTY_BOARD_FEN, STARTING_FEN } from "./SidebarModel";
import { GLOW_FLOOR } from "./glow";
import type { DailyGame } from "../poller/GamesParser";
import type { PollStatus } from "../poller/Poller";
import type { ActionDescriptor } from "./boardActions";

// Fixed clock for deterministic glow. Non-glow tests rely on the default; glow
// tests pass an explicit `now`. move_by is Unix seconds, so build it from NOW_S.
const NOW = 1_700_000_000_000; // ms
const NOW_S = NOW / 1000;
/** `from` with `now` defaulted to NOW so the many non-glow tests stay terse. */
const from = (
  status: PollStatus | undefined,
  usernameConfigured: boolean,
  lastKnownGames: DailyGame[] | undefined,
  now: number = NOW,
  descriptors?: ReadonlyMap<string, ActionDescriptor>
): ReturnType<typeof fromModel> =>
  fromModel(status, usernameConfigured, lastKnownGames, now, descriptors);

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
  return { kind: "counted", games, count: awaiting.length, mostUrgent, confirmedAt: 0 };
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

  // --- S1: oldest-first ordering by start_time within each group ---

  /** An awaiting game (white to move, player white) with a start time + opponent. */
  const awaitingAt = (startTime: number | undefined, opponent: string, url = opponent): DailyGame =>
    game({ url: `https://www.chess.com/game/daily/${url}`, opponent, startTime });
  /** A non-awaiting game (black to move, player white). */
  const othersAt = (startTime: number | undefined, opponent: string, url = opponent): DailyGame =>
    game({ url: `https://www.chess.com/game/daily/${url}`, opponent, startTime, turn: "black" });

  it("O1: awaiting boards are ordered oldest start_time first", () => {
    const model = from(
      counted([awaitingAt(300, "c"), awaitingAt(100, "a"), awaitingAt(200, "b")]),
      true,
      undefined
    );
    assert.deepStrictEqual(
      model.boards.map((b) => b.opponent),
      ["a", "b", "c"]
    );
  });

  it("O2: non-awaiting boards are ordered oldest start_time first", () => {
    const model = from(
      counted([othersAt(300, "c"), othersAt(100, "a"), othersAt(200, "b")]),
      true,
      undefined
    );
    assert.deepStrictEqual(
      model.boards.map((b) => b.opponent),
      ["a", "b", "c"]
    );
  });

  it("O3: a missing start_time sorts to the end of its group (tie-broken by url)", () => {
    const model = from(
      counted([
        awaitingAt(undefined, "z-undated", "z"),
        awaitingAt(200, "dated"),
        awaitingAt(undefined, "a-undated", "a"),
      ]),
      true,
      undefined
    );
    assert.deepStrictEqual(
      model.boards.map((b) => b.opponent),
      ["dated", "a-undated", "z-undated"]
    );
  });

  it("O4: equal start_time within a group falls back to url ascending", () => {
    const model = from(counted([awaitingAt(100, "b"), awaitingAt(100, "a")]), true, undefined);
    assert.deepStrictEqual(
      model.boards.map((b) => b.opponent),
      ["a", "b"]
    );
  });

  it("SHIFT (proof #3): when a game ends, the survivors keep oldest-first order (lower boards shift up)", () => {
    const all = from(
      counted([awaitingAt(100, "g1"), awaitingAt(200, "g2"), awaitingAt(300, "g3")]),
      true,
      undefined
    );
    assert.deepStrictEqual(
      all.boards.map((b) => b.opponent),
      ["g1", "g2", "g3"]
    );
    // g2 ends → drops out; g3 moves up into g2's slot, order preserved.
    const afterEnd = from(counted([awaitingAt(100, "g1"), awaitingAt(300, "g3")]), true, undefined);
    assert.deepStrictEqual(
      afterEnd.boards.map((b) => b.opponent),
      ["g1", "g3"]
    );
  });

  it("BOTTOM (proof #4): a newly-started game (newer start_time) sorts to the bottom of its group", () => {
    const model = from(
      counted([awaitingAt(100, "g1"), awaitingAt(200, "g2"), awaitingAt(300, "g3-new")]),
      true,
      undefined
    );
    assert.strictEqual(model.boards.at(-1)?.opponent, "g3-new");
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
    const model = from({ kind: "notFound", confirmedAt: 0 }, true, undefined);
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

  it("M9: transient rebuilds boards from the last-known games (fresh glow) + retry note", () => {
    const lastKnownGames = [
      game({ url: "https://www.chess.com/game/daily/ada", opponent: "ada", moveBy: NOW_S + 3600 }),
    ];
    const model = from({ kind: "transient" }, true, lastKnownGames);
    const board = model.boards.find((b) => b.opponent === "ada");
    assert.ok(board, "the last-known game is rebuilt into a board");
    assert.strictEqual(board.awaiting, true);
    assert.ok(board.glow > 0, "glow is recomputed from the games, not a stale re-send");
    assert.strictEqual(model.note?.kind, "retry");
  });

  it("M10: transient with no last-known → empty placeholder + retry note", () => {
    const model = from({ kind: "transient" }, true, undefined);
    assert.strictEqual(model.boards.length, 1);
    assert.strictEqual(model.boards[0]?.fen, EMPTY_BOARD_FEN);
    assert.strictEqual(model.note?.kind, "retry");
  });

  // --- S2: Awaiting Glow intensity (replaces the former single-board most-urgent flag) ---

  /** An awaiting game (white to move, player white) whose deadline is `hours` from NOW. */
  const awaitingIn = (hours: number, opponent: string): DailyGame =>
    game({
      url: `https://www.chess.com/game/daily/${opponent}`,
      opponent,
      moveBy: NOW_S + hours * 3600,
    });

  it("G1: an awaiting board with a near deadline carries glow > 0", () => {
    const board = from(counted([awaitingIn(1, "ada")]), true, undefined).boards.find(
      (b) => b.opponent === "ada"
    );
    assert.ok(board);
    assert.ok(board.glow > 0, `expected glow > 0, got ${board.glow}`);
  });

  it("G2: a non-awaiting board carries glow === 0 (proof #2, pure)", () => {
    const board = from(
      counted([game({ url: "https://www.chess.com/game/daily/x", opponent: "x", turn: "black" })]),
      true,
      undefined
    ).boards.find((b) => b.opponent === "x");
    assert.ok(board);
    assert.strictEqual(board.awaiting, false);
    assert.strictEqual(board.glow, 0);
  });

  it("G3: every placeholder board carries glow === 0", () => {
    const placeholders = [
      from(undefined, false, undefined), // setup
      from({ kind: "notFound", confirmedAt: 0 }, true, undefined), // warning
      from(counted([]), true, undefined), // zero games (starting)
      from(undefined, true, undefined), // pre-first-poll (starting)
    ];
    for (const model of placeholders) {
      assert.strictEqual(model.boards.length, 1);
      assert.strictEqual(model.boards[0]?.glow, 0);
    }
  });

  it("G4: among awaiting boards, the soonest move_by glows strongest", () => {
    const model = from(counted([awaitingIn(1, "soon"), awaitingIn(10, "later")]), true, undefined);
    const soon = model.boards.find((b) => b.opponent === "soon")!;
    const later = model.boards.find((b) => b.opponent === "later")!;
    assert.ok(soon.glow > later.glow, `${soon.glow} should exceed ${later.glow}`);
  });

  it("G5: awaiting games sharing the soonest move_by glow equally (derived-cue invariant)", () => {
    const model = from(counted([awaitingIn(2, "a"), awaitingIn(2, "b")]), true, undefined);
    const a = model.boards.find((b) => b.opponent === "a")!;
    const b = model.boards.find((b) => b.opponent === "b")!;
    assert.strictEqual(a.glow, b.glow);
  });

  it("G-FLOOR: an awaiting board past the ceiling glows at GLOW_FLOOR (still > 0)", () => {
    const board = from(counted([awaitingIn(1000, "far")]), true, undefined).boards.find(
      (b) => b.opponent === "far"
    )!;
    assert.strictEqual(board.glow, GLOW_FLOOR);
    assert.ok(board.glow > 0);
  });

  it("G-DEGEN: all awaiting deadlines past the ceiling → every awaiting board glows equally at FLOOR", () => {
    const model = from(counted([awaitingIn(200, "a"), awaitingIn(500, "b")]), true, undefined);
    const glows = model.boards.filter((b) => b.awaiting).map((b) => b.glow);
    assert.deepStrictEqual(glows, [GLOW_FLOOR, GLOW_FLOOR]);
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
    assert.strictEqual(
      from({ kind: "notFound", confirmedAt: 0 }, true, undefined).turnNotice,
      undefined
    );
  });

  it("TN6: transient rebuilds last-known games → turnNotice keeps the awaiting count", () => {
    const lastKnownGames = [
      game({ url: "https://www.chess.com/game/daily/ada", opponent: "ada" }), // awaiting (w/w)
      game({ url: "https://www.chess.com/game/daily/bo", opponent: "bo" }), // awaiting
      game({ url: "https://www.chess.com/game/daily/cy", opponent: "cy", turn: "black" }), // not awaiting
    ];
    const model = from({ kind: "transient" }, true, lastKnownGames);
    assert.strictEqual(model.turnNotice?.count, 2);
  });

  it("TN7: transient with no last-known → no turnNotice", () => {
    assert.strictEqual(from({ kind: "transient" }, true, undefined).turnNotice, undefined);
  });

  // --- S2: action descriptor attachment ---

  it("SM-ACT1: from() with a descriptor map attaches action to the matching game board", () => {
    const g = game({ url: "https://www.chess.com/game/daily/42", opponent: "ada" });
    const descriptors = new Map<string, ActionDescriptor>([
      [g.url, { token: "tok-abc", label: "Open game vs ada" }],
    ]);
    const board = from(counted([g]), true, undefined, NOW, descriptors).boards.find(
      (b) => b.opponent === "ada"
    );
    assert.ok(board, "board must be present");
    assert.deepStrictEqual(board.action, { token: "tok-abc", label: "Open game vs ada" });
  });

  it("SM-ACT2: from() with no descriptor map — all boards have no action (backward-compat)", () => {
    const g = game({ url: "https://www.chess.com/game/daily/1", opponent: "ada" });
    const board = from(counted([g]), true, undefined).boards.find((b) => b.opponent === "ada");
    assert.ok(board);
    assert.strictEqual("action" in board, false, "no action field when no descriptors passed");
  });

  it("SM-ACT3: placeholder boards carry no action regardless of descriptor map", () => {
    const descriptors = new Map<string, ActionDescriptor>([
      ["https://www.chess.com/game/daily/1", { token: "tok", label: "Open game vs opp" }],
    ]);
    const placeholders = [
      from(undefined, false, undefined, NOW, descriptors).boards[0], // setup empty
      from({ kind: "notFound", confirmedAt: 0 }, true, undefined, NOW, descriptors).boards[0], // warning empty
      from(counted([]), true, undefined, NOW, descriptors).boards[0], // zero-games starting
    ];
    for (const board of placeholders) {
      assert.ok(board, "placeholder board must exist");
      assert.strictEqual("action" in board, false, "placeholder must never carry action");
    }
  });

  // --- S3: Settings-placeholder activation (the no-username and unknown-user
  // placeholders become actionable; idle and transient-empty stay inert) ---

  const settingsDesc = (token: string, label: string): ActionDescriptor => ({ token, label });

  it("SM-SET-1: the no-username placeholder carries the no-username Settings action", () => {
    const action = settingsDesc("tok-nu", "Open Settings to set your Chess.com username");
    const model = fromModel(undefined, false, undefined, NOW, undefined, { noUsername: action });
    assert.strictEqual(model.boards.length, 1);
    assert.strictEqual(model.boards[0]?.fen, EMPTY_BOARD_FEN);
    assert.deepStrictEqual(model.boards[0]?.action, { token: "tok-nu", label: action.label });
    assert.strictEqual(model.note?.kind, "setup");
  });

  it("SM-SET-2: the unknown-user (notFound) placeholder carries the unknown-user Settings action", () => {
    const action = settingsDesc("tok-uu", "Open Settings to fix your Chess.com username");
    const model = fromModel({ kind: "notFound", confirmedAt: 0 }, true, undefined, NOW, undefined, {
      unknownUser: action,
    });
    assert.strictEqual(model.boards.length, 1);
    assert.deepStrictEqual(model.boards[0]?.action, { token: "tok-uu", label: action.label });
    assert.strictEqual(model.note?.kind, "warning");
  });

  it("SM-SET-3: idle, fresh-start, and transient-empty placeholders stay inert even with Settings descriptors", () => {
    const settings = {
      noUsername: settingsDesc("tok-nu", "set"),
      unknownUser: settingsDesc("tok-uu", "fix"),
    };
    const inert = [
      fromModel(counted([]), true, undefined, NOW, undefined, settings).boards[0], // idle zero-games
      fromModel(undefined, true, undefined, NOW, undefined, settings).boards[0], // configured, pre-first-poll
      fromModel({ kind: "transient" }, true, undefined, NOW, undefined, settings).boards[0], // transient, no data
    ];
    for (const board of inert) {
      assert.ok(board, "placeholder board must exist");
      assert.strictEqual("action" in board, false, "an inert placeholder must carry no action");
    }
  });

  it("SM-SET-4: the no-username placeholder without Settings descriptors carries no action (backward-compat)", () => {
    const board = fromModel(undefined, false, undefined, NOW).boards[0];
    assert.ok(board);
    assert.strictEqual("action" in board, false, "no action when no Settings descriptors passed");
  });

  it("MT7: toBoard copies a game's lastMove; games and placeholders without one omit it", () => {
    const withTrail = game({
      url: "https://www.chess.com/game/daily/trail",
      opponent: "ada",
      lastMove: ["e2", "e4"],
    });
    const board = from(counted([withTrail]), true, undefined).boards.find(
      (b) => b.opponent === "ada"
    );
    assert.ok(board);
    assert.deepStrictEqual(board.lastMove, ["e2", "e4"]);

    // A game without a lastMove omits the key (never undefined) — matching placeholders.
    const noTrail = from(
      counted([game({ url: "https://www.chess.com/game/daily/none", opponent: "bo" })]),
      true,
      undefined
    ).boards.find((b) => b.opponent === "bo");
    assert.ok(noTrail);
    assert.strictEqual("lastMove" in noTrail, false);

    // A placeholder board (no username) omits it too.
    const placeholder = from(undefined, false, undefined).boards[0];
    assert.ok(placeholder);
    assert.strictEqual("lastMove" in placeholder, false);
  });
});
