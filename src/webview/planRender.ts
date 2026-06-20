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
  /** This is the Most Urgent Game's board — drives the Urgent Glow styling. */
  urgent: boolean;
  /** [from, to] of the most recent move — drives the Move Trail. Omitted when absent. */
  lastMove?: [string, string];
}

export interface NotePlan {
  kind: SidebarNote["kind"];
  text: string;
}

/** The bottom Turn Notice, or `null` when no Daily Game awaits a move. */
export interface NoticePlan {
  count: number;
}

export interface RenderPlan {
  note: NotePlan | null;
  cards: CardPlan[];
  notice: NoticePlan | null;
}

export function planRender(model: SidebarRenderModel): RenderPlan {
  return {
    note: model.note ? { kind: model.note.kind, text: model.note.text } : null,
    notice: model.turnNotice ? { count: model.turnNotice.count } : null,
    cards: model.boards.map((board) => {
      const card: CardPlan = {
        label: board.opponent === null ? null : `vs ${board.opponent}`,
        fen: board.fen,
        orientation: board.orientation,
        awaiting: board.awaiting,
        urgent: board.mostUrgent,
      };
      // Conditional-omit, mirroring the board model: carry the Move Trail only
      // when present, so an absent trail is never `lastMove: undefined`.
      if (board.lastMove) {
        card.lastMove = board.lastMove;
      }
      return card;
    }),
  };
}
