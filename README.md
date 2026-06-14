# VS Code Chess

![version: 0.1.0](https://img.shields.io/badge/version-0.1.0-blue?style=flat-square) ![status: in development](https://img.shields.io/badge/status-in%20development-yellow?style=flat-square) ![visibility: public](https://img.shields.io/badge/visibility-public-brightgreen?style=flat-square)

A VS Code extension that monitors a single player's [Chess.com](https://www.chess.com)
Daily (correspondence) games and calmly signals when it is their turn to move, with a
link to open the most urgent game in the browser.

> **Status:** Early development (`0.1.0`) — not yet implemented or published to the
> Marketplace. The behavior described below is the intended 1.0 design.

## Features

- **Turn awareness** — watches the player's ongoing Daily games and surfaces how many
  await a move.
- **Always-visible signal** — a status-bar item carries the count even when the sidebar
  is hidden.
- **One-click to the board** — opens the most urgent game (soonest move deadline) on
  Chess.com.
- **Calm by design** — never blanks the UI on a transient network error and never nags.
- **No credentials** — uses only a Chess.com username against the public, unauthenticated
  Chess.com API.

Scope for 1.0 is **Daily games only**; Live formats (Blitz, Rapid, Bullet) are out of
scope.

## Requirements

- [Visual Studio Code](https://code.visualstudio.com/)
- A public Chess.com username with ongoing Daily games

## Installation

Not yet released. Once published it will be installable from the VS Code Marketplace.
Until then, the extension can be run from source (build tooling is not yet in the
repository).

## Usage

1. Open VS Code settings and set your Chess.com username:

   ```jsonc
   // settings.json
   "vscodeChess.username": "your-chesscom-username"
   ```

2. Open the VS Code Chess view from the activity bar.

Once a username is set, the extension begins monitoring. When one or more Daily games
await your move, the status bar shows the count and the in-view turn notice surfaces a
button to open the most urgent game.

## Versioning

This project follows [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).
Notable changes are recorded in [CHANGELOG.md](CHANGELOG.md).

## License

Licensed under the [GNU General Public License v3.0 or later](LICENSE)
(`GPL-3.0-or-later`).

Board rendering uses [chessground](https://github.com/lichess-org/chessground), the
open-source board UI from Lichess, which is GPL-3.0-or-later; bundling it makes the
combined extension subject to the GPL.
