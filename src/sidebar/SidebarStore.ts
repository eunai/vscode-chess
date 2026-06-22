import type { PollStatus } from "../poller/Poller";
import type { DailyGame } from "../poller/GamesParser";
import type { SidebarRenderModel } from "./contract";
import { from } from "./SidebarModel";

/**
 * The host's single source of truth for the sidebar. The webview is stateless, so
 * the host stores:
 *
 * - `latestModel` — the most recent model for any state; replayed verbatim on a
 *   `ready` handshake and on every become-visible.
 * - `lastKnownGames` — the Daily Games from the most recent successful `counted`.
 *   A transient failure **rebuilds** the boards from these at the current time
 *   (so the Awaiting Glow keeps ramping from the known deadline while
 *   disconnected) rather than re-sending stale boards.
 *
 * The injected `now` clock (default `Date.now`) is read on **every** `update`, so
 * the glow recomputes on each poll tick — including a `304`-driven re-emit (the
 * `Poller` re-emits the retained games as `counted`) and a transient.
 *
 * `update` maintains the transitions: a `counted` sets last-known games; a
 * `notFound`, a username change/clear, or a fresh start (status `undefined`)
 * clears them; a `transient` leaves them untouched and rebuilds from them.
 */
export class SidebarStore {
  private _latestModel: SidebarRenderModel;
  private lastKnownGames: DailyGame[] | undefined;
  private readonly now: () => number;

  constructor(now: () => number = () => Date.now()) {
    this.now = now;
    this._latestModel = from(undefined, false, undefined, this.now());
  }

  get latestModel(): SidebarRenderModel {
    return this._latestModel;
  }

  update(status: PollStatus | undefined, usernameConfigured: boolean): SidebarRenderModel {
    // Compute first (with a fresh `now`) so a transient still sees the previous
    // last-known games and the glow ramps from the current clock.
    const model = from(status, usernameConfigured, this.lastKnownGames, this.now());

    if (status?.kind === "counted") {
      this.lastKnownGames = status.games;
    } else if (!usernameConfigured || status === undefined || status.kind === "notFound") {
      // No valid games for this Player: cleared username, a fresh start (a new
      // Player resets status to undefined), or an unknown user.
      this.lastKnownGames = undefined;
    }
    // status.kind === "transient": last-known games unchanged.

    this._latestModel = model;
    return model;
  }
}
