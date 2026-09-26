import { assert, assertEquals, assertFalse } from 'jsr:@std/assert@^1.0.0';
import { z } from 'zod';

import { describeError, redactSensitiveText } from './safe-error.ts';
import { EdgeError } from './index.ts';

// Built at run time so no credential-shaped literal lives in the repository.
const jwt = ['eyJhbGciOiJIUzI1NiJ9', 'eyJyb2xlIjoic2VydmljZV9yb2xlIn0', 'c2lnbmF0dXJl'].join('.');
const opaque = 'x'.repeat(24) + 'Y'.repeat(24);

Deno.test('fetch errors keep the host and route but drop query strings and ids', () => {
  const error = new TypeError(
    'error sending request for url (https://www.googleapis.com/calendar/v3/calendars/' +
      'alice%40example.com/events?syncToken=CPDAlvWDx70CEPDAlvWDx70CGAU&maxResults=250): ' +
      'connection reset',
  );
  const logged = JSON.stringify(describeError(error));

  assert(logged.includes('https://www.googleapis.com/calendar/v3/calendars/[id]/events'));
  assert(logged.includes('connection reset'));
  assert(logged.includes('"name":"TypeError"'));
  assertFalse(logged.includes('syncToken'));
  assertFalse(logged.includes('CPDAlvWDx70'));
  assertFalse(logged.includes('alice'));
});

Deno.test('credentials in free text are masked', () => {
  const text = [
    `Authorization: Bearer ${jwt}`,
    `refresh_token=${opaque}`,
    `{"client_secret":"shh-${opaque}"}`,
    `apikey ${jwt}`,
    ['sb', 'secret', 'z'.repeat(32)].join('_'),
    'https://user:pass@db.example.com:5432/postgres',
    'owner bob@example.org',
    `code_verifier=${'v'.repeat(10)}`,
  ].join(' | ');
  const redacted = redactSensitiveText(text);

  for (const leaked of [jwt, opaque, 'shh-', 'z'.repeat(32), 'user:pass', 'bob@', 'v'.repeat(10)]) {
    assertFalse(redacted.includes(leaked), `leaked ${leaked.slice(0, 12)} in ${redacted}`);
  }
  assert(redacted.includes('https://db.example.com:5432/postgres'));
});

Deno.test('Zod errors keep issue codes and paths, never the rejected input', () => {
  const parsed = z
    .object({
      status: z.enum(['confirmed']),
      attendees: z.array(z.string().email()),
    })
    .safeParse({
      status: 'Secret board meeting',
      attendees: ['carol@example.com', 'nope'],
    });
  assertFalse(parsed.success);

  const described = describeError(parsed.error);
  const logged = JSON.stringify(described);

  assertEquals(described.name, 'ZodError');
  assertEquals(described.message, undefined);
  assertEquals(
    described.issues?.map((issue) => issue.path),
    ['status', 'attendees.#'],
  );
  assertFalse(logged.includes('Secret board meeting'));
  assertFalse(logged.includes('carol'));
});

Deno.test('stable codes, statuses, and cause class are preserved', () => {
  const described = describeError(new EdgeError('PROVIDER_RATE_LIMITED', 'Slow down.', 429));
  assertEquals(described, {
    name: 'EdgeError',
    code: 'PROVIDER_RATE_LIMITED',
    status: 429,
    message: 'Slow down.',
  });

  const withCause = new Error('outer', {
    cause: new RangeError(`inner ${jwt}`),
  });
  assertEquals(describeError(withCause).cause, 'RangeError');
  assertFalse(JSON.stringify(describeError(withCause)).includes(jwt));

  const odd = Object.assign(new Error('x'), { code: `refresh ${opaque}` });
  assertEquals(describeError(odd).code, undefined);
});

Deno.test('non-Error throwables are reduced to their type', () => {
  assertEquals(describeError({ access_token: opaque }), { name: 'object' });
  assertEquals(describeError(`token ${opaque}`), { name: 'string' });
  assertEquals(describeError(null), { name: 'null' });
});

Deno.test('messages are bounded', () => {
  const described = describeError(new Error('a '.repeat(1000)));
  assert((described.message?.length ?? 0) <= 301);
});
