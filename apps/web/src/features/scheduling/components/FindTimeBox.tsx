import { formatDuration } from '@cal/domain';
import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import styles from './FindTimeBox.module.css';
import { useSubscription } from '../../billing/hooks/useBilling';
import { getSubscriptionStatusInfo } from '../../billing/utils/subscription-display';
import {
  type FindTimeConfirmation,
  type FindTimeProposal,
  type FindTimeSuggestion,
} from '../api/find-time.api';
import { useConfirmSlot } from '../hooks/useConfirmSlot';
import {
  clearStoredFindTimeDraft,
  getStoredFindTimeDraft,
  saveStoredFindTimeDraft,
  useFindTime,
} from '../hooks/useFindTime';

const PLACEHOLDER = 'Try “15-minute meeting with Andrew”';

const BANNER_STORAGE_KEY = 'bplan_recent_scheduled_banner';
const CONFIRMATION_DISPLAY_DURATION_MS = 5000;
const BANNER_TOTAL_DURATION_MS = 30000;

type ScheduledNoticePhase = 'confirmation' | 'banner';

interface StoredScheduledBanner {
  confirmation: FindTimeConfirmation;
  phase?: ScheduledNoticePhase;
  /** Expiry for the currently stored phase. */
  expiresAt: number;
  /** Absolute expiry for the compact banner after the confirmation phase. */
  bannerExpiresAt?: number;
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
  const findTime = useFindTime();
  const confirmSlot = useConfirmSlot();

  const [text, setText] = useState(() => findTime.promptText || getStoredFindTimeDraft());

  // Restore any active scheduled banner from sessionStorage (survives route navigation)
  const [storedRecord, setStoredRecord] = useState<StoredScheduledBanner | null>(() => {
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
    ? storedRecord.phase === 'banner'
      ? Math.max(0, storedRecord.expiresAt - Date.now())
      : BANNER_TOTAL_DURATION_MS
    : BANNER_TOTAL_DURATION_MS;

  const [recentScheduled, setRecentScheduled] = useState<FindTimeConfirmation | null>(
    () => storedRecord?.confirmation ?? confirmSlot.confirmation ?? null,
  );
  const [noticePhase, setNoticePhase] = useState<ScheduledNoticePhase | null>(() => {
    if (storedRecord) return storedRecord.phase ?? 'banner';
    if (confirmSlot.confirmation) return 'confirmation';
    return null;
  });
  const isSchedulingAnother = noticePhase === 'banner';
  const [isBannerExiting, setIsBannerExiting] = useState(false);
  const [bannerRemainingMs, setBannerRemainingMs] = useState<number>(initialRemaining);
  const [bannerTotalDurationMs, setBannerTotalDurationMs] = useState<number>(
    () => storedRecord?.totalDurationMs ?? BANNER_TOTAL_DURATION_MS,
  );

  const subscription = useSubscription();
  const statusInfo = getSubscriptionStatusInfo(subscription.data);
  const isCheckingSubscription = subscription.isLoading;
  const isPro = !isCheckingSubscription && statusInfo.state === 'active';
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bannerExitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDismissingRef = useRef(false);
  const hasRestoredRef = useRef(false);
  const lastHandledConfirmationRef = useRef<string | null>(
    storedRecord?.confirmation.suggestionId ?? confirmSlot.confirmation?.suggestionId ?? null,
  );

  // Smooth exit state for proposal when user clears/deletes input
  const [displayedProposal, setDisplayedProposal] = useState<FindTimeProposal | null>(
    () => findTime.proposal,
  );
  const [isProposalExiting, setIsProposalExiting] = useState(false);
  const proposalExitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerBannerDismiss = useCallback(() => {
    if (isDismissingRef.current) return;
    isDismissingRef.current = true;

    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
    if (bannerExitTimerRef.current) {
      clearTimeout(bannerExitTimerRef.current);
      bannerExitTimerRef.current = null;
    }

    clearBannerRecord();
    setStoredRecord(null);
    setIsBannerExiting(true);
    confirmSlot.reset();

    bannerExitTimerRef.current = setTimeout(() => {
      setRecentScheduled(null);
      setNoticePhase(null);
      setIsBannerExiting(false);
      isDismissingRef.current = false;
      bannerExitTimerRef.current = null;
    }, 350);
  }, [confirmSlot]);

  const transitionToBanner = useCallback(
    (target: FindTimeConfirmation, bannerExpiresAt: number) => {
      const remaining = bannerExpiresAt - Date.now();
      if (remaining <= 0) {
        clearBannerRecord();
        setStoredRecord(null);
        confirmSlot.reset();
        setRecentScheduled(null);
        setNoticePhase(null);
        return;
      }

      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
      }
      confirmSlot.reset();
      setStoredRecord(null);
      setRecentScheduled(target);
      setNoticePhase('banner');
      setIsBannerExiting(false);
      setBannerRemainingMs(remaining);
      setBannerTotalDurationMs(BANNER_TOTAL_DURATION_MS);
      saveBannerRecord({
        confirmation: target,
        phase: 'banner',
        expiresAt: bannerExpiresAt,
        bannerExpiresAt,
        totalDurationMs: BANNER_TOTAL_DURATION_MS,
      });
      dismissTimerRef.current = setTimeout(() => {
        triggerBannerDismiss();
      }, remaining);
    },
    [confirmSlot, triggerBannerDismiss],
  );

  // Restore the appropriate scheduled notice phase from storage and keep its
  // absolute transition/expiry times running across route navigation.
  useEffect(() => {
    if (!storedRecord || hasRestoredRef.current) return;
    hasRestoredRef.current = true;

    if (storedRecord.phase === 'confirmation') {
      const bannerExpiresAt =
        storedRecord.bannerExpiresAt ?? storedRecord.expiresAt + BANNER_TOTAL_DURATION_MS;
      const remaining = storedRecord.expiresAt - Date.now();
      if (remaining > 0) {
        if (dismissTimerRef.current) {
          clearTimeout(dismissTimerRef.current);
        }
        dismissTimerRef.current = setTimeout(() => {
          transitionToBanner(storedRecord.confirmation, bannerExpiresAt);
        }, remaining);
      } else {
        transitionToBanner(storedRecord.confirmation, bannerExpiresAt);
      }
      return;
    }

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
      triggerBannerDismiss();
    }
  }, [storedRecord, transitionToBanner, triggerBannerDismiss]);

