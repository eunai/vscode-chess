import assert from "node:assert/strict";
import { Poller } from "./Poller";
import type { PollResult, PollStatus } from "./Poller";

// ---------------------------------------------------------------------------
// Fake infrastructure
// ---------------------------------------------------------------------------

/** Drain all pending microtasks by yielding to the macrotask queue. */
function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

type TimerCallback = () => void;

/** A manual clock: records scheduled timers without actually firing them. */
class FakeClock {
  readonly pending: Array<{ delay: number; fn: TimerCallback; id: number }> = [];
  private nextId = 1;

  setTimeout(fn: TimerCallback, delay: number): number {
    const id = this.nextId++;
    this.pending.push({ delay, fn, id });
    return id;
  }

  clearTimeout(id: number): void {
    const idx = this.pending.findIndex((t) => t.id === id);
    if (idx !== -1) this.pending.splice(idx, 1);
  }

  /** Fire the oldest pending timer and remove it. */
  tick(): void {
    const timer = this.pending.shift();
    if (timer === undefined) throw new Error("FakeClock.tick(): no pending timer");
    timer.fn();
  }

  get count(): number {
    return this.pending.length;
  }
}

/** Builds a fake logger that records every line appended. */
function makeLogger(): { appendLine: (s: string) => void; lines: string[] } {
  const lines: string[] = [];
  return { appendLine: (s: string) => lines.push(s), lines };
}

/** A minimal DailyGame fixture — one game awaiting white. */
const GAME = {
  fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
  turn: "white" as const,
  moveBy: 1_700_000_000,
  url: "https://www.chess.com/game/daily/123",
  opponent: "playertwo",
  playerColor: "white" as const,
};

// ---------------------------------------------------------------------------
// S4 — Poller
// ---------------------------------------------------------------------------

