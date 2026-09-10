import { formatDuration, type SchedulingIntent } from '@cal/domain';
import React, { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import styles from './FindTimeBox.module.css';
import {
  DEFAULT_MEETING_MINUTES,
  type FindTimeConfirmation,
  type FindTimeProposal,
  type FindTimeSuggestion,
} from '../api/find-time.api';
import { useConfirmSlot } from '../hooks/useConfirmSlot';
import { useFindTime } from '../hooks/useFindTime';

const PLACEHOLDER = 'Try “15-minute meeting with Andrew”';

const TIME_OF_DAY_LABELS: Record<string, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
};

const BANNER_STORAGE_KEY = 'bplan_recent_scheduled_banner';
const BANNER_TOTAL_DURATION_MS = 30000;

interface StoredScheduledBanner {
  confirmation: FindTimeConfirmation;
  expiresAt: number;
  totalDurationMs: number;
}

function getStoredBanner(): StoredScheduledBanner | null {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return null;
    const raw = window.sessionStorage.getItem(BANNER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredScheduledBanner;
    if (!parsed || !parsed.confirmation || typeof parsed.expiresAt !== 'number') {
      window.sessionStorage.removeItem(BANNER_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveBannerRecord(record: StoredScheduledBanner): void {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem(BANNER_STORAGE_KEY, JSON.stringify(record));
    }
  } catch {
    // Ignore storage quota or security errors
  }
}

function clearBannerRecord(): void {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.removeItem(BANNER_STORAGE_KEY);
    }
  } catch {
    // Ignore
  }
}

export interface FindTimeBoxProps {
  timeZone: string;
  /** Notified after a slot is booked, e.g. so the page can navigate to it. */
  onScheduled?: (suggestion: FindTimeSuggestion) => void;
}

/**
 * The free-text scheduling box on Today. The text is parsed deterministically
 * in `@cal/domain`; the server finds genuinely open slots and ranks them.
 */
