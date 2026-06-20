import { Chess } from "chess.js";

/**
 * Derive the most recent move's `[from, to]` squares from a game's PGN, for the
 * Move Trail. **The sole importer of chess.js** — quarantined here so the library
 * bundles into the host bundle (`dist/extension.js`) only and never reaches the
 * webview bundle. Never import this module (or chess.js) from the webview graph.
 *
 * Total and best-effort: returns the verbose last move's squares, or `undefined`
 * for a move-less / missing / malformed / unsupported-variant PGN. It **never
 * throws** — a missing Move Trail is cosmetic and must never break polling, the
 * parse loop, or board rendering.
 */
export function deriveLastMove(pgn: string): [string, string] | undefined {
  try {
    const chess = new Chess();
    chess.loadPgn(pgn);
    const last = chess.history({ verbose: true }).at(-1);
    return last ? [last.from, last.to] : undefined;
  } catch {
    return undefined;
  }
}
