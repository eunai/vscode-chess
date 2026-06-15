# VS Code Chess

![version: 0.2.0](https://img.shields.io/badge/version-0.2.0-blue?style=flat-square) ![status: active](https://img.shields.io/badge/status-active-brightgreen?style=flat-square) ![visibility: public](https://img.shields.io/badge/visibility-public-brightgreen?style=flat-square)

A VS Code extension that monitors a single player's [Chess.com](https://www.chess.com)
Daily (correspondence) games and calmly signals when it is their turn to move, with a
link to open the most urgent game in the browser.

> **Status:** Active (`0.2.0`) — the first release, available on the VS Code
> Marketplace. It ships the always-visible signal: a status-bar **Turn Count**
> with one-click open. The sidebar view and rendered boards described below are
> landing in 0.3.0 and are not in this release yet.

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

Install from the
[VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=eunai.vscode-chess),
search **VS Code Chess** in the Extensions view, or run:

```sh
code --install-extension eunai.vscode-chess
```

### From source

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

## ♟️ Roadmap

Today, `0.2.0` is the status-bar **Turn Count**. Coming next:

- A **sidebar** showing a live board for each of your Daily games.
- An in-sidebar **Turn Notice** that mirrors the count.
- **Calm under failure** — polling that never blanks out on a network blip.

Early days, so the order and details may shift. See the [changelog](CHANGELOG.md) for
what's shipped.

## Versioning

This project follows [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).
Notable changes are recorded in [CHANGELOG.md](CHANGELOG.md).

## License

Licensed under the [GNU General Public License v3.0 or later](LICENSE)
(`GPL-3.0-or-later`).

Board rendering uses [chessground](https://github.com/lichess-org/chessground), the
open-source board UI from Lichess, which is GPL-3.0-or-later; bundling it makes the
combined extension subject to the GPL.
