/**
 * The host ↔ webview message contract for the sidebar. These types are shared
 * by the extension host (which authors every value) and the webview (which only
 * renders them). The webview never classifies, sorts, or decides anything — it
 * maps a `SidebarRenderModel` to DOM/chessground and a `SidebarNote` `kind` to
 * presentation. See ADR 0004.
 */

export type Orientation = "white" | "black";

/** One rendered chess board in the sidebar — a Daily Game or a placeholder. */
export interface SidebarBoard {
  /** A validated FEN (payload board) or a trusted placeholder constant. */
  fen: string;
  /** Board orientation — the Player's color for a Daily Game, `white` for placeholders. */
  orientation: Orientation;
  /** Opponent label, or `null` for a placeholder board (no label). */
  opponent: string | null;
  /** Host-derived: this Daily Game awaits the Player's move (drives the Awaiting Marker). */
  awaiting: boolean;
}

/** The single host-authored calm message at the top of the sidebar. */
export type SidebarNote =
  | { kind: "setup"; text: string }
  | { kind: "warning"; text: string }
  | { kind: "retry"; text: string };

/**
 * The host-authored count of Daily Games awaiting the Player's move — the same
 * Turn Count the Presence shows. Present only when at least one game awaits;
 * its absence is how the webview knows to render no Turn Notice.
 */
export interface TurnNotice {
  count: number;
}

/** Everything the webview needs to render one frame. `boards` is always ≥ 1. */
export interface SidebarRenderModel {
  boards: SidebarBoard[];
  note?: SidebarNote;
  /** Host-authored; present (count ≥ 1) drives the bottom Turn Notice. */
  turnNotice?: TurnNotice;
}

/** host → webview */
export interface RenderMessage {
  type: "render";
  model: SidebarRenderModel;
}

/** webview → host: the listener-registered handshake (carries no data). */
export interface ReadyMessage {
  type: "ready";
}

/**
 * webview → host: the User clicked the Turn Notice. An intent only — it carries
 * no game and no URL; the host owns the open (it runs the existing
 * `openMostUrgent` command against its own Most Urgent Game), keeping all I/O
 * and the URL host-side per the "host owns I/O" rule.
 */
export interface OpenMostUrgentMessage {
  type: "openMostUrgent";
}

/** Every message the webview can post to the host. */
export type WebviewMessage = ReadyMessage | OpenMostUrgentMessage;
