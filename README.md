# VS Code Chess

![GitHub package.json version](https://img.shields.io/github/package-json/v/eunai/vscode-chess?style=flat-square) ![status: active](https://img.shields.io/badge/status-active-brightgreen?style=flat-square) ![License](https://img.shields.io/github/license/eunai/vscode-chess?style=flat-square) ![GitHub Repo stars](https://img.shields.io/github/stars/eunai/vscode-chess?style=flat-square)

A VS Code extension that monitors a single player's [Chess.com](https://www.chess.com)
Daily (correspondence) games and calmly signals when it is their turn to move, with a
link to open the most urgent game in the browser.

> **Status:** Active (`0.3.0`). The extension is on the VS Code Marketplace; this
> release makes the signal a true **Presence** — an always-visible status-bar ♟ that
> shows how many Daily games await your move, with one-click open, and stays visible
> as a proof of life in every state. The in-sidebar view with rendered boards
> described below is part of the later 1.0 design and is not in this release yet.

## Features

- **Turn awareness** — watches the player's ongoing Daily games and surfaces how many
  await a move.
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

Once a username is set, the extension begins monitoring automatically. A status-bar ♟
— the **Presence** — is always visible: it shows `♟ N` when N Daily games await your
move (click it to open the most urgent game, soonest move deadline, in your browser),
and a bare `♟` when none await. Before you've configured a username it prompts you with
`♟ Set Username`, and if Chess.com doesn't recognise the username it shows
`♟ Unknown User` — both click through to Settings. It never disappears, so you always
have a proof of life that the extension is running.

The in-sidebar view with rendered boards is part of the later 1.0 design and is not in
this release.

## ♟️ Roadmap

Today, `0.3.0` is the always-visible **Presence** in the status bar. Coming next:

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
