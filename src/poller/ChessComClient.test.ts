import assert from "node:assert/strict";
import { fetchGames } from "./ChessComClient";

const API_ORIGIN = "https://api.chess.com";
const APP_IDENTITY = "https://github.com/eunai/vscode-chess";

function makeResponse(
  status: number,
  body: string,
  headers: Record<string, string> = {}
): Response {
  return new Response(body, { status, headers });
}

describe("ChessComClient.fetchGames()", () => {
  it("200: returns rawJson + etag + maxAge, calls fetch exactly once with GET, correct origin, User-Agent has no PII", async () => {
    const rawJson = '{"games":[]}';
    let callCount = 0;
    let capturedUrl: string | undefined;
    let capturedInit: RequestInit | undefined;

    const fakeFetch = (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      callCount++;
      capturedUrl = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
      capturedInit = init;
      return Promise.resolve(
        makeResponse(200, rawJson, {
          ETag: '"abc123"',
          "Cache-Control": "max-age=55",
        })
      );
    };

    const result = await fetchGames("playerone", {}, fakeFetch);

    assert.strictEqual(callCount, 1, "fetch called exactly once");
    assert.ok(capturedUrl !== undefined);
    const parsed = new URL(capturedUrl);
    assert.strictEqual(
      parsed.origin,
      API_ORIGIN,
      `API origin must be ${API_ORIGIN}: ${capturedUrl}`
    );
    assert.ok(
      capturedUrl.endsWith("/pub/player/playerone/games"),
      `URL ends with encoded path: ${capturedUrl}`
    );
    assert.strictEqual(capturedInit?.method, "GET", "method must be GET");

    assert.strictEqual(result.type, "success");
    if (result.type !== "success") return;
    assert.strictEqual(result.rawJson, rawJson);
    assert.strictEqual(result.etag, '"abc123"');
    assert.strictEqual(result.maxAge, 55_000);

    const ua = (capturedInit?.headers as Record<string, string> | undefined)?.["User-Agent"] ?? "";
    assert.ok(ua.includes(APP_IDENTITY), `User-Agent includes repo URL: ${ua}`);
    assert.ok(
      !ua.toLowerCase().includes("playerone"),
      `User-Agent does not include username: ${ua}`
    );
  });

  it("200 without ETag header: etag is undefined, not empty string", async () => {
    const fakeFetch = (): Promise<Response> =>
      Promise.resolve(makeResponse(200, '{"games":[]}', { "Cache-Control": "max-age=60" }));

    const result = await fetchGames("playerone", {}, fakeFetch);

    assert.strictEqual(result.type, "success");
    if (result.type !== "success") return;
    assert.strictEqual(result.etag, undefined, "absent ETag must be undefined, not empty string");
  });

  it("encodes special characters in username as a single path segment", async () => {
    let capturedUrl: string | undefined;
    const fakeFetch = (url: string | URL | Request): Promise<Response> => {
      capturedUrl = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
      return Promise.resolve(
        makeResponse(200, '{"games":[]}', { ETag: '"x"', "Cache-Control": "max-age=60" })
      );
    };

    await fetchGames("player/one?two#three four", {}, fakeFetch);

    assert.ok(capturedUrl !== undefined);
    const parsed = new URL(capturedUrl);
    assert.strictEqual(parsed.origin, API_ORIGIN);
    assert.ok(
      parsed.pathname.endsWith("/pub/player/player%2Fone%3Ftwo%23three%20four/games"),
      `Path correctly encoded: ${parsed.pathname}`
    );
    assert.strictEqual(parsed.search, "", `No query string leaked: ${capturedUrl}`);
    assert.strictEqual(parsed.hash, "", `No fragment leaked: ${capturedUrl}`);
  });

  it("sends If-None-Match when a prior ETag is known", async () => {
    let capturedInit: RequestInit | undefined;
    const fakeFetch = (_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      capturedInit = init;
      return Promise.resolve(
        makeResponse(200, '{"games":[]}', { ETag: '"new"', "Cache-Control": "max-age=60" })
      );
    };

    await fetchGames("playerone", { etag: '"prior-etag"' }, fakeFetch);

    const headers = capturedInit?.headers as Record<string, string> | undefined;
    assert.strictEqual(headers?.["If-None-Match"], '"prior-etag"');
  });

  it("forwards AbortSignal to fetch", async () => {
    const controller = new AbortController();
    let capturedSignal: AbortSignal | undefined;

    const fakeFetch = (_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      capturedSignal = init?.signal ?? undefined;
      return Promise.resolve(
        makeResponse(200, '{"games":[]}', { ETag: '"s"', "Cache-Control": "max-age=60" })
      );
    };

    await fetchGames("playerone", {}, fakeFetch, controller.signal);

    assert.strictEqual(
      capturedSignal,
      controller.signal,
      "exact AbortSignal instance must be forwarded"
    );
  });

  it("304 with no Cache-Control: maxAge is undefined (absent, not zero)", async () => {
    const fakeFetch = (): Promise<Response> =>
      // Node's undici Response constructor rejects 304 as invalid; build a minimal fake.
      Promise.resolve({ status: 304, headers: new Headers() } as unknown as Response);
    const result = await fetchGames("playerone", { etag: '"abc"' }, fakeFetch);
    assert.strictEqual(result.type, "unchanged");
    if (result.type === "unchanged") {
      assert.strictEqual(result.maxAge, undefined, "maxAge=undefined when Cache-Control absent");
    }
  });

  it("304 with Cache-Control max-age=120: maxAge is 120_000", async () => {
    const fakeFetch = (): Promise<Response> =>
      Promise.resolve({
        status: 304,
        headers: new Headers({ "Cache-Control": "max-age=120" }),
      } as unknown as Response);
    const result = await fetchGames("playerone", { etag: '"abc"' }, fakeFetch);
    assert.strictEqual(result.type, "unchanged");
    if (result.type === "unchanged") {
      assert.strictEqual(result.maxAge, 120_000, "maxAge=120_000 from Cache-Control max-age=120");
    }
  });

  it("304 with Cache-Control max-age=0: maxAge is 0 (explicit zero, not absent)", async () => {
    const fakeFetch = (): Promise<Response> =>
      Promise.resolve({
        status: 304,
        headers: new Headers({ "Cache-Control": "max-age=0" }),
      } as unknown as Response);
    const result = await fetchGames("playerone", { etag: '"abc"' }, fakeFetch);
    assert.strictEqual(result.type, "unchanged");
    if (result.type === "unchanged") {
      assert.strictEqual(result.maxAge, 0, "maxAge=0 when server explicitly sends max-age=0");
    }
  });

  it("maps 404 to UsernameNotFound", async () => {
    const fakeFetch = (): Promise<Response> => Promise.resolve(makeResponse(404, ""));
    const result = await fetchGames("playerone", {}, fakeFetch);
    assert.strictEqual(result.type, "UsernameNotFound");
  });

  it("maps 429 to TransientError", async () => {
    const fakeFetch = (): Promise<Response> => Promise.resolve(makeResponse(429, ""));
    const result = await fetchGames("playerone", {}, fakeFetch);
    assert.strictEqual(result.type, "TransientError");
  });

  it("maps 503 to TransientError", async () => {
    const fakeFetch = (): Promise<Response> => Promise.resolve(makeResponse(503, ""));
    const result = await fetchGames("playerone", {}, fakeFetch);
    assert.strictEqual(result.type, "TransientError");
  });

  it("throws on unexpected HTTP status", async () => {
    const fakeFetch = (): Promise<Response> => Promise.resolve(makeResponse(418, "I'm a teapot"));
    await assert.rejects(() => fetchGames("playerone", {}, fakeFetch), /unexpected.*status.*418/i);
  });

  it("Cache-Control s-maxage alone: maxAge is undefined (s-maxage is not max-age)", async () => {
    const fakeFetch = (): Promise<Response> =>
      Promise.resolve(makeResponse(200, '{"games":[]}', { "Cache-Control": "s-maxage=999" }));

    const result = await fetchGames("playerone", {}, fakeFetch);

    assert.strictEqual(result.type, "success");
    if (result.type !== "success") return;
    assert.strictEqual(result.maxAge, undefined, "s-maxage must not be treated as max-age");
  });

  it("Cache-Control s-maxage=999, max-age=5: maxAge is 5000", async () => {
    const fakeFetch = (): Promise<Response> =>
      Promise.resolve(
        makeResponse(200, '{"games":[]}', { "Cache-Control": "s-maxage=999, max-age=5" })
      );

    const result = await fetchGames("playerone", {}, fakeFetch);

    assert.strictEqual(result.type, "success");
    if (result.type !== "success") return;
    assert.strictEqual(result.maxAge, 5000, "max-age=5 must produce 5000 ms");
  });

  it("Cache-Control present but no max-age directive: maxAge is undefined", async () => {
    const fakeFetch = (): Promise<Response> =>
      Promise.resolve(makeResponse(200, '{"games":[]}', { "Cache-Control": "no-cache" }));

    const result = await fetchGames("playerone", {}, fakeFetch);

    assert.strictEqual(result.type, "success");
    if (result.type !== "success") return;
    assert.strictEqual(result.maxAge, undefined, "no max-age directive must produce undefined");
  });

  it("aborted fetch: rejection propagates unchanged (not mapped to TransientError)", async () => {
    const abortError = new DOMException("The operation was aborted.", "AbortError");
    const fakeFetch = (): Promise<Response> => Promise.reject(abortError);

    const caught = await fetchGames("playerone", {}, fakeFetch).then(
      () => null,
      (err: unknown) => err
    );

    assert.strictEqual(caught, abortError, "abort error must propagate as-is");
  });

  it("Cache-Control max-age=5junk: maxAge is undefined (trailing non-digits rejected)", async () => {
    const fakeFetch = (): Promise<Response> =>
      Promise.resolve(makeResponse(200, '{"games":[]}', { "Cache-Control": "max-age=5junk" }));

    const result = await fetchGames("playerone", {}, fakeFetch);

    assert.strictEqual(result.type, "success");
    if (result.type !== "success") return;
    assert.strictEqual(result.maxAge, undefined, "max-age=5junk must not parse as 5");
  });

  it("Cache-Control max-age=-1: maxAge is undefined (negative values rejected)", async () => {
    const fakeFetch = (): Promise<Response> =>
      Promise.resolve(makeResponse(200, '{"games":[]}', { "Cache-Control": "max-age=-1" }));

    const result = await fetchGames("playerone", {}, fakeFetch);

    assert.strictEqual(result.type, "success");
    if (result.type !== "success") return;
    assert.strictEqual(result.maxAge, undefined, "max-age=-1 must be rejected");
  });

  it("Cache-Control max-age= (empty value): maxAge is undefined", async () => {
    const fakeFetch = (): Promise<Response> =>
      Promise.resolve(makeResponse(200, '{"games":[]}', { "Cache-Control": "max-age=" }));

    const result = await fetchGames("playerone", {}, fakeFetch);

    assert.strictEqual(result.type, "success");
    if (result.type !== "success") return;
    assert.strictEqual(result.maxAge, undefined, "empty max-age value must be rejected");
  });

  it("empty ETag response header: etag is undefined, not empty string", async () => {
    const fakeFetch = (): Promise<Response> =>
      Promise.resolve(
        makeResponse(200, '{"games":[]}', { ETag: "", "Cache-Control": "max-age=60" })
      );

    const result = await fetchGames("playerone", {}, fakeFetch);

    assert.strictEqual(result.type, "success");
    if (result.type !== "success") return;
    assert.strictEqual(result.etag, undefined, "empty ETag header must normalize to undefined");
  });

  it("whitespace-only ETag response header: etag is undefined", async () => {
    const fakeFetch = (): Promise<Response> =>
      Promise.resolve(
        makeResponse(200, '{"games":[]}', { ETag: "   ", "Cache-Control": "max-age=60" })
      );

    const result = await fetchGames("playerone", {}, fakeFetch);

    assert.strictEqual(result.type, "success");
    if (result.type !== "success") return;
    assert.strictEqual(
      result.etag,
      undefined,
      "whitespace ETag header must normalize to undefined"
    );
  });

  it("empty conditional etag: If-None-Match is omitted", async () => {
    let capturedInit: RequestInit | undefined;
    const fakeFetch = (_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      capturedInit = init;
      return Promise.resolve(
        makeResponse(200, '{"games":[]}', { ETag: '"new"', "Cache-Control": "max-age=60" })
      );
    };

    await fetchGames("playerone", { etag: "" }, fakeFetch);

    const headers = capturedInit?.headers as Record<string, string> | undefined;
    assert.strictEqual(
      headers?.["If-None-Match"],
      undefined,
      "empty etag must not produce If-None-Match"
    );
  });

  it("whitespace-only conditional etag: If-None-Match is omitted", async () => {
    let capturedInit: RequestInit | undefined;
    const fakeFetch = (_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      capturedInit = init;
      return Promise.resolve(
        makeResponse(200, '{"games":[]}', { ETag: '"new"', "Cache-Control": "max-age=60" })
      );
    };

    await fetchGames("playerone", { etag: "   " }, fakeFetch);

    const headers = capturedInit?.headers as Record<string, string> | undefined;
    assert.strictEqual(
      headers?.["If-None-Match"],
      undefined,
      "whitespace etag must not produce If-None-Match"
    );
  });

  it("Cache-Control max-age with astronomically large value: maxAge is capped at MAX_TIMEOUT_MS", async () => {
    const fakeFetch = (): Promise<Response> =>
      Promise.resolve(
        makeResponse(200, '{"games":[]}', {
          "Cache-Control": "max-age=99999999999999",
        })
      );

    const result = await fetchGames("playerone", {}, fakeFetch);

    assert.strictEqual(result.type, "success");
    if (result.type !== "success") return;
    assert.ok(result.maxAge !== undefined, "maxAge must be defined for a valid max-age directive");
    assert.ok(Number.isFinite(result.maxAge), `maxAge must be finite, got ${result.maxAge}`);
    assert.ok(
      result.maxAge <= 2_147_483_647,
      `maxAge must not exceed MAX_TIMEOUT_MS (2147483647), got ${result.maxAge}`
    );
  });

  it("Cache-Control max-age above setTimeout ceiling: maxAge is capped, not Infinity", async () => {
    const fakeFetch = (): Promise<Response> =>
      Promise.resolve(
        makeResponse(200, '{"games":[]}', {
          "Cache-Control": "max-age=2147484",
        })
      );

    const result = await fetchGames("playerone", {}, fakeFetch);

    assert.strictEqual(result.type, "success");
    if (result.type !== "success") return;
    assert.strictEqual(
      result.maxAge,
      2_147_483_647,
      "value above ceiling must clamp to MAX_TIMEOUT_MS"
    );
  });
});
