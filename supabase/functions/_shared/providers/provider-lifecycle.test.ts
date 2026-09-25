// deno-lint-ignore-file require-await -- async stubs implement Promise-returning dependency interfaces.
import { assertEquals, assertRejects } from 'jsr:@std/assert@^1.0.0';

import { EdgeError } from '../errors/index.ts';
import { createGoogleClient, type GoogleFetch } from './google/client.ts';
import { createGoogleProvider } from './google/provider.ts';
import { createMicrosoftClient, type MicrosoftFetch } from './microsoft/client.ts';
import { createMicrosoftProvider } from './microsoft/provider.ts';
import {
  jsonResponse,
  responseWithHeaders,
  ScriptedHttpTransport,
} from '../test-support/provider-lifecycle.ts';
import type { ProviderContext, ProviderEventInput } from './types.ts';

const NOW = Date.parse('2026-01-01T00:00:00.000Z');
const context: ProviderContext = {
  providerAccountId: '11111111-1111-1111-1111-111111111111',
  userId: '22222222-2222-2222-2222-222222222222',
  accessToken: 'dummy-access-token',
};

Deno.test(
  'real provider adapters converge calendar discovery through paginated transports',
  async () => {
    const transport = new ScriptedHttpTransport();
    transport.respond(
      {
        method: 'GET',
        url: 'https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250&showHidden=false',
      },
      jsonResponse({
        items: [
          {
            id: 'google-work',
            summary: 'Work',
            primary: true,
            accessRole: 'owner',
            timeZone: 'America/New_York',
            backgroundColor: '#123abc',
          },
          { id: 'google-removed', summary: 'Gone', deleted: true },
        ],
        nextPageToken: 'google-page-2',
      }),
    );
    transport.respond(
      {
        method: 'GET',
        url: 'https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250&showHidden=false&pageToken=google-page-2',
      },
      jsonResponse({
        items: [{ id: 'google-read', summary: 'Holidays', accessRole: 'reader' }],
      }),
    );
    transport.respond(
      { method: 'GET', url: 'https://graph.microsoft.com/v1.0/me/calendars?$top=250' },
      jsonResponse({
        value: [
          {
            id: 'microsoft-work',
            name: 'Work',
            isDefaultCalendar: true,
            canEdit: true,
            hexColor: '#123abc',
            timeZone: 'Eastern Standard Time',
          },
        ],
        '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/calendars?$skiptoken=page-2',
      }),
    );
    transport.respond(
      { method: 'GET', url: 'https://graph.microsoft.com/v1.0/me/calendars?$skiptoken=page-2' },
      jsonResponse({
        value: [{ id: 'microsoft-read', name: 'Holidays', canEdit: false }],
      }),
    );

    const google = createGoogleProvider({
      fetch: googleTransport(transport),
      now: () => NOW,
      randomUUID: () => 'google-channel',
      randomToken: () => 'google-token',
    });
    const microsoft = createMicrosoftProvider({
      fetch: microsoftTransport(transport),
      now: () => NOW,
    });

    assertEquals(await google.listCalendars(context), [
      {
        providerCalendarId: 'google-work',
        name: 'Work',
        color: '#123abc',
        isPrimary: true,
        isReadOnly: false,
        timezone: 'America/New_York',
      },
      {
        providerCalendarId: 'google-read',
        name: 'Holidays',
        color: '#6E8BFF',
        isPrimary: false,
        isReadOnly: true,
        timezone: null,
      },
    ]);
    assertEquals(await microsoft.listCalendars(context), [
      {
        providerCalendarId: 'microsoft-work',
        name: 'Work',
        color: '#123abc',
        isPrimary: true,
        isReadOnly: false,
        timezone: 'America/New_York',
      },
      {
        providerCalendarId: 'microsoft-read',
        name: 'Holidays',
        color: '#6E8BFF',
        isPrimary: false,
        isReadOnly: true,
        timezone: null,
      },
    ]);

    assertEquals(transport.requests.length, 4);
    assertEquals(transport.requests[0]?.headers.authorization, 'Bearer dummy-access-token');
    transport.assertExhausted();
  },
);

