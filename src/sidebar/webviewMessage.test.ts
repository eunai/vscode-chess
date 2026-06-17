import assert from "node:assert/strict";
import { onWebviewMessage } from "./webviewMessage";

describe("onWebviewMessage()", () => {
  function spies() {
    const calls: string[] = [];
    return {
      calls,
      handlers: {
        ready: () => calls.push("ready"),
        openMostUrgent: () => calls.push("openMostUrgent"),
      },
    };
  }

  it("routes a ready message to the ready handler", () => {
    const { calls, handlers } = spies();
    onWebviewMessage({ type: "ready" }, handlers);
    assert.deepStrictEqual(calls, ["ready"]);
  });

  it("routes an openMostUrgent message to the open handler", () => {
    const { calls, handlers } = spies();
    onWebviewMessage({ type: "openMostUrgent" }, handlers);
    assert.deepStrictEqual(calls, ["openMostUrgent"]);
  });

  it("ignores unknown or malformed messages", () => {
    const { calls, handlers } = spies();
    onWebviewMessage({ type: "nope" }, handlers);
    onWebviewMessage(null, handlers);
    onWebviewMessage("ready", handlers);
    onWebviewMessage(42, handlers);
    assert.deepStrictEqual(calls, []);
  });
});
