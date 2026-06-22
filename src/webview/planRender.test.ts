import assert from "node:assert/strict";
import { planRender } from "./planRender";
import type { SidebarRenderModel } from "../sidebar/contract";

const board = (over: Partial<SidebarRenderModel["boards"][number]> = {}) => ({
  fen: "8/8/8/8/8/8/8/8 w - - 0 1",
  orientation: "white" as const,
  opponent: "opp" as string | null,
  awaiting: false,
  glow: 0,
  ...over,
});

describe("planRender()", () => {
  it("R-plan1: a board with opponent null produces a card with no label", () => {
    const model: SidebarRenderModel = { boards: [board({ opponent: null })] };
    const plan = planRender(model);
    assert.strictEqual(plan.cards.length, 1);
    assert.strictEqual(plan.cards[0]?.label, null);
  });

  it("R-plan1b: a board with an opponent produces a 'vs {opponent}' label", () => {
    const model: SidebarRenderModel = { boards: [board({ opponent: "ada" })] };
    const plan = planRender(model);
    assert.strictEqual(plan.cards[0]?.label, "vs ada");
  });

  it("R-plan2: awaiting true marks the card; false does not", () => {
    const plan = planRender({
      boards: [board({ awaiting: true, opponent: "a" }), board({ awaiting: false, opponent: "b" })],
    });
    assert.strictEqual(plan.cards[0]?.awaiting, true);
    assert.strictEqual(plan.cards[1]?.awaiting, false);
  });

  it("R-plan3: a note produces one note plan by kind; absent note → null", () => {
    const withNote = planRender({
      boards: [board()],
      note: { kind: "retry", text: "Reconnecting…" },
    });
    assert.strictEqual(withNote.note?.kind, "retry");
    assert.strictEqual(withNote.note?.text, "Reconnecting…");

    const without = planRender({ boards: [board()] });
    assert.strictEqual(without.note, null);
  });

  it("R-plan4: N boards produce N cards in model order (no reordering in the webview)", () => {
    const plan = planRender({
      boards: [
        board({ opponent: "first" }),
        board({ opponent: "second" }),
        board({ opponent: "third" }),
      ],
    });
    assert.deepStrictEqual(
      plan.cards.map((c) => c.label),
      ["vs first", "vs second", "vs third"]
    );
  });

  it("PR1: planRender carries each board's glow intensity to the card (model order preserved)", () => {
    const plan = planRender({
      boards: [
        board({ opponent: "a", awaiting: true, glow: 0.8 }),
        board({ opponent: "b", awaiting: true, glow: 0.2 }),
        board({ opponent: "c", awaiting: false, glow: 0 }),
      ],
    });
    assert.strictEqual(plan.cards[0]?.glow, 0.8);
    assert.strictEqual(plan.cards[1]?.glow, 0.2);
    assert.strictEqual(plan.cards[2]?.glow, 0);
  });

  it("R-plan5: turnNotice present → a notice plan with the count; absent → null", () => {
    const withNotice = planRender({
      boards: [board({ awaiting: true, opponent: "a" })],
      turnNotice: { count: 3 },
    });
    assert.strictEqual(withNotice.notice?.count, 3);

    const without = planRender({ boards: [board()] });
    assert.strictEqual(without.notice, null);
  });

  it("carries fen and orientation through to each card", () => {
    const plan = planRender({
      boards: [board({ fen: "FEN", orientation: "black", opponent: "x" })],
    });
    assert.strictEqual(plan.cards[0]?.fen, "FEN");
    assert.strictEqual(plan.cards[0]?.orientation, "black");
  });

  it("MT8: carries a board's lastMove to the card; omits it when absent", () => {
    const plan = planRender({
      boards: [board({ opponent: "a", lastMove: ["e2", "e4"] }), board({ opponent: "b" })],
    });
    assert.deepStrictEqual(plan.cards[0]?.lastMove, ["e2", "e4"]);
    const second = plan.cards[1];
    assert.ok(second);
    assert.strictEqual("lastMove" in second, false);
  });
});
