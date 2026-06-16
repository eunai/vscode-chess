import { Chessground } from "chessground";
import type { Config } from "chessground/config";
import { planRender, type CardPlan, type NotePlan } from "./planRender";
import type { ReadyMessage, RenderMessage, SidebarRenderModel } from "../sidebar/contract";

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
  cardEl.className = card.awaiting ? "card card--awaiting" : "card";

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

function render(root: HTMLElement, model: SidebarRenderModel): void {
  const plan = planRender(model);
  root.replaceChildren();

  if (plan.note !== null) {
    mountNote(root, plan.note);
  }

  const boards = document.createElement("div");
  boards.className = "boards";
  for (const card of plan.cards) {
    mountCard(boards, card);
  }
  root.appendChild(boards);
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