Deno.test('real adapters reject malformed provider payloads with safe errors', async () => {
  const googleHttp = new ScriptedHttpTransport();
  googleHttp.respond(
    {
      method: 'GET',
      url: 'https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250&showHidden=false',
    },
    jsonResponse({ items: [{ id: 42, summary: 'private provider detail' }] }),
  );
  const google = createGoogleProvider({ fetch: googleTransport(googleHttp) });
  const googleError = await assertRejects(() => google.listCalendars(context), EdgeError);
  assertEquals(googleError.code, 'UNKNOWN');
  assertEquals(googleError.message.includes('private provider detail'), false);
  googleHttp.assertExhausted();

  const microsoftHttp = new ScriptedHttpTransport();
  microsoftHttp.respond(
    { method: 'GET', url: 'https://graph.microsoft.com/v1.0/me/calendars?$top=250' },
    jsonResponse({ value: [{ id: 42, name: 'private provider detail' }] }),
  );
  const microsoft = createMicrosoftProvider({ fetch: microsoftTransport(microsoftHttp) });
  const microsoftError = await assertRejects(() => microsoft.listCalendars(context), EdgeError);
  assertEquals(microsoftError.code, 'UNKNOWN');
  assertEquals(microsoftError.message.includes('private provider detail'), false);
  microsoftHttp.assertExhausted();
});

