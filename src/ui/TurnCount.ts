import * as vscode from "vscode";

/** The Turn Count status-bar signal: a ♟ glyph plus the count of Daily Games
 * awaiting the Player's move. Always created at activation (ADR 0002); shown
 * only when the count is greater than zero, hidden otherwise. */
export class TurnCount {
  private readonly item: vscode.StatusBarItem;
  private shown = false;

  constructor(command: string) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = command;
  }

  /** Render the count. Shown when count > 0, hidden at 0. */
  render(count: number): void {
    if (count > 0) {
      this.item.text = `♟ ${count}`;
      this.item.tooltip = `${count} Daily ${count === 1 ? "game" : "games"} awaiting your move`;
      this.item.show();
      this.shown = true;
    } else {
      this.item.hide();
      this.shown = false;
    }
  }

  /** Current rendered text. */
  get text(): string {
    return this.item.text;
  }

  /** Whether the item is currently shown (count > 0). */
  get visible(): boolean {
    return this.shown;
  }

  dispose(): void {
    this.item.dispose();
  }
}
