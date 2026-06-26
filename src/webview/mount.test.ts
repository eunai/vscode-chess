import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { makeMountFns, type PostMessage } from "./mount";
import type { CardPlan } from "./planRender";
import type { ActivateBoardMessage } from "../sidebar/contract";

const css = readFileSync(join(__dirname, "styles.css"), "utf8");

function makeJSDOM() {
  const { window } = new JSDOM("<!DOCTYPE html><html><body></body></html>");
  return window;
}

function makePostMessage() {
  const captured: unknown[] = [];
  const postMessage: PostMessage = (msg) => captured.push(msg);
  return { captured, postMessage };
}

const stubChessboard = () => {};

function actionCard(overrides: Partial<CardPlan> = {}): CardPlan {
  return {
    label: "vs ada",
    fen: "8/8/8/8/8/8/8/8 w - - 0 1",
    orientation: "white",
    awaiting: false,
    glow: 0,
    action: { token: "tok-abc", label: "Open game vs ada" },
    ...overrides,
  };
}

function inertCard(overrides: Partial<CardPlan> = {}): CardPlan {
  return {
    label: "vs ada",
    fen: "8/8/8/8/8/8/8/8 w - - 0 1",
    orientation: "white",
    awaiting: false,
    glow: 0,
    ...overrides,
  };
}

/** A Settings placeholder card: no opponent label, but an activation descriptor. */
function settingsCard(overrides: Partial<CardPlan> = {}): CardPlan {
  return {
    label: null,
    fen: "8/8/8/8/8/8/8/8 w - - 0 1",
    orientation: "white",
    awaiting: false,
    glow: 0,
    action: { token: "tok-settings", label: "Open Settings to set your Chess.com username" },
    ...overrides,
  };
}

function isActivateBoardMessage(m: unknown): m is ActivateBoardMessage {
  if (typeof m !== "object" || m === null) return false;
  const o = m as Record<string, unknown>;
  return o["type"] === "activateBoard";
}

