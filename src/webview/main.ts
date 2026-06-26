import { Chessground } from "chessground";
import type { Key } from "chessground/types";
import { makeMountFns, type ChessboardMount } from "./mount";
import type { ReadyMessage, RenderMessage } from "../sidebar/contract";

import "chessground/assets/chessground.base.css";
import "chessground/assets/chessground.brown.css";
import "chessground/assets/chessground.cburnett.css";
import "./styles.css";

interface VsCodeApi {
  postMessage(message: unknown): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();

const mountChessboard: ChessboardMount = (el, fen, orientation, lastMove) => {
  Chessground(el, {
    fen,
    orientation,
    viewOnly: true,
    coordinates: false,
    highlight: { lastMove: true },
    ...(lastMove ? { lastMove: lastMove as Key[] } : {}),
  });
};

const { render } = makeMountFns((msg) => vscode.postMessage(msg), mountChessboard);

function isRenderMessage(value: unknown): value is RenderMessage {
  return (
    typeof value === "object" && value !== null && (value as { type?: unknown }).type === "render"
  );
}

const root = document.getElementById("app") ?? document.body;

window.addEventListener("message", (event: MessageEvent) => {
  const message: unknown = event.data;
  if (isRenderMessage(message)) {
    document.body.dataset.boardTheme = message.boardTheme;
    render(root, message.model);
  }
});

const ready: ReadyMessage = { type: "ready" };
vscode.postMessage(ready);
