import assert from "node:assert/strict";
import { SidebarPresenter } from "./SidebarPresenter";
import { EMPTY_BOARD_FEN } from "./SidebarModel";
import type { RenderMessage } from "./contract";
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
    presenter.update({ kind: "notFound" }, true); // clears last-known

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
});
