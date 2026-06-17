import type { WebviewMessage } from "./contract";

/** The actions the host wires each inbound webview message to. */
export interface WebviewMessageHandlers {
  ready: () => void;
  openMostUrgent: () => void;
}

function isWebviewMessage(value: unknown): value is WebviewMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { type?: unknown }).type === "string"
  );
}

/**
 * Route an inbound webview→host message to a handler. vscode-free so the routing
 * is unit-testable without a live view; the host supplies the side effects
 * (replay on `ready`, run the open command on `openMostUrgent`). Unknown or
 * malformed messages are ignored.
 */
export function onWebviewMessage(message: unknown, handlers: WebviewMessageHandlers): void {
  if (!isWebviewMessage(message)) {
    return;
  }
  switch (message.type) {
    case "ready":
      handlers.ready();
      break;
    case "openMostUrgent":
      handlers.openMostUrgent();
      break;
  }
}
