import type * as vscode from "vscode";
import type { PresenceState } from "../turn/PresenceState";

/** Opens the Settings UI focused on the username field. A plain `Command` object
 * (no registered command needed) so the unconfigured/badUsername affordances
 * carry no username — preserving the privacy invariant. */
const SETTINGS_COMMAND: vscode.Command = {
  command: "workbench.action.openSettings",
  title: "Set username",
  arguments: ["vscodeChess.username"],
};

/** The Presence: the always-visible ♟ status-bar signal. A dumb renderer over an
 * injected `StatusBarItem` — shown once at construction and never hidden — that
 * maps a {@link PresenceState} to label, tooltip, and command. It computes
 * nothing itself; `PresenceState.from` decides which state to show. The item is
 * injected (not created here) so the component is unit-testable without the
 * `vscode` runtime. Generalizes the 0.2.0 `TurnCount`. */
export class Presence {
  private readonly item: vscode.StatusBarItem;
  private readonly openMostUrgentCommand: string;
  private shown = false;

  constructor(item: vscode.StatusBarItem, openMostUrgentCommand: string) {
    this.item = item;
    this.openMostUrgentCommand = openMostUrgentCommand;
    this.item.show();
    this.shown = true;
  }

  render(state: PresenceState): void {
    switch (state.kind) {
      case "count":
        this.item.text = `♟ ${state.count}`;
        this.item.tooltip = `${state.count} Daily ${state.count === 1 ? "game" : "games"} awaiting your move`;
        this.item.command = this.openMostUrgentCommand;
        break;
      case "idle":
        this.item.text = "♟";
        this.item.tooltip = "VS Code Chess — no games awaiting your move";
        this.item.command = undefined;
        break;
      case "unconfigured":
        this.item.text = "♟ Set Username";
        this.item.tooltip = "VS Code Chess — set your Chess.com username to begin";
        this.item.command = SETTINGS_COMMAND;
        break;
      case "badUsername":
        this.item.text = "♟ Unknown User";
        this.item.tooltip = "VS Code Chess — Chess.com user not found; check your username";
        this.item.command = SETTINGS_COMMAND;
        break;
      case "transient":
        // Calm under failure: keep the last non-transient label and command —
        // intentionally left untouched here so they persist — and disclose the
        // reconnect only through the tooltip.
        this.item.tooltip = "Reconnecting...";
        break;
    }
  }

  /** Current rendered label. */
  get text(): string {
    return this.item.text;
  }

  /** Current tooltip. */
  get tooltip(): string | vscode.MarkdownString | undefined {
    return this.item.tooltip;
  }

  /** Current click target — a command id, a `Command` object, or `undefined`
   * when the state is non-clickable (idle). */
  get command(): string | vscode.Command | undefined {
    return this.item.command;
  }

  /** Whether the item is shown. Always true once constructed — the Presence is
   * never hidden — exposed so the host can prove the always-visible invariant. */
  get visible(): boolean {
    return this.shown;
  }

  dispose(): void {
    this.item.dispose();
  }
}
