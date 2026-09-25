/**
 * A log-safe description of an unexpected error.
 *
 * `String(error)` is not safe to log: Deno's fetch errors quote the full
 * request URL (Google sync tokens, Microsoft delta links, calendar ids that are
 * email addresses), Zod errors quote the value they rejected, and a library
 * error can echo a header or token. This keeps what is useful for debugging —
 * the error class, a stable code, an HTTP status, and a scrubbed, bounded
 * message — and drops or masks everything that could identify a user or grant
 * access.
 */
export interface SafeErrorDescription {
  name: string;
  code?: string;
  status?: number;
  message?: string;
  issues?: Array<{ code: string; path: string }>;
  cause?: string;
}

const MAX_MESSAGE_LENGTH = 300;
const MAX_ISSUES = 5;
const STABLE_CODE = /^[A-Za-z0-9_.-]{1,64}$/;
const SAFE_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

export function describeError(error: unknown): SafeErrorDescription {
  if (!(error instanceof Error)) {
    // Never serialise an arbitrary thrown value: it may be a whole payload.
    return { name: error === null ? 'null' : typeof error };
  }

  const description: SafeErrorDescription = { name: safeName(error) };
  const record = error as unknown as Record<string, unknown>;

  if (typeof record.code === 'string' && STABLE_CODE.test(record.code)) {
    description.code = record.code;
  }
  if (typeof record.status === 'number' && Number.isInteger(record.status)) {
    description.status = record.status;
  }

  // A Zod-style error's message is its issues serialised, including the
  // rejected input. Keep only which rule failed and where.
  if (Array.isArray(record.issues)) {
    description.issues = record.issues.slice(0, MAX_ISSUES).map(describeIssue);
  } else if (error.message) {
    description.message = redactSensitiveText(error.message);
  }

  if (error.cause instanceof Error) description.cause = safeName(error.cause);

  return description;
}

/** Mask credentials, personal data, and URL query strings in free text. */
export function redactSensitiveText(text: string): string {
  const redacted = text
    // URLs: keep origin and path for context, drop credentials, query, fragment.
    .replace(
      /\b([a-z][a-z0-9+.-]*:\/\/)(?:[^\s/@]*@)?([^\s/?#'"`)]+)([^\s?#'"`)]*)(?:[?#][^\s'"`)]*)?/gi,
      (_match, scheme: string, host: string, path: string) =>
        `${scheme}${host}${redactPathSegments(path)}`,
    )
    // Authorization-style values.
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 [REDACTED]')
    // key=value / key: value pairs whose key names a secret.
    .replace(
      /\b([A-Za-z_-]*(?:token|secret|password|passwd|api[_-]?key|apikey|authorization|code_verifier|client_secret|refresh|signature|cookie)[A-Za-z_-]*)(["']?\s*[:=]\s*["']?)[^\s"'&,;}]+/gi,
      '$1$2[REDACTED]',
    )
    // JWTs and Supabase secret/publishable keys.
    .replace(/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g, '[REDACTED_JWT]')
    .replace(/\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, '[REDACTED_KEY]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[REDACTED_EMAIL]')
    // Anything else that looks like an opaque credential.
    .replace(/[A-Za-z0-9_\-+/=]{40,}/g, '[REDACTED]');

  return redacted.length > MAX_MESSAGE_LENGTH
    ? `${redacted.slice(0, MAX_MESSAGE_LENGTH)}…`
    : redacted;
}

function redactPathSegments(path: string): string {
  // Calendar ids in provider paths are often the owner's email address, and
  // Graph paths can carry opaque ids; keep the route shape only.
  return path.replace(/\/([^/]+)/g, (segment, part: string) =>
    /^[a-z][a-z0-9_.-]{0,40}$/i.test(part) && !part.includes('@') ? segment : '/[id]',
  );
}

function describeIssue(issue: unknown): { code: string; path: string } {
  const record = (issue ?? {}) as Record<string, unknown>;
  const code =
    typeof record.code === 'string' && STABLE_CODE.test(record.code) ? record.code : 'unknown';
  const path = Array.isArray(record.path)
    ? record.path.map((part) => (typeof part === 'number' ? '#' : String(part))).join('.')
    : '';
  return { code, path: redactSensitiveText(path) };
}

function safeName(error: Error): string {
  return SAFE_NAME.test(error.name) ? error.name : 'Error';
}