Deno.test(
  'real adapters preserve paginated cursors, normalized changes, and tombstones',
  async () => {
    const transport = new ScriptedHttpTransport();
    transport.respond(
      {
        method: 'GET',
        url: /^https:\/\/www\.googleapis\.com\/calendar\/v3\/calendars\/google-work\/events\?(?!.*syncToken)/,
      },
      jsonResponse({
        timeZone: 'America/New_York',
        items: [
          googleEvent('google-timed', {
            summary: 'Standup',
            start: { dateTime: '2026-01-02T09:00:00-05:00', timeZone: 'America/New_York' },
            end: { dateTime: '2026-01-02T09:30:00-05:00', timeZone: 'America/New_York' },
          }),
          googleEvent('google-day', {
            summary: 'Holiday',
            start: { date: '2026-01-15' },
            end: { date: '2026-01-16' },
          }),
        ],
        nextPageToken: 'google-events-page-2',
      }),
      jsonResponse({
        items: [
          googleEvent('google-series', {
            summary: 'Weekly review',
            start: { dateTime: '2026-01-06T14:00:00Z', timeZone: 'UTC' },
            end: { dateTime: '2026-01-06T15:00:00Z', timeZone: 'UTC' },
            recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=TU'],
          }),
        ],
        nextSyncToken: 'google-cursor-1',
      }),
    );
    transport.respond(
      {
        method: 'GET',
        url: /^https:\/\/www\.googleapis\.com\/calendar\/v3\/calendars\/google-work\/events\?.*syncToken=google-cursor-1/,
      },
      jsonResponse({
        timeZone: 'America/New_York',
        items: [
          googleEvent('google-changed', {
            summary: 'Moved standup',
            start: { dateTime: '2026-01-02T10:00:00-05:00', timeZone: 'America/New_York' },
            end: { dateTime: '2026-01-02T10:30:00-05:00', timeZone: 'America/New_York' },
          }),
          googleEvent('google-deleted', { status: 'cancelled' }),
        ],
        nextSyncToken: 'google-cursor-2',
      }),
    );

    transport.respond(
      {
        method: 'GET',
        url: /^https:\/\/graph\.microsoft\.com\/v1\.0\/me\/calendars\/microsoft-work\/calendarView\/delta\?startDateTime=/,
      },
      jsonResponse({
        value: [
          microsoftEvent('microsoft-timed', {
            subject: 'Standup',
            start: { dateTime: '2026-01-02T09:00:00.0000000', timeZone: 'UTC' },
            end: { dateTime: '2026-01-02T09:30:00.0000000', timeZone: 'UTC' },
          }),
          microsoftEvent('microsoft-day', {
            subject: 'Holiday',
            isAllDay: true,
            start: { dateTime: '2026-01-15T00:00:00.0000000', timeZone: 'Eastern Standard Time' },
            end: { dateTime: '2026-01-16T00:00:00.0000000', timeZone: 'Eastern Standard Time' },
          }),
        ],
        '@odata.nextLink':
          'https://graph.microsoft.com/v1.0/me/calendars/microsoft-work/calendarView/delta?$skiptoken=page-2',
      }),
    );
    transport.respond(
      {
        method: 'GET',
        url: 'https://graph.microsoft.com/v1.0/me/calendars/microsoft-work/calendarView/delta?$skiptoken=page-2',
      },
      jsonResponse({
        value: [
          microsoftEvent('microsoft-series', {
            subject: 'Weekly review',
            type: 'seriesMaster',
            start: { dateTime: '2026-01-06T14:00:00.0000000', timeZone: 'UTC' },
            end: { dateTime: '2026-01-06T15:00:00.0000000', timeZone: 'UTC' },
            recurrence: {
              pattern: { type: 'weekly', interval: 1, daysOfWeek: ['tuesday'] },
              range: { type: 'noEnd', startDate: '2026-01-06', recurrenceTimeZone: 'UTC' },
            },
          }),
        ],
        '@odata.deltaLink':
          'https://graph.microsoft.com/v1.0/me/calendars/microsoft-work/calendarView/delta?$deltatoken=microsoft-cursor-1',
      }),
    );
    transport.respond(
      {
        method: 'GET',
        url: 'https://graph.microsoft.com/v1.0/me/calendars/microsoft-work/calendarView/delta?$deltatoken=microsoft-cursor-1',
      },
      jsonResponse({
        value: [
          microsoftEvent('microsoft-changed', {
            subject: 'Moved standup',
            start: { dateTime: '2026-01-02T10:00:00.0000000', timeZone: 'UTC' },
            end: { dateTime: '2026-01-02T10:30:00.0000000', timeZone: 'UTC' },
          }),
          microsoftEvent('microsoft-deleted', { '@removed': { reason: 'deleted' } }),
        ],
        '@odata.deltaLink':
          'https://graph.microsoft.com/v1.0/me/calendars/microsoft-work/calendarView/delta?$deltatoken=microsoft-cursor-2',
      }),
    );

    const google = createGoogleProvider({ fetch: googleTransport(transport) });
    const microsoft = createMicrosoftProvider({ fetch: microsoftTransport(transport) });
    const window = { from: '2026-01-01T00:00:00.000Z', to: '2026-02-01T00:00:00.000Z' };

    const googleInitial = await google.initialSync(context, 'google-work', window);
    const googleIncremental = await google.incrementalSync(
      context,
      'google-work',
      'google-cursor-1',
    );
    const microsoftInitial = await microsoft.initialSync(context, 'microsoft-work', window);
    const microsoftIncremental = await microsoft.incrementalSync(
      context,
      'microsoft-work',
      'https://graph.microsoft.com/v1.0/me/calendars/microsoft-work/calendarView/delta?$deltatoken=microsoft-cursor-1',
    );

    assertEquals(googleInitial.cursor, 'google-cursor-1');
    assertEquals(
      googleInitial.events.map((event) => event.providerEventId),
      ['google-timed', 'google-day', 'google-series'],
    );
    assertEquals(googleInitial.events[0]?.startAt, '2026-01-02T14:00:00.000Z');
    assertEquals(googleInitial.events[1]?.allDay, true);
    assertEquals(googleInitial.events[2]?.recurrenceRule, 'FREQ=WEEKLY;BYDAY=TU');
    assertEquals(googleIncremental.cursor, 'google-cursor-2');
    assertEquals(googleIncremental.events[1]?.deleted, true);

    assertEquals(
      microsoftInitial.cursor,
      'https://graph.microsoft.com/v1.0/me/calendars/microsoft-work/calendarView/delta?$deltatoken=microsoft-cursor-1',
    );
    assertEquals(
      microsoftInitial.events.map((event) => event.providerEventId),
      ['microsoft-timed', 'microsoft-day', 'microsoft-series'],
    );
    assertEquals(microsoftInitial.events[1]?.startAt, '2026-01-15T05:00:00.000Z');
    assertEquals(microsoftInitial.events[2]?.recurrenceRule, 'FREQ=WEEKLY;BYDAY=TU');
    assertEquals(
      microsoftIncremental.cursor,
      'https://graph.microsoft.com/v1.0/me/calendars/microsoft-work/calendarView/delta?$deltatoken=microsoft-cursor-2',
    );
    assertEquals(microsoftIncremental.events[1]?.deleted, true);

    assertEquals(transport.requests.length, 6);
    assertEquals(transport.requests.filter((request) => request.method === 'GET').length, 6);
    transport.assertExhausted();
  },
);

