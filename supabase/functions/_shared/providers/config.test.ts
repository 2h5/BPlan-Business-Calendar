import { assertEquals, assertThrows } from 'jsr:@std/assert@^1.0.0';

import { type OAuthReturnTarget, oauthReturnUrlFor, parseOAuthReturnTarget } from './config.ts';

Deno.test('omitted OAuth return targets preserve the mobile destination', () => {
  assertEquals(parseOAuthReturnTarget(undefined), 'mobile');
  assertEquals(
    oauthReturnUrlFor('mobile', {
      mobile: 'calendarapp://settings/integrations',
    }),
    'calendarapp://settings/integrations',
  );
});

Deno.test('accepts the web target and uses only its configured server URL', () => {
  const target: OAuthReturnTarget = parseOAuthReturnTarget('web');
  assertEquals(
    oauthReturnUrlFor(target, {
      mobile: 'calendarapp://settings/integrations',
      web: 'https://web.example/settings/integrations/callback',
    }),
    'https://web.example/settings/integrations/callback',
  );
});

Deno.test('rejects malformed or unsupported return targets', () => {
  assertThrows(() => parseOAuthReturnTarget('https://attacker.example/callback'));
  assertThrows(() => parseOAuthReturnTarget('desktop'));
  assertThrows(() => parseOAuthReturnTarget(null));
});

Deno.test('requires a valid HTTP(S) web return URL', () => {
  assertThrows(() => oauthReturnUrlFor('web', { mobile: 'calendarapp://settings/integrations' }));
  assertThrows(() =>
    oauthReturnUrlFor('web', {
      mobile: 'calendarapp://settings/integrations',
      web: 'javascript:alert(1)',
    }),
  );
});
