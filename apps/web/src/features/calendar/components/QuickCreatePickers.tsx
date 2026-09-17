import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';

import styles from './QuickCreatePickers.module.css';

export interface TimePickerOption {
  value: string;
  label: string;
  detail?: string;
}

export function formatDurationBetweenTimes(startTime: string, endTime: string): string | undefined {
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);
  const duration =
    (endHour ?? 0) * 60 + (endMinute ?? 0) - ((startHour ?? 0) * 60 + (startMinute ?? 0));
  if (duration <= 0) return undefined;
  if (duration < 60) return `${duration} min${duration === 1 ? '' : 's'}`;
  if (duration % 60 === 0) {
    const hours = duration / 60;
    return `${hours} hr${hours === 1 ? '' : 's'}`;
  }
  if (duration % 30 === 0) return `${duration / 60} hrs`;
  const hours = Math.floor(duration / 60);
  const minutes = duration % 60;
  return `${hours} hr ${minutes} mins`;
}

interface AnchoredPosition {
  top: number;
  left: number;
}

function useAnchoredPosition(
  isOpen: boolean,
  triggerRef: RefObject<HTMLElement | null>,
  menuWidth: number,
  estimatedHeight: number,
): AnchoredPosition {
  const [position, setPosition] = useState<AnchoredPosition>({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current) return;

    const update = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const viewportPadding = 12;
      const gap = 6;
      const fitsBelow = rect.bottom + gap + estimatedHeight <= window.innerHeight - viewportPadding;
      const top = fitsBelow
        ? rect.bottom + gap
        : Math.max(viewportPadding, rect.top - estimatedHeight - gap);
      const left = Math.max(
        viewportPadding,
        Math.min(rect.left, window.innerWidth - menuWidth - viewportPadding),
      );
      setPosition({ top: Math.round(top), left: Math.round(left) });
    };

    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [estimatedHeight, isOpen, menuWidth, triggerRef]);

  return position;
}

function useDismissPicker(
  isOpen: boolean,
  triggerRef: RefObject<HTMLElement | null>,
  menuRef: RefObject<HTMLElement | null>,
  onDismiss: () => void,
) {
  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      onDismiss();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isOpen, menuRef, onDismiss, triggerRef]);
}

