import { Chessground } from "chessground";
import type { Config } from "chessground/config";
import { planRender, type CardPlan, type NotePlan, type NoticePlan } from "./planRender";
import type {
  OpenMostUrgentMessage,
  ReadyMessage,
  RenderMessage,
  SidebarRenderModel,
} from "../sidebar/contract";

import "chessground/assets/chessground.base.css";
import "chessground/assets/chessground.brown.css";
import "chessground/assets/chessground.cburnett.css";
import "./styles.css";

interface VsCodeApi {
  postMessage(message: unknown): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();

function mountNote(parent: HTMLElement, note: NotePlan): void {
  const el = document.createElement("div");
  el.className = `note note--${note.kind}`;
  el.textContent = note.text; // untrusted copy is host-authored, but never innerHTML
  parent.appendChild(el);
}

function mountCard(parent: HTMLElement, card: CardPlan): void {
  const cardEl = document.createElement("div");
  const classes = ["card"];
  if (card.awaiting) {
    classes.push("card--awaiting");
  }
  if (card.urgent) {
    // The single Most Urgent Game's board — the Urgent Glow, layered on the
    // Awaiting Marker (the most urgent game is always awaiting).
    classes.push("card--urgent");
  }
  cardEl.className = classes.join(" ");

  if (card.label !== null) {
    const label = document.createElement("div");
    label.className = "card__label";
    label.textContent = card.label; // opponent label via textContent, never HTML
    cardEl.appendChild(label);
  }

  const boardEl = document.createElement("div");
  boardEl.className = "card__board";
  cardEl.appendChild(boardEl);
  parent.appendChild(cardEl);

  const config: Config = {
    fen: card.fen,
    orientation: card.orientation,
    viewOnly: true,
    coordinates: false,
  };
  Chessground(boardEl, config);
}

function mountNotice(parent: HTMLElement, notice: NoticePlan): void {
  // A button so the whole bar is keyboard-activatable and focusable. Clicking
  // posts intent only — the host owns the open and the game URL.
  const el = document.createElement("button");
  el.type = "button";
  el.className = "notice";
  const games = notice.count === 1 ? "game" : "games";
  el.textContent = `♟ ${notice.count} ${games} · your move`;
  el.addEventListener("click", () => {
    const message: OpenMostUrgentMessage = { type: "openMostUrgent" };
    vscode.postMessage(message);
  });
  parent.appendChild(el);
}

function render(root: HTMLElement, model: SidebarRenderModel): void {
  const plan = planRender(model);
  root.replaceChildren();

  // Note + boards scroll; the Turn Notice is pinned to the bottom of the view.
  const scroll = document.createElement("div");
  scroll.className = "scroll";
  if (plan.note !== null) {
    mountNote(scroll, plan.note);
  }
  const boards = document.createElement("div");
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

function isRenderMessage(value: unknown): value is RenderMessage {
  return (
    typeof value === "object" && value !== null && (value as { type?: unknown }).type === "render"
  );
}

const root = document.getElementById("app") ?? document.body;

window.addEventListener("message", (event: MessageEvent) => {
  const message: unknown = event.data;
  if (isRenderMessage(message)) {
    render(root, message.model);
  }
});

// Tell the host the listener is registered; it replies with the current model.
const ready: ReadyMessage = { type: "ready" };
vscode.postMessage(ready);
