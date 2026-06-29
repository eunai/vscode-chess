import assert from "node:assert/strict";
import { formatDeadline, formatFreshness } from "./presenceFormat";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("presenceFormat.formatDeadline()", () => {
  it("DF1: >= 1 day shows two units (days + hours), no seconds", () => {
    assert.equal(formatDeadline(2 * DAY + 3 * HOUR), "2d 3h");
  });

  it("DF2: < 1 day shows hours + minutes", () => {
    assert.equal(formatDeadline(1 * HOUR + 10 * MIN), "1h 10m");
  });

  it("DF3: < 1 hour shows minutes only", () => {
    assert.equal(formatDeadline(47 * MIN), "47m");
  });

  it("DF4: clamps <= 0 to 'due now'; a positive sub-minute stays a minute form", () => {
    assert.equal(formatDeadline(0), "due now");
    assert.equal(formatDeadline(-5 * MIN), "due now");
    assert.equal(formatDeadline(30_000), "1m"); // 30s left → smallest unit, not "due now", never negative
  });
});

describe("presenceFormat.formatFreshness()", () => {
  it("FF1: under a minute (incl. 0) is 'just now'", () => {
    assert.equal(formatFreshness(0), "just now");
    assert.equal(formatFreshness(30_000), "just now");
  });

  it("FF2: minutes show 'Nm ago'", () => {
    assert.equal(formatFreshness(4 * MIN), "4m ago");
  });

  it("FF3: hours show 'Nh ago'", () => {
    assert.equal(formatFreshness(2 * HOUR), "2h ago");
  });

  it("FF4: days show 'Nd ago'", () => {
    assert.equal(formatFreshness(1 * DAY), "1d ago");
  });

  it("FF5: an absent Confirmation is 'checking...'", () => {
    assert.equal(formatFreshness(undefined), "checking...");
  });
});
