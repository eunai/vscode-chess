import * as vscode from "vscode";
import { Poller } from "./poller/Poller";
import type { PollResult } from "./poller/Poller";
import type { DailyGame } from "./poller/GamesParser";
import { TurnCount } from "./ui/TurnCount";
import { makeOpenMostUrgent } from "./commands/openMostUrgent";
import type { OpenExternal } from "./commands/openMostUrgent";
import { readUsername, onUsernameChange } from "./config/username";

const COMMAND_ID = "vscodeChess.openMostUrgent";

type FetchFn = (url: string | URL | Request, init?: RequestInit) => Promise<Response>;

/** Set by `activate` so `deactivate` can stop the in-flight poll loop. */
let deactivateHook: (() => void) | undefined;

/** Test-only surface returned from `activate`, used by the Layer 2 integration
 * suite to inject stubs and observe state without booting a real browser or a
 * live network. Not part of the extension's user-facing contract. */
export interface ChessExtensionApi {
  _setFetchForTest(fn: FetchFn): void;
  _setOpenExternalForTest(fn: OpenExternal): void;
  _getTurnCountForTest(): { text: string; visible: boolean };
  _getLastResultForTest(): PollResult | undefined;
  _isRunningForTest(): boolean;
  _pollOnceForTest(): Promise<void>;
  _restartForTest(): void;
}

export function activate(context: vscode.ExtensionContext): ChessExtensionApi {
  const logger = vscode.window.createOutputChannel("VS Code Chess", { log: true });
  const turnCount = new TurnCount(COMMAND_ID);
  context.subscriptions.push(logger, turnCount);

  // Mutable wiring seams. Default to the real platform surfaces; the test API
  // can swap them before a cycle runs.
  let fetchFn: FetchFn = (url, init) => fetch(url, init);
  let openExternal: OpenExternal = (target) => vscode.env.openExternal(target);

  let lastResult: PollResult | undefined;
  let mostUrgent: DailyGame | undefined;
  let poller: Poller | undefined;

  // Resolvers awaiting the next emitted PollResult (test seam only).
  let resultWaiters: Array<() => void> = [];

  function handleResult(result: PollResult): void {
    lastResult = result;
    mostUrgent = result.mostUrgent;
    turnCount.render(result.count);
    const waiters = resultWaiters;
    resultWaiters = [];
    for (const resolve of waiters) resolve();
  }

  function startPoller(username: string): void {
    poller?.stop();
    poller = new Poller({
      username,
      fetchFn,
      onResult: handleResult,
      logger,
    });
    poller.start();
  }

  function stopPoller(): void {
    poller?.stop();
    poller = undefined;
  }

  function applyUsername(username: string): void {
    // The configured Player has changed (or been cleared): the old count and
    // open target no longer represent the current Player, so drop them and hide
    // the Turn Count immediately. A non-empty username then starts a fresh
    // Poller; its first successful result renders the new Player's state.
    stopPoller();
    lastResult = undefined;
    mostUrgent = undefined;
    turnCount.render(0);
    if (username !== "") {
      startPoller(username);
    }
  }

  const command = vscode.commands.registerCommand(
    COMMAND_ID,
    makeOpenMostUrgent(
      () => mostUrgent,
      (target) => openExternal(target),
      logger
    )
  );

  const configListener = onUsernameChange(applyUsername);

  context.subscriptions.push(command, configListener, {
    dispose: () => {
      stopPoller();
    },
  });

  // Eager activation: start the loop now if a username is already configured.
  applyUsername(readUsername());

  deactivateHook = stopPoller;

  return {
    _setFetchForTest(fn) {
      fetchFn = fn;
    },
    _setOpenExternalForTest(fn) {
      openExternal = fn;
    },
    _getTurnCountForTest() {
      return { text: turnCount.text, visible: turnCount.visible };
    },
    _getLastResultForTest() {
      return lastResult;
    },
    _isRunningForTest() {
      return poller !== undefined;
    },
    _pollOnceForTest() {
      const username = readUsername();
      if (username === "") return Promise.resolve();
      return new Promise<void>((resolve) => {
        resultWaiters.push(resolve);
        startPoller(username);
      });
    },
    _restartForTest() {
      applyUsername(readUsername());
    },
  };
}

export function deactivate(): void {
  deactivateHook?.();
  deactivateHook = undefined;
}
