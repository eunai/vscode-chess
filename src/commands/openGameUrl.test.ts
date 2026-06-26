import assert from "node:assert/strict";
import { openGameUrl } from "./openGameUrl";
import { makeOpenMostUrgent } from "./openMostUrgent";
import type { DailyGame } from "../poller/GamesParser";

describe("openGameUrl()", () => {
  function makeLogger() {
    const lines: string[] = [];
    return { lines, warn: (msg: string) => lines.push(msg) };
  }

  function makeOpenUrl() {
    const opened: string[] = [];
    return {
      opened,
      openUrl: (url: string) => {
        opened.push(url);
        return Promise.resolve(true);
      },
    };
  }

  it("OGU-1: valid chess.com URL opens; no log emitted", async () => {
    const { opened, openUrl } = makeOpenUrl();
    const log = makeLogger();
    await openGameUrl("https://www.chess.com/game/daily/1", openUrl, log);
    assert.deepStrictEqual(opened, ["https://www.chess.com/game/daily/1"]);
    assert.strictEqual(log.lines.length, 0, "no success log (Q6)");
  });

  it("OGU-2: non-chess.com URL rejected; exact log wording; openUrl not called", async () => {
    const { opened, openUrl } = makeOpenUrl();
    const log = makeLogger();
    await openGameUrl("https://www.lichess.org/game/abc", openUrl, log);
    assert.strictEqual(opened.length, 0, "openUrl not called");
    assert.deepStrictEqual(log.lines, ["rejected a non-chess.com game URL"]);
  });

  it("OGU-3: malformed URL rejected; openUrl not called", async () => {
    const { opened, openUrl } = makeOpenUrl();
    const log = makeLogger();
    await openGameUrl("not-a-url", openUrl, log);
    assert.strictEqual(opened.length, 0, "openUrl not called");
  });

  it("OGU-4: makeOpenMostUrgent and openGameUrl behave identically for the same URL", async () => {
    const game = (url: string): DailyGame => ({
      url,
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      turn: "white",
      moveBy: 1_000_000_000,
      opponent: "opp",
      playerColor: "white",
    });

    for (const url of ["https://www.chess.com/game/daily/1", "https://www.lichess.org/game/1"]) {
      const { opened: dOpen, openUrl: dUrl } = makeOpenUrl();
      const dLog = makeLogger();
      await openGameUrl(url, dUrl, dLog);

      const { opened: hOpen, openUrl: hUrl } = makeOpenUrl();
      const hLog = makeLogger();
      await makeOpenMostUrgent(() => game(url), hUrl, hLog)();

      assert.deepStrictEqual(dOpen, hOpen, `open arrays must match for ${url}`);
      assert.deepStrictEqual(dLog.lines, hLog.lines, `log lines must match for ${url}`);
    }
  });
});
