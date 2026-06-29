import assert from "node:assert/strict";
import { SidebarPresenter } from "./SidebarPresenter";
import { EMPTY_BOARD_FEN } from "./SidebarModel";
import type { RenderMessage } from "./contract";
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

const HOUR = 3_600_000;
const T1 = 1_700_000_000_000;
/** An awaiting game whose deadline is T1 + 40h — inside the Awaiting Glow ramp window at T1. */
const awaitingSoon: DailyGame = { ...awaitingGame, moveBy: (T1 + 40 * HOUR) / 1000 };

const counted = (games: DailyGame[]): PollStatus => ({
  kind: "counted",
  games,
  count: games.filter((g) => g.turn === g.playerColor).length,
  mostUrgent: undefined,
  confirmedAt: 0,
});

/** Records every render message the host posts to the webview. */
class FakePoster {
  readonly posts: RenderMessage[] = [];
  postMessage(message: RenderMessage): void {
    this.posts.push(message);
  }
  get last(): RenderMessage | undefined {
    return this.posts[this.posts.length - 1];
  }
}

describe("SidebarPresenter", () => {
  it("W2: ready() delivers the current model to the webview", () => {
    const presenter = new SidebarPresenter();
    const poster = new FakePoster();
    presenter.update(counted([awaitingGame]), true); // computed before the view exists
    presenter.attach(poster);

    presenter.ready();

    assert.strictEqual(poster.posts.length, 1, "exactly one render on ready");
    assert.strictEqual(poster.last?.type, "render");
    assert.strictEqual(poster.last?.model.boards[0]?.opponent, "ada");
  });

  it("W3: a status update while visible posts an updated render", () => {
    const presenter = new SidebarPresenter();
    const poster = new FakePoster();
    presenter.attach(poster);
    presenter.ready(); // now visible, posts the initial model
    const before = poster.posts.length;

    presenter.update(counted([awaitingGame]), true);

    assert.strictEqual(poster.posts.length, before + 1, "visible update posts once");
    assert.strictEqual(poster.last?.model.boards[0]?.opponent, "ada");
  });

  it("W4: a transient status re-sends last-known boards + a retry note", () => {
    const presenter = new SidebarPresenter();
    const poster = new FakePoster();
    presenter.attach(poster);
    presenter.ready();
    presenter.update(counted([awaitingGame]), true); // last-known = ada's board

    presenter.update({ kind: "transient" }, true);

    assert.strictEqual(poster.last?.model.boards[0]?.opponent, "ada", "last-known re-sent");
    assert.strictEqual(poster.last?.model.note?.kind, "retry");
  });

  it("W5: a hidden update posts nothing; the next become-visible posts the latest", () => {
    const presenter = new SidebarPresenter();
    const poster = new FakePoster();
    presenter.attach(poster); // attached but not yet visible

    presenter.update(counted([awaitingGame]), true);
    assert.strictEqual(poster.posts.length, 0, "no post while hidden");

    presenter.setVisible(true);
    assert.strictEqual(
      poster.posts.length,
      1,
      "become-visible posts the model computed while hidden"
    );
    assert.strictEqual(poster.last?.model.boards[0]?.opponent, "ada");
  });

  it("W6: webview recreation (detach → attach → ready) re-posts the latest model", () => {
    const presenter = new SidebarPresenter();
    const first = new FakePoster();
    presenter.attach(first);
    presenter.ready();
    presenter.update(counted([awaitingGame]), true);

    presenter.detach(); // view hidden/destroyed

    const second = new FakePoster();
    presenter.attach(second);
    presenter.ready();

    assert.strictEqual(second.posts.length, 1, "rebuilt view receives the latest model");
    assert.strictEqual(second.last?.model.boards[0]?.opponent, "ada");
  });

  it("W7: a transient after notFound posts an empty placeholder + retry, not stale boards", () => {
    const presenter = new SidebarPresenter();
    const poster = new FakePoster();
    presenter.attach(poster);
    presenter.ready();
    presenter.update(counted([awaitingGame]), true); // real boards
    presenter.update({ kind: "notFound", confirmedAt: 0 }, true); // clears last-known

    presenter.update({ kind: "transient" }, true);

    assert.strictEqual(poster.last?.model.boards[0]?.fen, EMPTY_BOARD_FEN);
    assert.strictEqual(poster.last?.model.boards[0]?.opponent, null);
    assert.strictEqual(poster.last?.model.note?.kind, "retry");
  });

  it("BT2a: every posted render carries the boardTheme (default 'editor')", () => {
    const presenter = new SidebarPresenter();
    const poster = new FakePoster();
    presenter.attach(poster);
    presenter.ready();

    assert.strictEqual(poster.last?.boardTheme, "editor");
  });

  it("BT2b: setBoardTheme re-posts when visible, no-ops when hidden, replays on become-visible", () => {
    const presenter = new SidebarPresenter();
    const poster = new FakePoster();
    presenter.attach(poster);
    presenter.ready(); // visible; posts with the default 'editor'

    const beforeVisible = poster.posts.length;
    presenter.setBoardTheme("classic");
    assert.strictEqual(poster.posts.length, beforeVisible + 1, "visible setBoardTheme posts once");
    assert.strictEqual(poster.last?.boardTheme, "classic");

    presenter.setVisible(false);
    const beforeHidden = poster.posts.length;
    presenter.setBoardTheme("editor");
    assert.strictEqual(poster.posts.length, beforeHidden, "hidden setBoardTheme posts nothing");

    presenter.setVisible(true); // become-visible replays the latest model + boardTheme
    assert.strictEqual(
      poster.last?.boardTheme,
      "editor",
      "become-visible carries the latest boardTheme"
    );
  });

  it("SP-RT: resolveToken delegates to the store — same behavior as the store with the same games", () => {
    const auth = makeAuthority();
    const presenter = new SidebarPresenter(() => Date.now(), auth);
    const poster = new FakePoster();
    presenter.attach(poster);
    presenter.ready();
    presenter.update(counted([awaitingGame]), true);

    const token = poster.last?.model.boards[0]?.action?.token;
    assert.ok(token, "board must carry an action token");
    const action = presenter.resolveToken(token);
    assert.ok(action !== undefined, "resolveToken must return the action");
    assert.strictEqual(action.kind, "openUrl");
    assert.strictEqual(action.url, awaitingGame.url);

    // Backward-compat: no authority → undefined
    const presenterNoAuth = new SidebarPresenter();
    presenterNoAuth.update(counted([awaitingGame]), true);
    assert.strictEqual(presenterNoAuth.resolveToken("any"), undefined);
  });

  it("PR-ADV: identical games at an advancing now post a model whose awaiting glow rises (proof #1, render path)", () => {
    let t = T1;
    const presenter = new SidebarPresenter(() => t);
    const poster = new FakePoster();
    presenter.attach(poster);
    presenter.ready();

    presenter.update(counted([awaitingSoon]), true);
    const glow1 = poster.last!.model.boards[0]!.glow;

    t = T1 + 10 * HOUR; // 10h closer to the deadline; identical games re-posted
    presenter.update(counted([awaitingSoon]), true);
    const glow2 = poster.last!.model.boards[0]!.glow;

    assert.ok(glow2 > glow1, `posted glow should rise as the deadline nears: ${glow2} > ${glow1}`);
  });
});
