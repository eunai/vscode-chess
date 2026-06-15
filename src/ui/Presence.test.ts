import assert from "node:assert/strict";
import type * as vscode from "vscode";
import { Presence } from "./Presence";

const OPEN_MOST_URGENT = "vscodeChess.openMostUrgent";

interface FakeStatusBarItem {
  text: string;
  tooltip: string | vscode.MarkdownString | undefined;
  command: string | vscode.Command | undefined;
  shown: boolean;
  hideCalls: number;
  show(): void;
  hide(): void;
  dispose(): void;
}

function makeItem(): FakeStatusBarItem {
  return {
    text: "",
    tooltip: undefined,
    command: undefined,
    shown: false,
    hideCalls: 0,
    show() {
      this.shown = true;
    },
    hide() {
      this.shown = false;
      this.hideCalls++;
    },
    dispose() {},
  };
}

function newPresence(item: FakeStatusBarItem): Presence {
  return new Presence(item as unknown as vscode.StatusBarItem, OPEN_MOST_URGENT);
}

describe("Presence", () => {
  it("renders count(n) as '♟ n' with the open-most-urgent command (P2)", () => {
    const item = makeItem();
    const presence = newPresence(item);

    presence.render({ kind: "count", count: 3 });

    assert.equal(item.text, "♟ 3");
    assert.equal(item.command, OPEN_MOST_URGENT);
    assert.equal(item.tooltip, "3 Daily games awaiting your move");
  });

  it("renders idle as a bare '♟' with no command — non-clickable (P1)", () => {
    const item = makeItem();
    const presence = newPresence(item);

    presence.render({ kind: "idle" });

    assert.equal(item.text, "♟");
    assert.equal(item.command, undefined);
    assert.equal(item.tooltip, "VS Code Chess — no games awaiting your move");
  });

  it("is visible from construction and is never hidden across renders (AC2)", () => {
    const item = makeItem();
    const presence = newPresence(item);
    assert.equal(item.shown, true);

    presence.render({ kind: "count", count: 2 });
    presence.render({ kind: "idle" });

    assert.equal(item.shown, true);
    assert.equal(item.hideCalls, 0);
  });

  it("renders unconfigured as '♟ Set Username' whose command opens Settings (P3)", () => {
    const item = makeItem();
    const presence = newPresence(item);

    presence.render({ kind: "unconfigured" });

    assert.equal(item.text, "♟ Set Username");
    assert.equal(item.tooltip, "VS Code Chess — set your Chess.com username to begin");
    assert.deepEqual(item.command, {
      command: "workbench.action.openSettings",
      title: "Set username",
      arguments: ["vscodeChess.username"],
    });
  });

  it("renders badUsername as '♟ Unknown User' whose command opens Settings (P4)", () => {
    const item = makeItem();
    const presence = newPresence(item);

    presence.render({ kind: "badUsername" });

    assert.equal(item.text, "♟ Unknown User");
    assert.equal(item.tooltip, "VS Code Chess — Chess.com user not found; check your username");
    assert.deepEqual(item.command, {
      command: "workbench.action.openSettings",
      title: "Set username",
      arguments: ["vscodeChess.username"],
    });
  });

  it("renders transient by keeping the last non-transient label and command, swapping only the tooltip (P5)", () => {
    const item = makeItem();
    const presence = newPresence(item);

    presence.render({ kind: "count", count: 4 });
    presence.render({ kind: "transient" });

    assert.equal(item.text, "♟ 4");
    assert.equal(item.command, OPEN_MOST_URGENT);
    assert.equal(item.tooltip, "Reconnecting...");
  });
});
