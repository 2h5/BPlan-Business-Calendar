import type { FindTimeConfirmation } from '../api/find-time.api';

const BANNER_STORAGE_KEY = 'bplan_recent_scheduled_banner';
export const CONFIRMATION_DISPLAY_DURATION_MS = 5000;
export const BANNER_TOTAL_DURATION_MS = 30000;

export type ScheduledNoticePhase = 'confirmation' | 'banner';

export interface StoredScheduledBanner {
  confirmation: FindTimeConfirmation;
  phase?: ScheduledNoticePhase;
  /** Expiry for the currently stored phase. */
  expiresAt: number;
  /** Absolute expiry for the compact banner after the confirmation phase. */
  bannerExpiresAt?: number;
  totalDurationMs: number;
}

export function getStoredBanner(): StoredScheduledBanner | null {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return null;
    const raw = window.sessionStorage.getItem(BANNER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredScheduledBanner;
    if (!parsed || !parsed.confirmation || typeof parsed.expiresAt !== 'number') {
      window.sessionStorage.removeItem(BANNER_STORAGE_KEY);
      return null;
    }

    const now = Date.now();
    const phase: ScheduledNoticePhase = parsed.phase === 'confirmation' ? 'confirmation' : 'banner';
    const totalDurationMs =
      Number.isFinite(parsed.totalDurationMs) && parsed.totalDurationMs > 0
        ? parsed.totalDurationMs
        : BANNER_TOTAL_DURATION_MS;

    if (phase === 'confirmation') {
      const bannerExpiresAt =
        typeof parsed.bannerExpiresAt === 'number'
          ? parsed.bannerExpiresAt
          : parsed.expiresAt + totalDurationMs;

      if (parsed.expiresAt > now) {
        return { ...parsed, phase, bannerExpiresAt, totalDurationMs };
      }

      if (bannerExpiresAt > now) {
        const migrated = {
          ...parsed,
          phase: 'banner' as const,
          expiresAt: bannerExpiresAt,
          bannerExpiresAt,
          totalDurationMs,
        };
        saveBannerRecord(migrated);
        return migrated;
      }

      window.sessionStorage.removeItem(BANNER_STORAGE_KEY);
      return null;
    }

    if (parsed.expiresAt > now) {
      return { ...parsed, phase, totalDurationMs };
    }

    window.sessionStorage.removeItem(BANNER_STORAGE_KEY);
    return null;
  } catch {
    return null;
  }
}

export function saveBannerRecord(record: StoredScheduledBanner): void {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem(BANNER_STORAGE_KEY, JSON.stringify(record));
    }
  } catch {
    // Ignore storage quota or security errors
  }
}

export function clearBannerRecord(): void {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.removeItem(BANNER_STORAGE_KEY);
    }
  } catch {
    // Ignore
  }
}
