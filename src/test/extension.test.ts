import assert from "node:assert/strict";
import * as vscode from "vscode";
import type { ChessExtensionApi } from "../extension";

// ---------------------------------------------------------------------------
// S5 — Integration (Extension Development Host, @vscode/test-electron)
//
// Layer 2 of the test plan: only the wiring that genuinely needs the editor —
// activation, the Turn Count status-bar item, the openMostUrgent command, and
// config-driven start/stop. The pure logic is covered by the Layer 1 unit
// suites (GamesParser / TurnState / ChessComClient / Poller).
// ---------------------------------------------------------------------------

const EXTENSION_ID = "eunai.vscode-chess";
const USERNAME_KEY = "vscodeChess.username";

/** One daily game awaiting white ("playerone"). */
function dailyPayload(moveBy = 1_718_573_923): string {
  return JSON.stringify({
    games: [
      {
        url: "https://www.chess.com/game/daily/749532278",
        move_by: moveBy,
        turn: "white",
        time_class: "daily",
        white: "https://api.chess.com/pub/player/playerone",
        black: "https://api.chess.com/pub/player/playertwo",
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      },
    ],
  });
}

/** A payload where no game awaits the configured player (turn = black). */
function noTurnPayload(): string {
  return JSON.stringify({
    games: [
      {
        url: "https://www.chess.com/game/daily/749532278",
        move_by: 1_718_573_923,
        turn: "black",
        time_class: "daily",
        white: "https://api.chess.com/pub/player/playerone",
        black: "https://api.chess.com/pub/player/playertwo",
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      },
    ],
  });
}

/** A fetch stub returning a fixed 200 body. */
function fetchReturning(body: string): typeof fetch {
  return () =>
    Promise.resolve(
      new Response(body, {
        status: 200,
        headers: { "Cache-Control": "max-age=5" },
      })
    );
}

async function getApi(): Promise<ChessExtensionApi> {
  const ext = vscode.extensions.getExtension<ChessExtensionApi>(EXTENSION_ID);
  assert.ok(ext, `extension ${EXTENSION_ID} not found`);
  const api = await ext.activate();
  assert.ok(api, "activate() returned no API surface");
  return api;
}

async function setUsername(value: string): Promise<void> {
  await vscode.workspace
    .getConfiguration()
    .update(USERNAME_KEY, value, vscode.ConfigurationTarget.Global);
}

