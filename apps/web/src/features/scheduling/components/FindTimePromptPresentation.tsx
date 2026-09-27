import type React from 'react';
import { Link } from 'react-router-dom';

import styles from './FindTimeBox.module.css';
import { ArrowRightIcon, HelpCircleIcon, LockIcon, SparkleIcon, StarIcon } from './FindTimeIcons';
import { FindTimeRotatingPrompt } from './FindTimeRotatingPrompt';
import { FIND_TIME_PLACEHOLDER_EXAMPLE } from '../utils/find-time-prompts';

interface FindTimeLockedTeaserProps {
  inputId: string;
}

export function FindTimeLockedTeaser({ inputId }: FindTimeLockedTeaserProps) {
  return (
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
            placeholder={`Try ${FIND_TIME_PLACEHOLDER_EXAMPLE}`}
            aria-label="Find Time with AI is available on the Pro plan"
          />
        </div>
        <Link to="/subscription" className={styles.upgradeButton}>
          <span>Upgrade to Pro</span>
          <ArrowRightIcon />
        </Link>
      </div>

      <p className={styles.lockedDescription}>
        BPlan interprets your natural-language requests and finds optimal, conflict-free openings on
        your calendar. Upgrade to Pro to unlock AI scheduling.
      </p>
    </div>
  );
}

interface FindTimeActivePromptProps {
  inputId: string;
  inputRef: React.Ref<HTMLInputElement>;
  text: string;
  isPending: boolean;
  canSubmit: boolean;
  showHint: boolean;
  clarificationQuestion: string | null;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
  onInputChange: React.ChangeEventHandler<HTMLInputElement>;
  onInputKeyDown: React.KeyboardEventHandler<HTMLInputElement>;
}

export function FindTimeActivePrompt({
  inputId,
  inputRef,
  text,
  isPending,
  canSubmit,
  showHint,
  clarificationQuestion,
  onSubmit,
  onInputChange,
  onInputKeyDown,
}: FindTimeActivePromptProps) {
  return (
    <>
      <form className={styles.form} onSubmit={onSubmit}>
        <div className={`${styles.inputWrap} ${isPending ? styles.inputWrapScanning : ''}`}>
          <span
            className={`${styles.inputIcon} ${isPending ? styles.inputIconScanning : ''}`}
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
            placeholder=""
            aria-label="Describe what you want to schedule"
            onChange={onInputChange}
            onKeyDown={onInputKeyDown}
          />
          {!text && !isPending && <FindTimeRotatingPrompt />}
        </div>
        <button
          type="submit"
          className={`${styles.submit} ${isPending ? styles.submitFinding : ''}`}
          disabled={!canSubmit}
        >
          {isPending ? (
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

      {showHint && (
        <p className={styles.hint}>
          Describe a meeting and BPlan will suggest the three best open slots in your schedule.
        </p>
      )}

      {/* Loading Radar / Shimmering Skeletons while finding */}
      {isPending && (
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
      {clarificationQuestion !== null && (
        <div className={styles.clarificationCard} role="status">
          <div className={styles.clarificationHeader}>
            <div className={styles.clarificationIconWrap}>
              <HelpCircleIcon />
            </div>
            <div className={styles.clarificationMain}>
              <div className={styles.clarificationTag}>BPlan needs more verification</div>
              <p className={styles.clarificationQuestion}>{clarificationQuestion}</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