function dateFromKey(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1, 12);
}

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function QuickCreateDatePicker({
  value,
  displayValue,
  onChange,
  ariaLabel,
}: {
  value: string;
  displayValue: string;
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const selected = dateFromKey(value);
    return new Date(selected.getFullYear(), selected.getMonth(), 1, 12);
  });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selectedDayRef = useRef<HTMLButtonElement>(null);
  const position = useAnchoredPosition(isOpen, triggerRef, 288, 328);

  useEffect(() => {
    if (!isOpen) return;
    const selected = dateFromKey(value);
    setVisibleMonth(new Date(selected.getFullYear(), selected.getMonth(), 1, 12));
  }, [isOpen, value]);

  useDismissPicker(isOpen, triggerRef, menuRef, () => setIsOpen(false));

  useEffect(() => {
    if (!isOpen) return;
    const frame = requestAnimationFrame(() => {
      selectedDayRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen, visibleMonth]);

  const days = useMemo(() => {
    const firstGridDay = new Date(
      visibleMonth.getFullYear(),
      visibleMonth.getMonth(),
      1 - visibleMonth.getDay(),
      12,
    );
    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(firstGridDay);
      day.setDate(firstGridDay.getDate() + index);
      return day;
    });
  }, [visibleMonth]);

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      setIsOpen(false);
      triggerRef.current?.focus();
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles.pickerTrigger}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        data-value={value}
        onClick={() => setIsOpen((current) => !current)}
      >
        {displayValue}
      </button>

      {isOpen
        ? createPortal(
            <div
              ref={menuRef}
              className={styles.calendarPopover}
              role="dialog"
              aria-label="Choose date"
              style={{ top: position.top, left: position.left }}
              onKeyDown={handleMenuKeyDown}
            >
              <div className={styles.calendarHeader}>
                <strong>
                  {visibleMonth.toLocaleDateString('en-US', {
                    month: 'long',
                    year: 'numeric',
                  })}
                </strong>
                <div className={styles.monthActions}>
                  <button
                    type="button"
                    aria-label="Previous month"
                    onClick={() =>
                      setVisibleMonth(
                        (current) => new Date(current.getFullYear(), current.getMonth() - 1, 1, 12),
                      )
                    }
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    aria-label="Next month"
                    onClick={() =>
                      setVisibleMonth(
                        (current) => new Date(current.getFullYear(), current.getMonth() + 1, 1, 12),
                      )
                    }
                  >
                    ›
                  </button>
                </div>
              </div>
              <div className={styles.weekdayRow} aria-hidden="true">
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
                  <span key={`${day}-${index}`}>{day}</span>
                ))}
              </div>
              <div className={styles.dayGrid}>
                {days.map((day) => {
                  const key = dateKey(day);
                  const isSelected = key === value;
                  const isOutsideMonth = day.getMonth() !== visibleMonth.getMonth();
                  return (
                    <button
                      key={key}
                      ref={isSelected ? selectedDayRef : undefined}
                      type="button"
                      className={`${styles.dayButton} ${
                        isSelected ? styles.dayButtonSelected : ''
                      } ${isOutsideMonth ? styles.dayButtonOutside : ''}`}
                      aria-label={day.toLocaleDateString('en-US', {
                        weekday: 'long',
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                      aria-pressed={isSelected}
                      onClick={() => {
                        onChange(key);
                        setIsOpen(false);
                        triggerRef.current?.focus();
                      }}
                    >
                      {day.getDate()}
                    </button>
                  );
                })}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

export function QuickCreateTimePicker({
  value,
  options,
  onChange,
  ariaLabel,
  disabled = false,
  menuWidth = 164,
}: {
  value: string;
  options: readonly TimePickerOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  disabled?: boolean;
  menuWidth?: number;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);
  const position = useAnchoredPosition(isOpen, triggerRef, menuWidth, 280);
  const selected = options.find((option) => option.value === value);

  useDismissPicker(isOpen, triggerRef, menuRef, () => setIsOpen(false));

  useEffect(() => {
    if (!isOpen) return;
    const frame = requestAnimationFrame(() => {
      const selectedOption = selectedRef.current;
      const menu = menuRef.current;
      selectedOption?.focus({ preventScroll: true });
      if (selectedOption && menu) {
        menu.scrollTop =
          selectedOption.offsetTop - menu.clientHeight / 2 + selectedOption.offsetHeight / 2;
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen]);

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      setIsOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const buttons = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [],
    );
    const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const direction = event.key === 'ArrowDown' ? 1 : -1;
    const nextIndex = Math.max(0, Math.min(buttons.length - 1, currentIndex + direction));
    buttons[nextIndex]?.focus();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles.pickerTrigger}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        disabled={disabled}
        data-value={value}
        onClick={() => setIsOpen((current) => !current)}
      >
        {selected?.label ?? value}
      </button>

      {isOpen
        ? createPortal(
            <div
              ref={menuRef}
              className={styles.timeMenu}
              role="listbox"
              aria-label={ariaLabel}
              style={{ top: position.top, left: position.left, width: menuWidth }}
              onKeyDown={handleMenuKeyDown}
            >
              {options.map((option) => {
                const isSelected = option.value === value;
                return (
                  <button
                    key={option.value}
                    ref={isSelected ? selectedRef : undefined}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`${styles.timeOption} ${
                      isSelected ? styles.timeOptionSelected : ''
                    }`}
                    onClick={() => {
                      onChange(option.value);
                      setIsOpen(false);
                      triggerRef.current?.focus();
                    }}
                  >
                    <span>{option.label}</span>
                    {option.detail ? (
                      <span className={styles.timeDetail}>{option.detail}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
