import assert from "node:assert/strict";
import { normalizeBoardTheme } from "./contract";

describe("normalizeBoardTheme()", () => {
  it("BT1a: an unset value defaults to 'editor'", () => {
    assert.strictEqual(normalizeBoardTheme(undefined), "editor");
  });

  it("BT1b: 'editor' and 'classic' pass through unchanged", () => {
    assert.strictEqual(normalizeBoardTheme("editor"), "editor");
    assert.strictEqual(normalizeBoardTheme("classic"), "classic");
  });

  it("BT1c: any other value falls back to 'editor' and never throws", () => {
    for (const v of ["", "Editor", "CLASSIC", "brown", 123, null, {}, []]) {
      assert.strictEqual(normalizeBoardTheme(v as unknown), "editor");
    }
  });
});
