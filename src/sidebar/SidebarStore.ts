import type { PollStatus } from "../poller/Poller";
import type { DailyGame } from "../poller/GamesParser";
import type { SidebarRenderModel } from "./contract";
import { from } from "./SidebarModel";
import type { SettingsDescriptors } from "./SidebarModel";
import * as boardActions from "./boardActions";
import type { TokenAuthority } from "./TokenAuthority";

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
 * - `_tokenMap` — the most recent token → action map (ADR 0007). Retained across
 *   transients so stale boards remain activatable (DESIGN.md); cleared on
 *   notFound, username change, or fresh start.
 *
 * The injected `now` clock (default `Date.now`) is read on **every** `update`, so
 * the glow recomputes on each poll tick — including a `304`-driven re-emit (the
 * `Poller` re-emits the retained games as `counted`) and a transient.
 */
export class SidebarStore {
  private _latestModel: SidebarRenderModel;
  private lastKnownGames: DailyGame[] | undefined;
  private _tokenMap: Map<string, boardActions.Action> = new Map();
  private readonly now: () => number;
  private readonly authority: TokenAuthority | undefined;

  constructor(now: () => number = () => Date.now(), authority?: TokenAuthority) {
    this.now = now;
    this.authority = authority;
    this._latestModel = from(undefined, false, undefined, this.now());
  }

  get latestModel(): SidebarRenderModel {
    return this._latestModel;
  }

  resolveToken(token: string): boardActions.Action | undefined {
    return boardActions.resolveToken(this._tokenMap, token);
  }

  update(status: PollStatus | undefined, usernameConfigured: boolean): SidebarRenderModel {
    // Build the descriptor maps (and update the token map) before calling from()
    // so the new boards carry their activation descriptors in this render.
    let descriptors: Map<string, boardActions.ActionDescriptor> = new Map();
    let settingsDescriptors: SettingsDescriptors = {};

    if (!usernameConfigured) {
      // No username → the no-username placeholder is the only board. Make it
      // Settings-activatable (ADR 0007); clear when there is no authority.
      if (this.authority) {
        const s = boardActions.buildSettingsDescriptor(
          boardActions.SETTINGS_NO_USERNAME,
          this.authority
        );
        settingsDescriptors = { noUsername: s.descriptor };
        this._tokenMap = new Map([[s.token, s.action]]);
      } else {
        this._tokenMap = new Map();
      }
    } else if (status?.kind === "counted" && status.games.length > 0 && this.authority) {
      const result = boardActions.buildDescriptors(status.games, this.authority);
      descriptors = result.descriptors;
      this._tokenMap = result.tokenMap;
    } else if (status?.kind === "notFound" && this.authority) {
      // Unknown-user placeholder → Settings-activatable (the user's fix is to
      // correct the username). Distinct identity, so a no-username token minted
      // earlier fails closed here.
      const s = boardActions.buildSettingsDescriptor(
        boardActions.SETTINGS_UNKNOWN_USER,
        this.authority
      );
      settingsDescriptors = { unknownUser: s.descriptor };
      this._tokenMap = new Map([[s.token, s.action]]);
    } else if (
      status?.kind === "counted" || // counted(0 games) → idle, inert
      status === undefined || // fresh start
      status?.kind === "notFound" || // notFound without authority
      (status?.kind === "transient" && this.lastKnownGames === undefined)
      // transient with no last-known games: the board renders as an inert
      // empty placeholder, so retaining Settings tokens would leave them
      // resolvable with no carrying board. Clear to restore invariant 3.
    ) {
      this._tokenMap = new Map();
    }
    // transient with last-known games → retain _tokenMap so stale game boards
    // stay activatable (SS-RET2, DESIGN.md).

    // Compute model (with a fresh `now`) so a transient still sees the previous
    // last-known games and the glow ramps from the current clock.
    const model = from(
      status,
      usernameConfigured,
      this.lastKnownGames,
      this.now(),
      descriptors,
      settingsDescriptors
    );

    if (status?.kind === "counted") {
      this.lastKnownGames = status.games;
    } else if (!usernameConfigured || status === undefined || status.kind === "notFound") {
      this.lastKnownGames = undefined;
    }
    // status.kind === "transient": last-known games unchanged.

    this._latestModel = model;
    return model;
  }
}