export function FindTimeBox({ timeZone, onScheduled }: FindTimeBoxProps) {
  const [text, setText] = useState('');

  // Restore any active scheduled banner from sessionStorage (survives route navigation)
  const [storedRecord] = useState<StoredScheduledBanner | null>(() => {
    const stored = getStoredBanner();
    if (!stored) return null;
    const remaining = stored.expiresAt - Date.now();
    if (remaining > 0) {
      return stored;
    }
    clearBannerRecord();
    return null;
  });

  const initialRemaining = storedRecord
    ? Math.max(0, storedRecord.expiresAt - Date.now())
    : BANNER_TOTAL_DURATION_MS;

  const [recentScheduled, setRecentScheduled] = useState<FindTimeConfirmation | null>(
    () => storedRecord?.confirmation ?? null,
  );
  const [isSchedulingAnother, setIsSchedulingAnother] = useState<boolean>(
    () => storedRecord !== null,
  );
  const [isBannerExiting, setIsBannerExiting] = useState(false);
  const [bannerRemainingMs, setBannerRemainingMs] = useState<number>(initialRemaining);
  const [bannerTotalDurationMs, setBannerTotalDurationMs] = useState<number>(
    () => storedRecord?.totalDurationMs ?? BANNER_TOTAL_DURATION_MS,
  );

  const findTime = useFindTime();
  const confirmSlot = useConfirmSlot();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Smooth exit state for proposal and intent when user clears/deletes input
  const [displayedProposal, setDisplayedProposal] = useState<FindTimeProposal | null>(null);
  const [displayedIntent, setDisplayedIntent] = useState<SchedulingIntent | null>(null);
  const [isProposalExiting, setIsProposalExiting] = useState(false);
  const proposalExitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // If mounted with an active banner from storage, set its dismiss timer
  useEffect(() => {
    if (storedRecord && isSchedulingAnother) {
      const remaining = storedRecord.expiresAt - Date.now();
      if (remaining > 0) {
        setBannerRemainingMs(remaining);
        if (dismissTimerRef.current) {
          clearTimeout(dismissTimerRef.current);
        }
        dismissTimerRef.current = setTimeout(() => {
          triggerBannerDismiss();
        }, remaining);
      } else {
        clearBannerRecord();
        setRecentScheduled(null);
        setIsSchedulingAnother(false);
      }
    }
  }, [isSchedulingAnother, storedRecord]);

  // Sync displayed proposal/intent when new ones arrive from findTime
  useEffect(() => {
    if (findTime.proposal) {
      setDisplayedProposal(findTime.proposal);
      setDisplayedIntent(findTime.intent);
      setIsProposalExiting(false);
      if (proposalExitTimerRef.current) {
        clearTimeout(proposalExitTimerRef.current);
        proposalExitTimerRef.current = null;
      }
    }
  }, [findTime.proposal, findTime.intent]);

  // When a slot is confirmed, update state and save to sessionStorage
  useEffect(() => {
    if (confirmSlot.confirmation) {
      setRecentScheduled(confirmSlot.confirmation);
      setIsSchedulingAnother(false);
      setIsBannerExiting(false);
      setBannerRemainingMs(BANNER_TOTAL_DURATION_MS);
      setBannerTotalDurationMs(BANNER_TOTAL_DURATION_MS);

      saveBannerRecord({
        confirmation: confirmSlot.confirmation,
        expiresAt: Date.now() + BANNER_TOTAL_DURATION_MS,
        totalDurationMs: BANNER_TOTAL_DURATION_MS,
      });

      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = null;
      }
    }
  }, [confirmSlot.confirmation]);

  useEffect(() => {
    return () => {
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
      }
      if (proposalExitTimerRef.current) {
        clearTimeout(proposalExitTimerRef.current);
      }
    };
  }, []);

  const triggerBannerDismiss = () => {
    setIsBannerExiting(true);
    clearBannerRecord();
    setTimeout(() => {
      setRecentScheduled(null);
      setIsBannerExiting(false);
      setIsSchedulingAnother(false);
    }, 350);
  };

  const triggerProposalExit = () => {
    if (isProposalExiting) return;
    setIsProposalExiting(true);
    if (proposalExitTimerRef.current) {
      clearTimeout(proposalExitTimerRef.current);
    }
    proposalExitTimerRef.current = setTimeout(() => {
      setDisplayedProposal(null);
      setDisplayedIntent(null);
      setIsProposalExiting(false);
      findTime.reset();
      proposalExitTimerRef.current = null;
    }, 280);
  };

  const handleScheduleAnother = () => {
    setIsSchedulingAnother(true);
    setIsBannerExiting(false);
    setText('');
    findTime.reset();
    confirmSlot.reset();
    setDisplayedProposal(null);
    setDisplayedIntent(null);
    setIsProposalExiting(false);

    setBannerRemainingMs(BANNER_TOTAL_DURATION_MS);
    setBannerTotalDurationMs(BANNER_TOTAL_DURATION_MS);

    const target = recentScheduled ?? confirmSlot.confirmation;
    if (target) {
      setRecentScheduled(target);
      saveBannerRecord({
        confirmation: target,
        expiresAt: Date.now() + BANNER_TOTAL_DURATION_MS,
        totalDurationMs: BANNER_TOTAL_DURATION_MS,
      });
    }

    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);

    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
    }
    dismissTimerRef.current = setTimeout(() => {
      triggerBannerDismiss();
    }, BANNER_TOTAL_DURATION_MS);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (proposalExitTimerRef.current) {
      clearTimeout(proposalExitTimerRef.current);
      proposalExitTimerRef.current = null;
    }
    setIsProposalExiting(false);
    setDisplayedProposal(null);
    setDisplayedIntent(null);

    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
    if (recentScheduled) {
      triggerBannerDismiss();
    }
    confirmSlot.reset();
    findTime.submit(text, timeZone);
  };

  const handleSelect = (suggestion: FindTimeSuggestion) => {
    confirmSlot.confirm(suggestion.id);
    onScheduled?.(suggestion);
  };

  const canSubmit = text.trim().length > 0 && !findTime.isPending;
  const { confirmation } = confirmSlot;

  const calendarLink = confirmation
    ? `/calendar?date=${getEventDateKey(confirmation.event.startAt)}&event=${confirmation.event.id}`
    : '/calendar';

  return (
    <section className={styles.container} aria-label="Find a time">
      <form className={styles.form} onSubmit={handleSubmit}>
        <div
          className={`${styles.inputWrap} ${findTime.isPending ? styles.inputWrapScanning : ''}`}
        >
          <span
            className={`${styles.inputIcon} ${findTime.isPending ? styles.inputIconScanning : ''}`}
            aria-hidden="true"
          >
            <StarIcon />
          </span>
          <input
            id={inputId}
            ref={inputRef}
            className={styles.input}
            type="text"
            value={text}
            placeholder={PLACEHOLDER}
            aria-label="Describe what you want to schedule"
            onChange={(event) => {
              const newText = event.target.value;
              setText(newText);
              if (confirmSlot.errorMessage) confirmSlot.reset();
              if (findTime.errorMessage) findTime.reset();

              if (newText.trim().length === 0) {
                if ((displayedProposal || findTime.proposal) && !isProposalExiting) {
                  triggerProposalExit();
                }
              } else if (isProposalExiting) {
                if (proposalExitTimerRef.current) {
                  clearTimeout(proposalExitTimerRef.current);
                  proposalExitTimerRef.current = null;
                }
                setIsProposalExiting(false);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setText('');
                if ((displayedProposal || findTime.proposal) && !isProposalExiting) {
                  triggerProposalExit();
                }
              }
            }}
          />
        </div>
        <button
          type="submit"
          className={`${styles.submit} ${findTime.isPending ? styles.submitFinding : ''}`}
          disabled={!canSubmit}
        >
          {findTime.isPending ? (
            <>
              <SparkleIcon className={styles.spinningSparkle} />
              <span>Finding slots…</span>
            </>
          ) : (
            <>
              <StarIcon />
              <span>Find time</span>
            </>
          )}
        </button>
      </form>

      {/* Docked Recent Scheduled Notification */}
      {isSchedulingAnother && recentScheduled && (
        <div
          className={`${styles.recentBanner} ${isBannerExiting ? styles.recentBannerExiting : ''}`}
          role="status"
        >
          <div className={styles.recentBannerMain}>
            <div className={styles.recentCheckIcon}>
              <CheckIcon />
            </div>
            <div className={styles.recentText}>
              <span className={styles.recentTag}>Scheduled</span>
              <span className={styles.recentTitle}>{recentScheduled.event.title}</span>
              <span className={styles.recentSeparator}>·</span>
              <span className={styles.recentTime}>
                {formatSlot(recentScheduled.event.startAt, recentScheduled.event.endAt, timeZone)}
              </span>
            </div>
          </div>
          <div className={styles.recentActions}>
            <Link
              to={`/calendar?date=${getEventDateKey(recentScheduled.event.startAt)}&event=${recentScheduled.event.id}`}
              className={styles.recentCalendarLink}
            >
              <span>View in Calendar</span>
              <ArrowRightIcon />
            </Link>
            <button
              type="button"
              className={styles.recentDismissButton}
              onClick={triggerBannerDismiss}
              aria-label="Dismiss scheduled notice"
            >
              ✕
            </button>
          </div>
          <div
            className={styles.bannerTimerBar}
            style={
              {
                '--start-width': `${Math.max(0, Math.min(100, (bannerRemainingMs / bannerTotalDurationMs) * 100))}%`,
                '--deplete-duration': `${bannerRemainingMs}ms`,
              } as React.CSSProperties
            }
          />
        </div>
      )}

      {!confirmation && (
        <p className={styles.hint}>
          Describe a meeting and BPlan will suggest the three best open slots in your schedule.
        </p>
      )}

      {/* Loading Radar / Shimmering Skeletons while finding */}
      {findTime.isPending && (
        <div className={styles.loadingArea} role="status" aria-live="polite">
          <div className={styles.loadingHeader}>
            <div className={styles.loadingBadge}>
              <SparkleIcon className={styles.spinningSparkle} />
              <span>AI Engine</span>
            </div>
            <span className={styles.loadingText}>
              Verifying deterministic calendar availability &amp; ranking optimal slots…
            </span>
          </div>
          <div className={styles.skeletonContainer}>
            <div className={styles.skeletonCard}>
              <div className={styles.skeletonRank} />
              <div className={styles.skeletonBody}>
                <div className={styles.skeletonTime} />
                <div className={styles.skeletonReason} />
              </div>
              <div className={styles.skeletonAction} />
            </div>
            <div className={`${styles.skeletonCard} ${styles.skeletonDelay1}`}>
              <div className={styles.skeletonRank} />
              <div className={styles.skeletonBody}>
                <div className={styles.skeletonTime} />
                <div className={styles.skeletonReason} />
              </div>
              <div className={styles.skeletonAction} />
            </div>
            <div className={`${styles.skeletonCard} ${styles.skeletonDelay2}`}>
              <div className={styles.skeletonRank} />
              <div className={styles.skeletonBody}>
                <div className={styles.skeletonTime} />
                <div className={styles.skeletonReason} />
              </div>
              <div className={styles.skeletonAction} />
            </div>
          </div>
        </div>
      )}

      {/* Parsed Intent Readback */}
      {displayedIntent && displayedProposal && !confirmation && !findTime.isPending && (
        <div className={`${styles.readback} ${isProposalExiting ? styles.proposalExiting : ''}`}>
          <span className={`${styles.chip} ${styles.chipTitle}`}>
            <StarIcon />
            <span>{displayedIntent.title}</span>
          </span>
          <span className={styles.chip}>
            <ClockIcon />
            <span>
              {formatDuration(displayedIntent.durationMinutes ?? DEFAULT_MEETING_MINUTES)}
              {displayedIntent.durationMinutes === null ? ' (default)' : ''}
            </span>
          </span>
          {displayedIntent.dayHint && (
            <span className={styles.chip}>
              <CalendarIcon />
              <span>{displayedIntent.dayHint === 'today' ? 'Today' : 'Tomorrow'}</span>
            </span>
          )}
          {displayedIntent.preferredTimeOfDay !== 'any' && (
            <span className={styles.chip}>
              <span>{TIME_OF_DAY_LABELS[displayedIntent.preferredTimeOfDay]}</span>
            </span>
          )}
        </div>
      )}

      {/* Beautiful Scheduled Confirmation */}
      {confirmation && !isSchedulingAnother && (
        <div className={styles.confirmationCard} role="status">
          <div className={styles.confirmationHeader}>
            <div className={styles.checkIconWrap}>
              <CheckCircleIcon />
            </div>
            <div className={styles.confirmationMain}>
              <div className={styles.confirmationBadgeRow}>
                <span className={styles.confirmationBadge}>Successfully Scheduled</span>
                <span className={styles.confirmationLiveIndicator}>✦ Synced</span>
              </div>
              <h3 className={styles.confirmationTitle}>{confirmation.event.title}</h3>
              <div className={styles.confirmationTimeRow}>
                <CalendarIcon />
                <span>
                  {formatSlot(confirmation.event.startAt, confirmation.event.endAt, timeZone)}
                </span>
              </div>
            </div>
          </div>

          <div className={styles.confirmationActions}>
            <button
              type="button"
              className={styles.actionResetButton}
              onClick={handleScheduleAnother}
            >
              <PlusIcon />
              <span>Schedule another</span>
            </button>
            <Link to={calendarLink} className={styles.actionCalendarButton}>
              <span>View in Calendar</span>
              <ArrowRightIcon />
            </Link>
          </div>
        </div>
      )}

      {/* Available Slots Display */}
      {displayedProposal && !confirmation && !findTime.isPending && (
        <div className={`${styles.results} ${isProposalExiting ? styles.proposalExiting : ''}`}>
          <div className={styles.resultsHeader}>
            <div className={styles.resultsTitleGroup}>
              <span className={styles.resultsHeading}>Verified Open Slots</span>
              <span className={styles.resultsBadge}>✦ Guaranteed Conflict-Free</span>
            </div>
            <span className={styles.resultsSub}>Ranked by optimal availability</span>
          </div>

          <div className={styles.slotList}>
            {displayedProposal.suggestions.map((suggestion, index) => {
              const isTopPick = suggestion.rank === 1;
              const isBooking = confirmSlot.confirmingSuggestionId === suggestion.id;
              const isOtherBooking = confirmSlot.confirmingSuggestionId !== null && !isBooking;

              return (
                <div
                  key={suggestion.id}
                  className={`${styles.slotCard} ${isTopPick ? styles.slotCardTopPick : ''} ${
                    isBooking ? styles.slotCardBooking : ''
                  } ${isOtherBooking ? styles.slotCardDimmed : ''}`}
                  style={{ animationDelay: `${index * 70}ms` }}
                >
                  <div className={styles.slotCardMain}>
                    <div className={styles.slotLeft}>
                      <div
                        className={`${styles.rankBadge} ${isTopPick ? styles.rankBadgeTop : ''}`}
                        aria-hidden="true"
                      >
                        {suggestion.rank}
                      </div>
                      <div className={styles.slotDetails}>
                        <div className={styles.slotTimeRow}>
                          <span className={styles.slotTime}>
                            {formatSlot(suggestion.startAt, suggestion.endAt, timeZone)}
                          </span>
                          {isTopPick && <span className={styles.topPickTag}>✦ Recommended</span>}
                        </div>
                        <p className={styles.slotReason}>{suggestion.reason}</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      className={`${styles.scheduleButton} ${
                        isTopPick ? styles.scheduleButtonPrimary : ''
                      } ${isBooking ? styles.scheduleButtonLoading : ''}`}
                      disabled={confirmSlot.confirmingSuggestionId !== null}
                      onClick={() => handleSelect(suggestion)}
                    >
                      {isBooking ? (
                        <>
                          <SpinnerIcon className={styles.buttonSpinner} />
                          <span>Booking…</span>
                        </>
                      ) : (
                        <>
                          <span>Schedule</span>
                          <ArrowRightIcon />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {(findTime.errorMessage ?? confirmSlot.errorMessage) && (
        <p className={styles.error} role="alert">
          {findTime.errorMessage ?? confirmSlot.errorMessage}
        </p>
      )}
    </section>
  );
}

function getEventDateKey(startAt: string): string {
  try {
    return new Date(startAt).toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

/** e.g. "Thu, Sep 10 · 10:15 AM – 10:30 AM". */
function formatSlot(startAt: string, endAt: string, timeZone: string): string {
  const start = new Date(startAt);
  const end = new Date(endAt);
  const day = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone,
  }).format(start);

  return `${day} · ${clockTime(start, timeZone)} – ${clockTime(end, timeZone)}`;
}

function clockTime(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).format(value);
}

function StarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2l2.85 7.15L22 12l-7.15 2.85L12 22l-2.85-7.15L2 12l7.15-2.85L12 2z" />
    </svg>
  );
}

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 0L14.59 9.41L24 12L14.59 14.59L12 24L9.41 14.59L0 12L9.41 9.41L12 0Z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="12" y1="2" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
      <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
      <line x1="2" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="22" y2="12" />
      <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
      <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
