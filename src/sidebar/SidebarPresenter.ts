import type { PollStatus } from "../poller/Poller";
import type { BoardTheme, RenderMessage } from "./contract";
import { SidebarStore } from "./SidebarStore";

/** The webview side the presenter posts render messages to. */
export interface Poster {
  postMessage(message: RenderMessage): void;
}

/**
 * Drives the sidebar webview from host state, vscode-free so it is unit-testable
 * without a live view. It owns the {@link SidebarStore} (the source of truth) and
 * the current webview poster + visibility. The host calls {@link update} on every
 * poll cycle; the presenter posts the latest model only while a view is attached
 * and visible, and **replays** it on `ready` and on become-visible — so a
 * freshly-opened or rebuilt webview is never blank (ADR 0004).
 */
export class SidebarPresenter {
  private readonly store: SidebarStore;
  private poster: Poster | undefined;
  private visible = false;
  /** The active Board Theme, injected by the host (vscode-free here). */
  private boardTheme: BoardTheme = "editor";

  /**
   * `now` (default `Date.now`) is injected into the {@link SidebarStore} so the
   * Awaiting Glow recomputes from the current clock on every poll tick — including
   * a `304`-driven re-emit and a transient re-send. Tests pass a fake clock.
   */
  constructor(now: () => number = () => Date.now()) {
    this.store = new SidebarStore(now);
  }

  /** A webview view resolved — wire its post channel. */
  attach(poster: Poster): void {
    this.poster = poster;
  }

  /** The webview view was hidden/destroyed (`retainContextWhenHidden: false`). */
  detach(): void {
    this.poster = undefined;
    this.visible = false;
  }

  /** The webview's message listener is registered — deliver the current model. */
  ready(): void {
    this.visible = true;
    this.post();
  }

  /** The view's visibility changed; a become-visible replays the latest model. */
  setVisible(visible: boolean): void {
    this.visible = visible;
    if (visible) {
      this.post();
    }
  }

  /** A new poll status (or a reset): recompute and post only while visible. */
  update(status: PollStatus | undefined, usernameConfigured: boolean): void {
    this.store.update(status, usernameConfigured);
    if (this.visible) {
      this.post();
    }
  }

  /** The host's `vscodeChess.boardTheme` changed (or was read at activation).
   * Stored and re-posted while visible, mirroring {@link update}'s guard. */
  setBoardTheme(theme: BoardTheme): void {
    this.boardTheme = theme;
    if (this.visible) {
      this.post();
    }
  }

  private post(): void {
    if (this.poster === undefined) {
      return;
    }
    this.poster.postMessage({
      type: "render",
      model: this.store.latestModel,
      boardTheme: this.boardTheme,
    });
  }
}
