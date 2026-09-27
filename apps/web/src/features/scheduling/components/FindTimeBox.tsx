import React, { useCallback, useEffect, useId, useRef, useState } from 'react';

import styles from './FindTimeBox.module.css';
import { FindTimeActivePrompt, FindTimeLockedTeaser } from './FindTimePromptPresentation';
import { FindTimeProposalResults } from './FindTimeProposalResults';
import { ScheduledBanner, ScheduledConfirmationCard } from './FindTimeScheduledNotice';
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
import {
  BANNER_TOTAL_DURATION_MS,
  clearBannerRecord,
  CONFIRMATION_DISPLAY_DURATION_MS,
  getStoredBanner,
  saveBannerRecord,
  type ScheduledNoticePhase,
  type StoredScheduledBanner,
} from '../utils/scheduled-notice-storage';

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

  // Show a new proposal when one arrives from findTime. This runs only when the
  // proposal changes, so starting the exit below does not cancel it again.
  useEffect(() => {
    if (!findTime.proposal) return;
    setDisplayedProposal(findTime.proposal);
    setIsProposalExiting(false);
    if (proposalExitTimerRef.current) {
      clearTimeout(proposalExitTimerRef.current);
      proposalExitTimerRef.current = null;
    }
  }, [findTime.proposal]);

  // Drop the displayed proposal once findTime has been reset
  useEffect(() => {
    if (!findTime.proposal && !findTime.isPending && !isProposalExiting) {
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

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
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
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
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

  return (
    <section className={styles.container} aria-label="Find a time">
      {!isPro ? (
        <FindTimeLockedTeaser inputId={inputId} />
      ) : (
        <>
          <FindTimeActivePrompt
            inputId={inputId}
            inputRef={inputRef}
            text={text}
            isPending={findTime.isPending}
            canSubmit={canSubmit}
            showHint={!activeConfirmation}
            clarificationQuestion={
              findTime.clarification && !activeConfirmation && !findTime.isPending
                ? findTime.clarification.clarificationQuestion
                : null
            }
            onSubmit={handleSubmit}
            onInputChange={handleInputChange}
            onInputKeyDown={handleInputKeyDown}
          />

          {displayedProposal && !activeConfirmation && !findTime.isPending && (
            <FindTimeProposalResults
              proposal={displayedProposal}
              timeZone={timeZone}
              isExiting={isProposalExiting}
              confirmingSuggestionId={confirmSlot.confirmingSuggestionId}
              onSelect={handleSelect}
            />
          )}
        </>
      )}

      {/* Beautiful Scheduled Confirmation (preserved in both Pro and Free) */}
      {activeConfirmation?.event && !isSchedulingAnother && (
        <ScheduledConfirmationCard
          event={activeConfirmation.event}
          timeZone={timeZone}
          onScheduleAnother={handleScheduleAnother}
        />
      )}

      {/* Docked Recent Scheduled Notification */}
      {isSchedulingAnother && recentScheduled?.event && (
        <ScheduledBanner
          event={recentScheduled.event}
          timeZone={timeZone}
          isExiting={isBannerExiting}
          remainingMs={bannerRemainingMs}
          totalDurationMs={bannerTotalDurationMs}
          onDismiss={triggerBannerDismiss}
        />
      )}

      {(findTime.errorMessage ?? confirmSlot.errorMessage) && (
        <p className={styles.error} role="alert">
          {findTime.errorMessage ?? confirmSlot.errorMessage}
        </p>
      )}
    </section>
  );
}
