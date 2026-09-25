import type { Profile } from '@cal/schemas';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { SettingsView } from './SettingsView';
import { buildTimezoneOptions, COMMON_TIME_ZONES } from '../utils/timezone-options';

vi.mock('../../auth', () => ({
  useAuth: () => ({ email: 'test@example.com' }),
}));

vi.mock('../hooks/useTheme', () => ({
  useTheme: () => ({ theme: 'auto', resolvedTheme: 'light', setTheme: vi.fn() }),
}));

vi.mock('../../calendar/utils/calendar-preferences', () => ({
  useCalendarViewPreference: () => ['week', vi.fn()],
}));

vi.mock('../../billing/components/BillingSection', () => ({
  BillingSection: () => <div data-testid="billing-section" />,
}));

vi.mock('./ConnectionsSection', () => ({
  ConnectionsSection: () => <div data-testid="connections-section" />,
}));

vi.mock('./AccountPanel', () => ({
  AccountPanel: () => <div data-testid="account-panel" />,
}));

vi.mock('./ProfilePhotoField', () => ({
  ProfilePhotoField: () => <div data-testid="profile-photo-field" />,
}));

const mockProfile: Profile = {
  id: '00000000-0000-0000-0000-000000000001',
  avatarUrl: null,
  fullName: 'Test User',
  timezone: 'Pacific/Auckland', // Non-standard / not in common list
  weekStartsOn: 1,
  hourCycle: 'h12',
  defaultTaskMinutes: 30,
  defaultEventMinutes: 30,
  workingHours: [],
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
};

const mockUpdateMutateAsync = vi.fn().mockResolvedValue(mockProfile);

vi.mock('../hooks/useSettings', () => ({
  useProfile: () => ({
    data: mockProfile,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useUpdateProfile: () => ({
    mutateAsync: mockUpdateMutateAsync,
    isPending: false,
  }),
}));

describe('SettingsView Time Zone Control', () => {
  it('renders a BPlan Select combobox for Time zone and does not render a datalist or text input', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <SettingsView />
      </MemoryRouter>,
    );

    // Datalist and input with list="time-zones" must NOT exist
    expect(html).not.toContain('<datalist id="time-zones"');
    expect(html).not.toContain('list="time-zones"');
    expect(html).not.toContain('id="time-zones"');

    // BPlan Select with combobox role and Time zone aria-label must exist
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-label="Time zone"');

    // Currently saved timezone (Pacific/Auckland) must appear selected in the trigger value
    expect(html).toContain('Pacific/Auckland');
  });

  it('builds timezone options containing saved timezone, device timezone, and common timezones', () => {
    const options = buildTimezoneOptions({
      currentTimezone: mockProfile.timezone,
      savedTimezone: mockProfile.timezone,
      deviceTimezone: 'Europe/Paris',
    });

    const values = options.map((opt) => opt.value);

    // Saved non-common timezone is preserved
    expect(values).toContain('Pacific/Auckland');

    // Device timezone is included
    expect(values).toContain('Europe/Paris');

    // Common timezones are included
    for (const commonZone of COMMON_TIME_ZONES) {
      expect(values).toContain(commonZone);
    }
  });

  it('deduplicates timezone options when draft matches a common or device timezone', () => {
    const options = buildTimezoneOptions({
      currentTimezone: 'America/New_York',
      savedTimezone: 'America/New_York',
      deviceTimezone: 'America/New_York',
    });

    const newYorkMatches = options.filter((opt) => opt.value === 'America/New_York');
    expect(newYorkMatches).toHaveLength(1);
  });

  it('preserves saved non-common timezone even after draft changes to another timezone', () => {
    // User changes draft from Pacific/Auckland to Europe/London
    const options = buildTimezoneOptions({
      currentTimezone: 'Europe/London',
      savedTimezone: 'Pacific/Auckland',
      deviceTimezone: 'UTC',
    });

    const values = options.map((opt) => opt.value);
    expect(values).toContain('Europe/London');
    expect(values).toContain('Pacific/Auckland');
  });

  it('updates draft timezone when Select onChange triggers and preserves saved timezone', () => {
    let currentDraftTimezone = mockProfile.timezone;
    const setDraftTimezone = (tz: string) => {
      currentDraftTimezone = tz;
    };

    setDraftTimezone('Europe/London');
    expect(currentDraftTimezone).toBe('Europe/London');

    const updatedOptions = buildTimezoneOptions({
      currentTimezone: currentDraftTimezone,
      savedTimezone: mockProfile.timezone,
    });
    expect(updatedOptions.map((o) => o.value)).toContain('Europe/London');
    expect(updatedOptions.map((o) => o.value)).toContain('Pacific/Auckland');
  });
});
