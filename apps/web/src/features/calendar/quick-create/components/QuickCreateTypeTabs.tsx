import { SegmentIndicator } from '../../../../components/segmented/SegmentIndicator';
import { useSegmentIndicator } from '../../../../components/segmented/useSegmentIndicator';
import styles from '../QuickCreatePopover.module.css';

interface QuickCreateTypeTabsProps {
  mode: 'event' | 'task';
  onSelectEvent: () => void;
  onSelectTask: () => void;
}

/** Event / Task switch, with a pill that glides to the selected type. */
export function QuickCreateTypeTabs({
  mode,
  onSelectEvent,
  onSelectTask,
}: QuickCreateTypeTabsProps) {
  const ref = useSegmentIndicator<HTMLDivElement>(mode);
  return (
    <div ref={ref} className={styles.typeTabs} role="tablist" aria-label="Creation type">
      <SegmentIndicator className={styles.typeTabsIndicator} />
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'event'}
        className={`${styles.tabButton} ${mode === 'event' ? styles.tabButtonActive : ''}`}
        onClick={onSelectEvent}
      >
        Event
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'task'}
        className={`${styles.tabButton} ${mode === 'task' ? styles.tabButtonActive : ''}`}
        onClick={onSelectTask}
      >
        Task
      </button>
    </div>
  );
}
