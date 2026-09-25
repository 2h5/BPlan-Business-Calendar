import { assertEquals, assertThrows } from 'jsr:@std/assert@^1.0.0';

import { EdgeError } from '../errors/index.ts';
import { readAllPages, requireCronSecret, SYNC_CRON_SECRET_HEADER } from './cron.ts';

const request = (secret?: string) =>
  new Request('https://example.test/sync-cron', {
    method: 'POST',
    headers: secret === undefined ? {} : { [SYNC_CRON_SECRET_HEADER]: secret },
  });

function edgeError(fn: () => void): EdgeError {
  const error = assertThrows(fn);
  if (!(error instanceof EdgeError)) throw new Error('expected an EdgeError');
  return error;
}

Deno.test('sync cron refuses to run when its secret is not configured', () => {
  const error = edgeError(() => requireCronSecret(request('anything'), undefined));
  assertEquals([error.code, error.status], ['NOT_AUTHORIZED', 503]);

  const empty = edgeError(() => requireCronSecret(request(''), ''));
  assertEquals(empty.status, 503);
});

Deno.test('sync cron rejects a missing, wrong, or prefix secret', () => {
  for (const supplied of [undefined, '', 'wrong', 'expected-secre', 'expected-secret-and-more']) {
    const error = edgeError(() => requireCronSecret(request(supplied), 'expected-secret'));
    assertEquals([error.code, error.status], ['NOT_AUTHORIZED', 403]);
  }
});

Deno.test('sync cron accepts the configured secret', () => {
  requireCronSecret(request('expected-secret'), 'expected-secret');
});

Deno.test('readAllPages reads past the first page instead of stopping at a cap', async () => {
  const rows = Array.from({ length: 1_203 }, (_, index) => ({ id: index }));
  const ranges: Array<[number, number]> = [];

  const result = await readAllPages(async (from, to) => {
    ranges.push([from, to]);
    return { data: rows.slice(from, to + 1), error: null };
  }, 500);

  assertEquals(result.error, null);
  assertEquals(result.data.length, 1_203);
  assertEquals(result.data.at(-1), { id: 1_202 });
  assertEquals(ranges, [
    [0, 499],
    [500, 999],
    [1_000, 1_499],
  ]);
});

Deno.test(
  'readAllPages issues one extra read when the total is an exact page multiple',
  async () => {
    let reads = 0;
    const result = await readAllPages(async (from, to) => {
      reads += 1;
      return { data: from < 4 ? [from, from + 1].filter((value) => value <= to) : [], error: null };
    }, 2);

    assertEquals(result.data, [0, 1, 2, 3]);
    assertEquals(reads, 3);
  },
);

Deno.test('readAllPages stops and reports the first page error', async () => {
  const failure = { code: 'XX000' };
  let reads = 0;
  const result = await readAllPages(async (from) => {
    reads += 1;
    return from === 0 ? { data: [1, 2], error: null } : { data: null, error: failure };
  }, 2);

  assertEquals(result.error, failure);
  assertEquals(reads, 2);
});