  // Sync displayed proposal when a new one arrives from findTime or when reset
  useEffect(() => {
    if (findTime.proposal) {
      setDisplayedProposal(findTime.proposal);
      setIsProposalExiting(false);
      if (proposalExitTimerRef.current) {
        clearTimeout(proposalExitTimerRef.current);
        proposalExitTimerRef.current = null;
      }
    } else if (!findTime.isPending && !isProposalExiting) {
      setDisplayedProposal(null);
    }
  }, [findTime.proposal, findTime.isPending, isProposalExiting]);

  // When a slot is confirmed, update state and save to sessionStorage
  useEffect(() => {
    const confirmation = confirmSlot.confirmation;
    if (confirmation && lastHandledConfirmationRef.current !== confirmation.suggestionId) {
      lastHandledConfirmationRef.current = confirmation.suggestionId;

      setText('');
      clearStoredFindTimeDraft();
      setDisplayedProposal(null);
      setIsProposalExiting(false);

      const confirmationExpiresAt = Date.now() + CONFIRMATION_DISPLAY_DURATION_MS;
      const bannerExpiresAt = confirmationExpiresAt + BANNER_TOTAL_DURATION_MS;

      setRecentScheduled(confirmation);
      setNoticePhase('confirmation');
      setIsBannerExiting(false);
      setBannerRemainingMs(BANNER_TOTAL_DURATION_MS);
      setBannerTotalDurationMs(BANNER_TOTAL_DURATION_MS);

      saveBannerRecord({
        confirmation,
        phase: 'confirmation',
        expiresAt: confirmationExpiresAt,
        bannerExpiresAt,
        totalDurationMs: BANNER_TOTAL_DURATION_MS,
      });

      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
      }
      dismissTimerRef.current = setTimeout(() => {
        transitionToBanner(confirmation, bannerExpiresAt);
      }, CONFIRMATION_DISPLAY_DURATION_MS);
    } else if (!confirmation) {
      lastHandledConfirmationRef.current = null;
    }
  }, [confirmSlot.confirmation, transitionToBanner]);

  useEffect(() => {
    return () => {
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
      }
      if (bannerExitTimerRef.current) {
        clearTimeout(bannerExitTimerRef.current);
      }
      if (proposalExitTimerRef.current) {
        clearTimeout(proposalExitTimerRef.current);
      }
    };
  }, []);

  const triggerProposalExit = () => {
    if (isProposalExiting) return;
    setIsProposalExiting(true);
    if (proposalExitTimerRef.current) {
      clearTimeout(proposalExitTimerRef.current);
    }
    proposalExitTimerRef.current = setTimeout(() => {
      setDisplayedProposal(null);
      setIsProposalExiting(false);
      clearStoredFindTimeDraft();
      findTime.reset();
      proposalExitTimerRef.current = null;
    }, 280);
  };

  const handleScheduleAnother = () => {
    const target = recentScheduled ?? confirmSlot.confirmation;
    setText('');
    clearStoredFindTimeDraft();
    findTime.reset();
    confirmSlot.reset();
    setDisplayedProposal(null);
    setIsProposalExiting(false);

    if (target) {
      transitionToBanner(target, Date.now() + BANNER_TOTAL_DURATION_MS);
    }

    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!isPro) return;
    if (proposalExitTimerRef.current) {
      clearTimeout(proposalExitTimerRef.current);
      proposalExitTimerRef.current = null;
    }
    setIsProposalExiting(false);
    setDisplayedProposal(null);

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
    setText('');
    clearStoredFindTimeDraft();
    setDisplayedProposal(null);
    findTime.reset();
    confirmSlot.confirm(suggestion.id);
    onScheduled?.(suggestion);
  };

  const canSubmit = isPro && text.trim().length > 0 && !findTime.isPending;
  const activeConfirmation =
    noticePhase === 'banner' ? null : (recentScheduled ?? confirmSlot.confirmation);

  const calendarLink = activeConfirmation?.event?.id
    ? `/calendar?date=${getEventDateKey(activeConfirmation.event.startAt)}&event=${activeConfirmation.event.id}`
    : '/calendar';

  return (
    <section className={styles.container} aria-label="Find a time">
      {!isPro ? (
        <div className={styles.lockedTeaser}>
          <div className={styles.lockedHeader}>
            <div className={styles.lockedBadgeGroup}>
              <span className={styles.proBadge}>
                <SparkleIcon className={styles.proSparkleIcon} />
                <span>PRO</span>
              </span>
              <span className={styles.lockedHeading}>Find Time with AI</span>
            </div>
            <span className={styles.lockedSubheading}>AI-assisted natural language scheduling</span>
          </div>

          <div className={styles.lockedInputBar}>
            <div className={styles.lockedInputWrap}>
              <span className={styles.lockIcon} aria-hidden="true">
                <LockIcon />
              </span>
              <input
                id={inputId}
                className={`${styles.input} ${styles.inputLocked}`}
                type="text"
                disabled
                readOnly
                value=""
                placeholder="Try “15-minute meeting with Andrew tomorrow afternoon”"
                aria-label="Find Time with AI is available on the Pro plan"
              />
            </div>
            <Link to="/subscription" className={styles.upgradeButton}>
              <span>Upgrade to Pro</span>
              <ArrowRightIcon />
            </Link>
          </div>

          <p className={styles.lockedDescription}>
            BPlan interprets your natural-language requests and finds optimal, conflict-free
            openings on your calendar. Upgrade to Pro to unlock AI scheduling.
          </p>
        </div>
      ) : (
        <>
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
                  saveStoredFindTimeDraft(newText);
                  if (confirmSlot.errorMessage) confirmSlot.reset();
                  if (findTime.errorMessage) findTime.reset();

                  if (newText.trim().length === 0) {
                    clearStoredFindTimeDraft();
                    if (findTime.clarification) {
                      findTime.reset();
                    }
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
                    clearStoredFindTimeDraft();
                    if (findTime.clarification) {
                      findTime.reset();
                    }
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

          {!activeConfirmation && (
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

          {/* Clarification Notice */}
          {findTime.clarification && !activeConfirmation && !findTime.isPending && (
            <div className={styles.clarificationCard} role="status">
              <div className={styles.clarificationHeader}>
                <div className={styles.clarificationIconWrap}>
                  <HelpCircleIcon />
                </div>
                <div className={styles.clarificationMain}>
                  <div className={styles.clarificationTag}>BPlan needs more verification</div>
                  <p className={styles.clarificationQuestion}>
                    {findTime.clarification.clarificationQuestion}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Parsed Intent Readback */}
          {displayedProposal && !activeConfirmation && !findTime.isPending && (
            <div
              className={`${styles.readback} ${isProposalExiting ? styles.proposalExiting : ''}`}
            >
              {displayedProposal.readback ? (
                <>
                  <span className={`${styles.chip} ${styles.chipTitle}`}>
                    <StarIcon />
                    <span>{displayedProposal.readback.title}</span>
                  </span>
                  <span className={styles.chip}>
                    <ClockIcon />
                    <span>{displayedProposal.readback.durationLabel}</span>
                  </span>
                  {displayedProposal.readback.dateLabel && (
                    <span className={styles.chip}>
                      <CalendarIcon />
                      <span>{displayedProposal.readback.dateLabel}</span>
                    </span>
                  )}
                  {displayedProposal.readback.timeLabel && (
                    <span className={styles.chip}>
                      <span>{displayedProposal.readback.timeLabel}</span>
                    </span>
                  )}
                  {displayedProposal.readback.location && (
                    <span className={styles.chip}>
                      <MapPinIcon />
                      <span>{displayedProposal.readback.location}</span>
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span className={`${styles.chip} ${styles.chipTitle}`}>
                    <StarIcon />
                    <span>{displayedProposal.task.title}</span>
                  </span>
                  <span className={styles.chip}>
                    <ClockIcon />
                    <span>{formatDuration(displayedProposal.task.durationMinutes)}</span>
                  </span>
                </>
              )}
            </div>
          )}

          {/* Available Slots Display */}
          {displayedProposal && !activeConfirmation && !findTime.isPending && (
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
                              {isTopPick && (
                                <span className={styles.topPickTag}>✦ Recommended</span>
                              )}
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
        </>
      )}

      {/* Beautiful Scheduled Confirmation (preserved in both Pro and Free) */}
      {activeConfirmation?.event && !isSchedulingAnother && (
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
              <h3 className={styles.confirmationTitle}>{activeConfirmation.event.title}</h3>
              <div className={styles.confirmationTimeRow}>
                <CalendarIcon />
                <span>
                  {formatSlot(
                    activeConfirmation.event.startAt,
                    activeConfirmation.event.endAt,
                    timeZone,
                  )}
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

      {/* Docked Recent Scheduled Notification */}
      {isSchedulingAnother && recentScheduled?.event && (
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
              to={
                recentScheduled.event.id
                  ? `/calendar?date=${getEventDateKey(recentScheduled.event.startAt)}&event=${recentScheduled.event.id}`
                  : '/calendar'
              }
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

      {(findTime.errorMessage ?? confirmSlot.errorMessage) && (
        <p className={styles.error} role="alert">
          {findTime.errorMessage ?? confirmSlot.errorMessage}
        </p>
      )}
    </section>
  );
}

function getEventDateKey(startAt?: string): string {
  try {
    if (!startAt) return '';
    const date = new Date(startAt);
    if (isNaN(date.getTime())) return '';
    return date.toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

/** e.g. "Thu, Sep 10 · 10:15 AM – 10:30 AM". */
function formatSlot(startAt?: string, endAt?: string, timeZone?: string): string {
  if (!startAt || !endAt) return '';
  try {
    const tz = timeZone || 'UTC';
    const start = new Date(startAt);
    const end = new Date(endAt);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return '';
    const day = new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: tz,
    }).format(start);

    return `${day} · ${clockTime(start, tz)} – ${clockTime(end, tz)}`;
  } catch {
    return '';
  }
}

function clockTime(value: Date, timeZone: string): string {
  try {
    if (isNaN(value.getTime())) return '';
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone,
    }).format(value);
  } catch {
    return '';
  }
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

function MapPinIcon() {
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
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function HelpCircleIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
