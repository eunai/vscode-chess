import { parse } from "./GamesParser";
import { fetchGames } from "./ChessComClient";
import { from } from "../turn/TurnState";
import type { TurnStateResult } from "../turn/TurnState";
import type { ConditionalParams } from "./ChessComClient";
import type { DailyGame } from "./GamesParser";

export type PollResult = TurnStateResult;

export type PollStatus =
  | { kind: "counted"; count: number; mostUrgent: DailyGame | undefined }
  | { kind: "notFound" }
  | { kind: "transient" };

const MIN_DELAY_MS = 60_000;

type FetchFn = (url: string | URL | Request, init?: RequestInit) => Promise<Response>;

interface Logger {
  appendLine(value: string): void;
}

interface Clock {
  setTimeout(fn: () => void, delay: number): number;
  clearTimeout(id: number): void;
}

interface PollerOptions {
  username: string;
  fetchFn: FetchFn;
  onResult: (result: PollResult) => void;
  onStatus?: (status: PollStatus) => void;
  logger: Logger;
  clock?: Clock;
}

const defaultClock: Clock = {
  setTimeout: (fn, d) => +globalThis.setTimeout(fn, d),
  clearTimeout: (id) => globalThis.clearTimeout(id),
};

export class Poller {
  private readonly username: string;
  private readonly fetchFn: FetchFn;
  private readonly onResult: (result: PollResult) => void;
  private readonly onStatus: ((status: PollStatus) => void) | undefined;
  private readonly logger: Logger;
  private readonly clock: Clock;

  private running = false;
  private cycleId = 0;
  private timerId: number | undefined;
  private abortController: AbortController | undefined;
  private conditional: ConditionalParams = {};
  private lastKnownDelay = MIN_DELAY_MS;

  constructor(options: PollerOptions) {
    this.username = options.username;
    this.fetchFn = options.fetchFn;
    this.onResult = options.onResult;
    this.onStatus = options.onStatus;
    this.logger = options.logger;
    this.clock = options.clock ?? defaultClock;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.cycleId++;
    void this.runCycle(this.cycleId);
  }

  stop(): void {
    this.running = false;
    if (this.timerId !== undefined) {
      this.clock.clearTimeout(this.timerId);
      this.timerId = undefined;
    }
    this.abortController?.abort();
    this.abortController = undefined;
  }

  private async runCycle(id: number): Promise<void> {
    if (!this.running || id !== this.cycleId) return;

    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    try {
      const outcome = await fetchGames(this.username, this.conditional, this.fetchFn, signal);

      if (!this.running || id !== this.cycleId) return;

      if (outcome.type === "success") {
        const games = parse(JSON.parse(outcome.rawJson) as unknown, this.username);
        const result = from(games);
        // Commit ETag and cadence only after parsing succeeds
        this.conditional = { etag: outcome.etag };
        const delay =
          outcome.maxAge !== undefined
            ? Math.max(outcome.maxAge, MIN_DELAY_MS)
            : this.lastKnownDelay;
        this.lastKnownDelay = delay;
        this.onResult(result);
        this.onStatus?.({ kind: "counted", count: result.count, mostUrgent: result.mostUrgent });
        this.schedule(id, delay);
      } else if (outcome.type === "unchanged") {
        const delay =
          outcome.maxAge !== undefined
            ? Math.max(outcome.maxAge, MIN_DELAY_MS)
            : this.lastKnownDelay;
        this.lastKnownDelay = delay;
        this.schedule(id, delay);
      } else if (outcome.type === "UsernameNotFound") {
        this.onStatus?.({ kind: "notFound" });
        this.schedule(id, MIN_DELAY_MS);
      } else {
        // outcome.type === "TransientError"
        this.onStatus?.({ kind: "transient" });
        this.logger.appendLine(`Poller: poll outcome ${outcome.type}`);
        this.schedule(id, MIN_DELAY_MS);
      }
    } catch (err: unknown) {
      if (!this.running || id !== this.cycleId) return;
      if (err instanceof DOMException && err.name === "AbortError") return;
      const classification = err instanceof TypeError ? "network error" : "unexpected error";
      this.logger.appendLine(`Poller: cycle failed — ${classification}`);
      this.onStatus?.({ kind: "transient" });
      this.schedule(id, MIN_DELAY_MS);
    }
  }

  private schedule(id: number, delayMs: number): void {
    if (!this.running || id !== this.cycleId) return;
    this.timerId = this.clock.setTimeout(() => {
      this.timerId = undefined;
      void this.runCycle(id);
    }, delayMs);
  }
}
