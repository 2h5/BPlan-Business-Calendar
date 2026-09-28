import styles from './SegmentIndicator.module.css';

/**
 * The raised pill behind a segmented control's selected option. Render it as
 * the container's first child and attach `useSegmentIndicator` to the
 * container; the options must be `position: relative` to sit above it.
 */
export function SegmentIndicator({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={className ? `${styles.indicator} ${className}` : styles.indicator}
    />
  );
}