Deno.test(
  'real adapters perform provider-first writes and provider-specific watch lifecycles',
  async () => {
    const transport = new ScriptedHttpTransport();
    let microsoftClientState = '';

    transport.respond(
      {
        method: 'POST',
        url: 'https://www.googleapis.com/calendar/v3/calendars/google-work/events',
      },
      jsonResponse(googleEvent('google-created', { summary: 'Created' })),
    );
    transport.respond(
      {
        method: 'PATCH',
        url: 'https://www.googleapis.com/calendar/v3/calendars/google-work/events/google-created',
      },
      () => jsonResponse(googleEvent('google-created', { summary: 'Updated', etag: '"g-new"' })),
    );
    transport.respond(
      {
        method: 'DELETE',
        url: 'https://www.googleapis.com/calendar/v3/calendars/google-work/events/google-created',
      },
      new Response(null, { status: 204 }),
    );
    transport.respond(
      {
        method: 'POST',
        url: 'https://www.googleapis.com/calendar/v3/calendars/google-work/events/watch',
      },
      (request) => {
        const body = parseJson(request.body);
        assertEquals(body.id, 'google-channel');
        assertEquals(body.token, 'google-token');
        return jsonResponse({
          id: 'google-channel',
          resourceId: 'google-resource',
          expiration: String(NOW + 7 * 24 * 60 * 60 * 1000),
        });
      },
    );
    transport.respond(
      { method: 'POST', url: 'https://www.googleapis.com/calendar/v3/channels/stop' },
      new Response(null, { status: 204 }),
    );

    transport.respond(
      {
        method: 'POST',
        url: 'https://graph.microsoft.com/v1.0/me/calendars/microsoft-work/events',
      },
      (request) => {
        const body = parseJson(request.body);
        assertEquals(body.subject, 'Created');
        microsoftClientState = 'not-a-watch-token';
        return jsonResponse(
          microsoftEvent('microsoft-created', { subject: 'Created', '@odata.etag': 'W/"m-1"' }),
        );
      },
    );
    transport.respond(
      {
        method: 'PATCH',
        url: 'https://graph.microsoft.com/v1.0/me/calendars/microsoft-work/events/microsoft-created',
      },
      (request) => {
        assertEquals(request.headers['if-match'], 'W/"m-old"');
        return jsonResponse(
          microsoftEvent('microsoft-created', { subject: 'Updated', '@odata.etag': 'W/"m-2"' }),
        );
      },
    );
    transport.respond(
      {
        method: 'DELETE',
        url: 'https://graph.microsoft.com/v1.0/me/calendars/microsoft-work/events/microsoft-created',
      },
      new Response(null, { status: 204 }),
    );
    transport.respond(
      { method: 'POST', url: 'https://graph.microsoft.com/v1.0/subscriptions' },
      (request) => {
        const body = parseJson(request.body);
        microsoftClientState = String(body.clientState);
        return jsonResponse({
          id: 'microsoft-subscription',
          resource: '/me/events',
          expirationDateTime: new Date(NOW + 5 * 24 * 60 * 60 * 1000).toISOString(),
          clientState: microsoftClientState,
        });
      },
    );
    transport.respond(
      {
        method: 'PATCH',
        url: 'https://graph.microsoft.com/v1.0/subscriptions/microsoft-subscription',
      },
      () =>
        jsonResponse({
          id: 'microsoft-subscription',
          resource: '/me/events',
          expirationDateTime: new Date(NOW + 6 * 24 * 60 * 60 * 1000).toISOString(),
          clientState: microsoftClientState,
        }),
    );
    transport.respond(
      {
        method: 'DELETE',
        url: 'https://graph.microsoft.com/v1.0/subscriptions/microsoft-subscription',
      },
      new Response(null, { status: 204 }),
    );

    const google = createGoogleProvider({
      fetch: googleTransport(transport),
      now: () => NOW,
      randomUUID: () => 'google-channel',
      randomToken: () => 'google-token',
    });
    const microsoft = createMicrosoftProvider({
      fetch: microsoftTransport(transport),
      now: () => NOW,
    });
    const input = eventInput('Created');

    assertEquals(
      (await google.createEvent(context, 'google-work', input)).providerEventId,
      'google-created',
    );
    assertEquals(
      (
        await google.updateEvent(context, 'google-work', 'google-created', {
          ...input,
          providerEtag: '"g-old"',
        })
      ).title,
      'Updated',
    );
    await google.deleteEvent(context, 'google-work', 'google-created');
    const googleWatch = await google.watch(
      context,
      { scope: 'calendar', providerCalendarId: 'google-work' },
      'https://app.example.com/webhook-google',
    );
    await google.unwatch(context, googleWatch);

    assertEquals(
      (await microsoft.createEvent(context, 'microsoft-work', input)).providerEventId,
      'microsoft-created',
    );
    assertEquals(
      (
        await microsoft.updateEvent(context, 'microsoft-work', 'microsoft-created', {
          ...input,
          providerEtag: 'W/"m-old"',
        })
      ).title,
      'Updated',
    );
    await microsoft.deleteEvent(context, 'microsoft-work', 'microsoft-created');
    const microsoftWatch = await microsoft.watch(
      context,
      { scope: 'account' },
      'https://app.example.com/webhook-microsoft',
    );
    const renewed = await microsoft.renewWatch!(context, microsoftWatch);
    await microsoft.unwatch(context, renewed);

    assertEquals(googleWatch, {
      channelId: 'google-channel',
      resourceId: 'google-resource',
      subscriptionId: null,
      token: 'google-token',
      expiresAt: '2026-01-08T00:00:00.000Z',
    });
    assertEquals(microsoftWatch.subscriptionId, 'microsoft-subscription');
    assertEquals(microsoftWatch.resourceId, null);
    assertEquals(renewed.expiresAt, '2026-01-07T00:00:00.000Z');
    assertEquals(transport.requests.filter((request) => request.method === 'POST').length, 5);
    assertEquals(
      transport.requests.find(
        (request) => request.method === 'PATCH' && request.url.includes('google-work'),
      )?.headers['if-match'],
      '"g-old"',
    );
    transport.assertExhausted();
  },
);

