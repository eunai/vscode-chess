import * as vscode from "vscode";
import { Poller } from "./poller/Poller";
import type { PollStatus } from "./poller/Poller";
import type { DailyGame } from "./poller/GamesParser";
import { Presence } from "./ui/Presence";
import { from as toPresenceState } from "./turn/PresenceState";
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
  _getPresenceForTest(): {
    text: string;
    tooltip: string | vscode.MarkdownString | undefined;
    command: string | vscode.Command | undefined;
    visible: boolean;
  };
  _isRunningForTest(): boolean;
  _pollOnceForTest(): Promise<void>;
  _restartForTest(): void;
}

export function activate(context: vscode.ExtensionContext): ChessExtensionApi {
  const logger = vscode.window.createOutputChannel("VS Code Chess", { log: true });
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  const presence = new Presence(item, COMMAND_ID);
  context.subscriptions.push(logger, presence);

  // Mutable wiring seams. Default to the real platform surfaces; the test API
  // can swap them before a cycle runs.
  let fetchFn: FetchFn = (url, init) => fetch(url, init);
  let openExternal: OpenExternal = (target) => vscode.env.openExternal(target);

  let lastStatus: PollStatus | undefined;
  let mostUrgent: DailyGame | undefined;
  let poller: Poller | undefined;

  // Resolvers awaiting the next emitted PollStatus (test seam only).
  let statusWaiters: Array<() => void> = [];

  /** Render the Presence from the latest poll status (or its absence) and the
   * current username config. One classification in, one PresenceState out — the
   * Presence renders, never re-derives. */
  function render(): void {
    presence.render(toPresenceState(lastStatus, readUsername() !== ""));
  }

  function handleStatus(status: PollStatus): void {
    lastStatus = status;
    // Track the open target only while a game actually awaits a move. A
    // transient status keeps the last-known target (the Presence keeps the
    // last-known label + command); notFound has no target.
    if (status.kind === "counted") {
      mostUrgent = status.count > 0 ? status.mostUrgent : undefined;
    } else if (status.kind === "notFound") {
      mostUrgent = undefined;
    }
    render();
    const waiters = statusWaiters;
    statusWaiters = [];
    for (const resolve of waiters) resolve();
  }

  function startPoller(username: string): void {
    poller?.stop();
    poller = new Poller({
      username,
      fetchFn,
      // onResult is the S1 carryover; the host drives all state off onStatus,
      // which carries the already-classified outcome plus the most-urgent game.
      onResult: () => undefined,
      onStatus: handleStatus,
      logger,
    });
    poller.start();
  }

  function stopPoller(): void {
    poller?.stop();
    poller = undefined;
  }

  function applyUsername(username: string): void {
    // The configured Player has changed (or been cleared): the old status and
    // open target no longer represent the current Player, so drop them. The
    // Presence is then re-rendered from the new config — `unconfigured` when the
    // username is empty, otherwise `idle` until the new Player's first poll
    // status arrives. The item is never hidden (always-visible signal).
    stopPoller();
    lastStatus = undefined;
    mostUrgent = undefined;
    render();
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

  // Eager activation: render the Presence now (visible from activation) and
  // start the loop if a username is already configured.
  applyUsername(readUsername());

  deactivateHook = stopPoller;

  return {
    _setFetchForTest(fn) {
      fetchFn = fn;
    },
    _setOpenExternalForTest(fn) {
      openExternal = fn;
    },
    _getPresenceForTest() {
      return {
        text: presence.text,
        tooltip: presence.tooltip,
        command: presence.command,
        visible: presence.visible,
      };
    },
    _isRunningForTest() {
      return poller !== undefined;
    },
    _pollOnceForTest() {
      const username = readUsername();
      if (username === "") return Promise.resolve();
      return new Promise<void>((resolve) => {
        statusWaiters.push(resolve);
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
