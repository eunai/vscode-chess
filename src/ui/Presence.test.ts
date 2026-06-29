import assert from "node:assert/strict";
import type * as vscode from "vscode";
import { Presence } from "./Presence";

const OPEN_MOST_URGENT = "vscodeChess.openMostUrgent";
const SETTINGS_COMMAND = {
  command: "workbench.action.openSettings",
  title: "Set username",
  arguments: ["vscodeChess.username"],
};

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
  it("C1/C2: count(n>1) renders '♟ N · <deadline>' and the full tooltip; click opens Most Urgent", () => {
    const item = makeItem();
    newPresence(item).render({
      kind: "count",
      count: 3,
      deadlineText: "1h 10m",
      freshnessText: "last confirmed 4m ago",
    });

    assert.equal(item.text, "♟ 3 · 1h 10m");
    assert.equal(
      item.tooltip,
      "3 Daily games awaiting your move · Most Urgent in 1h 10m · last confirmed 4m ago"
    );
    assert.equal(item.command, OPEN_MOST_URGENT);
  });

  it("C3: count(1) uses singular grammar and keeps 'Most Urgent in'", () => {
    const item = makeItem();
    newPresence(item).render({
      kind: "count",
      count: 1,
      deadlineText: "2d 3h",
      freshnessText: "last confirmed just now",
    });

    assert.equal(item.text, "♟ 1 · 2d 3h");
    assert.equal(
      item.tooltip,
      "1 Daily game awaiting your move · Most Urgent in 2d 3h · last confirmed just now"
    );
  });

  it("ID1: idle renders bare '♟' with Freshness in the tooltip and no command", () => {
    const item = makeItem();
    newPresence(item).render({ kind: "idle", freshnessText: "last confirmed 4m ago" });

    assert.equal(item.text, "♟");
    assert.equal(item.tooltip, "No Daily games awaiting your move · last confirmed 4m ago");
    assert.equal(item.command, undefined);
  });

  it("ID2: idle before the first Confirmation shows 'checking...'", () => {
    const item = makeItem();
    newPresence(item).render({ kind: "idle", freshnessText: "checking..." });

    assert.equal(item.tooltip, "No Daily games awaiting your move · checking...");
  });

  it("is visible from construction and is never hidden across renders (AC2)", () => {
    const item = makeItem();
    const presence = newPresence(item);
    assert.equal(item.shown, true);

    presence.render({
      kind: "count",
      count: 2,
      deadlineText: "5h 0m",
      freshnessText: "last confirmed just now",
    });
    presence.render({ kind: "idle", freshnessText: "last confirmed just now" });

    assert.equal(item.shown, true);
    assert.equal(item.hideCalls, 0);
  });

  it("GU1: unconfigured renders '♟ Set Username' opening Settings (unchanged)", () => {
    const item = makeItem();
    newPresence(item).render({ kind: "unconfigured" });

    assert.equal(item.text, "♟ Set Username");
    assert.equal(item.tooltip, "VS Code Chess — set your Chess.com username to begin");
    assert.deepEqual(item.command, SETTINGS_COMMAND);
  });

  it("GU2: badUsername renders '♟ Unknown User' opening Settings (unchanged)", () => {
    const item = makeItem();
    newPresence(item).render({ kind: "badUsername" });

    assert.equal(item.text, "♟ Unknown User");
    assert.equal(item.tooltip, "VS Code Chess — Chess.com user not found; check your username");
    assert.deepEqual(item.command, SETTINGS_COMMAND);
  });

  it("TR1/TR2/TR4: transient renders '♟ Reconnecting...' with last-known disclosure; click retained", () => {
    const item = makeItem();
    newPresence(item).render({
      kind: "transient",
      freshnessText: "last confirmed 4m ago",
      lastKnown: { count: 3, deadlineText: "1h 10m" },
    });

    assert.equal(item.text, "♟ Reconnecting...");
    assert.equal(
      item.tooltip,
      "Reconnecting... · last confirmed 4m ago · last known: 3 games awaiting your move · Most Urgent in 1h 10m"
    );
    assert.equal(item.command, OPEN_MOST_URGENT);
  });

  it("TR3: transient with no last-known shows 'checking...' and is non-clickable", () => {
    const item = makeItem();
    newPresence(item).render({ kind: "transient", freshnessText: "checking..." });

    assert.equal(item.text, "♟ Reconnecting...");
    assert.equal(item.tooltip, "Reconnecting... · checking...");
    assert.equal(item.command, undefined);
  });
});
