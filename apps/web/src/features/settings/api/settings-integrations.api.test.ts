import { describe, expect, it, beforeEach, vi } from 'vitest';

const invokeMock = vi.hoisted(() => vi.fn());
const fromMock = vi.hoisted(() => vi.fn());
const selectMock = vi.hoisted(() => vi.fn());

vi.mock('../../../lib/supabase/client', () => ({
  supabase: {
    functions: { invoke: invokeMock },
    from: fromMock,
  },
}));

import {
  fetchProviderCalendars,
  fetchSyncHealth,
  setCalendarImported,
  startProviderConnect,
  syncConnection,
} from './settings.api';

const ACCOUNT_ID = '11111111-1111-1111-1111-111111111111';
const CALENDAR_ID = '22222222-2222-2222-2222-222222222222';

beforeEach(() => {
  invokeMock.mockReset();
  fromMock.mockReset();
  selectMock.mockReset();
  fromMock.mockReturnValue({ select: selectMock });
});

describe('web integration API contracts', () => {
  it('starts browser OAuth with the explicit web return target', async () => {
    invokeMock.mockResolvedValue({
      data: { authorizationUrl: 'https://accounts.example/authorize?state=opaque' },
      error: null,
    });

    await expect(startProviderConnect('google')).resolves.toBe(
      'https://accounts.example/authorize?state=opaque',
    );
    expect(invokeMock).toHaveBeenCalledWith('oauth-google-start', {
      body: { returnTarget: 'web' },
    });
  });

  it('validates provider calendar responses and rejects malformed entries', async () => {
    invokeMock.mockResolvedValue({
      data: {
        calendars: [
          {
            providerCalendarId: 'primary',
            name: 'Work',
            color: '#3366FF',
            isPrimary: true,
            isReadOnly: false,
            timezone: 'America/New_York',
            isImported: false,
            calendarId: null,
            isVisible: true,
          },
        ],
      },
      error: null,
    });

    await expect(fetchProviderCalendars(ACCOUNT_ID)).resolves.toHaveLength(1);

    invokeMock.mockResolvedValue({
      data: { calendars: [{ providerCalendarId: 'primary', name: '' }] },
      error: null,
    });
    await expect(fetchProviderCalendars(ACCOUNT_ID)).rejects.toThrow();
  });

  it('sends the import toggle shape and parses the safe result', async () => {
    invokeMock.mockResolvedValue({
      data: { calendarId: CALENDAR_ID, syncing: true },
      error: null,
    });

    await expect(
      setCalendarImported({
        providerAccountId: ACCOUNT_ID,
        providerCalendarId: 'primary',
        imported: true,
      }),
    ).resolves.toEqual({ calendarId: CALENDAR_ID, syncing: true });
    expect(invokeMock).toHaveBeenCalledWith('integrations-import', {
      body: {
        providerAccountId: ACCOUNT_ID,
        providerCalendarId: 'primary',
        imported: true,
      },
    });
  });

  it('maps the client-safe health view and preserves stable function error codes', async () => {
    selectMock.mockResolvedValue({
      data: [
        {
          calendar_id: CALENDAR_ID,
          provider_account_id: ACCOUNT_ID,
          provider: 'microsoft',
          account_status: 'active',
          last_full_sync_at: '2026-09-08T10:00:00.000Z',
          last_incremental_sync_at: null,
          webhook_expires_at: null,
          needs_full_resync: false,
          has_error: false,
          retry_count: 0,
        },
      ],
      error: null,
    });
    await expect(fetchSyncHealth()).resolves.toMatchObject([
      {
        calendarId: CALENDAR_ID,
        provider: 'microsoft',
        lastFullSyncAt: '2026-09-08T10:00:00.000Z',
      },
    ]);
    expect(fromMock).toHaveBeenCalledWith('calendar_sync_health');

    invokeMock.mockResolvedValue({
      data: null,
      error: {
        context: new Response(
          JSON.stringify({
            error: { code: 'PROVIDER_AUTH_EXPIRED', message: 'Reconnect your calendar account.' },
          }),
          { status: 401 },
        ),
      },
    });
    await expect(syncConnection(ACCOUNT_ID)).rejects.toMatchObject({
      code: 'PROVIDER_AUTH_EXPIRED',
    });
  });
});
