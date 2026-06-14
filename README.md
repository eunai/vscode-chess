# VS Code Chess

![version: 0.2.0](https://img.shields.io/badge/version-0.2.0-blue?style=flat-square) ![status: in development](https://img.shields.io/badge/status-in%20development-yellow?style=flat-square) ![visibility: public](https://img.shields.io/badge/visibility-public-brightgreen?style=flat-square)

A VS Code extension that monitors a single player's [Chess.com](https://www.chess.com)
Daily (correspondence) games and calmly signals when it is their turn to move, with a
link to open the most urgent game in the browser.

> **Status:** Early development (`0.2.0`). The 0.2.0 MVP is implemented — the
> status-bar **Turn Count** and one-click open are working — but the extension is
> not yet published to the Marketplace. The sidebar view and rendered boards
> described below are the intended 1.0 design and are not in 0.2.0 yet.

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

Not yet on the VS Code Marketplace. Until then, run it from source:

```sh
npm install
npm run build      # bundle the extension host into dist/
```

Then open the repository in VS Code and press <kbd>F5</kbd> to launch an Extension
Development Host with the extension loaded.

## Usage

1. Open VS Code settings and set your Chess.com username:

   ```jsonc
   // settings.json
   "vscodeChess.username": "your-chesscom-username"
   ```

Once a username is set, the extension begins monitoring automatically. When one or
more Daily games await your move, a **Turn Count** appears in the status bar with the
count; click it to open the most urgent game (soonest move deadline) in your browser.
When no game awaits your move, the status bar stays empty.

The in-sidebar view with rendered boards is part of the later 1.0 design and is not in
this release.

## Versioning

This project follows [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).
Notable changes are recorded in [CHANGELOG.md](CHANGELOG.md).

## License

Licensed under the [GNU General Public License v3.0 or later](LICENSE)
(`GPL-3.0-or-later`).

Board rendering uses [chessground](https://github.com/lichess-org/chessground), the
open-source board UI from Lichess, which is GPL-3.0-or-later; bundling it makes the
combined extension subject to the GPL.
