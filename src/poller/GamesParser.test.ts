import assert from "node:assert/strict";
import { parse } from "./GamesParser";
import fixtureData from "../../test/fixtures/games.daily.json";

const fixture: unknown = fixtureData;

const rapidOnlyPayload = {
  games: [
    {
      url: "https://www.chess.com/game/daily/100",
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      turn: "white",
      move_by: 9_999_999_999,
      white: "https://api.chess.com/pub/player/playerone",
      black: "https://api.chess.com/pub/player/playertwo",
      time_class: "rapid",
    },
  ],
};

const missingFenPayload = {
  games: [
    {
      url: "https://www.chess.com/game/daily/101",
      turn: "white",
      move_by: 9_999_999_999,
      white: "https://api.chess.com/pub/player/playerone",
      black: "https://api.chess.com/pub/player/playertwo",
      time_class: "daily",
    },
  ],
};

describe("GamesParser.parse()", () => {
  it("maps live /games fixture to DailyGame[] for playerone", () => {
    const games = parse(fixture, "playerone");
    assert.strictEqual(games.length, 1);
    const [game] = games;
    assert.ok(game !== undefined);
    assert.deepStrictEqual(game, {
      fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
      turn: "black",
      moveBy: 1718573923,
      url: "https://www.chess.com/game/daily/749532278",
      playerColor: "white",
      opponent: "playertwo",
      startTime: 1718400000,
      lastMove: ["e2", "e4"],
    });
  });

  it("SG2: a daily game with no start_time omits startTime (best-effort, never thrown)", () => {
    const payload = {
      games: [
        {
          url: "https://www.chess.com/game/daily/400",
          fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
          turn: "white",
          move_by: 9_999_999_999,
          white: "https://api.chess.com/pub/player/playerone",
          black: "https://api.chess.com/pub/player/playertwo",
          time_class: "daily",
        },
      ],
    };
    assert.doesNotThrow(() => parse(payload, "playerone"));
    const [game] = parse(payload, "playerone");
    assert.ok(game);
    assert.strictEqual("startTime" in game, false);
  });

  it("SG3: a non-number start_time is ignored (omitted), no throw", () => {
    const payload = {
      games: [
        {
          url: "https://www.chess.com/game/daily/401",
          fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
          turn: "white",
          move_by: 9_999_999_999,
          start_time: "soon",
          white: "https://api.chess.com/pub/player/playerone",
          black: "https://api.chess.com/pub/player/playertwo",
          time_class: "daily",
        },
      ],
    };
    assert.doesNotThrow(() => parse(payload, "playerone"));
    const [game] = parse(payload, "playerone");
    assert.ok(game);
    assert.strictEqual("startTime" in game, false);
  });

  it("resolves playerColor correctly with case-insensitive username match", () => {
    const games = parse(fixture, "PlayerOne");
    assert.strictEqual(games.length, 1);
    const [game] = games;
    assert.ok(game !== undefined);
    assert.strictEqual(game.playerColor, "white");
    assert.strictEqual(game.opponent, "playertwo");
  });

  it("resolves playerColor = black when configured username matches black URL tail", () => {
    const games = parse(fixture, "playertwo");
    assert.strictEqual(games.length, 1);
    const [game] = games;
    assert.ok(game !== undefined);
    assert.strictEqual(game.playerColor, "black");
    assert.strictEqual(game.opponent, "playerone");
  });

  it("throws when configured username is not in either player URL", () => {
    assert.throws(() => parse(fixture, "someone-else"), /not found/i);
  });

  it("filters out non-daily games", () => {
    const games = parse(rapidOnlyPayload, "playerone");
    assert.strictEqual(games.length, 0);
  });

  it("throws on malformed game missing fen", () => {
    assert.throws(() => parse(missingFenPayload, "playerone"), /fen/i);
  });

  // ---------------------------------------------------------------------------
  // S1 (v0.4.0) — syntactic FEN validation at the data layer (crash-early)
  // ---------------------------------------------------------------------------

  /** A daily game for playerone carrying the given FEN. */
  const gameWithFen = (fen: string): unknown => ({
    games: [
      {
        url: "https://www.chess.com/game/daily/200",
        fen,
        turn: "white",
        move_by: 9_999_999_999,
        white: "https://api.chess.com/pub/player/playerone",
        black: "https://api.chess.com/pub/player/playertwo",
        time_class: "daily",
      },
    ],
  });

  it("F1: accepts a well-formed mid-game FEN", () => {
    const games = parse(
      gameWithFen("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1"),
      "playerone"
    );
    assert.strictEqual(games.length, 1);
    assert.strictEqual(
      games[0]?.fen,
      "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1"
    );
  });

  it("F2a: rejects a FEN with the wrong number of fields", () => {
    // Only 5 space-separated fields (missing fullmove number)
    assert.throws(
      () =>
        parse(gameWithFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0"), "playerone"),
      /fen/i
    );
  });

  it("F2b: rejects a FEN whose rank does not sum to 8 squares", () => {
    // Final rank "RNBQKBN" describes only 7 squares
    assert.throws(
      () =>
        parse(gameWithFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBN w KQkq - 0 1"), "playerone"),
      /fen/i
    );
  });

  it("F2c: rejects a FEN with an illegal piece glyph", () => {
    // 'X' is not a valid piece placement character
    assert.throws(
      () =>
        parse(gameWithFen("rnbqkbnX/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"), "playerone"),
      /fen/i
    );
  });

  it("F2d: rejects a FEN with an invalid side-to-move", () => {
    assert.throws(
      () =>
        parse(gameWithFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR x KQkq - 0 1"), "playerone"),
      /fen/i
    );
  });

  // ---------------------------------------------------------------------------
  // S1 (Move Trail) — host-side last-move derivation, best-effort PER BOARD
  // ---------------------------------------------------------------------------

  /** A daily game for playerone carrying the given pgn (with a post-e4 FEN). */
  const gameWithPgn = (pgn: string): unknown => ({
    games: [
      {
        url: "https://www.chess.com/game/daily/300",
        fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
        turn: "black",
        move_by: 9_999_999_999,
        pgn,
        white: "https://api.chess.com/pub/player/playerone",
        black: "https://api.chess.com/pub/player/playertwo",
        time_class: "daily",
      },
    ],
  });

  it("MT6a: derives DailyGame.lastMove from the game's pgn", () => {
    const [game] = parse(fixture, "playerone");
    assert.ok(game);
    assert.deepStrictEqual(game.lastMove, ["e2", "e4"]);
  });

  it("MT6b: best-effort per board — a malformed pgn omits the trail without dropping siblings", () => {
    const payload = {
      games: [
        {
          url: "https://www.chess.com/game/daily/301",
          fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
          turn: "black",
          move_by: 1,
          pgn: "1. e4",
          white: "https://api.chess.com/pub/player/playerone",
          black: "https://api.chess.com/pub/player/playertwo",
          time_class: "daily",
        },
        {
          url: "https://www.chess.com/game/daily/302",
          fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
          turn: "white",
          move_by: 2,
          pgn: "not a real pgn",
          white: "https://api.chess.com/pub/player/playertwo",
          black: "https://api.chess.com/pub/player/playerone",
          time_class: "daily",
        },
      ],
    };
    const games = parse(payload, "playerone");
    assert.strictEqual(games.length, 2);
    const [first, second] = games;
    assert.ok(first);
    assert.ok(second);
    assert.deepStrictEqual(first.lastMove, ["e2", "e4"]);
    assert.strictEqual("lastMove" in second, false);
  });

  it("MT6c: a malformed pgn does not throw (unlike a malformed required field)", () => {
    const payload = gameWithPgn("this is not a pgn at all");
    assert.doesNotThrow(() => parse(payload, "playerone"));
    const [game] = parse(payload, "playerone");
    assert.ok(game);
    assert.strictEqual("lastMove" in game, false);
  });
});
