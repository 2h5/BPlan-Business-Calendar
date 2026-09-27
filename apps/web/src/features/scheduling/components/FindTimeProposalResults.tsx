import { formatDuration } from '@cal/domain';

import styles from './FindTimeBox.module.css';
import {
  ArrowRightIcon,
  CalendarIcon,
  ClockIcon,
  MapPinIcon,
  SpinnerIcon,
  StarIcon,
} from './FindTimeIcons';
import type { FindTimeProposal, FindTimeSuggestion } from '../api/find-time.api';
import { formatSlot } from '../utils/find-time-format';

interface FindTimeProposalResultsProps {
  proposal: FindTimeProposal;
  timeZone: string;
  isExiting: boolean;
  confirmingSuggestionId: string | null;
  onSelect: (suggestion: FindTimeSuggestion) => void;
}

export function FindTimeProposalResults({
  proposal,
  timeZone,
  isExiting,
  confirmingSuggestionId,
  onSelect,
}: FindTimeProposalResultsProps) {
  return (
    <>
      {/* Parsed Intent Readback */}
      <div className={`${styles.readback} ${isExiting ? styles.proposalExiting : ''}`}>
        {proposal.readback ? (
          <>
            <span className={`${styles.chip} ${styles.chipTitle}`}>
              <StarIcon />
              <span>{proposal.readback.title}</span>
            </span>
            <span className={styles.chip}>
              <ClockIcon />
              <span>{proposal.readback.durationLabel}</span>
            </span>
            {proposal.readback.dateLabel && (
              <span className={styles.chip}>
                <CalendarIcon />
                <span>{proposal.readback.dateLabel}</span>
              </span>
            )}
            {proposal.readback.timeLabel && (
              <span className={styles.chip}>
                <span>{proposal.readback.timeLabel}</span>
              </span>
            )}
            {proposal.readback.location && (
              <span className={styles.chip}>
                <MapPinIcon />
                <span>{proposal.readback.location}</span>
              </span>
            )}
          </>
        ) : (
          <>
            <span className={`${styles.chip} ${styles.chipTitle}`}>
              <StarIcon />
              <span>{proposal.task.title}</span>
            </span>
            <span className={styles.chip}>
              <ClockIcon />
              <span>{formatDuration(proposal.task.durationMinutes)}</span>
            </span>
          </>
        )}
      </div>

      {/* Available Slots Display */}
      <div className={`${styles.results} ${isExiting ? styles.proposalExiting : ''}`}>
        <div className={styles.resultsHeader}>
          <div className={styles.resultsTitleGroup}>
            <span className={styles.resultsHeading}>Verified Open Slots</span>
            <span className={styles.resultsBadge}>✦ Guaranteed Conflict-Free</span>
          </div>
          <span className={styles.resultsSub}>Ranked by optimal availability</span>
        </div>

        <div className={styles.slotList}>
          {proposal.suggestions.map((suggestion, index) => {
            const isTopPick = suggestion.rank === 1;
            const isBooking = confirmingSuggestionId === suggestion.id;
            const isOtherBooking = confirmingSuggestionId !== null && !isBooking;

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
                    disabled={confirmingSuggestionId !== null}
                    onClick={() => onSelect(suggestion)}
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
    </>
  );
}
