import assert from "node:assert/strict";
import * as vscode from "vscode";
import type { ChessExtensionApi } from "../extension";
import type { RenderMessage } from "../sidebar/contract";

// ---------------------------------------------------------------------------
// Integration (Extension Development Host, @vscode/test-electron)
//
// Layer 2 of the test plan: only the wiring that genuinely needs the editor —
// activation, the always-visible Presence status-bar item, the openMostUrgent
// command, and config-driven start/stop. The pure logic is covered by the
// Layer 1 unit suites (GamesParser / TurnState / ChessComClient / Poller /
// PresenceState / Presence).
//
// S3 — the always-visible Presence: T0 (tracer / proof-of-life) + W1–W4.
// ---------------------------------------------------------------------------

const EXTENSION_ID = "eunai.vscode-chess";
const USERNAME_KEY = "vscodeChess.username";
const OPEN_MOST_URGENT = "vscodeChess.openMostUrgent";
const MOST_URGENT_URL = "https://www.chess.com/game/daily/749532278";

/** The Settings affordance carried by the unconfigured / badUsername states.
 * A plain `Command` object so it opens Settings at the username field without
 * constructing any Chess.com URL from the Player username (privacy invariant). */
const OPEN_SETTINGS_COMMAND = {
  command: "workbench.action.openSettings",
  title: "Set username",
  arguments: [USERNAME_KEY],
};

