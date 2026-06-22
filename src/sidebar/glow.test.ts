import assert from "node:assert/strict";
import { glowIntensity, GLOW_FLOOR, GLOW_CEILING_MS } from "./glow";

// `now` is ms (Date.now); `moveBy` is Unix SECONDS. A game whose deadline is
// `remainingMs` away has moveBy = (now + remainingMs) / 1000.
const NOW = 1_000_000_000_000;
const moveByWithRemaining = (remainingMs: number): number => (NOW + remainingMs) / 1000;

describe("glowIntensity()", () => {
  it("GI2: overdue (remaining ≤ 0) clamps to 1", () => {
    assert.strictEqual(glowIntensity(moveByWithRemaining(-1), NOW), 1);
    assert.strictEqual(glowIntensity(moveByWithRemaining(-60 * 60 * 1000), NOW), 1);
  });

  it("GI2: far future (remaining ≥ CEILING) clamps to FLOOR", () => {
    assert.strictEqual(glowIntensity(moveByWithRemaining(GLOW_CEILING_MS), NOW), GLOW_FLOOR);
    assert.strictEqual(glowIntensity(moveByWithRemaining(GLOW_CEILING_MS * 2), NOW), GLOW_FLOOR);
  });

  it("GI1: strictly decreasing in remaining within the open window (0, CEILING)", () => {
    const near = glowIntensity(moveByWithRemaining(GLOW_CEILING_MS * 0.25), NOW);
    const mid = glowIntensity(moveByWithRemaining(GLOW_CEILING_MS * 0.5), NOW);
    const far = glowIntensity(moveByWithRemaining(GLOW_CEILING_MS * 0.75), NOW);
    assert.ok(near > mid, "a nearer deadline glows stronger");
    assert.ok(mid > far, "a nearer deadline glows stronger");
  });

  it("GI3: equals the documented linear curve at the midpoint (derived from the exported constants)", () => {
    const mid = glowIntensity(moveByWithRemaining(GLOW_CEILING_MS * 0.5), NOW);
    const expected = GLOW_FLOOR + (1 - GLOW_FLOOR) * 0.5;
    assert.ok(Math.abs(mid - expected) < 1e-9, `${mid} ≈ ${expected}`);
  });

  it("stays within [FLOOR, 1] across the whole domain", () => {
    for (const r of [-1e9, 0, 1, GLOW_CEILING_MS * 0.1, GLOW_CEILING_MS, GLOW_CEILING_MS * 10]) {
      const v = glowIntensity(moveByWithRemaining(r), NOW);
      assert.ok(v >= GLOW_FLOOR && v <= 1, `intensity ${v} for remaining ${r} out of range`);
    }
  });
});
