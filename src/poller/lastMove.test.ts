import assert from "node:assert/strict";
import { deriveLastMove } from "./lastMove";

describe("deriveLastMove()", () => {
  // MT1 — valid PGN -> the last move's [from, to]
  it("MT1: returns the last move's [from, to] for a multi-move PGN", () => {
    assert.deepStrictEqual(deriveLastMove("1. e4 e5 2. Nf3 Nc6 3. Bb5"), ["f1", "b5"]);
  });

  it("MT1: returns the opening move for a single-move PGN", () => {
    assert.deepStrictEqual(deriveLastMove("1. e4"), ["e2", "e4"]);
  });

  it("MT1: tolerates full PGN headers and a result token", () => {
    const pgn =
      '[Event "Let\'s Play!"]\n[White "a"]\n[Black "b"]\n[Result "*"]\n\n1. d4 d5 2. c4 *';
    assert.deepStrictEqual(deriveLastMove(pgn), ["c2", "c4"]);
  });

  // MT2 — move-less / empty -> undefined
  it("MT2: returns undefined for a move-less PGN", () => {
    assert.strictEqual(deriveLastMove("*"), undefined);
    assert.strictEqual(deriveLastMove('[White "a"]\n[Black "b"]\n[Result "*"]\n\n*'), undefined);
  });

  it("MT2: returns undefined for an empty string", () => {
    assert.strictEqual(deriveLastMove(""), undefined);
  });

  // MT3 — malformed -> undefined, never throws
  it("MT3: returns undefined for non-PGN garbage without throwing", () => {
    assert.strictEqual(deriveLastMove("this is not a pgn at all"), undefined);
  });

  it("MT3: returns undefined for an illegal move without throwing", () => {
    assert.strictEqual(deriveLastMove("1. e4 e5 2. Qxz9"), undefined);
  });

  // MT4 — special moves resolve to the verbose move's from/to (no special derivation)
  it("MT4: castling -> the king's squares (e1->g1)", () => {
    assert.deepStrictEqual(deriveLastMove("1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O"), ["e1", "g1"]);
  });

  it("MT4: en passant -> the capturing pawn's from/to", () => {
    const pgn = '[SetUp "1"]\n[FEN "4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1"]\n\n1. exd6';
    assert.deepStrictEqual(deriveLastMove(pgn), ["e5", "d6"]);
  });

  it("MT4: promotion -> the pawn's from/to", () => {
    const pgn = '[SetUp "1"]\n[FEN "8/P7/8/8/8/8/8/k6K w - - 0 1"]\n\n1. a8=Q+';
    assert.deepStrictEqual(deriveLastMove(pgn), ["a7", "a8"]);
  });

  // MT5 — comments tolerated; genuinely unparseable degrades to undefined (best-effort)
  it("MT5: tolerates movetext comments and NAGs and still returns the last move", () => {
    assert.deepStrictEqual(deriveLastMove("1. e4 {best by test} e5 $1 2. Nf3"), ["g1", "f3"]);
  });

  it("MT5: returns undefined for an unparseable position (variant/illegal) without throwing", () => {
    // An illegal SetUp position (no kings) stands in for variant / corrupt PGNs that
    // chess.js cannot reconcile; real Chess960 / variant daily games degrade the same way.
    const pgn = '[SetUp "1"]\n[FEN "8/8/8/8/8/8/8/8 w - - 0 1"]\n\n1. a4';
    assert.strictEqual(deriveLastMove(pgn), undefined);
  });
});
