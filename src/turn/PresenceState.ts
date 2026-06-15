import type { PollStatus } from "../poller/Poller";

/** The five presentation states the Presence can render. A pure value object
 * with no `vscode` dependency, mirroring how `TurnState.from` isolates counting
 * from the UI. The host maps a `PollStatus` (plus whether a username is
 * configured) to exactly one of these; the Presence renders it. */
export type PresenceState =
  | { kind: "unconfigured" }
  | { kind: "badUsername" }
  | { kind: "idle" }
  | { kind: "count"; count: number }
  | { kind: "transient" };

/** Map a poll status (or its absence, before the first cycle) plus username
 * configuration to exactly one PresenceState. */
export function from(
  pollStatus: PollStatus | undefined,
  usernameConfigured: boolean
): PresenceState {
  if (!usernameConfigured) {
    return { kind: "unconfigured" };
  }
  if (pollStatus === undefined) {
    return { kind: "idle" };
  }
  switch (pollStatus.kind) {
    case "counted":
      return pollStatus.count > 0 ? { kind: "count", count: pollStatus.count } : { kind: "idle" };
    case "notFound":
      return { kind: "badUsername" };
    case "transient":
      return { kind: "transient" };
  }
}
