import { assertEquals, assertFalse, assertThrows } from 'jsr:@std/assert@^1.0.0';

import { requireEnv } from './env.ts';
import { EdgeError } from './errors/index.ts';

Deno.test('a missing server setting is named in logs but not to the caller', () => {
  const logged: string[] = [];
  const original = console.error;
  console.error = (line: string) => logged.push(line);
  try {
    const error = assertThrows(
      () => requireEnv('GOOGLE_CLIENT_SECRET', () => undefined),
      EdgeError,
    );
    assertEquals(error.status, 500);
    assertFalse(error.message.includes('GOOGLE_CLIENT_SECRET'));
    assertEquals(JSON.parse(logged[0] ?? '{}').name, 'GOOGLE_CLIENT_SECRET');
  } finally {
    console.error = original;
  }
});

Deno.test('an empty server setting is treated as missing', () => {
  const original = console.error;
  console.error = () => undefined;
  try {
    assertThrows(() => requireEnv('X', () => ''), EdgeError);
  } finally {
    console.error = original;
  }
  assertEquals(
    requireEnv('X', () => 'set'),
    'set',
  );
});