describe("vscode-chess extension (integration)", () => {
  let api: ChessExtensionApi;

  beforeEach(async () => {
    api = await getApi();
    api._setOpenExternalForTest(() => Promise.resolve(true));
    await setUsername("");
    api._restartForTest();
  });

  afterEach(async () => {
    await setUsername("");
  });

  // -------------------------------------------------------------------------
  // 1. Activation with no username — no poll, hidden, no crash
  // -------------------------------------------------------------------------

  it("activates with no username set: no Poller, Turn Count hidden", () => {
    const turnCount = api._getTurnCountForTest();
    assert.equal(turnCount.visible, false);
    assert.equal(api._getLastResultForTest(), undefined);
  });

  // -------------------------------------------------------------------------
  // 2. Activation with a username — Turn Count shows the count
  // -------------------------------------------------------------------------

  it("shows the Turn Count when a username is set and a game awaits the player", async () => {
    api._setFetchForTest(fetchReturning(dailyPayload()));
    await setUsername("playerone");
    await api._pollOnceForTest();

    const turnCount = api._getTurnCountForTest();
    assert.equal(turnCount.visible, true);
    assert.match(turnCount.text, /1/);

    const result = api._getLastResultForTest();
    assert.equal(result?.count, 1);
  });

  // -------------------------------------------------------------------------
  // 3. Count drops to 0 — Turn Count hides
  // -------------------------------------------------------------------------

  it("hides the Turn Count when a later cycle reports zero awaiting games", async () => {
    api._setFetchForTest(fetchReturning(dailyPayload()));
    await setUsername("playerone");
    await api._pollOnceForTest();
    assert.equal(api._getTurnCountForTest().visible, true);

    api._setFetchForTest(fetchReturning(noTurnPayload()));
    await api._pollOnceForTest();

    assert.equal(api._getTurnCountForTest().visible, false);
    assert.equal(api._getLastResultForTest()?.count, 0);
  });

  // -------------------------------------------------------------------------
  // 4. openMostUrgent — opens the most-urgent game URL via env.openExternal
  // -------------------------------------------------------------------------

  it("openMostUrgent opens the most-urgent game URL via env.openExternal", async () => {
    const opened: string[] = [];
    api._setOpenExternalForTest((uri) => {
      opened.push(uri.toString());
      return Promise.resolve(true);
    });
    api._setFetchForTest(fetchReturning(dailyPayload()));
    await setUsername("playerone");
    await api._pollOnceForTest();

    await vscode.commands.executeCommand("vscodeChess.openMostUrgent");

    assert.equal(opened.length, 1);
    assert.equal(opened[0], "https://www.chess.com/game/daily/749532278");
  });

  // -------------------------------------------------------------------------
  // 5. openMostUrgent — rejects a non-chess.com URL (shape validation, R3)
  // -------------------------------------------------------------------------

  it("openMostUrgent rejects a hostile URL and does not call openExternal", async () => {
    const opened: string[] = [];
    api._setOpenExternalForTest((uri) => {
      opened.push(uri.toString());
      return Promise.resolve(true);
    });
    const hostile = JSON.stringify({
      games: [
        {
          url: "https://evil.example.com/phish",
          move_by: 1_718_573_923,
          turn: "white",
          time_class: "daily",
          white: "https://api.chess.com/pub/player/playerone",
          black: "https://api.chess.com/pub/player/playertwo",
          fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        },
      ],
    });
    api._setFetchForTest(fetchReturning(hostile));
    await setUsername("playerone");
    await api._pollOnceForTest();

    await vscode.commands.executeCommand("vscodeChess.openMostUrgent");

    assert.equal(opened.length, 0);
  });

  // -------------------------------------------------------------------------
  // 6. openMostUrgent — no-op when there is no most-urgent game
  // -------------------------------------------------------------------------

  it("openMostUrgent is a no-op when no game awaits the player", async () => {
    const opened: string[] = [];
    api._setOpenExternalForTest((uri) => {
      opened.push(uri.toString());
      return Promise.resolve(true);
    });
    api._setFetchForTest(fetchReturning(noTurnPayload()));
    await setUsername("playerone");
    await api._pollOnceForTest();

    await vscode.commands.executeCommand("vscodeChess.openMostUrgent");

    assert.equal(opened.length, 0);
  });

  // -------------------------------------------------------------------------
  // 7. Config change — clearing the username stops the Poller and hides
  // -------------------------------------------------------------------------

  it("stops the Poller and hides the Turn Count when the username is cleared", async () => {
    api._setFetchForTest(fetchReturning(dailyPayload()));
    await setUsername("playerone");
    await api._pollOnceForTest();
    assert.equal(api._getTurnCountForTest().visible, true);

    await setUsername("");
    // onDidChangeConfiguration is synchronous-ish; give the host a tick.
    await new Promise((r) => setTimeout(r, 50));

    assert.equal(api._isRunningForTest(), false);
    assert.equal(api._getTurnCountForTest().visible, false);
  });

  // -------------------------------------------------------------------------
  // 8. Config change — switching to a different non-empty username must clear
  //    the stale Turn Count and open target immediately, before the new
  //    Player's first poll result arrives.
  // -------------------------------------------------------------------------

  it("clears the stale Turn Count and open target when switching to a different username", async () => {
    const opened: string[] = [];
    api._setOpenExternalForTest((uri) => {
      opened.push(uri.toString());
      return Promise.resolve(true);
    });

    // Player A: one awaiting game, Turn Count visible, command targets A's game.
    api._setFetchForTest(fetchReturning(dailyPayload()));
    await setUsername("playerone");
    await api._pollOnceForTest();
    assert.equal(api._getTurnCountForTest().visible, true);

    // Switch to Player B but never let B's first poll result return, so we can
    // observe the state strictly between the setting change and any new render.
    api._setFetchForTest(() => new Promise<Response>(() => {}));
    await setUsername("playertwo");
    // Let onDidChangeConfiguration run.
    await new Promise((r) => setTimeout(r, 50));

    // The configured Player changed: the old count and target must be gone now.
    assert.equal(api._getTurnCountForTest().visible, false);
    assert.equal(api._getLastResultForTest(), undefined);

    await vscode.commands.executeCommand("vscodeChess.openMostUrgent");
    assert.equal(opened.length, 0);
  });
});
