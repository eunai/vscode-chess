import type { DailyGame } from "../poller/GamesParser";
import type { TokenAuthority } from "./TokenAuthority";

// Identity constants for Settings-placeholder boards (ADR 0007). Wired in S3.
export const SETTINGS_NO_USERNAME = "settings:no-username";
export const SETTINGS_UNKNOWN_USER = "settings:unknown-user";

/** A Settings-placeholder identity — one per host state that offers a fix. */
export type SettingsIdentity = typeof SETTINGS_NO_USERNAME | typeof SETTINGS_UNKNOWN_USER;

/**
 * What activating a board does. `openUrl` carries the game URL (host-side I/O);
 * `openSettings` carries no payload — the Settings target is host-owned in
 * `extension.ts` and never crosses into the webview (ADR 0007, DR5).
 */
export type Action = { kind: "openUrl"; url: string } | { kind: "openSettings" };

export interface ActionDescriptor {
  token: string;
  label: string;
}

export function gameActionLabel(opponent: string): string {
  return `Open game vs ${opponent}`;
}

/** Host-authored accessible name for a Settings-placeholder button — distinct
 * from a game-open name, one per state (ADR 0007). */
export function settingsActionLabel(identity: SettingsIdentity): string {
  return identity === SETTINGS_NO_USERNAME
    ? "Open Settings to set your Chess.com username"
    : "Open Settings to fix your Chess.com username";
}

/**
 * Build the activation descriptor + token-map entry for a Settings placeholder.
 * The token is the HMAC of the state-specific identity, so a token minted in one
 * state fails closed once the state (and thus the identity) changes — no slot or
 * index fallback (ADR 0007, DR6). Pure: no `vscode`, no crypto (the authority is
 * the injected seam).
 */
export function buildSettingsDescriptor(
  identity: SettingsIdentity,
  authority: TokenAuthority
): { descriptor: ActionDescriptor; token: string; action: Action } {
  const token = authority.mint(identity);
  return {
    descriptor: { token, label: settingsActionLabel(identity) },
    token,
    action: { kind: "openSettings" },
  };
}

/** Build per-render descriptor and token maps from a list of games.
 * Identity is the game URL (DR4 stable-per-identity, ADR 0007). */
export function buildDescriptors(
  games: DailyGame[],
  authority: TokenAuthority
): { descriptors: Map<string, ActionDescriptor>; tokenMap: Map<string, Action> } {
  const descriptors = new Map<string, ActionDescriptor>();
  const tokenMap = new Map<string, Action>();
  for (const game of games) {
    const token = authority.mint(game.url);
    descriptors.set(game.url, { token, label: gameActionLabel(game.opponent) });
    tokenMap.set(token, { kind: "openUrl", url: game.url });
  }
  return { descriptors, tokenMap };
}

export function resolveToken(
  tokenMap: ReadonlyMap<string, Action>,
  token: string
): Action | undefined {
  return tokenMap.get(token);
}
