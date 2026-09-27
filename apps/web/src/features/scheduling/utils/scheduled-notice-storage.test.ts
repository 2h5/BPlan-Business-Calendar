import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BANNER_TOTAL_DURATION_MS,
  clearBannerRecord,
  CONFIRMATION_DISPLAY_DURATION_MS,
  getStoredBanner,
  saveBannerRecord,
  type StoredScheduledBanner,
} from './scheduled-notice-storage';
import type { FindTimeConfirmation } from '../api/find-time.api';

const STORAGE_KEY = 'bplan_recent_scheduled_banner';
const NOW = 1_800_000_000_000;

const confirmation: FindTimeConfirmation = {
  status: 'accepted',
  suggestionId: 'suggestion-1',
  event: {
    id: 'event-1',
    title: 'Planning',
    startAt: '2026-09-10T16:15:00Z',
    endAt: '2026-09-10T16:45:00Z',
  },
};

function storageWith(raw?: string) {
  const data = new Map<string, string>();
  if (raw !== undefined) data.set(STORAGE_KEY, raw);
  return {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      data.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      data.delete(key);
    }),
  };
}

describe('scheduled notice storage', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('uses the existing key and confirmation/banner durations', () => {
    expect(CONFIRMATION_DISPLAY_DURATION_MS).toBe(5000);
    expect(BANNER_TOTAL_DURATION_MS).toBe(30000);
    const storage = storageWith();
    vi.stubGlobal('window', { sessionStorage: storage });
    const record: StoredScheduledBanner = {
      confirmation,
      phase: 'banner',
      expiresAt: NOW + BANNER_TOTAL_DURATION_MS,
      totalDurationMs: BANNER_TOTAL_DURATION_MS,
    };

    saveBannerRecord(record);
    expect(storage.setItem).toHaveBeenCalledWith(STORAGE_KEY, JSON.stringify(record));
    expect(getStoredBanner()).toEqual(record);
    clearBannerRecord();
    expect(storage.removeItem).toHaveBeenCalledWith(STORAGE_KEY);
    expect(getStoredBanner()).toBeNull();
  });

  it('restores an active confirmation with its absolute banner expiry', () => {
    const record = {
      confirmation,
      phase: 'confirmation',
      expiresAt: NOW + 2000,
      bannerExpiresAt: NOW + 32000,
      totalDurationMs: BANNER_TOTAL_DURATION_MS,
    };
    const storage = storageWith(JSON.stringify(record));
    vi.stubGlobal('window', { sessionStorage: storage });

    expect(getStoredBanner()).toEqual(record);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('migrates an expired confirmation while its banner is still valid', () => {
    const record = {
      confirmation,
      phase: 'confirmation',
      expiresAt: NOW - 1000,
      bannerExpiresAt: NOW + 29000,
      totalDurationMs: BANNER_TOTAL_DURATION_MS,
    };
    const storage = storageWith(JSON.stringify(record));
    vi.stubGlobal('window', { sessionStorage: storage });

    const migrated = { ...record, phase: 'banner', expiresAt: record.bannerExpiresAt };
    expect(getStoredBanner()).toEqual(migrated);
    expect(storage.setItem).toHaveBeenCalledWith(STORAGE_KEY, JSON.stringify(migrated));
  });

  it('keeps older-record defaults for missing phase, duration, and banner expiry', () => {
    const legacyBanner = { confirmation, expiresAt: NOW + 1000, totalDurationMs: 0 };
    const storage = storageWith(JSON.stringify(legacyBanner));
    vi.stubGlobal('window', { sessionStorage: storage });
    expect(getStoredBanner()).toEqual({
      ...legacyBanner,
      phase: 'banner',
      totalDurationMs: BANNER_TOTAL_DURATION_MS,
    });

    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({ confirmation, phase: 'confirmation', expiresAt: NOW - 1000 }),
    );
    expect(getStoredBanner()).toMatchObject({
      confirmation,
      phase: 'banner',
      expiresAt: NOW - 1000 + BANNER_TOTAL_DURATION_MS,
      bannerExpiresAt: NOW - 1000 + BANNER_TOTAL_DURATION_MS,
      totalDurationMs: BANNER_TOTAL_DURATION_MS,
    });
  });

  it('removes invalid and expired records, but leaves malformed JSON untouched', () => {
    const storage = storageWith(JSON.stringify({ confirmation, expiresAt: NOW }));
    vi.stubGlobal('window', { sessionStorage: storage });
    expect(getStoredBanner()).toBeNull();
    expect(storage.removeItem).toHaveBeenCalledWith(STORAGE_KEY);

    storage.setItem(STORAGE_KEY, JSON.stringify({ confirmation }));
    expect(getStoredBanner()).toBeNull();
    expect(storage.removeItem).toHaveBeenCalledTimes(2);

    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        confirmation,
        phase: 'confirmation',
        expiresAt: NOW - 30001,
        totalDurationMs: BANNER_TOTAL_DURATION_MS,
      }),
    );
    expect(getStoredBanner()).toBeNull();
    expect(storage.removeItem).toHaveBeenCalledTimes(3);

    storage.setItem(STORAGE_KEY, '{bad json');
    expect(getStoredBanner()).toBeNull();
    expect(storage.removeItem).toHaveBeenCalledTimes(3);
  });

  it('tolerates SSR and storage access errors', () => {
    vi.stubGlobal('window', undefined);
    expect(getStoredBanner()).toBeNull();
    expect(() =>
      saveBannerRecord({ confirmation, expiresAt: NOW, totalDurationMs: 30000 }),
    ).not.toThrow();
    expect(() => clearBannerRecord()).not.toThrow();

    vi.stubGlobal('window', {
      get sessionStorage() {
        throw new Error('blocked');
      },
    });
    expect(getStoredBanner()).toBeNull();
    expect(() =>
      saveBannerRecord({ confirmation, expiresAt: NOW, totalDurationMs: 30000 }),
    ).not.toThrow();
    expect(() => clearBannerRecord()).not.toThrow();
  });
});
