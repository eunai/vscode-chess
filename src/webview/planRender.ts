import type { Orientation, SidebarNote, SidebarRenderModel } from "../sidebar/contract";

/**
 * A declarative description of the sidebar DOM, derived purely from the render
 * model. Splitting this from the imperative chessground/DOM apply keeps the
 * mapping (labels, marker, note, order) unit-testable without a live webview.
 * The webview never reorders or reclassifies — it renders cards in model order.
 */
export interface CardPlan {
  /** `vs {opponent}`, or `null` for a placeholder board (no label). */
  label: string | null;
  fen: string;
  orientation: Orientation;
  /** Drives the Awaiting Marker styling. */
  awaiting: boolean;
}

export interface NotePlan {
  kind: SidebarNote["kind"];
  text: string;
}

export interface RenderPlan {
  note: NotePlan | null;
  cards: CardPlan[];
}

export function planRender(model: SidebarRenderModel): RenderPlan {
  return {
    note: model.note ? { kind: model.note.kind, text: model.note.text } : null,
    cards: model.boards.map((board) => ({
      label: board.opponent === null ? null : `vs ${board.opponent}`,
      fen: board.fen,
      orientation: board.orientation,
      awaiting: board.awaiting,
    })),
  };
}
