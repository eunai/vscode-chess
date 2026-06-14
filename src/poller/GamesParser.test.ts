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
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      turn: "white",
      moveBy: 1718573923,
      url: "https://www.chess.com/game/daily/749532278",
      playerColor: "white",
      opponent: "playertwo",
    });
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
});
