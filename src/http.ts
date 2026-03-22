const REQUEST_INTERVAL_MS = 1000;
const DEFAULT_RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 500;

export const ASURA_BASE_URL = "https://asurascans.com";
export const ASURA_API_BASE_URL = "https://api.asurascans.com/api";
export const ASURA_BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36";

let throttleChain = Promise.resolve();
let nextRequestAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForThrottle(): Promise<void> {
  const previous = throttleChain;
  let release: (() => void) | undefined;

  // Serialize callers so request spacing is enforced process-wide, not just per call site.
  throttleChain = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous;

  const now = Date.now();
  const waitMs = Math.max(0, nextRequestAt - now);
  nextRequestAt = Math.max(now, nextRequestAt) + REQUEST_INTERVAL_MS;

  if (waitMs > 0) {
    await sleep(waitMs);
  }

  release?.();
}

export function createAsuraHeaders(
  extraHeaders?: HeadersInit,
  includeOrigin = true,
): Headers {
  const headers = new Headers({
    Referer: `${ASURA_BASE_URL}/`,
    "User-Agent": ASURA_BROWSER_USER_AGENT,
  });

  if (includeOrigin) {
    headers.set("Origin", ASURA_BASE_URL);
  }

  if (extraHeaders) {
    const extra = new Headers(extraHeaders);
    extra.forEach((value, key) => headers.set(key, value));
  }

  return headers;
}

export async function asuraFetch(
  input: string | URL,
  init: RequestInit = {},
  options: { throttled?: boolean; includeOrigin?: boolean; retryAttempts?: number } = {},
): Promise<Response> {
  const {
    throttled = false,
    includeOrigin = true,
    retryAttempts = DEFAULT_RETRY_ATTEMPTS,
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt < retryAttempts; attempt += 1) {
    try {
      if (throttled) {
        await waitForThrottle();
      }

      const response = await fetch(input, {
        ...init,
        headers: createAsuraHeaders(init.headers, includeOrigin),
      });

      if (attempt < retryAttempts - 1 && shouldRetryResponse(response)) {
        await sleep(getRetryDelayMs(attempt));
        continue;
      }

      return response;
    } catch (error) {
      lastError = error;

      if (attempt >= retryAttempts - 1) {
        throw error;
      }

      await sleep(getRetryDelayMs(attempt));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Request failed after retries.");
}

function shouldRetryResponse(response: Response): boolean {
  return [408, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524].includes(response.status);
}

function getRetryDelayMs(attempt: number): number {
  return RETRY_BASE_DELAY_MS * 2 ** attempt;
}

export async function requestJson<T>(
  input: string | URL,
  init: RequestInit = {},
  options: { throttled?: boolean; includeOrigin?: boolean } = {},
): Promise<T> {
  const response = await asuraFetch(input, init, options);

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
}

export async function requestText(
  input: string | URL,
  init: RequestInit = {},
  options: { throttled?: boolean; includeOrigin?: boolean } = {},
): Promise<string> {
  const response = await asuraFetch(input, init, options);

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }

  return response.text();
}
