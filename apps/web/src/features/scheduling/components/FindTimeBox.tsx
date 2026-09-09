import { formatDuration } from '@cal/domain';
import React, { useId, useState } from 'react';

import styles from './FindTimeBox.module.css';
import { DEFAULT_MEETING_MINUTES, type FindTimeSuggestion } from '../api/find-time.api';
import { useFindTime } from '../hooks/useFindTime';

const PLACEHOLDER = 'Try “15-minute meeting with Andrew”';

const TIME_OF_DAY_LABELS: Record<string, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
};

export interface FindTimeBoxProps {
  timeZone: string;
  /** Called with the chosen slot so the page can open it for confirmation. */
  onSelectSlot?: (suggestion: FindTimeSuggestion) => void;
}

/**
 * The free-text scheduling box on Today. The text is parsed deterministically
 * in `@cal/domain`; the server finds genuinely open slots and ranks them.
 */
export function FindTimeBox({ timeZone, onSelectSlot }: FindTimeBoxProps) {
  const [text, setText] = useState('');
  const findTime = useFindTime();
  const inputId = useId();

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    findTime.submit(text, timeZone);
  };

  const canSubmit = text.trim().length > 0 && !findTime.isPending;

  return (
    <section className={styles.container} aria-label="Find a time">
      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.inputWrap}>
          <span className={styles.inputIcon} aria-hidden="true">
            <SparkleIcon />
          </span>
          <input
            id={inputId}
            className={styles.input}
            type="text"
            value={text}
            placeholder={PLACEHOLDER}
            aria-label="Describe what you want to schedule"
            onChange={(event) => {
              setText(event.target.value);
              if (findTime.proposal || findTime.errorMessage) findTime.reset();
            }}
          />
        </div>
        <button type="submit" className={styles.submit} disabled={!canSubmit}>
          {findTime.isPending ? 'Finding…' : 'Find time'}
        </button>
      </form>

      {!findTime.proposal && !findTime.errorMessage && (
        <p className={styles.hint}>
          Describe a meeting and BCal will suggest the three best open slots in your schedule.
        </p>
      )}

      {findTime.intent && findTime.proposal && (
        <div className={styles.readback}>
          <span className={`${styles.chip} ${styles.chipTitle}`}>{findTime.intent.title}</span>
          <span className={styles.chip}>
            {formatDuration(findTime.intent.durationMinutes ?? DEFAULT_MEETING_MINUTES)}
            {findTime.intent.durationMinutes === null ? ' (default)' : ''}
          </span>
          {findTime.intent.dayHint && (
            <span className={styles.chip}>
              {findTime.intent.dayHint === 'today' ? 'Today' : 'Tomorrow'}
            </span>
          )}
          {findTime.intent.preferredTimeOfDay !== 'any' && (
            <span className={styles.chip}>
              {TIME_OF_DAY_LABELS[findTime.intent.preferredTimeOfDay]}
            </span>
          )}
        </div>
      )}

      {findTime.proposal && (
        <div className={styles.results}>
          <p className={styles.resultsHeading}>Best times</p>
          {findTime.proposal.suggestions.map((suggestion) => {
            const body = (
              <>
                <span className={styles.rank} aria-hidden="true">
                  {suggestion.rank}
                </span>
                <span className={styles.slotBody}>
                  <span className={styles.slotTime}>
                    {formatSlot(suggestion.startAt, suggestion.endAt, timeZone)}
                  </span>
                  <span className={styles.slotReason}>{suggestion.reason}</span>
                </span>
              </>
            );

            // Without a handler the slot is presentational: never offer a dead click.
            return onSelectSlot ? (
              <button
                key={suggestion.id}
                type="button"
                className={styles.slot}
                onClick={() => onSelectSlot(suggestion)}
              >
                {body}
              </button>
            ) : (
              <div key={suggestion.id} className={styles.slotStatic}>
                {body}
              </div>
            );
          })}
        </div>
      )}

      {findTime.errorMessage && (
        <p className={styles.error} role="alert">
          {findTime.errorMessage}
        </p>
      )}
    </section>
  );
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

function SparkleIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4" strokeLinecap="round" />
      <path d="M12 8l1.2 2.8L16 12l-2.8 1.2L12 16l-1.2-2.8L8 12l2.8-1.2L12 8z" />
    </svg>
  );
}
