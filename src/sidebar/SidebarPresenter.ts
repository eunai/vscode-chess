import type { PollStatus } from "../poller/Poller";
import type { RenderMessage } from "./contract";
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
  private readonly store = new SidebarStore();
  private poster: Poster | undefined;
  private visible = false;

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

  private post(): void {
    if (this.poster === undefined) {
      return;
    }
    this.poster.postMessage({ type: "render", model: this.store.latestModel });
  }
}
