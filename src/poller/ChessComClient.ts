const BASE_URL = "https://api.chess.com";
const USER_AGENT = "vscode-chess https://github.com/eunai/vscode-chess";

export interface ConditionalParams {
  etag?: string;
}

export type PollOutcome =
  | { type: "success"; rawJson: string; etag: string | undefined; maxAge: number | undefined }
  | { type: "unchanged"; maxAge: number | undefined }
  | { type: "UsernameNotFound" }
  | { type: "TransientError" };

type FetchFn = (url: string | URL | Request, init?: RequestInit) => Promise<Response>;

const MAX_TIMEOUT_MS = 2_147_483_647;

function parseMaxAge(cacheControl: string | null): number | undefined {
  if (cacheControl === null) return undefined;
  for (const directive of cacheControl.split(",")) {
    const [name, value] = directive.trim().split("=");
    if (name?.trim().toLowerCase() === "max-age" && value !== undefined) {
      const trimmed = value.trim();
      if (/^\d+$/.test(trimmed)) {
        const ms = parseInt(trimmed, 10) * 1000;
        return Number.isFinite(ms) ? Math.min(ms, MAX_TIMEOUT_MS) : MAX_TIMEOUT_MS;
      }
    }
  }
  return undefined;
}

export async function fetchGames(
  username: string,
  conditional: ConditionalParams,
  fetchFn: FetchFn,
  signal?: AbortSignal
): Promise<PollOutcome> {
  const encodedUsername = encodeURIComponent(username);
  const url = `${BASE_URL}/pub/player/${encodedUsername}/games`;

  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
  };
  if (conditional.etag !== undefined && conditional.etag.trim() !== "") {
    headers["If-None-Match"] = conditional.etag;
  }

  const response = await fetchFn(url, { method: "GET", headers, signal });

  if (response.status === 304) {
    return { type: "unchanged", maxAge: parseMaxAge(response.headers.get("Cache-Control")) };
  }
  if (response.status === 404) {
    return { type: "UsernameNotFound" };
  }
  if (response.status === 429 || (response.status >= 500 && response.status < 600)) {
    return { type: "TransientError" };
  }
  if (response.status === 200) {
    const rawJson = await response.text();
    const rawEtag = response.headers.get("ETag");
    const etag = rawEtag !== null && rawEtag.trim() !== "" ? rawEtag : undefined;
    const maxAge = parseMaxAge(response.headers.get("Cache-Control"));
    return { type: "success", rawJson, etag, maxAge };
  }

  throw new Error(`Unexpected HTTP status ${response.status} from Chess.com API`);
}
