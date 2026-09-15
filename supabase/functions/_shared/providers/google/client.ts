import { EdgeError } from '../../errors/index.ts';
import { googleApiErrorSchema } from './schemas.ts';

/**
 * The single place a request leaves for Google.
 *
 * Every caller goes through here so that three things are guaranteed: a
 * provider status code is translated into one of our stable error codes exactly
 * once, replay-safe rate limits can be retried rather than surfaced as a sync
 * failure, and a provider response body is never attached to an error that
 * could reach the client.
 */

export interface GoogleRequest {
  accessToken: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  body?: unknown;
  /** Sent as `If-Match` so a concurrent provider edit is a 412, not a clobber. */
  etag?: string | null;
  /** The request context keeps a 410 cursor signal from leaking into writes. */
  operation: GoogleRequestOperation;
  /** Opt in only when repeating the request cannot create a duplicate effect. */
  replaySafe?: boolean;
}

export type GoogleRequestOperation = 'calendar' | 'sync' | 'event' | 'watch';

export interface GoogleClientDeps {
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
}

export type GoogleFetch = (request: GoogleRequest) => Promise<unknown>;

const MAX_ATTEMPTS = 3;

/** Create an authenticated Google transport with deterministic retry seams. */
export function createGoogleClient(deps: GoogleClientDeps = {}): GoogleFetch {
  const fetcher = deps.fetch ?? fetch;
  const now = deps.now ?? (() => Date.now());
  const sleep = deps.sleep ?? defaultSleep;
  const random = deps.random ?? Math.random;

  return async (request) => {
    const response = await sendWithRetry(request, fetcher, sleep, now, random);

    if (response.status === 204 || response.status === 205) return null;

    const text = await response.text();
    if (!text) return null;

    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new EdgeError('UNKNOWN', 'Google returned a response we could not read.', 502);
    }
  };
}

/** The production transport; response bodies remain unknown to this layer. */
export const googleFetch: GoogleFetch = createGoogleClient();

async function sendWithRetry(
  request: GoogleRequest,
  fetcher: typeof fetch,
  sleep: (milliseconds: number) => Promise<void>,
  now: () => number,
  random: () => number,
): Promise<Response> {
  let lastError: EdgeError | null = null;
  const method = request.method ?? 'GET';
  const replaySafe = request.replaySafe ?? method === 'GET';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let response: Response;

    try {
      response = await fetcher(request.url, {
        method,
        headers: buildHeaders(request),
        body: request.body === undefined ? undefined : JSON.stringify(request.body),
      });
    } catch (cause) {
      // A replay-safe transport failure is worth one more try; it is usually a
      // cold socket. Never repeat an unsafe write without an idempotency key.
      lastError = new EdgeError('NETWORK_UNAVAILABLE', 'Could not reach Google.', 503);
      console.error(
        JSON.stringify({ code: 'NETWORK_UNAVAILABLE', attempt, detail: String(cause) }),
      );
      if (!replaySafe || attempt === MAX_ATTEMPTS) throw lastError;
      await backoff(attempt, null, now, random, sleep);
      continue;
    }

    if (response.ok) return response;

    // 403 is overloaded: it is both "rate limited" and "forbidden". Only the
    // rate-limit reasons are worth retrying, and they are distinguishable only
    // by reading the body, so consume it here rather than guessing.
    const detail = await safeReadError(response);

    if (response.status === 429 || (response.status === 403 && isRateLimit(detail))) {
      lastError = new EdgeError('PROVIDER_RATE_LIMITED', 'Google is rate limiting us.', 429);
      if (!replaySafe || attempt === MAX_ATTEMPTS) throw lastError;
      await backoff(attempt, response.headers.get('Retry-After'), now, random, sleep);
      continue;
    }

    if (response.status >= 500) {
      lastError = new EdgeError('UNKNOWN', 'Google is unavailable.', 502);
      if (!replaySafe || attempt === MAX_ATTEMPTS) throw lastError;
      await backoff(attempt, null, now, random, sleep);
      continue;
    }

    throw translate(response.status, detail, request.operation);
  }

  throw lastError ?? new EdgeError('UNKNOWN', 'Google request failed.', 502);
}

function buildHeaders(request: GoogleRequest): HeadersInit {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${request.accessToken}`,
    Accept: 'application/json',
  };
  if (request.body !== undefined) headers['Content-Type'] = 'application/json';
  if (request.etag) headers['If-Match'] = request.etag;
  return headers;
}

/**
 * Provider status → our vocabulary.
 *
 * 410 is the important one: it is how Google says a `syncToken` has aged out,
 * and the caller must respond by discarding the cursor and doing a full
 * resync rather than by retrying.
 */
function translate(
  status: number,
  reason: string | null,
  operation: GoogleRequestOperation,
): EdgeError {
  switch (status) {
    case 401:
      return new EdgeError('PROVIDER_AUTH_EXPIRED', 'Reconnect your Google account.', 401);
    case 403:
      return new EdgeError('NOT_AUTHORIZED', 'Google denied access to that calendar.', 403);
    case 404:
      return new EdgeError('NOT_FOUND', 'That calendar or event no longer exists in Google.', 404);
    case 409:
    case 412:
      return new EdgeError('EVENT_PROVIDER_CONFLICT', 'That event changed in Google.', 409);
    case 410:
      return operation === 'sync'
        ? new EdgeError('PROVIDER_SYNC_CURSOR_INVALID', 'The sync cursor expired.', 410)
        : new EdgeError('UNKNOWN', 'Google rejected the request.', 502);
    default:
      // The reason string is a Google enum ("notFound", "rateLimitExceeded"),
      // never user content, so it is safe to log — but it is not returned.
      console.error(JSON.stringify({ code: 'GOOGLE_HTTP_ERROR', status, reason }));
      return new EdgeError('UNKNOWN', 'Google rejected the request.', 502);
  }
}

/** Read only the machine-readable reason, never the message or payload. */
async function safeReadError(response: Response): Promise<string | null> {
  try {
    const parsed = googleApiErrorSchema.safeParse(await response.json());
    if (!parsed.success) return null;
    return parsed.data.error?.errors?.[0]?.reason ?? parsed.data.error?.status ?? null;
  } catch {
    return null;
  }
}

function isRateLimit(reason: string | null): boolean {
  return (
    reason === 'rateLimitExceeded' ||
    reason === 'userRateLimitExceeded' ||
    reason === 'RESOURCE_EXHAUSTED'
  );
}

async function backoff(
  attempt: number,
  retryAfter: string | null,
  now: () => number,
  random: () => number,
  sleep: (milliseconds: number) => Promise<void>,
): Promise<void> {
  const hinted = retryAfter === null ? null : parseRetryAfter(retryAfter, now());
  // Jitter matters here: several calendars for one account tend to fail
  // together, and un-jittered backoff would have them all retry in lockstep.
  const delay =
    hinted !== null ? Math.min(hinted, 8_000) : 2 ** (attempt - 1) * 250 + random() * 250;

  await sleep(delay);
}

/** Retry-After is either delta-seconds or an HTTP-date. */
function parseRetryAfter(value: string, now: number): number | null {
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed);
    return Number.isFinite(seconds) ? seconds * 1000 : null;
  }

  if (!/[A-Za-z]/.test(trimmed)) return null;
  const timestamp = Date.parse(trimmed);
  return Number.isFinite(timestamp) ? Math.max(timestamp - now, 0) : null;
}

async function defaultSleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}
