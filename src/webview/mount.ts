import type {
  Orientation,
  SidebarRenderModel,
  ActivateBoardMessage,
  OpenMostUrgentMessage,
} from "../sidebar/contract";
import { planRender, type CardPlan, type NotePlan, type NoticePlan } from "./planRender";

export type PostMessage = (message: unknown) => void;
export type ChessboardMount = (
  el: HTMLElement,
  fen: string,
  orientation: Orientation,
  lastMove?: [string, string]
) => void;

export interface MountFns {
  mountCard(this: void, parent: HTMLElement, card: CardPlan): void;
  mountNote(this: void, parent: HTMLElement, note: NotePlan): void;
  mountNotice(this: void, parent: HTMLElement, notice: NoticePlan): void;
  render(this: void, root: HTMLElement, model: SidebarRenderModel): void;
}

export function makeMountFns(
  postMessage: PostMessage,
  mountChessboard: ChessboardMount,
  doc: Document = globalThis.document
): MountFns {
  function mountNote(parent: HTMLElement, note: NotePlan): void {
    const el = doc.createElement("div");
    el.className = `note note--${note.kind}`;
    el.textContent = note.text;
    parent.appendChild(el);
  }

  function mountCard(parent: HTMLElement, card: CardPlan): void {
    const cardEl = doc.createElement("div");
    const classes = ["card"];
    if (card.awaiting) {
      classes.push("card--awaiting");
    }
    cardEl.className = classes.join(" ");
    if (card.glow > 0) {
      cardEl.style.setProperty("--glow", String(card.glow));
    }

    if (card.label !== null) {
      const label = doc.createElement("div");
      label.className = "card__label";
      label.textContent = card.label;
      cardEl.appendChild(label);
    }

    let boardEl: HTMLElement;
    if (card.action) {
      const btn = doc.createElement("button");
      btn.type = "button";
      btn.className = "card__board";
      btn.setAttribute("aria-label", card.action.label);
      const token = card.action.token;
      btn.addEventListener("click", () => {
        const message: ActivateBoardMessage = { type: "activateBoard", actionToken: token };
        postMessage(message);
      });
      boardEl = btn;
    } else {
      const div = doc.createElement("div");
      div.className = "card__board";
      boardEl = div;
    }

    cardEl.appendChild(boardEl);
    parent.appendChild(cardEl);

    mountChessboard(boardEl, card.fen, card.orientation, card.lastMove);
  }

  function mountNotice(parent: HTMLElement, notice: NoticePlan): void {
    const el = doc.createElement("button");
    el.type = "button";
    el.className = "notice";
    const games = notice.count === 1 ? "game" : "games";
    el.textContent = `♟ ${notice.count} ${games} · your move`;
    el.addEventListener("click", () => {
      const message: OpenMostUrgentMessage = { type: "openMostUrgent" };
      postMessage(message);
    });
    parent.appendChild(el);
  }

  function render(root: HTMLElement, model: SidebarRenderModel): void {
    const plan = planRender(model);
    root.replaceChildren();

    const scroll = doc.createElement("div");
    scroll.className = "scroll";
    if (plan.note !== null) {
      mountNote(scroll, plan.note);
    }
    const boards = doc.createElement("div");
    boards.className = "boards";
    for (const card of plan.cards) {
      mountCard(boards, card);
    }
    scroll.appendChild(boards);
    root.appendChild(scroll);

    if (plan.notice !== null) {
      mountNotice(root, plan.notice);
    }
  }

  return { mountCard, mountNote, mountNotice, render };
}
