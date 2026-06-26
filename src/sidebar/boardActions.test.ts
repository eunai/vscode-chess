import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildDescriptors,
  resolveToken,
  buildSettingsDescriptor,
  settingsActionLabel,
  gameActionLabel,
  SETTINGS_NO_USERNAME,
  SETTINGS_UNKNOWN_USER,
} from "./boardActions";
import type { Action } from "./boardActions";
import type { TokenAuthority } from "./TokenAuthority";
import type { DailyGame } from "../poller/GamesParser";

function makeAuthority(): TokenAuthority {
  const cache = new Map<string, string>();
  let n = 0;
  return {
    mint: (id) => {
      if (!cache.has(id)) cache.set(id, `tok-${n++}`);
      return cache.get(id)!;
    },
  };
}

function game(overrides: Partial<DailyGame> = {}): DailyGame {
  return {
    url: "https://www.chess.com/game/daily/1",
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    turn: "white",
    moveBy: 1_000_000_000,
    opponent: "alice",
    playerColor: "white",
    ...overrides,
  };
}

describe("boardActions", () => {
  it("BA-1: same identity + same authority → same token on repeated buildDescriptors call", () => {
    const auth = makeAuthority();
    const g = game();
    const { descriptors: d1 } = buildDescriptors([g], auth);
    const { descriptors: d2 } = buildDescriptors([g], auth);
    assert.strictEqual(
      d1.get(g.url)?.token,
      d2.get(g.url)?.token,
      "token stable across re-renders"
    );
  });

  it("BA-2: reorder — same game URL produces the same token regardless of list position", () => {
    const auth = makeAuthority();
    const g1 = game({ url: "https://www.chess.com/game/daily/1" });
    const g2 = game({ url: "https://www.chess.com/game/daily/2" });
    const { descriptors: dAB } = buildDescriptors([g1, g2], auth);
    const { descriptors: dBA } = buildDescriptors([g2, g1], auth);
    assert.strictEqual(
      dAB.get(g1.url)?.token,
      dBA.get(g1.url)?.token,
      "g1 token unchanged after reorder"
    );
    assert.strictEqual(
      dAB.get(g2.url)?.token,
      dBA.get(g2.url)?.token,
      "g2 token unchanged after reorder"
    );
  });

  it("BA-3: resolveToken — absent token → undefined (fail-closed)", () => {
    const auth = makeAuthority();
    const { tokenMap } = buildDescriptors([game()], auth);
    assert.strictEqual(resolveToken(tokenMap, "not-in-map"), undefined);
  });

  it("BA-4: resolveToken — minted token → correct Action with game URL", () => {
    const auth = makeAuthority();
    const g = game({ url: "https://www.chess.com/game/daily/42" });
    const { descriptors, tokenMap } = buildDescriptors([g], auth);
    const token = descriptors.get(g.url)!.token;
    const action = resolveToken(tokenMap, token);
    assert.ok(action !== undefined, "action must be defined");
    assert.strictEqual(action.kind, "openUrl");
    assert.strictEqual(action.url, g.url);
  });

  it("BA-5: empty game list → no descriptors; resolveToken → undefined for any token", () => {
    const auth = makeAuthority();
    const { descriptors, tokenMap } = buildDescriptors([], auth);
    assert.strictEqual(descriptors.size, 0, "no descriptors for empty list");
    assert.strictEqual(resolveToken(tokenMap, "tok-0"), undefined);
  });

  it("BA-6: stale token from a replaced game does not resolve in the new map (no index fallback)", () => {
    const auth = makeAuthority();
    const gameA = game({ url: "https://www.chess.com/game/daily/100" });
    const gameB = game({ url: "https://www.chess.com/game/daily/200" });
    const gameC = game({ url: "https://www.chess.com/game/daily/300" });

    const { descriptors: d1, tokenMap: map1 } = buildDescriptors([gameA, gameB], auth);
    const tokenA = d1.get(gameA.url)!.token;
    assert.ok(resolveToken(map1, tokenA) !== undefined, "sanity: token A valid in first render");

    const { tokenMap: map2 } = buildDescriptors([gameC, gameB], auth);
    assert.strictEqual(
      resolveToken(map2, tokenA),
      undefined,
      "stale game-A token fails closed in new map"
    );
  });

  it("BA-FORGED: syntactically valid but unminted token → undefined", () => {
    const auth = makeAuthority();
    const { tokenMap } = buildDescriptors([game()], auth);
    const forged = "a".repeat(64);
    assert.strictEqual(resolveToken(tokenMap, forged), undefined);
  });

  // --- S3: Settings-placeholder activation (ADR 0007) ---

  it("BA-SET-1: buildSettingsDescriptor mints the identity token and an openSettings action", () => {
    const auth = makeAuthority();
    const { descriptor, token, action } = buildSettingsDescriptor(SETTINGS_NO_USERNAME, auth);
    assert.strictEqual(
      token,
      auth.mint(SETTINGS_NO_USERNAME),
      "token is the minted identity token"
    );
    assert.strictEqual(descriptor.token, token, "descriptor carries the same token");
    assert.strictEqual(action.kind, "openSettings", "action is openSettings");
    assert.ok(descriptor.label.length > 0, "descriptor carries a host-authored accessible name");
  });

  it("BA-SET-2: the two Settings identities produce distinct tokens and distinct labels", () => {
    const auth = makeAuthority();
    const noUser = buildSettingsDescriptor(SETTINGS_NO_USERNAME, auth);
    const unknownUser = buildSettingsDescriptor(SETTINGS_UNKNOWN_USER, auth);
    assert.notStrictEqual(noUser.token, unknownUser.token, "distinct identity → distinct token");
    assert.notStrictEqual(
      noUser.descriptor.label,
      unknownUser.descriptor.label,
      "each state carries its own accessible name"
    );
  });

  it("BA-SET-3: stale Settings token fails closed across a state change (the sixth token test)", () => {
    const auth = makeAuthority();
    const noUser = buildSettingsDescriptor(SETTINGS_NO_USERNAME, auth);
    const unknownUser = buildSettingsDescriptor(SETTINGS_UNKNOWN_USER, auth);

    // While the state is no-username, only the no-username token is in the map.
    const mapNoUser = new Map<string, Action>([[noUser.token, noUser.action]]);
    assert.ok(
      resolveToken(mapNoUser, noUser.token) !== undefined,
      "sanity: the no-username token resolves in its own state"
    );

    // State moves to unknown-user → the map holds only the unknown-user token.
    const mapUnknownUser = new Map<string, Action>([[unknownUser.token, unknownUser.action]]);
    assert.strictEqual(
      resolveToken(mapUnknownUser, noUser.token),
      undefined,
      "a stale no-username token does not resolve once state moved to unknown-user"
    );
    assert.strictEqual(
      resolveToken(mapNoUser, unknownUser.token),
      undefined,
      "and the unknown-user token does not resolve in the no-username state"
    );
  });

  it("BA-SET-4: a Settings label is distinct from a game-open label; resolution yields openSettings", () => {
    const auth = makeAuthority();
    const { descriptor, token, action } = buildSettingsDescriptor(SETTINGS_UNKNOWN_USER, auth);
    assert.notStrictEqual(
      descriptor.label,
      gameActionLabel("ada"),
      "a Settings accessible name is not a game-open name"
    );
    assert.strictEqual(
      settingsActionLabel(SETTINGS_UNKNOWN_USER),
      descriptor.label,
      "the label comes from the shared label builder"
    );
    const map = new Map<string, Action>([[token, action]]);
    assert.strictEqual(resolveToken(map, token)?.kind, "openSettings");
  });

  it("BA-IMPORT: boardActions.ts imports neither vscode nor a crypto module", () => {
    const src = readFileSync(join(__dirname, "boardActions.ts"), "utf8");
    assert.ok(!src.includes("from 'vscode'"), "must not import vscode (single quotes)");
    assert.ok(!src.includes('from "vscode"'), "must not import vscode (double quotes)");
    assert.ok(!src.includes("from 'node:crypto'"), "must not import node:crypto");
    assert.ok(!src.includes('from "node:crypto"'), "must not import node:crypto (double quotes)");
    assert.ok(!src.includes("from 'crypto'"), "must not import crypto");
    assert.ok(!src.includes('from "crypto"'), "must not import crypto (double quotes)");
  });
});