/** One daily game awaiting white ("playerone"). */
function dailyPayload(moveBy = 1_718_573_923): string {
  return JSON.stringify({
    games: [
      {
        url: MOST_URGENT_URL,
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
        url: MOST_URGENT_URL,
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

/** A fetch stub returning a fixed status with an empty body — for the 404
 * (UsernameNotFound) and 5xx/429 (TransientError) classifications. */
function fetchStatus(status: number): typeof fetch {
  return () => Promise.resolve(new Response(null, { status }));
}

/** A multi-game daily payload for playerone; each game's opponent is `opp-<id>`. */
function multiPayload(
  games: Array<{ id: string; turn: "white" | "black"; moveBy: number; startTime?: number }>
): string {
  return JSON.stringify({
    games: games.map((g) => ({
      url: `https://www.chess.com/game/daily/${g.id}`,
      move_by: g.moveBy,
      turn: g.turn,
      time_class: "daily",
      ...(g.startTime !== undefined ? { start_time: g.startTime } : {}),
      white: "https://api.chess.com/pub/player/playerone",
      black: `https://api.chess.com/pub/player/opp-${g.id}`,
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    })),
  });
}

// Fixed clock for deterministic Awaiting Glow in the integration proofs. move_by
// is Unix seconds, built relative to NOW_S.
const NOW_MS = 1_700_000_000_000;
const NOW_S = NOW_MS / 1000;

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

const BOARD_THEME_KEY = "vscodeChess.boardTheme";

async function setBoardTheme(value: string | undefined): Promise<void> {
  await vscode.workspace
    .getConfiguration()
    .update(BOARD_THEME_KEY, value, vscode.ConfigurationTarget.Global);
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
    await setBoardTheme(undefined);
    api._setNowForTest(() => Date.now()); // restore the real clock for the next test
  });

  // -------------------------------------------------------------------------
  // T0 — tracer / proof-of-life: on activation with no username, the Presence
  //      is visible showing "Set Username", and its click opens Settings.
  // -------------------------------------------------------------------------

  it("T0: with no username, the Presence is visible showing 'Set Username' and clicks open Settings", () => {
    const presence = api._getPresenceForTest();
    assert.equal(presence.visible, true);
    assert.equal(presence.text, "♟ Set Username");
    assert.deepEqual(presence.command, OPEN_SETTINGS_COMMAND);
  });

  // -------------------------------------------------------------------------
  // W1 — username set: counted(0) → idle (bare ♟, non-clickable);
  //      counted(≥1) → count (♟ N) whose click opens the Most Urgent Game.
  // -------------------------------------------------------------------------

  it("W1: counted(0) renders idle (non-clickable); counted(≥1) renders the count and opens the Most Urgent Game", async () => {
    // counted(0): a game exists but none awaits the player's move → idle.
    api._setFetchForTest(fetchReturning(noTurnPayload()));
    await setUsername("playerone");
    await api._pollOnceForTest();

    let presence = api._getPresenceForTest();
    assert.equal(presence.visible, true);
    assert.equal(presence.text, "♟");
    assert.equal(presence.command, undefined, "idle Presence is non-clickable");

    // counted(≥1): one game awaits → count, click opens the Most Urgent Game.
    const opened: string[] = [];
    api._setOpenExternalForTest((uri) => {
      opened.push(uri.toString());
      return Promise.resolve(true);
    });
    api._setFetchForTest(fetchReturning(dailyPayload()));
    await api._pollOnceForTest();

    presence = api._getPresenceForTest();
    assert.equal(presence.visible, true);
    assert.equal(presence.text, "♟ 1");
    assert.equal(presence.command, OPEN_MOST_URGENT);

    await vscode.commands.executeCommand(OPEN_MOST_URGENT);
    assert.deepEqual(opened, [MOST_URGENT_URL]);
  });

  // -------------------------------------------------------------------------
  // W2 — a notFound (404) status → badUsername, whose click opens Settings.
  // -------------------------------------------------------------------------

  it("W2: a 404 (notFound) status renders badUsername whose click opens Settings", async () => {
    api._setFetchForTest(fetchStatus(404));
    await setUsername("nobody");
    await api._pollOnceForTest();

    const presence = api._getPresenceForTest();
    assert.equal(presence.visible, true);
    assert.equal(presence.text, "♟ Unknown User");
    assert.deepEqual(presence.command, OPEN_SETTINGS_COMMAND);
  });

  // -------------------------------------------------------------------------
  // W3 — a transient (5xx) status keeps the last-known label and command and
  //      swaps only the tooltip to "Reconnecting...".
  // -------------------------------------------------------------------------

  it("W3: a transient (503) status keeps the last-known label and command, tooltip 'Reconnecting...'", async () => {
    const opened: string[] = [];
    api._setOpenExternalForTest((uri) => {
      opened.push(uri.toString());
      return Promise.resolve(true);
    });

    // Establish a count state first.
    api._setFetchForTest(fetchReturning(dailyPayload()));
    await setUsername("playerone");
    await api._pollOnceForTest();
    assert.equal(api._getPresenceForTest().text, "♟ 1");

    // A transient failure must not blank or alarm: last-known display retained.
    api._setFetchForTest(fetchStatus(503));
    await api._pollOnceForTest();

    const presence = api._getPresenceForTest();
    assert.equal(presence.visible, true);
    assert.equal(presence.text, "♟ 1", "last-known label retained");
    assert.equal(presence.command, OPEN_MOST_URGENT, "last-known command retained");
    assert.equal(presence.tooltip, "Reconnecting...");

    // The retained click target still opens the last-known Most Urgent Game.
    await vscode.commands.executeCommand(OPEN_MOST_URGENT);
    assert.deepEqual(opened, [MOST_URGENT_URL]);
  });

  // -------------------------------------------------------------------------
  // W4 — clearing the username returns the Presence to unconfigured, still
  //      visible, and stops the Poller.
  // -------------------------------------------------------------------------

  it("W4: clearing the username returns the Presence to unconfigured, still visible", async () => {
    api._setFetchForTest(fetchReturning(dailyPayload()));
    await setUsername("playerone");
    await api._pollOnceForTest();
    assert.equal(api._getPresenceForTest().text, "♟ 1");

    await setUsername("");
    // onDidChangeConfiguration is synchronous-ish; give the host a tick.
    await new Promise((r) => setTimeout(r, 50));

    const presence = api._getPresenceForTest();
    assert.equal(presence.visible, true, "the Presence stays visible when unconfigured");
    assert.equal(presence.text, "♟ Set Username");
    assert.deepEqual(presence.command, OPEN_SETTINGS_COMMAND);
    assert.equal(api._isRunningForTest(), false, "the Poller is stopped");
  });

  // -------------------------------------------------------------------------
  // openMostUrgent — rejects a non-chess.com URL (shape validation, R4).
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

    await vscode.commands.executeCommand(OPEN_MOST_URGENT);

    assert.equal(opened.length, 0);
  });

  // -------------------------------------------------------------------------
  // openMostUrgent — no-op when there is no most-urgent game (idle).
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

    await vscode.commands.executeCommand(OPEN_MOST_URGENT);

    assert.equal(opened.length, 0);
  });

  // -------------------------------------------------------------------------
  // Config change — switching to a different non-empty username must clear the
  // stale count and open target immediately, before the new Player's first
  // poll status arrives. The Presence stays visible, falling back to idle.
  // -------------------------------------------------------------------------

  it("clears the stale count and open target when switching to a different username", async () => {
    const opened: string[] = [];
    api._setOpenExternalForTest((uri) => {
      opened.push(uri.toString());
      return Promise.resolve(true);
    });

    // Player A: one awaiting game, count visible, command targets A's game.
    api._setFetchForTest(fetchReturning(dailyPayload()));
    await setUsername("playerone");
    await api._pollOnceForTest();
    assert.equal(api._getPresenceForTest().text, "♟ 1");

    // Switch to Player B but never let B's first poll status return, so we can
    // observe the state strictly between the setting change and any new render.
    api._setFetchForTest(() => new Promise<Response>(() => {}));
    await setUsername("playertwo");
    await new Promise((r) => setTimeout(r, 50));

    // The configured Player changed: the old count and target must be gone, the
    // Presence falling back to idle (still visible) pending B's first status.
    const presence = api._getPresenceForTest();
    assert.equal(presence.visible, true);
    assert.equal(presence.text, "♟");
    assert.equal(presence.command, undefined);

    await vscode.commands.executeCommand(OPEN_MOST_URGENT);
    assert.equal(opened.length, 0);
  });

  // -------------------------------------------------------------------------
  // S3 sidebar — W1: the boards view is contributed under the activity-bar
  //   container, and an attached, ready webview receives the host's render of
  //   the Daily Game boards after a poll (the full host pipeline end to end).
  // -------------------------------------------------------------------------

  it("W1: the Daily Games webview view is contributed under the vscodeChess container", () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(ext);
    const pkg = ext.packageJSON as {
      contributes?: { views?: Record<string, Array<{ id?: string; type?: string }>> };
    };
    const views = pkg.contributes?.views?.["vscodeChess"] ?? [];
    assert.ok(
      views.some((v) => v.id === "vscodeChess.boards" && v.type === "webview"),
      "vscodeChess.boards webview view is contributed"
    );
  });

  it("W1: an attached, ready webview receives a render of the Daily Game boards after a poll", async () => {
    const posts: RenderMessage[] = [];
    const presenter = api._getSidebarPresenterForTest();
    presenter.attach({ postMessage: (message) => posts.push(message) });
    presenter.ready();

    api._setFetchForTest(fetchReturning(dailyPayload()));
    await setUsername("playerone");
    await api._pollOnceForTest();

    const last = posts[posts.length - 1];
    assert.ok(last, "the host posted a render message");
    assert.equal(last.type, "render");
    assert.equal(last.model.boards[0]?.opponent, "playertwo");
    assert.equal(last.model.boards[0]?.awaiting, true, "the awaiting game carries the marker");
    assert.equal(last.model.note, undefined);
    assert.equal(last.model.turnNotice?.count, 1, "the Turn Notice mirrors the awaiting count");
  });

  it("UG6: a counted poll posts a render whose awaiting board carries the Awaiting Glow (glow > 0)", async () => {
    const posts: RenderMessage[] = [];
    const presenter = api._getSidebarPresenterForTest();
    presenter.attach({ postMessage: (message) => posts.push(message) });
    presenter.ready();

    api._setFetchForTest(fetchReturning(dailyPayload()));
    await setUsername("playerone");
    await api._pollOnceForTest();

    const last = posts[posts.length - 1];
    assert.ok(last, "the host posted a render message");
    const glowing = last.model.boards.filter((b) => b.glow > 0);
    assert.equal(glowing.length, 1, "the one awaiting board carries the Awaiting Glow");
    assert.equal(glowing[0]?.opponent, "playertwo", "the awaiting board glows");
    assert.equal(glowing[0]?.awaiting, true);
  });

  it("UG6′: with ≥2 awaiting games every awaiting board glows, and the soonest deadline glows strongest", async () => {
    const posts: RenderMessage[] = [];
    const presenter = api._getSidebarPresenterForTest();
    presenter.attach({ postMessage: (m) => posts.push(m) });
    presenter.ready();

    api._setNowForTest(() => NOW_MS);
    api._setFetchForTest(
      fetchReturning(
        multiPayload([
          { id: "soon", turn: "white", moveBy: NOW_S + 2 * 3600, startTime: 100 },
          { id: "later", turn: "white", moveBy: NOW_S + 40 * 3600, startTime: 200 },
        ])
      )
    );
    await setUsername("playerone");
    await api._pollOnceForTest();

    const last = posts[posts.length - 1]!;
    const awaiting = last.model.boards.filter((b) => b.awaiting);
    assert.equal(awaiting.length, 2, "both games await the player");
    assert.ok(
      awaiting.every((b) => b.glow > 0),
      "every awaiting board carries the Awaiting Glow"
    );
    const soon = last.model.boards.find((b) => b.opponent === "opp-soon")!;
    const later = last.model.boards.find((b) => b.opponent === "opp-later")!;
    assert.ok(soon.glow > later.glow, "the soonest-deadline board glows strongest");
  });

  it("I2: a board that flips to the opponent's turn loses its glow (proof #2, wiring)", async () => {
    const posts: RenderMessage[] = [];
    const presenter = api._getSidebarPresenterForTest();
    presenter.attach({ postMessage: (m) => posts.push(m) });
    presenter.ready();

    api._setNowForTest(() => NOW_MS);
    api._setFetchForTest(
      fetchReturning(
        multiPayload([{ id: "g", turn: "white", moveBy: NOW_S + 3600, startTime: 100 }])
      )
    );
    await setUsername("playerone");
    await api._pollOnceForTest();
    let board = posts[posts.length - 1]!.model.boards.find((b) => b.opponent === "opp-g")!;
    assert.ok(board.glow > 0, "awaiting → glows");

    // Same game, now the opponent's turn.
    api._setFetchForTest(
      fetchReturning(
        multiPayload([{ id: "g", turn: "black", moveBy: NOW_S + 3600, startTime: 100 }])
      )
    );
    await api._pollOnceForTest();
    board = posts[posts.length - 1]!.model.boards.find((b) => b.opponent === "opp-g")!;
    assert.equal(board.awaiting, false);
    assert.equal(board.glow, 0, "non-awaiting → no glow");
  });

  it("I3: when a game ends, the survivors shift up in oldest-first order (proof #3, wiring, by start_time)", async () => {
    const posts: RenderMessage[] = [];
    const presenter = api._getSidebarPresenterForTest();
    presenter.attach({ postMessage: (m) => posts.push(m) });
    presenter.ready();

    api._setNowForTest(() => NOW_MS);
    // start_time order is the INVERSE of the url order, so a pass proves age-ordering, not the url fallback.
    api._setFetchForTest(
      fetchReturning(
        multiPayload([
          { id: "g1", turn: "white", moveBy: NOW_S + 3600, startTime: 300 },
          { id: "g2", turn: "white", moveBy: NOW_S + 3600, startTime: 200 },
          { id: "g3", turn: "white", moveBy: NOW_S + 3600, startTime: 100 },
        ])
      )
    );
    await setUsername("playerone");
    await api._pollOnceForTest();
    assert.deepEqual(
      posts[posts.length - 1]!.model.boards.map((b) => b.opponent),
      ["opp-g3", "opp-g2", "opp-g1"],
      "oldest start_time first (inverse of url order)"
    );

    // g2 ends → drops from the payload; g3 and g1 keep their relative order.
    api._setFetchForTest(
      fetchReturning(
        multiPayload([
          { id: "g1", turn: "white", moveBy: NOW_S + 3600, startTime: 300 },
          { id: "g3", turn: "white", moveBy: NOW_S + 3600, startTime: 100 },
        ])
      )
    );
    await api._pollOnceForTest();
    assert.deepEqual(
      posts[posts.length - 1]!.model.boards.map((b) => b.opponent),
      ["opp-g3", "opp-g1"],
      "the survivor shifts up; order preserved"
    );
  });

  it("I4: a newly-started game (newer start_time) inserts at the bottom of its group (proof #4, wiring)", async () => {
    const posts: RenderMessage[] = [];
    const presenter = api._getSidebarPresenterForTest();
    presenter.attach({ postMessage: (m) => posts.push(m) });
    presenter.ready();

    api._setNowForTest(() => NOW_MS);
    api._setFetchForTest(
      fetchReturning(
        multiPayload([
          { id: "m", turn: "white", moveBy: NOW_S + 3600, startTime: 100 },
          { id: "z", turn: "white", moveBy: NOW_S + 3600, startTime: 200 },
        ])
      )
    );
    await setUsername("playerone");
    await api._pollOnceForTest();
    assert.deepEqual(
      posts[posts.length - 1]!.model.boards.map((b) => b.opponent),
      ["opp-m", "opp-z"]
    );

    // A new game "aaa" — its url sorts FIRST, but its start_time is newest, so it lands LAST.
    api._setFetchForTest(
      fetchReturning(
        multiPayload([
          { id: "m", turn: "white", moveBy: NOW_S + 3600, startTime: 100 },
          { id: "z", turn: "white", moveBy: NOW_S + 3600, startTime: 200 },
          { id: "aaa", turn: "white", moveBy: NOW_S + 3600, startTime: 300 },
        ])
      )
    );
    await api._pollOnceForTest();
    assert.deepEqual(
      posts[posts.length - 1]!.model.boards.map((b) => b.opponent),
      ["opp-m", "opp-z", "opp-aaa"],
      "the newest-start_time game is last, despite its url sorting first"
    );
  });

  // -------------------------------------------------------------------------
  // MT9 — the Move Trail flows end to end: a counted poll posts a render whose
  //   board carries the host-derived lastMove ([from, to]) from the game's pgn.
  // -------------------------------------------------------------------------

  it("MT9: a counted poll posts a render whose board carries the derived Move Trail", async () => {
    const posts: RenderMessage[] = [];
    const presenter = api._getSidebarPresenterForTest();
    presenter.attach({ postMessage: (message) => posts.push(message) });
    presenter.ready();

    // After 1. e4 e5 it is white ("playerone") to move — so the game awaits the
    // player AND the last move (black's ...e5) is e7->e5. FEN and pgn agree.
    const withTrail = JSON.stringify({
      games: [
        {
          url: MOST_URGENT_URL,
          move_by: 1_718_573_923,
          turn: "white",
          time_class: "daily",
          pgn: "1. e4 e5",
          white: "https://api.chess.com/pub/player/playerone",
          black: "https://api.chess.com/pub/player/playertwo",
          fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2",
        },
      ],
    });
    api._setFetchForTest(fetchReturning(withTrail));
    await setUsername("playerone");
    await api._pollOnceForTest();

    const last = posts[posts.length - 1];
    assert.ok(last, "the host posted a render message");
    assert.deepEqual(last.model.boards[0]?.lastMove, ["e7", "e5"]);
  });

  // -------------------------------------------------------------------------
  // BT3 — Board Theme flows end to end: a counted poll posts a render whose
  //   boardTheme reflects the vscodeChess.boardTheme setting, and changing the
  //   setting re-renders with the new value (host owns the flag; the webview
  //   only maps it to CSS).
  // -------------------------------------------------------------------------

  it("BT3: a counted poll posts a render whose boardTheme reflects the setting and flips on change", async () => {
    const posts: RenderMessage[] = [];
    const presenter = api._getSidebarPresenterForTest();
    presenter.attach({ postMessage: (message) => posts.push(message) });
    presenter.ready();

    await setBoardTheme("classic");
    await new Promise((r) => setTimeout(r, 50)); // onDidChangeConfiguration tick
    api._setFetchForTest(fetchReturning(dailyPayload()));
    await setUsername("playerone");
    await api._pollOnceForTest();

    let last = posts[posts.length - 1];
    assert.ok(last, "the host posted a render message");
    assert.equal(last.boardTheme, "classic", "posted boardTheme reflects the configured value");

    await setBoardTheme("editor");
    await new Promise((r) => setTimeout(r, 50));

    last = posts[posts.length - 1];
    assert.ok(last, "the host posted a render message after the setting change");
    assert.equal(last.boardTheme, "editor", "changing the setting re-renders with the new value");
  });
});
