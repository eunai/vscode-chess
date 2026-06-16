import assert from "node:assert/strict";
import { from } from "./PresenceState";
import type { PollStatus } from "../poller/Poller";

const counted = (count: number): PollStatus => ({
  kind: "counted",
  games: [],
  count,
  mostUrgent: undefined,
});
const notFound: PollStatus = { kind: "notFound" };
const transient: PollStatus = { kind: "transient" };

describe("PresenceState.from()", () => {
  it("returns unconfigured when no username is set, whatever the poll status", () => {
    assert.deepEqual(from(counted(3), false), { kind: "unconfigured" });
    assert.deepEqual(from(notFound, false), { kind: "unconfigured" });
    assert.deepEqual(from(transient, false), { kind: "unconfigured" });
    assert.deepEqual(from(undefined, false), { kind: "unconfigured" });
  });

  it("maps a counted status with games awaiting to count(n) when the username is set", () => {
    assert.deepEqual(from(counted(3), true), { kind: "count", count: 3 });
  });

  it("maps a counted status with zero awaiting to idle when the username is set", () => {
    assert.deepEqual(from(counted(0), true), { kind: "idle" });
  });

  it("maps the absence of a poll status to idle when the username is set (pre-first-poll)", () => {
    assert.deepEqual(from(undefined, true), { kind: "idle" });
  });

  it("maps a notFound status to badUsername when the username is set", () => {
    assert.deepEqual(from(notFound, true), { kind: "badUsername" });
  });

  it("maps a transient status to transient when the username is set", () => {
    assert.deepEqual(from(transient, true), { kind: "transient" });
  });
});
