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

/** Everything the webview needs to render one frame. `boards` is always ≥ 1. */
export interface SidebarRenderModel {
  boards: SidebarBoard[];
  note?: SidebarNote;
}

/** host → webview */
export interface RenderMessage {
  type: "render";
  model: SidebarRenderModel;
}

/** webview → host (the only signal this slice; carries no data, no intent) */
export interface ReadyMessage {
  type: "ready";
}