Deno.test(
  'default-deny transport and actual clients make retries deterministic and cursor-specific',
  async () => {
    const transport = new ScriptedHttpTransport();
    const sleeps: number[] = [];
    transport.respond(
      {
        method: 'GET',
        url: 'https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250&showHidden=false',
      },
      responseWithHeaders(503),
      responseWithHeaders(429, { 'Retry-After': '2' }),
      jsonResponse({ items: [{ id: 'google-work', summary: 'Work', accessRole: 'owner' }] }),
    );
    transport.respond(
      {
        method: 'GET',
        url: /^https:\/\/www\.googleapis\.com\/calendar\/v3\/calendars\/google-work\/events\?.*syncToken=old-google-cursor/,
      },
      responseWithHeaders(410),
    );
    transport.respond(
      {
        method: 'POST',
        url: 'https://www.googleapis.com/calendar/v3/calendars/google-work/events',
      },
      responseWithHeaders(503),
    );
    transport.respond(
      {
        method: 'GET',
        url: 'https://graph.microsoft.com/v1.0/me/calendars/microsoft-work/calendarView/delta?$deltatoken=old-microsoft-cursor',
      },
      jsonResponse({ error: { code: 'syncStateNotFound' } }, 410),
    );

    const googleClient = createGoogleClient({
      fetch: transport.fetch,
      now: () => NOW,
      random: () => 0,
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
      },
    });
    const google = createGoogleProvider({
      fetch: googleClient,
      now: () => NOW,
      randomUUID: () => 'google-channel',
      randomToken: () => 'google-token',
    });
    const microsoft = createMicrosoftProvider({
      fetch: microsoftTransport(transport),
      now: () => NOW,
    });

    assertEquals((await google.listCalendars(context))[0]?.providerCalendarId, 'google-work');
    assertEquals(sleeps, [250, 2000]);
    assertEquals(await google.incrementalSync(context, 'google-work', 'old-google-cursor'), {
      events: [],
      cursor: null,
      cursorInvalid: true,
    });
    const unsafeCreateError = await assertRejects(
      () => google.createEvent(context, 'google-work', eventInput('Unsafe create')),
      EdgeError,
    );
    assertEquals(unsafeCreateError.code, 'UNKNOWN');
    assertEquals(
      await microsoft.incrementalSync(
        context,
        'microsoft-work',
        'https://graph.microsoft.com/v1.0/me/calendars/microsoft-work/calendarView/delta?$deltatoken=old-microsoft-cursor',
      ),
      { events: [], cursor: null, cursorInvalid: true },
    );

    assertEquals(transport.requests.length, 6);
    assertEquals(transport.requests.filter((request) => request.method === 'POST').length, 1);
    transport.assertExhausted();

    const unconfigured = new ScriptedHttpTransport();
    await assertRejects(
      () => unconfigured.fetch('https://graph.microsoft.com/v1.0/me/events'),
      Error,
      'Unexpected scripted provider request',
    );
  },
);

