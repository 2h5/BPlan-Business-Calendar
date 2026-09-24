import type { CSSProperties } from 'react';

import styles from './DayBar.module.css';
import { formatHourMark, type DayBarModel, type DayBarSegment } from '../utils/day-bar';

export interface DayBarProps {
  model: DayBarModel;
  hourCycle: 'h12' | 'h23';
  /** Hover text for a segment, e.g. "Standup · 9:00 – 9:30 AM". */
  describeSegment: (segment: DayBarSegment) => string;
  /** Opens a busy segment's event. */
  onOpenSegment?: (segment: DayBarSegment) => void;
}

/**
 * The day at a glance as one horizontal strip, laid out by `buildDayBar`
 * exactly as on mobile: events as solid blocks in their calendar colour, free
 * working time as open green slots, and a red tick for now.
 *
 * The web adds what a pointer and a wide screen allow: hourly gridlines,
 * shading over the part of the day already gone, a hover label on every
 * segment, and events that open when clicked.
 */
export function DayBar({ model, hourCycle, describeSegment, onOpenSegment }: DayBarProps) {
  const hours = (model.endMinute - model.startMinute) / 60;
  const gridlines = Array.from({ length: Math.max(0, hours - 1) }, (_, index) => {
    return ((index + 1) / hours) * 100;
  });

  return (
    <div className={styles.root}>
      <div className={styles.track}>
        {gridlines.map((percent) => (
          <span key={percent} className={styles.gridline} style={{ left: `${percent}%` }} />
        ))}
        <span className={styles.elapsed} style={{ width: `${model.nowPercent}%` }} />

        {model.segments.map((segment, index) => {
          const live =
            segment.kind === 'busy' &&
            !segment.past &&
            segment.left <= model.nowPercent &&
            model.nowPercent < segment.left + segment.width;
          const freeNow =
            segment.kind === 'free' &&
            segment.left <= model.nowPercent &&
            model.nowPercent < segment.left + segment.width;
          const label = describeSegment(segment);
          const style = {
            left: `${segment.left}%`,
            width: `${segment.width}%`,
            '--segment-color': segment.color ?? 'var(--color-accent)',
            '--segment-index': index,
          } as CSSProperties;
          const className = [
            styles.segment,
            segment.kind === 'free' ? styles.free : styles.busy,
            segment.past ? styles.past : '',
            live ? styles.live : '',
            freeNow ? styles.freeNow : '',
          ].join(' ');

          return segment.kind === 'busy' && onOpenSegment ? (
            <button
              key={segment.key}
              type="button"
              className={className}
              style={style}
              aria-label={`Open ${label}`}
              onClick={() => onOpenSegment(segment)}
            >
              <span className={styles.tooltip} aria-hidden>
                {label}
              </span>
            </button>
          ) : (
            <span key={segment.key} className={className} style={style} aria-hidden>
              <span className={styles.tooltip}>{label}</span>
            </span>
          );
        })}

        <span className={styles.now} style={{ left: `${model.nowPercent}%` }} aria-hidden />
      </div>

      <div className={styles.labels} aria-hidden>
        {model.labels.map((label, index) => {
          const first = index === 0;
          const last = index === model.labels.length - 1;
          return (
            <span
              key={label.minute}
              className={`${styles.label} ${first ? styles.labelFirst : ''} ${last ? styles.labelLast : ''}`}
              style={last ? undefined : { left: `${label.percent}%` }}
            >
              {formatHourMark(label.minute, hourCycle)}
            </span>
          );
        })}
      </div>

      <div className={styles.legend} aria-hidden>
        <span className={styles.legendKey}>
          <span className={`${styles.swatch} ${styles.swatchFree}`} />
          Free
        </span>
        <span className={styles.legendKey}>
          <span className={`${styles.swatch} ${styles.swatchNow}`} />
          Now
        </span>
      </div>
    </div>
  );
}
