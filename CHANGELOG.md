# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2026-06-14

### Added

- **Presence — the always-visible signal.** The status-bar item is now created at
  activation and never hidden, rendering one of five states so you always have a
  proof of life that the extension is installed and running: `♟ Set Username` before
  a username is configured (click opens Settings), a bare `♟` when no Daily game
  awaits your move, `♟ N` when N await (click opens the most urgent game),
  `♟ Unknown User` when Chess.com does not recognise the username — a 404 (click
  opens Settings), and the last-known label with a `Reconnecting...` tooltip during a
  transient network / rate-limit / 5xx failure. The Turn Count is now one state of
  the Presence rather than the whole element.
- The poll loop now forwards each cycle's classified outcome (`counted` / `notFound`
  / `transient`) to the extension host, which maps it — together with whether a
  username is configured — to exactly one Presence state. The host renders that state
  and never re-derives it.
- **Extension icon** for the VS Code Marketplace listing (`assets/icon.png`, wired
  via the manifest `icon` field).

### Changed

- **The status bar no longer goes empty when no game awaits your move.** Where
  `0.2.0` hid the Turn Count whenever the count was zero, the Presence now stays
  visible as a calm `♟`. This reverses the `0.2.0` "hidden at 0" behavior — the
  always-visible proof of life is the purpose of this release.

## [0.2.0] - 2026-06-14

### Added

- **MVP — the turn signal.** The extension now runs end-to-end: on startup it
  reads the `vscodeChess.username` setting, polls the player's Chess.com Daily
  games on a serial cadence, and surfaces a **Turn Count** status-bar item (a ♟
  glyph plus the number of Daily Games awaiting the player's move). The item is
  shown only when the count is greater than zero and hidden otherwise. Clicking
  it runs `vscodeChess.openMostUrgent`, which opens the most urgent Daily Game
  (soonest move deadline) in the browser after shape-validating its URL to
  `https://www.chess.com/...`; a non-conforming URL is rejected, never opened.
  Changing `vscodeChess.username` starts or stops monitoring without a reload;
  `deactivate` stops the poll loop and aborts any in-flight request. All
  disposables are registered to the extension context.
- `TurnCount`: wraps a `StatusBarItem` bound to `vscodeChess.openMostUrgent`;
  renders `♟ <count>` and shows/hides on the count crossing zero.
- `openMostUrgent` command handler: shape-validates the most-urgent game URL
  (`https://www.chess.com/...`) before `env.openExternal`; a missing target or
  a non-conforming URL is a no-op.
- `config/username`: reads `vscodeChess.username` (trimmed) and watches
  `onDidChangeConfiguration` to start/stop the Poller on change.
- Layer 2 integration tests via `@vscode/test-electron` / `@vscode/test-cli`:
  exercise activation, Turn Count show/hide, the command's open + hostile-URL
  rejection, and config-driven start/stop inside an Extension Development Host
  (`env.openExternal` and the network are stubbed — no real browser or live
  request in CI).
- `Poller`: drives a serial polling cadence — each cycle awaits `ChessComClient.fetchGames`
  then pipes the result through `GamesParser` and `TurnState` to emit a single `PollResult`
  to a subscriber. The next cycle is scheduled only after the current cycle completes, at
  `max(server max-age, 60s)`; `304 Not Modified` responses also honor the server's
  `max-age` (falling back to the last known cadence when absent). `start()` begins the loop
  (idempotent); `stop()` clears any pending timer and aborts the in-flight request via
  `AbortController`. A generation counter prevents a stale in-flight cycle (one that ignored
  abort) from emitting, logging, or scheduling after a stop+start restart. Failed cycles log
  only a fixed operational classification — never the request URL, username, or error text —
  and reschedule without emitting or crashing. The clock is injected for deterministic unit
  testing.
- `GamesParser`: parses the Chess.com `/pub/player/{username}/games` response into typed
  `DailyGame[]` records — filters to Daily games only, derives the Player's color and opponent
  by matching the configured username against the `white`/`black` profile-URL tails
  (case-insensitive), and crashes early on malformed payload.
- `TurnState`: derives Turn Count and most-urgent Daily Game from a `DailyGame[]` — counts
  games where `turn === playerColor` (never `move_by` presence), returns the awaiting game
  with the soonest deadline as `mostUrgent`, and yields `count: 0, mostUrgent: undefined`
  when none await the Player's move.
- `ChessComClient`: fetches the Player's Daily games from the Chess.com public API via an
  injected `fetch`, with PII-free `User-Agent`, conditional `If-None-Match` requests, and
  typed status mapping (`304` → `unchanged`; `404` → `UsernameNotFound`; `429`/`5xx` →
  `TransientError`; `200` → `{ rawJson, etag, maxAge }`). Username is encoded via
  `encodeURIComponent` as a single path segment so special characters cannot alter the URL
  structure. Unexpected HTTP statuses throw explicitly.
- **Marketplace release.** Packaged and published to the VS Code Marketplace as
  `eunai.vscode-chess`. The manifest gained `repository`, `bugs`, `homepage`, `keywords`,
  `galleryBanner`, and `qna` metadata; `package` / `publish` scripts (`@vscode/vsce`,
  `--no-dependencies`); and a `.vscodeignore` so the packaged `.vsix` carries only the
  bundled extension. The README install/status sections and the status badge now reflect
  the live release. Installable from the Marketplace or via
  `code --install-extension eunai.vscode-chess`.

### Fixed

- Changing `vscodeChess.username` from one player to another now clears the previous
  player's Turn Count and open target immediately, rather than leaving the old count
  shown and `openMostUrgent` pointed at the old player's game until the new player's
  first poll result arrives. State is reset on every username change before the new
  poll loop starts.
- `ChessComClient`: `Cache-Control` parsing now matches only the exact `max-age` directive;
  previously the regex `/max-age=(\d+)/` also matched the `s-maxage` substring, which could
  cause the poller to use a shared-cache TTL instead of the correct client TTL. A directive
  name must now equal `max-age` exactly (case-insensitive, comma-split, leading/trailing
  whitespace stripped). The value must be a non-negative decimal integer with no trailing
  characters (`/^\d+$/`); values such as `5junk`, `-1`, or empty are now rejected and
  return 0. Aborted-fetch rejections propagate unchanged.
- `ChessComClient`: empty or whitespace-only `ETag` response headers now normalize to
  `undefined` (previously `""` could propagate as the etag value); empty or whitespace-only
  `conditional.etag` values no longer produce an `If-None-Match` header.
- `ChessComClient`: `Cache-Control max-age` values are now capped at Node's maximum
  `setTimeout` delay (2 147 483 647 ms); previously an astronomically large digit-only
  value would produce a millisecond result above the ceiling, which Node clamps to ~1 ms
  and causes a hot polling loop. Non-finite products (integer overflow) are also clamped
  to the same ceiling.

## [0.1.0] - 2026-06-11

### Added

- Initial project: a VS Code extension that monitors a player's Chess.com Daily games
  and signals when it is their turn to move, with a one-click link to open the most
  urgent game in the browser.
- GPL-3.0-or-later license.

[Unreleased]: https://github.com/eunai/vscode-chess/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/eunai/vscode-chess/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/eunai/vscode-chess/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/eunai/vscode-chess/releases/tag/v0.1.0