function googleTransport(transport: ScriptedHttpTransport): GoogleFetch {
  return createGoogleClient({
    fetch: transport.fetch,
    sleep: async () => undefined,
    random: () => 0,
  });
}

function microsoftTransport(transport: ScriptedHttpTransport): MicrosoftFetch {
  return createMicrosoftClient({ fetch: transport.fetch, sleep: async () => undefined });
}

function googleEvent(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, status: 'confirmed', ...overrides };
}

function microsoftEvent(
  id: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    subject: 'Planning',
    start: { dateTime: '2026-01-02T09:00:00.0000000', timeZone: 'UTC' },
    end: { dateTime: '2026-01-02T10:00:00.0000000', timeZone: 'UTC' },
    isAllDay: false,
    isCancelled: false,
    ...overrides,
  };
}

function eventInput(title: string): ProviderEventInput {
  return {
    title,
    description: null,
    location: null,
    startAt: '2026-01-02T09:00:00.000Z',
    endAt: '2026-01-02T10:00:00.000Z',
    allDay: false,
    timezone: 'UTC',
    recurrenceRule: null,
    alerts: [],
  };
}

function parseJson(value: string | null): Record<string, unknown> {
  if (!value) throw new Error('Expected a scripted JSON request body.');
  return JSON.parse(value) as Record<string, unknown>;
}