describe("Poller", () => {
  // -------------------------------------------------------------------------
  // 1. Scheduling: next cycle fires at max(maxAge, 60_000) after completion
  // -------------------------------------------------------------------------

  it("schedules the next cycle at max(maxAge, 60_000) after a successful cycle completes", async () => {
    const clock = new FakeClock();
    const logger = makeLogger();
    const rawJson = JSON.stringify({
      games: [
        {
          ...GAME,
          white: "https://api.chess.com/pub/player/playerone",
          black: "https://api.chess.com/pub/player/playertwo",
          time_class: "daily",
          move_by: GAME.moveBy,
        },
      ],
    });

    let fetchResolve!: (r: Response) => void;
    const fetchFn = (): Promise<Response> =>
      new Promise<Response>((resolve) => {
        fetchResolve = resolve;
      });

    const results: PollResult[] = [];
    const poller = new Poller({
      username: "playerone",
      fetchFn,
      onResult: (r) => results.push(r),
      logger,
      clock,
    });

    poller.start();

    // No timer yet — fetch is in flight
    assert.strictEqual(clock.count, 0, "no timer while fetch is in flight");

    // Resolve the fetch with maxAge=90s (above the 60s floor)
    fetchResolve(
      new Response(rawJson, {
        status: 200,
        headers: { ETag: '"etag1"', "Cache-Control": "max-age=90" },
      })
    );
    // Allow microtasks to settle
    await flush();

    assert.strictEqual(clock.count, 1, "exactly one timer scheduled after cycle");
    assert.strictEqual(
      clock.pending[0]!.delay,
      90_000,
      "delay = maxAge (90s) when above 60s floor"
    );
    assert.strictEqual(results.length, 1, "exactly one result emitted");

    poller.stop();
  });

  it("uses 60_000 ms floor when maxAge is below 60s", async () => {
    const clock = new FakeClock();
    const rawJson = JSON.stringify({
      games: [
        {
          ...GAME,
          white: "https://api.chess.com/pub/player/playerone",
          black: "https://api.chess.com/pub/player/playertwo",
          time_class: "daily",
          move_by: GAME.moveBy,
        },
      ],
    });

    let fetchResolve!: (r: Response) => void;
    const fetchFn = (): Promise<Response> =>
      new Promise<Response>((resolve) => {
        fetchResolve = resolve;
      });

    const poller = new Poller({
      username: "playerone",
      fetchFn,
      onResult: () => undefined,
      logger: makeLogger(),
      clock,
    });

    poller.start();
    fetchResolve(
      new Response(rawJson, {
        status: 200,
        headers: { ETag: '"e"', "Cache-Control": "max-age=5" },
      })
    );
    await flush();

    assert.strictEqual(clock.pending[0]!.delay, 60_000, "delay = 60_000 floor when maxAge=5s");

    poller.stop();
  });

  // -------------------------------------------------------------------------
  // 2. No overlap — in-flight first request blocks scheduling
  // -------------------------------------------------------------------------

  it("does not schedule a second cycle while the first fetch is unresolved", () => {
    const clock = new FakeClock();
    let fetchCallCount = 0;
    const fetchFn = (): Promise<Response> => {
      fetchCallCount++;
      return new Promise(() => {
        /* never resolves */
      });
    };

    const poller = new Poller({
      username: "playerone",
      fetchFn,
      onResult: () => undefined,
      logger: makeLogger(),
      clock,
    });

    poller.start();

    assert.strictEqual(fetchCallCount, 1, "fetch called once on start");
    assert.strictEqual(clock.count, 0, "no timer scheduled while fetch is in flight");

    poller.stop();
  });

  it("serial: second cycle only begins after first cycle's timer fires", async () => {
    const clock = new FakeClock();
    let fetchCallCount = 0;
    const rawJson = JSON.stringify({ games: [] });

    const fetchFn = (): Promise<Response> => {
      fetchCallCount++;
      return Promise.resolve(
        new Response(rawJson, {
          status: 200,
          headers: { "Cache-Control": "max-age=60" },
        })
      );
    };

    const poller = new Poller({
      username: "playerone",
      fetchFn,
      onResult: () => undefined,
      logger: makeLogger(),
      clock,
    });

    poller.start();
    await flush();

    assert.strictEqual(fetchCallCount, 1, "after first cycle: one fetch");
    assert.strictEqual(clock.count, 1, "after first cycle: one timer pending");

    clock.tick(); // fire the timer → triggers second cycle
    await flush();

    assert.strictEqual(fetchCallCount, 2, "after timer fires: second fetch");

    poller.stop();
  });

  // -------------------------------------------------------------------------
  // 3. Repeated start() cannot create parallel loops
  // -------------------------------------------------------------------------

  it("repeated start() calls do not create multiple parallel loops", async () => {
    const clock = new FakeClock();
    let fetchCallCount = 0;
    const rawJson = JSON.stringify({ games: [] });

    const fetchFn = (): Promise<Response> => {
      fetchCallCount++;
      return Promise.resolve(
        new Response(rawJson, {
          status: 200,
          headers: { "Cache-Control": "max-age=60" },
        })
      );
    };

    const poller = new Poller({
      username: "playerone",
      fetchFn,
      onResult: () => undefined,
      logger: makeLogger(),
      clock,
    });

    poller.start();
    poller.start(); // second call while first fetch is in flight
    poller.start(); // third call

    await flush();

    // Should be exactly one fetch, not three
    assert.strictEqual(fetchCallCount, 1, "multiple start() calls produce only one active loop");
    assert.strictEqual(clock.count, 1, "only one timer scheduled after a single cycle");

    poller.stop();
  });

  // -------------------------------------------------------------------------
  // 4. stop() — clears timer, prevents rescheduling, aborts in-flight request
  // -------------------------------------------------------------------------

  it("stop() clears a pending timer before it fires", async () => {
    const clock = new FakeClock();
    const rawJson = JSON.stringify({ games: [] });

    let fetchResolve!: (r: Response) => void;
    const fetchFn = (): Promise<Response> =>
      new Promise<Response>((resolve) => {
        fetchResolve = resolve;
      });

    const poller = new Poller({
      username: "playerone",
      fetchFn,
      onResult: () => undefined,
      logger: makeLogger(),
      clock,
    });

    poller.start();
    // Resolve the in-flight fetch so a timer gets scheduled
    fetchResolve(
      new Response(rawJson, { status: 200, headers: { "Cache-Control": "max-age=60" } })
    );
    await flush();

    assert.strictEqual(clock.count, 1, "timer pending before stop()");

    poller.stop();

    assert.strictEqual(clock.count, 0, "timer cleared by stop()");
  });

  it("stop() prevents rescheduling after an in-flight cycle completes", async () => {
    const clock = new FakeClock();
    let fetchResolve!: (r: Response) => void;
    let fetchCallCount = 0;
    const rawJson = JSON.stringify({ games: [] });

    const fetchFn = (): Promise<Response> => {
      fetchCallCount++;
      return new Promise<Response>((resolve) => {
        fetchResolve = resolve;
      });
    };

    const poller = new Poller({
      username: "playerone",
      fetchFn,
      onResult: () => undefined,
      logger: makeLogger(),
      clock,
    });

    poller.start();
    assert.strictEqual(fetchCallCount, 1, "fetch in flight");

    // stop() while fetch is in flight
    poller.stop();

    // Now resolve the fetch — the cycle completes but must NOT reschedule
    fetchResolve(
      new Response(rawJson, { status: 200, headers: { "Cache-Control": "max-age=60" } })
    );
    await flush();

    assert.strictEqual(clock.count, 0, "no timer scheduled after stop() + in-flight completion");
    assert.strictEqual(fetchCallCount, 1, "no second fetch triggered");
  });

  it("stop() aborts the in-flight request via AbortController", () => {
    const clock = new FakeClock();
    let capturedSignal: AbortSignal | undefined;
    let abortCalled = false;

    const fetchFn = (_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      capturedSignal = init?.signal ?? undefined;
      return new Promise((_resolve, reject) => {
        if (init?.signal) {
          init.signal.addEventListener("abort", () => {
            abortCalled = true;
            reject(new DOMException("AbortError", "AbortError"));
          });
        }
      });
    };

    const poller = new Poller({
      username: "playerone",
      fetchFn,
      onResult: () => undefined,
      logger: makeLogger(),
      clock,
    });

    poller.start();

    assert.ok(capturedSignal !== undefined, "AbortSignal forwarded to fetch");
    const signal = capturedSignal;
    assert.strictEqual(signal.aborted, false, "signal not yet aborted");

    poller.stop();

    assert.strictEqual(abortCalled, true, "stop() aborts the in-flight request");
    assert.strictEqual(signal.aborted, true, "signal is aborted after stop()");
  });

  // -------------------------------------------------------------------------
  // 5. Success emits exactly one derived PollResult
  // -------------------------------------------------------------------------

  it("success emits exactly one PollResult derived from ChessComClient → GamesParser → TurnState", async () => {
    const clock = new FakeClock();

    // Build a JSON payload with one game awaiting white ("playerone")
    const rawGames = {
      games: [
        {
          time_class: "daily",
          fen: GAME.fen,
          turn: "white",
          move_by: GAME.moveBy,
          url: GAME.url,
          white: "https://api.chess.com/pub/player/playerone",
          black: "https://api.chess.com/pub/player/playertwo",
        },
      ],
    };
    const rawJson = JSON.stringify(rawGames);

    const fetchFn = (): Promise<Response> =>
      Promise.resolve(
        new Response(rawJson, {
          status: 200,
          headers: { ETag: '"etag42"', "Cache-Control": "max-age=60" },
        })
      );

    const results: PollResult[] = [];
    const poller = new Poller({
      username: "playerone",
      fetchFn,
      onResult: (r) => results.push(r),
      logger: makeLogger(),
      clock,
    });

    poller.start();
    await flush();

    assert.strictEqual(results.length, 1, "exactly one result emitted");
    const result = results[0];
    assert.ok(result !== undefined, "result is defined");
    assert.strictEqual(result.count, 1, "count = 1 (one game awaiting playerone)");
    assert.ok(result.mostUrgent !== undefined, "mostUrgent is defined");
    assert.strictEqual(result.mostUrgent.url, GAME.url, "mostUrgent.url matches fixture");

    poller.stop();
  });

  // -------------------------------------------------------------------------
  // 6. Failure: logs non-identifying operational facts, reschedules, no crash
  // -------------------------------------------------------------------------

  it("failure cycle: logs non-identifying facts, reschedules at 60_000 ms, does not emit, does not throw", async () => {
    const clock = new FakeClock();
    const logger = makeLogger();
    // Error message contains both username and full API URL — neither may appear in logs
    const piiMessage =
      "Failed to fetch https://api.chess.com/pub/player/playerone/games for playerone";
    const fetchError = new TypeError(piiMessage);

    const fetchFn = (): Promise<Response> => Promise.reject(fetchError);

    const results: PollResult[] = [];
    const poller = new Poller({
      username: "playerone",
      fetchFn,
      onResult: (r) => results.push(r),
      logger,
      clock,
    });

    poller.start();
    await flush();

    assert.strictEqual(results.length, 0, "failed cycle must not emit a result");
    assert.strictEqual(clock.count, 1, "failed cycle must reschedule");
    assert.strictEqual(
      clock.pending[0]!.delay,
      60_000,
      "failed cycle reschedules at 60_000 ms floor"
    );
    assert.ok(logger.lines.length > 0, "failure must be logged");

    // Verify log contains no PII: no username, no URL fragment
    for (const line of logger.lines) {
      assert.ok(!line.includes("playerone"), `log must not contain username, got: ${line}`);
      assert.ok(!line.includes("api.chess.com"), `log must not contain request URL, got: ${line}`);
      assert.ok(
        !line.includes("pub/player"),
        `log must not contain URL path fragment, got: ${line}`
      );
    }

    poller.stop();
  });

  it("abort rejection during stop() is not logged as an error", async () => {
    const clock = new FakeClock();
    const logger = makeLogger();

    const fetchFn = (_url: string | URL | Request, init?: RequestInit): Promise<Response> =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("The operation was aborted.", "AbortError"))
        );
      });

    const poller = new Poller({
      username: "playerone",
      fetchFn,
      onResult: () => undefined,
      logger,
      clock,
    });

    poller.start();
    poller.stop();

    await flush();

    assert.strictEqual(
      logger.lines.length,
      0,
      "abort on stop() must not produce an error log entry"
    );
  });

  // -------------------------------------------------------------------------
  // 7. 304 carries server-driven cadence via maxAge
  // -------------------------------------------------------------------------

  it("304 unchanged with maxAge>60s schedules at max(maxAge, 60_000)", async () => {
    const clock = new FakeClock();

    const fetchFn = (): Promise<Response> =>
      Promise.resolve(
        new Response(null, {
          status: 304,
          headers: { "Cache-Control": "max-age=120" },
        })
      );

    const poller = new Poller({
      username: "playerone",
      fetchFn,
      onResult: () => undefined,
      logger: makeLogger(),
      clock,
    });

    poller.start();
    await flush();

    assert.strictEqual(clock.count, 1, "timer scheduled after 304");
    assert.strictEqual(
      clock.pending[0]!.delay,
      120_000,
      "304 with max-age=120s schedules at 120_000 ms"
    );

    poller.stop();
  });

  it("304 with no Cache-Control retains last known cadence", async () => {
    const clock = new FakeClock();
    let callCount = 0;
    const rawJson = JSON.stringify({ games: [] });

    const fetchFn = (): Promise<Response> => {
      callCount++;
      // First call: 200 with maxAge=90s to establish lastKnownDelay
      // Second call: 304 with no Cache-Control
      if (callCount === 1) {
        return Promise.resolve(
          new Response(rawJson, {
            status: 200,
            headers: { "Cache-Control": "max-age=90" },
          })
        );
      }
      return Promise.resolve(new Response(null, { status: 304 }));
    };

    const poller = new Poller({
      username: "playerone",
      fetchFn,
      onResult: () => undefined,
      logger: makeLogger(),
      clock,
    });

    poller.start();
    await flush();

    // After first (200) cycle — 90_000 ms timer
    assert.strictEqual(clock.pending[0]!.delay, 90_000, "first cycle schedules at 90_000");
    clock.tick(); // fire timer → second cycle (304)
    await flush();

    assert.strictEqual(clock.count, 1, "timer scheduled after 304");
    assert.strictEqual(
      clock.pending[0]!.delay,
      90_000,
      "304 with no Cache-Control retains last known delay (90_000)"
    );

    poller.stop();
  });

  it("304 with explicit max-age=0 schedules at 60_000 floor, not lastKnownDelay", async () => {
    const clock = new FakeClock();
    let callCount = 0;
    const rawJson = JSON.stringify({ games: [] });

    const fetchFn = (): Promise<Response> => {
      callCount++;
      // First call: 200 with maxAge=90s — establishes lastKnownDelay=90_000
      if (callCount === 1) {
        return Promise.resolve(
          new Response(rawJson, {
            status: 200,
            headers: { "Cache-Control": "max-age=90" },
          })
        );
      }
      // Second call: 304 with explicit max-age=0 — must NOT reuse 90_000
      return Promise.resolve({
        status: 304,
        headers: new Headers({ "Cache-Control": "max-age=0" }),
      } as unknown as Response);
    };

    const poller = new Poller({
      username: "playerone",
      fetchFn,
      onResult: () => undefined,
      logger: makeLogger(),
      clock,
    });

    poller.start();
    await flush();

    assert.strictEqual(clock.pending[0]!.delay, 90_000, "first cycle schedules at 90_000");
    clock.tick(); // fire timer → second cycle (304 max-age=0)
    await flush();

    assert.strictEqual(clock.count, 1, "timer scheduled after 304");
    assert.strictEqual(
      clock.pending[0]!.delay,
      60_000,
      "304 with max-age=0 must schedule at 60_000 floor, not lastKnownDelay"
    );

    poller.stop();
  });

  // -------------------------------------------------------------------------
  // 8. Invalid payload must not commit ETag before parse succeeds
  // -------------------------------------------------------------------------

  it("malformed 200 with ETag E1 must not send If-None-Match on the next request", async () => {
    const clock = new FakeClock();
    const logger = makeLogger();

    let callCount = 0;
    const capturedHeaders: Array<Record<string, string>> = [];

    const fetchFn = (_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      callCount++;
      // Record whatever conditional headers were sent
      const sent: Record<string, string> = {};
      if (init?.headers) {
        const h = init.headers as Record<string, string>;
        for (const key of Object.keys(h)) {
          sent[key.toLowerCase()] = h[key]!;
        }
      }
      capturedHeaders.push(sent);

      if (callCount === 1) {
        // First call: malformed 200 with an ETag
        return Promise.resolve(
          new Response("this is not valid json {{{", {
            status: 200,
            headers: { ETag: '"etag-malformed"', "Cache-Control": "max-age=60" },
          })
        );
      }
      // Second call: valid 200 with no games
      return Promise.resolve(
        new Response(JSON.stringify({ games: [] }), {
          status: 200,
          headers: { ETag: '"etag-valid"', "Cache-Control": "max-age=60" },
        })
      );
    };

    const results: PollResult[] = [];
    const poller = new Poller({
      username: "playerone",
      fetchFn,
      onResult: (r) => results.push(r),
      logger,
      clock,
    });

    poller.start();
    await flush();

    // Malformed parse must not emit a result
    assert.strictEqual(results.length, 0, "malformed 200 must not emit a result");
    // Poller must reschedule (treats parse failure like a cycle error)
    assert.strictEqual(clock.count, 1, "failed cycle must reschedule");

    // Fire the timer to trigger the second request
    clock.tick();
    await flush();

    assert.strictEqual(callCount, 2, "second fetch was triggered");

    // The second request must NOT carry If-None-Match from the malformed cycle
    const secondHeaders = capturedHeaders[1] ?? {};
    assert.strictEqual(
      secondHeaders["if-none-match"],
      undefined,
      "second request must not send If-None-Match: the ETag from the malformed cycle must not be committed"
    );

    poller.stop();
  });

  // -------------------------------------------------------------------------
  // 9. Stale-cycle race: stop() → start() while old fetch is still in flight
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // S1 — Poller status forwarding (onStatus contract)
  // -------------------------------------------------------------------------

  it("K1: 200 response emits onStatus {kind:'counted'} with count and mostUrgent", async () => {
    const clock = new FakeClock();
    const rawGames = {
      games: [
        {
          time_class: "daily",
          fen: GAME.fen,
          turn: "white",
          move_by: GAME.moveBy,
          url: GAME.url,
          white: "https://api.chess.com/pub/player/playerone",
          black: "https://api.chess.com/pub/player/playertwo",
        },
      ],
    };

    const fetchFn = (): Promise<Response> =>
      Promise.resolve(
        new Response(JSON.stringify(rawGames), {
          status: 200,
          headers: { "Cache-Control": "max-age=60" },
        })
      );

    const statuses: PollStatus[] = [];
    const poller = new Poller({
      username: "playerone",
      fetchFn,
      onResult: () => undefined,
      onStatus: (s) => statuses.push(s),
      logger: makeLogger(),
      clock,
    });

    poller.start();
    await flush();

    assert.strictEqual(statuses.length, 1, "exactly one status emitted");
    const status = statuses[0];
    assert.ok(status !== undefined);
    assert.strictEqual(status.kind, "counted");
    if (status.kind === "counted") {
      assert.strictEqual(status.count, 1, "count = 1");
      assert.ok(status.mostUrgent !== undefined, "mostUrgent populated");
      assert.strictEqual(status.mostUrgent.url, GAME.url, "mostUrgent.url matches fixture");
    }

    poller.stop();
  });

  it("stale cycle A cannot emit, log, or schedule after stop() → start() cycle B", async () => {
    const clock = new FakeClock();
    const logger = makeLogger();

    let resolveA!: (r: Response) => void;
    let resolveB!: (r: Response) => void;
    let callCount = 0;
    const rawJson = JSON.stringify({ games: [] });

    const fetchFn = (): Promise<Response> => {
      callCount++;
      if (callCount === 1) {
        return new Promise<Response>((resolve) => {
          resolveA = resolve;
        });
      }
      return new Promise<Response>((resolve) => {
        resolveB = resolve;
      });
    };

    const results: PollResult[] = [];
    const poller = new Poller({
      username: "playerone",
      fetchFn,
      onResult: (r) => results.push(r),
      logger,
      clock,
    });

    // Start cycle A — fetch is in flight, abort is ignored (fetch never rejects)
    poller.start();
    assert.strictEqual(callCount, 1, "cycle A fetch in flight");

    // stop() + start() launches cycle B while A's fetch is still pending
    poller.stop();
    poller.start();
    assert.strictEqual(callCount, 2, "cycle B fetch in flight");

    // Resolve A — stale cycle; must be a no-op
    resolveA(
      new Response(rawJson, {
        status: 200,
        headers: { "Cache-Control": "max-age=60" },
      })
    );
    await flush();

    assert.strictEqual(results.length, 0, "stale cycle A must not emit");
    assert.strictEqual(logger.lines.length, 0, "stale cycle A must not log");
    assert.strictEqual(clock.count, 0, "stale cycle A must not schedule a timer");

    // Resolve B — the live cycle; must emit and schedule normally
    resolveB(
      new Response(rawJson, {
        status: 200,
        headers: { "Cache-Control": "max-age=60" },
      })
    );
    await flush();

    assert.strictEqual(clock.count, 1, "live cycle B schedules exactly one timer");

    poller.stop();
  });

  it("K2: 404 response emits onStatus {kind:'notFound'}", async () => {
    const clock = new FakeClock();
    const fetchFn = (): Promise<Response> => Promise.resolve(new Response(null, { status: 404 }));

    const statuses: PollStatus[] = [];
    const poller = new Poller({
      username: "nobody",
      fetchFn,
      onResult: () => undefined,
      onStatus: (s) => statuses.push(s),
      logger: makeLogger(),
      clock,
    });

    poller.start();
    await flush();

    assert.strictEqual(statuses.length, 1, "exactly one status emitted");
    assert.strictEqual(statuses[0]?.kind, "notFound");

    poller.stop();
  });

  it("K3: 429 emits onStatus {kind:'transient'}", async () => {
    const clock = new FakeClock();
    const fetchFn = (): Promise<Response> => Promise.resolve(new Response(null, { status: 429 }));

    const statuses: PollStatus[] = [];
    const poller = new Poller({
      username: "playerone",
      fetchFn,
      onResult: () => undefined,
      onStatus: (s) => statuses.push(s),
      logger: makeLogger(),
      clock,
    });

    poller.start();
    await flush();

    assert.strictEqual(statuses.length, 1, "exactly one status emitted");
    assert.strictEqual(statuses[0]?.kind, "transient");

    poller.stop();
  });

  it("K3b: 503 emits onStatus {kind:'transient'}", async () => {
    const clock = new FakeClock();
    const fetchFn = (): Promise<Response> => Promise.resolve(new Response(null, { status: 503 }));

    const statuses: PollStatus[] = [];
    const poller = new Poller({
      username: "playerone",
      fetchFn,
      onResult: () => undefined,
      onStatus: (s) => statuses.push(s),
      logger: makeLogger(),
      clock,
    });

    poller.start();
    await flush();

    assert.strictEqual(statuses.length, 1, "exactly one status emitted");
    assert.strictEqual(statuses[0]?.kind, "transient");

    poller.stop();
  });

  it("K4: network TypeError emits onStatus {kind:'transient'}", async () => {
    const clock = new FakeClock();
    const fetchFn = (): Promise<Response> => Promise.reject(new TypeError("Failed to fetch"));

    const statuses: PollStatus[] = [];
    const poller = new Poller({
      username: "playerone",
      fetchFn,
      onResult: () => undefined,
      onStatus: (s) => statuses.push(s),
      logger: makeLogger(),
      clock,
    });

    poller.start();
    await flush();

    assert.strictEqual(statuses.length, 1, "exactly one status emitted on network error");
    assert.strictEqual(statuses[0]?.kind, "transient");

    poller.stop();
  });

  // -------------------------------------------------------------------------
  // S1 (v0.4.0) — counted status carries the full parsed Daily Game list
  // -------------------------------------------------------------------------

  it("counted status carries the full parsed games[]; count/mostUrgent derive from it", async () => {
    const clock = new FakeClock();
    // Two daily games: A awaits playerone (white to move, playerone white),
    // B does not (black to move). A.move_by is sooner → A is most urgent.
    const rawGames = {
      games: [
        {
          time_class: "daily",
          fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
          turn: "black",
          move_by: 2_000_000_000,
          url: "https://www.chess.com/game/daily/B",
          white: "https://api.chess.com/pub/player/playerone",
          black: "https://api.chess.com/pub/player/playertwo",
        },
        {
          time_class: "daily",
          fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
          turn: "white",
          move_by: 1_000_000_000,
          url: "https://www.chess.com/game/daily/A",
          white: "https://api.chess.com/pub/player/playerone",
          black: "https://api.chess.com/pub/player/playerthree",
        },
      ],
    };

    const fetchFn = (): Promise<Response> =>
      Promise.resolve(
        new Response(JSON.stringify(rawGames), {
          status: 200,
          headers: { "Cache-Control": "max-age=60" },
        })
      );

    const statuses: PollStatus[] = [];
    const poller = new Poller({
      username: "playerone",
      fetchFn,
      onResult: () => undefined,
      onStatus: (s) => statuses.push(s),
      logger: makeLogger(),
      clock,
    });

    poller.start();
    await flush();

    const status = statuses[0];
    assert.ok(status !== undefined);
    assert.strictEqual(status.kind, "counted");
    if (status.kind === "counted") {
      assert.strictEqual(status.games.length, 2, "counted carries every parsed Daily Game");
      const urls = status.games.map((g) => g.url).sort();
      assert.deepStrictEqual(urls, [
        "https://www.chess.com/game/daily/A",
        "https://www.chess.com/game/daily/B",
      ]);
      // count/mostUrgent are derived from that same array — not a separate source
      assert.strictEqual(status.count, 1, "only A awaits playerone");
      assert.ok(status.mostUrgent !== undefined);
      assert.strictEqual(status.mostUrgent.url, "https://www.chess.com/game/daily/A");
      assert.ok(
        status.games.includes(status.mostUrgent),
        "mostUrgent is one of the carried games (same array identity)"
      );
    }

    poller.stop();
  });

  it("F3: a 200 carrying a malformed FEN is classified transient, emits no counted", async () => {
    const clock = new FakeClock();
    // Valid JSON, daily game, but the FEN's last rank describes only 7 squares.
    const rawGames = {
      games: [
        {
          time_class: "daily",
          fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBN w KQkq - 0 1",
          turn: "white",
          move_by: 1_000_000_000,
          url: "https://www.chess.com/game/daily/bad",
          white: "https://api.chess.com/pub/player/playerone",
          black: "https://api.chess.com/pub/player/playertwo",
        },
      ],
    };

    const fetchFn = (): Promise<Response> =>
      Promise.resolve(
        new Response(JSON.stringify(rawGames), {
          status: 200,
          headers: { "Cache-Control": "max-age=60" },
        })
      );

    const statuses: PollStatus[] = [];
    const poller = new Poller({
      username: "playerone",
      fetchFn,
      onResult: () => undefined,
      onStatus: (s) => statuses.push(s),
      logger: makeLogger(),
      clock,
    });

    poller.start();
    await flush();

    assert.strictEqual(statuses.length, 1, "exactly one status on a malformed-FEN cycle");
    assert.strictEqual(statuses[0]?.kind, "transient", "malformed FEN → transient, not counted");
    assert.strictEqual(clock.count, 1, "malformed-FEN cycle reschedules");

    poller.stop();
  });

  it("K5: 304 (unchanged) emits nothing via onStatus — last-known preserved", async () => {
    const clock = new FakeClock();
    const fetchFn = (): Promise<Response> =>
      Promise.resolve(
        new Response(null, {
          status: 304,
          headers: { "Cache-Control": "max-age=60" },
        })
      );

    const statuses: PollStatus[] = [];
    const poller = new Poller({
      username: "playerone",
      fetchFn,
      onResult: () => undefined,
      onStatus: (s) => statuses.push(s),
      logger: makeLogger(),
      clock,
    });

    poller.start();
    await flush();

    assert.strictEqual(statuses.length, 0, "304 must not emit any onStatus call");

    poller.stop();
  });
});