describe("mount.ts — jsdom harness", () => {
  it("DOM-1: actionable board renders as <button type='button'>", () => {
    const window = makeJSDOM();
    const { postMessage } = makePostMessage();
    const { mountCard } = makeMountFns(postMessage, stubChessboard, window.document);
    const container = window.document.createElement("div");
    window.document.body.appendChild(container);
    mountCard(container, actionCard());
    const boardEl = container.querySelector<HTMLButtonElement>(".card__board");
    assert.ok(boardEl, "board element must exist");
    assert.strictEqual(boardEl.tagName, "BUTTON", "actionable board must be a button");
    assert.strictEqual(boardEl.type, "button", "button type must be 'button' (not submit)");
  });

  it("DOM-2: button carries host-authored aria-label", () => {
    const window = makeJSDOM();
    const { postMessage } = makePostMessage();
    const { mountCard } = makeMountFns(postMessage, stubChessboard, window.document);
    const container = window.document.createElement("div");
    window.document.body.appendChild(container);
    mountCard(container, actionCard({ action: { token: "tok", label: "Open game vs opponent" } }));
    const boardEl = container.querySelector(".card__board");
    assert.strictEqual(
      boardEl?.getAttribute("aria-label"),
      "Open game vs opponent",
      "aria-label must match host-authored label"
    );
  });

  it("DOM-3: inert board is not a focusable control", () => {
    const window = makeJSDOM();
    const { postMessage } = makePostMessage();
    const { mountCard } = makeMountFns(postMessage, stubChessboard, window.document);
    const container = window.document.createElement("div");
    window.document.body.appendChild(container);
    mountCard(container, inertCard());
    const boardEl = container.querySelector<HTMLElement>(".card__board");
    assert.ok(boardEl, "board element must exist");
    assert.notStrictEqual(boardEl.tagName, "BUTTON", "inert board must not be a button");
    assert.ok(!boardEl.getAttribute("role"), "inert board must not have role attribute");
    assert.ok(boardEl.tabIndex < 0, "inert board must not be in the tab order");
  });

  it("DOM-4: click dispatches exactly one activateBoard message with the correct token", () => {
    const window = makeJSDOM();
    const { captured, postMessage } = makePostMessage();
    const { mountCard } = makeMountFns(postMessage, stubChessboard, window.document);
    const container = window.document.createElement("div");
    window.document.body.appendChild(container);
    mountCard(container, actionCard({ action: { token: "tok-xyz", label: "Open game vs ada" } }));
    const boardEl = container.querySelector<HTMLButtonElement>(".card__board");
    assert.ok(boardEl);
    boardEl.click();
    const activateMessages = captured.filter(isActivateBoardMessage);
    assert.strictEqual(activateMessages.length, 1, "exactly one activateBoard message on click");
    assert.strictEqual(activateMessages[0]?.actionToken, "tok-xyz");
  });

  it("A11Y-1: no keydown listener registered on the board element", () => {
    const window = makeJSDOM();
    const keydownCalls: string[] = [];

    // Prototype-patch is the only way to observe registered listeners in jsdom;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const proto: any = window.HTMLElement.prototype;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const origAdd: unknown = proto.addEventListener;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    proto.addEventListener = function (this: HTMLElement, type: string, ...args: unknown[]) {
      if (type === "keydown") {
        keydownCalls.push(`keydown on ${this.tagName}.${this.className}`);
      }
      return (origAdd as (...a: unknown[]) => void).call(this, type, ...args);
    };

    const { postMessage } = makePostMessage();
    const { mountCard } = makeMountFns(postMessage, stubChessboard, window.document);
    const container = window.document.createElement("div");
    window.document.body.appendChild(container);
    mountCard(container, actionCard());

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    proto.addEventListener = origAdd;
    assert.strictEqual(
      keydownCalls.length,
      0,
      `keydown must not be registered; native button handles Enter/Space. Got: ${keydownCalls.join(", ")}`
    );
  });

  it("A11Y-2: actionable board uses button.card__board; inert uses div.card__board; CSS has cursor:pointer", () => {
    const window = makeJSDOM();
    const { postMessage } = makePostMessage();
    const { mountCard } = makeMountFns(postMessage, stubChessboard, window.document);
    const container = window.document.createElement("div");
    window.document.body.appendChild(container);

    mountCard(container, actionCard());
    const buttonBoard = container.querySelector(".card__board");
    assert.strictEqual(buttonBoard?.tagName, "BUTTON", "actionable board: button");

    const container2 = window.document.createElement("div");
    window.document.body.appendChild(container2);
    mountCard(container2, inertCard());
    const divBoard = container2.querySelector(".card__board");
    assert.strictEqual(divBoard?.tagName, "DIV", "inert board: div");

    assert.ok(css.includes("button.card__board"), "styles.css must target button.card__board");
    assert.ok(
      css.includes("cursor: pointer") || css.includes("cursor:pointer"),
      "button.card__board must set cursor:pointer"
    );
  });

  it("A11Y-3: focus style uses --vscode-focusBorder and outline (not outline:none)", () => {
    assert.ok(
      css.includes("button.card__board:focus-visible"),
      "styles.css must have :focus-visible rule"
    );
    assert.ok(
      css.includes("--vscode-focusBorder"),
      "focus ring must use --vscode-focusBorder token"
    );
    assert.ok(css.includes("outline"), "focus style must include outline");
    assert.ok(
      !css.includes("outline: none") && !css.includes("outline:none"),
      "focus style must NOT strip the outline"
    );
  });

  it("A11Y-4: no mounted element carries tabindex ≥ 1", () => {
    const window = makeJSDOM();
    const { postMessage } = makePostMessage();
    const { mountCard } = makeMountFns(postMessage, stubChessboard, window.document);
    const container = window.document.createElement("div");
    window.document.body.appendChild(container);
    mountCard(container, actionCard());
    mountCard(container, inertCard());

    const all = container.querySelectorAll("*");
    for (const el of all) {
      assert.ok(
        (el as HTMLElement).tabIndex < 1,
        `element ${el.tagName}.${el.className} has tabIndex=${(el as HTMLElement).tabIndex} ≥ 1`
      );
    }
  });

  it("PRIV-LOG: no outbound activation message contains a URL, game data, or token value in its JSON", () => {
    const window = makeJSDOM();
    const { captured, postMessage } = makePostMessage();
    const { mountCard } = makeMountFns(postMessage, stubChessboard, window.document);
    const container = window.document.createElement("div");
    window.document.body.appendChild(container);
    mountCard(
      container,
      actionCard({ action: { token: "tok-secret", label: "Open game vs ada" } })
    );
    const boardEl = container.querySelector<HTMLButtonElement>(".card__board");
    assert.ok(boardEl);
    boardEl.click();

    for (const msg of captured) {
      const json = JSON.stringify(msg);
      assert.ok(!json.match(/chess\.com/i), `message must not contain a chess.com URL: ${json}`);
      assert.ok(!json.match(/"url":/i), `message must not contain a url field: ${json}`);
      assert.ok(!json.match(/"index":/i), `message must not contain an index field: ${json}`);
      assert.ok(!json.match(/settings/i), `message must not contain a settings reference: ${json}`);
    }
    const msg = captured[0] as Record<string, unknown>;
    assert.ok(msg, "at least one message captured");
    assert.deepStrictEqual(Object.keys(msg).sort(), ["actionToken", "type"]);
  });

  it("DOM-7: outbound activation message shape is exactly { type, actionToken } — no URL, no index", () => {
    const window = makeJSDOM();
    const { captured, postMessage } = makePostMessage();
    const { mountCard } = makeMountFns(postMessage, stubChessboard, window.document);
    const container = window.document.createElement("div");
    window.document.body.appendChild(container);
    mountCard(container, actionCard({ action: { token: "tok-1", label: "Open game vs ada" } }));
    const boardEl = container.querySelector<HTMLButtonElement>(".card__board");
    assert.ok(boardEl);
    boardEl.click();

    assert.ok(captured.length > 0, "at least one message must be posted");
    for (const msg of captured) {
      const json = JSON.stringify(msg);
      assert.ok(
        !json.match(/(chess\.com|"url":|"index":|settings)/i),
        `activation message must only carry opaque token; got: ${json}`
      );
    }
    const first = captured[0] as Record<string, unknown>;
    assert.strictEqual(first["type"], "activateBoard");
    assert.ok("actionToken" in first, "must carry actionToken");
    assert.ok(!("url" in first), "must NOT carry url");
    assert.ok(!("index" in first), "must NOT carry index");
  });

  // --- S3: Settings-placeholder activation (a placeholder with no opponent but
  // an action renders as a button exactly like a game board; an inert one does not).

  it("DOM-SET-1: a Settings placeholder (no opponent) renders as a native button with the host-authored aria-label", () => {
    const window = makeJSDOM();
    const { postMessage } = makePostMessage();
    const { mountCard } = makeMountFns(postMessage, stubChessboard, window.document);
    const container = window.document.createElement("div");
    window.document.body.appendChild(container);
    mountCard(container, settingsCard());
    const boardEl = container.querySelector<HTMLButtonElement>(".card__board");
    assert.ok(boardEl, "board element must exist");
    assert.strictEqual(boardEl.tagName, "BUTTON", "Settings placeholder must be a button");
    assert.strictEqual(boardEl.type, "button");
    assert.strictEqual(
      boardEl.getAttribute("aria-label"),
      "Open Settings to set your Chess.com username",
      "aria-label is the host-authored Settings accessible name"
    );
  });

  it("DOM-SET-2: an inert placeholder (no action) renders as a non-focusable div", () => {
    const window = makeJSDOM();
    const { postMessage } = makePostMessage();
    const { mountCard } = makeMountFns(postMessage, stubChessboard, window.document);
    const container = window.document.createElement("div");
    window.document.body.appendChild(container);
    mountCard(container, inertCard({ label: null }));
    const boardEl = container.querySelector<HTMLElement>(".card__board");
    assert.ok(boardEl);
    assert.notStrictEqual(boardEl.tagName, "BUTTON", "inert placeholder must not be a button");
    assert.ok(!boardEl.getAttribute("role"), "inert placeholder must not have role");
    assert.ok(boardEl.tabIndex < 0, "inert placeholder must not be in the tab order");
  });

  it("DOM-SET-3: no keydown listener registered on the Settings placeholder button", () => {
    const window = makeJSDOM();
    const keydownCalls: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const proto: any = window.HTMLElement.prototype;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const origAdd: unknown = proto.addEventListener;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    proto.addEventListener = function (this: HTMLElement, type: string, ...args: unknown[]) {
      if (type === "keydown") {
        keydownCalls.push(`keydown on ${this.tagName}.${this.className}`);
      }
      return (origAdd as (...a: unknown[]) => void).call(this, type, ...args);
    };

    const { postMessage } = makePostMessage();
    const { mountCard } = makeMountFns(postMessage, stubChessboard, window.document);
    const container = window.document.createElement("div");
    window.document.body.appendChild(container);
    mountCard(container, settingsCard());

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    proto.addEventListener = origAdd;
    assert.strictEqual(
      keydownCalls.length,
      0,
      `keydown must not be registered; native button handles Enter/Space. Got: ${keydownCalls.join(", ")}`
    );
  });

  it("DOM-SET-4: clicking a Settings placeholder posts exactly one activateBoard with its token", () => {
    const window = makeJSDOM();
    const { captured, postMessage } = makePostMessage();
    const { mountCard } = makeMountFns(postMessage, stubChessboard, window.document);
    const container = window.document.createElement("div");
    window.document.body.appendChild(container);
    mountCard(
      container,
      settingsCard({
        action: { token: "tok-set-1", label: "Open Settings to set your Chess.com username" },
      })
    );
    const boardEl = container.querySelector<HTMLButtonElement>(".card__board");
    assert.ok(boardEl);
    boardEl.click();
    const activateMessages = captured.filter(isActivateBoardMessage);
    assert.strictEqual(activateMessages.length, 1, "exactly one activateBoard on click");
    assert.strictEqual(activateMessages[0]?.actionToken, "tok-set-1");
  });

  it("DOM-SET-5: mixed list — game and Settings placeholder are buttons in DOM order; the inert placeholder is a skipped div; no tabindex ≥ 1", () => {
    const window = makeJSDOM();
    const { postMessage } = makePostMessage();
    const { mountCard } = makeMountFns(postMessage, stubChessboard, window.document);
    const container = window.document.createElement("div");
    window.document.body.appendChild(container);
    mountCard(container, actionCard({ action: { token: "g1", label: "Open game vs ada" } }));
    mountCard(
      container,
      settingsCard({
        action: { token: "s1", label: "Open Settings to fix your Chess.com username" },
      })
    );
    mountCard(container, inertCard({ label: null }));

    const boards = [...container.querySelectorAll(".card__board")];
    assert.strictEqual(boards.length, 3);
    assert.strictEqual(boards[0]?.tagName, "BUTTON", "game board is a button");
    assert.strictEqual(boards[1]?.tagName, "BUTTON", "Settings placeholder is a button");
    assert.strictEqual(
      boards[2]?.tagName,
      "DIV",
      "inert placeholder is a div (skipped in tab order)"
    );
    for (const el of container.querySelectorAll("*")) {
      assert.ok(
        (el as HTMLElement).tabIndex < 1,
        `element ${el.tagName}.${el.className} has tabIndex ≥ 1`
      );
    }
  });
});
