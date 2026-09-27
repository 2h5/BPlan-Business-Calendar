import type { Calendar } from '@cal/schemas';

import {
  QuickCreateDatePicker,
  QuickCreateTimePicker,
  type TimePickerOption,
} from './QuickCreatePickers';
import { Select } from '../../../../components/forms/Select';
import styles from '../QuickCreatePopover.module.css';

interface QuickCreateEventFieldsProps {
  startDate: string;
  startDateDisplay: string;
  onStartDateChange: (value: string) => void;
  startTime: string;
  startTimeOptions: readonly TimePickerOption[];
  onStartTimeChange: (value: string) => void;
  endTime: string;
  endTimePickerOptions: readonly TimePickerOption[];
  onEndTimeChange: (value: string) => void;
  allDay: boolean;
  onAllDayChange: (checked: boolean) => void;
  writableCalendars: readonly Calendar[];
  selectedCalendarColor: string | undefined;
  calendarId: string;
  defaultCalendarId: string;
  onCalendarChange: (value: string) => void;
  location: string;
  onLocationChange: (value: string) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
}

export function QuickCreateEventFields({
  startDate,
  startDateDisplay,
  onStartDateChange,
  startTime,
  startTimeOptions,
  onStartTimeChange,
  endTime,
  endTimePickerOptions,
  onEndTimeChange,
  allDay,
  onAllDayChange,
  writableCalendars,
  selectedCalendarColor,
  calendarId,
  defaultCalendarId,
  onCalendarChange,
  location,
  onLocationChange,
  description,
  onDescriptionChange,
}: QuickCreateEventFieldsProps) {
  return (
    <>
      {/* Event Date & Time */}
      <div className={styles.fieldRowTopAligned}>
        <span className={styles.fieldIconTop} aria-hidden="true">
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </span>

        <div className={styles.dateTimeContainer}>
          <div className={styles.dateTimeRow}>
            <QuickCreateDatePicker
              value={startDate}
              displayValue={startDateDisplay}
              onChange={onStartDateChange}
              ariaLabel={`Date: ${startDateDisplay}`}
            />

            <div
              className={`${styles.timeRange} ${allDay ? styles.timeRangeHidden : ''}`}
              aria-hidden={allDay}
            >
              <div className={styles.timeBoxWrapper}>
                <QuickCreateTimePicker
                  value={startTime}
                  options={startTimeOptions}
                  onChange={onStartTimeChange}
                  ariaLabel="Start time"
                  disabled={allDay}
                />
              </div>

              <span className={styles.timeSeparator}>–</span>

              <div className={styles.timeBoxWrapper}>
                <QuickCreateTimePicker
                  value={endTime}
                  options={endTimePickerOptions}
                  onChange={onEndTimeChange}
                  ariaLabel="End time"
                  disabled={allDay}
                  menuWidth={188}
                />
              </div>
            </div>
          </div>

          <div className={styles.allDayRow}>
            <label className={styles.allDayCheckbox}>
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => onAllDayChange(e.target.checked)}
              />
              <span>All day</span>
            </label>
          </div>
        </div>
      </div>

      {/* Calendar Selector */}
      <div className={styles.fieldRow}>
        <span
          className={styles.fieldIcon}
          aria-hidden="true"
          style={{ color: selectedCalendarColor ?? undefined }}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        </span>

        <div className={styles.calendarSelect}>
          <Select
            id="quick-create-calendar"
            value={calendarId || defaultCalendarId || ''}
            options={writableCalendars.map((cal) => ({
              value: cal.id,
              label: cal.name,
              color: cal.color,
            }))}
            onChange={(val) => onCalendarChange(val)}
            size="sm"
            ariaLabel="Choose calendar"
          />
        </div>
      </div>

      {/* Location (always opened by default) */}
      <div className={styles.fieldRow}>
        <span className={styles.fieldIcon} aria-hidden="true">
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
        </span>
        <input
          type="text"
          className={styles.textInput}
          placeholder="Add location"
          value={location}
          onChange={(e) => onLocationChange(e.target.value)}
          aria-label="Location"
        />
      </div>

      {/* Description (always opened by default) */}
      <div className={styles.fieldRowTopAligned}>
        <span className={styles.fieldIconTop} aria-hidden="true">
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="15" y2="18" />
          </svg>
        </span>
        <textarea
          className={styles.textareaInput}
          placeholder="Add description"
          rows={2}
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          aria-label="Description"
        />
      </div>
    </>
  );
}
