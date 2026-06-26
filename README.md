# VS Code Chess

![GitHub package.json version](https://img.shields.io/github/package-json/v/eunai/vscode-chess?style=flat-square) ![status: active](https://img.shields.io/badge/status-active-brightgreen?style=flat-square) ![License](https://img.shields.io/github/license/eunai/vscode-chess?style=flat-square) ![GitHub Repo stars](https://img.shields.io/github/stars/eunai/vscode-chess?style=flat-square)

A VS Code extension that monitors a single player's [Chess.com](https://www.chess.com)
Daily (correspondence) games and calmly signals when it is their turn to move, with a
link to open the most urgent game in the browser.

> **Status:** Active (`0.10.0`). Click or keyboard-activate any board in the sidebar to open its
> game in the browser; no-username and unknown-user placeholders open VS Code Settings at the
> username field instead.

## Features

- **Turn awareness** — watches the player's ongoing Daily games and surfaces how many
  await a move.
- **Sidebar with live boards** _(new in 0.4.0)_ — a Chess view in the activity bar renders a
  board for each ongoing Daily game, oriented to your color and labelled with your opponent.
  _(0.9.0)_ Boards hold a stable, oldest-first order — your longest-running game stays on top — and
  only move when a game ends or a new one begins; games awaiting your move group above the rest.
- **Click any board to act** — click or keyboard-activate (Enter / Space) a board to open its
  game in the browser; every game is activatable, even last-known boards during a transient
  network failure. When no username is set, or the configured username is not found on Chess.com,
  the placeholder board opens VS Code Settings at the username field instead. Idle and reconnecting
  placeholders stay calmly inert. All actionable boards are native buttons with accessible names,
  reachable by Tab, with full keyboard and screen-reader parity.
- **Turn Notice** _(new in 0.5.0)_ — when it's your turn, a calm bar pinned to the bottom of
  the sidebar shows how many games await your move; click it to open the most urgent one. It
  mirrors the status-bar count and stays in sync, even while reconnecting.
- **Awaiting Glow** _(reworked in 0.9.0)_ — every game awaiting your move carries one calm glow that
  deepens as its move deadline approaches, so the most time-pressed game — the one a click opens —
  stands out at a glance, legible on light and dark themes alike.
- **Move Trail** _(new in 0.7.0)_ — each board highlights the two squares of the most recent move
  (where the last piece came from and where it landed) with a calm, warm tint.
- **Board Theme** _(new in 0.8.0)_ — the board squares wear your active VS Code color theme, while the
  pieces stay unchanged; switch back to the classic board colors with `vscodeChess.boardTheme`.
- **Always-visible signal** — a status-bar ♟ stays visible in every state, even when no
  game awaits your move or the sidebar is hidden.
- **Proof of life** — the ♟ appears the moment the extension loads, before you've even set
  a username, so you always know it's installed and running.
- **One-click to the board** — opens the most urgent game (soonest move deadline) on
  Chess.com.
- **Calm by design** — never blanks the UI on a transient network error and never nags; a
  blip just shows a quiet "Reconnecting..." while keeping the last-known count.
- **No credentials** — uses only a Chess.com username against the public, unauthenticated
  Chess.com API.

Scope for 1.0 is **Daily games only**; Live formats (Blitz, Rapid, Bullet) are out of
scope.

## Accessibility

- Actionable boards and setup placeholders are native VS Code webview buttons with
  descriptive accessible names.
- Keyboard users can Tab to every actionable board and activate it with Enter or Space.
- Idle and reconnecting placeholders are skipped in the tab order, so focus never lands on a
  dead board.
- The focused board uses VS Code's focus color, including High Contrast themes.
- The board activation flow was manually checked on Windows 11, Ubuntu, and macOS.

## Requirements

- [Visual Studio Code](https://code.visualstudio.com/)
- A public Chess.com username with ongoing Daily games

## Installation

Install from the
[VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=eunai.vscode-chess),
search **VS Code Chess** in the Extensions view, or run:

```sh
code --install-extension eunai.vscode-chess
```

### From source

```sh
npm install
npm run build      # bundle the extension host + webview into dist/
```

Then open the repository in VS Code and press <kbd>F5</kbd> to launch an Extension
Development Host with the extension loaded.

## Usage

1. Open VS Code settings and set your Chess.com username:

   ```jsonc
   // settings.json
   "vscodeChess.username": "your-chesscom-username"
   ```

Once a username is set, the extension begins monitoring automatically. A status-bar ♟
— the **Presence** — is always visible: it shows `♟ N` when N Daily games await your
move (click it to open the most urgent game, soonest move deadline, in your browser),
and a bare `♟` when none await. Before you've configured a username it prompts you with
`♟ Set Username`, and if Chess.com doesn't recognise the username it shows
`♟ Unknown User` — both click through to Settings. It never disappears, so you always
have a proof of life that the extension is running.

Open the **Chess** view from the activity bar to see a live board for each of your Daily
games — oriented to your color, in a stable oldest-first order with the games awaiting your move
grouped on top. Click or keyboard-activate (Enter / Space) any board to open that game in the
browser. When it's your turn, a **Turn Notice** bar appears at the bottom of that view with the
count; clicking it opens the most urgent game. Before you've set a username (or if Chess.com
doesn't recognise it), the sidebar placeholder opens VS Code Settings at the username field —
the same place as the Presence in the status bar.

## ♟️ Roadmap

`0.10.0` makes every actionable sidebar board open the matching game or Settings target, with
keyboard and screen-reader friendly controls. Coming next:

- **Calm under failure** — polling that never blanks out on a network blip.

Ideas being considered (not committed, order and details may shift):

- Nothing queued yet.

Early days. See the [changelog](CHANGELOG.md) for what's actually shipped.

## Versioning

This project follows [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).
Notable changes are recorded in [CHANGELOG.md](CHANGELOG.md).

## License

Licensed under the [GNU General Public License v3.0 or later](LICENSE)
(`GPL-3.0-or-later`).

Board rendering uses [chessground](https://github.com/lichess-org/chessground), the
open-source board UI from Lichess, which is GPL-3.0-or-later; bundling it makes the
combined extension subject to the GPL.
