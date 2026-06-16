import type { PollStatus } from "../poller/Poller";
import type { SidebarBoard, SidebarRenderModel } from "./contract";
import { from } from "./SidebarModel";

/**
 * The host's single source of truth for the sidebar. The webview is stateless,
 * so the host stores **both**:
 *
 * - `latestModel` — the most recent model for any state; replayed verbatim on a
 *   `ready` handshake and on every become-visible.
 * - `lastKnownBoards` — only the boards from the most recent successful
 *   `counted`; the calm fallback a transient failure re-sends.
 *
 * `update` recomputes the model from a poll status and maintains the transitions:
 * a `counted` sets last-known; `notFound`, a username change/clear, or a fresh
 * start (status `undefined`) clears it; a `transient` leaves it untouched and
 * falls back to it.
 */
export class SidebarStore {
  private _latestModel: SidebarRenderModel;
  private lastKnownBoards: SidebarBoard[] | undefined;

  constructor() {
    this._latestModel = from(undefined, false, undefined);
  }

  get latestModel(): SidebarRenderModel {
    return this._latestModel;
  }

  update(status: PollStatus | undefined, usernameConfigured: boolean): SidebarRenderModel {
    // Compute first so a transient still sees the previous last-known boards.
    const model = from(status, usernameConfigured, this.lastKnownBoards);

    if (status?.kind === "counted") {
      this.lastKnownBoards = model.boards;
    } else if (!usernameConfigured || status === undefined || status.kind === "notFound") {
      // No valid boards for this Player: cleared username, a fresh start (a new
      // Player resets status to undefined), or an unknown user.
      this.lastKnownBoards = undefined;
    }
    // status.kind === "transient": last-known unchanged.

    this._latestModel = model;
    return model;
  }
}
