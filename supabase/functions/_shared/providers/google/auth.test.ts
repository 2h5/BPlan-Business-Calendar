import { assertEquals, assertRejects } from 'jsr:@std/assert@^1.0.0';

import { EdgeError } from '../../errors/index.ts';
import { ScriptedHttpTransport, jsonResponse } from '../../test-support/provider-lifecycle.ts';

import { createGoogleAuth } from './auth.ts';

const NOW = Date.parse('2026-01-01T00:00:00.000Z');

Deno.test(
  'Google OAuth uses injected transport and preserves refresh-token semantics',
  async () => {
    const transport = new ScriptedHttpTransport();
    transport.respond(
      { method: 'POST', url: 'https://oauth2.googleapis.com/token' },
      jsonResponse({
        access_token: 'dummy-access-token',
        expires_in: 3600,
        refresh_token: 'dummy-refresh-token',
        scope: 'openid email',
      }),
      jsonResponse({ access_token: 'refreshed-access-token', expires_in: 120 }),
    );
    transport.respond(
      { method: 'GET', url: 'https://openidconnect.googleapis.com/v1/userinfo' },
      jsonResponse({ sub: 'google-user', email: 'person@example.com' }),
    );
    transport.respond(
      { method: 'POST', url: 'https://oauth2.googleapis.com/revoke' },
      new Response(null, { status: 204 }),
    );

    const auth = createGoogleAuth({
      fetch: transport.fetch,
      now: () => NOW,
      clientId: 'dummy-client-id',
      clientSecret: 'dummy-client-secret',
    });

    const authorization = new URL(
      auth.authorizationUrl({
        state: 'state-value',
        codeChallenge: 'challenge-value',
        redirectUri: 'https://app.example.com/callback',
      }),
    );
    assertEquals(authorization.searchParams.get('client_id'), 'dummy-client-id');
    assertEquals(authorization.searchParams.get('access_type'), 'offline');
    assertEquals(authorization.searchParams.get('prompt'), 'consent');

    const exchanged = await auth.exchangeCode({
      code: 'code-value',
      codeVerifier: 'verifier-value',
      redirectUri: 'https://app.example.com/callback',
    });
    assertEquals(exchanged, {
      accessToken: 'dummy-access-token',
      refreshToken: 'dummy-refresh-token',
      expiresAt: '2026-01-01T00:59:00.000Z',
      scopes: ['openid', 'email'],
    });

    const exchangeForm = new URLSearchParams(transport.requests[0]?.body ?? '');
    assertEquals(exchangeForm.get('client_secret'), 'dummy-client-secret');
    assertEquals(exchangeForm.get('code_verifier'), 'verifier-value');

    assertEquals(await auth.refresh('dummy-refresh-token'), {
      accessToken: 'refreshed-access-token',
      refreshToken: null,
      expiresAt: '2026-01-01T00:01:00.000Z',
      scopes: [],
    });
    assertEquals(await auth.identify('refreshed-access-token'), {
      providerUserId: 'google-user',
      email: 'person@example.com',
    });
    await auth.revoke('dummy-refresh-token');

    assertEquals(transport.requests[2]?.headers.authorization, 'Bearer refreshed-access-token');
    assertEquals(transport.requests.length, 4);
    transport.assertExhausted();
  },
);

Deno.test('Google OAuth maps invalid grants and malformed token responses safely', async () => {
  const invalidGrantTransport = new ScriptedHttpTransport();
  invalidGrantTransport.respond(
    { method: 'POST', url: 'https://oauth2.googleapis.com/token' },
    jsonResponse({ error: 'invalid_grant', error_description: 'private provider detail' }, 400),
  );
  const auth = createGoogleAuth({
    fetch: invalidGrantTransport.fetch,
    clientId: 'dummy-client-id',
    clientSecret: 'dummy-client-secret',
  });

  const invalidGrant = await assertRejects(() => auth.refresh('dummy-refresh-token'), EdgeError);
  assertEquals(invalidGrant.code, 'PROVIDER_AUTH_EXPIRED');
  assertEquals(invalidGrant.message.includes('private provider detail'), false);
  invalidGrantTransport.assertExhausted();

  const malformedTransport = new ScriptedHttpTransport();
  malformedTransport.respond(
    { method: 'POST', url: 'https://oauth2.googleapis.com/token' },
    jsonResponse({ access_token: 'access-token' }),
  );
  const malformedAuth = createGoogleAuth({
    fetch: malformedTransport.fetch,
    clientId: 'dummy-client-id',
    clientSecret: 'dummy-client-secret',
  });
  const malformed = await assertRejects(
    () => malformedAuth.refresh('dummy-refresh-token'),
    EdgeError,
  );
  assertEquals(malformed.code, 'UNKNOWN');
  malformedTransport.assertExhausted();

  const malformedProfileTransport = new ScriptedHttpTransport();
  malformedProfileTransport.respond(
    { method: 'GET', url: 'https://openidconnect.googleapis.com/v1/userinfo' },
    new Response('private provider body', { status: 200 }),
  );
  const malformedProfileAuth = createGoogleAuth({
    fetch: malformedProfileTransport.fetch,
  });
  const malformedProfile = await assertRejects(
    () => malformedProfileAuth.identify('dummy-access-token'),
    EdgeError,
  );
  assertEquals(malformedProfile.code, 'UNKNOWN');
  assertEquals(malformedProfile.message.includes('private provider body'), false);
  malformedProfileTransport.assertExhausted();
});
