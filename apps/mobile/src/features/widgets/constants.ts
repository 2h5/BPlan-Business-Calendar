/**
 * The contract shared with the native widget in `apps/mobile/targets/widget`.
 *
 * Every name here has a twin in `targets/widget/Model/SharedStore.swift`.
 * Change one, change both, and bump `WIDGET_SNAPSHOT_VERSION` when the
 * snapshot's shape changes so an old widget never misreads a new payload.
 */

/** Mirrors `ios.entitlements['com.apple.security.application-groups']` in app.json. */
export const WIDGET_APP_GROUP = 'group.com.example.calendarapp';

/** The widget's `kind`, used to ask WidgetKit to redraw it. */
export const WIDGET_KIND = 'CalendarWidget';

export const WIDGET_STORAGE_KEYS = {
  /** The JSON snapshot the widget renders. Written by the app only. */
  snapshot: 'widget.snapshot',
  /** Task ticks made on the Home Screen, waiting for the app to send them. */
  pendingTaskToggles: 'widget.pendingTaskToggles',
} as const;

export const WIDGET_SNAPSHOT_VERSION = 2;

/** Months either side of the current one that the widget can page to. */
export const WIDGET_MONTHS_BEFORE = 1;
export const WIDGET_MONTHS_AFTER = 3;

/**
 * Days from today that carry a full event list: the Today and Agenda views,
 * next week in the Week view, and rollover while the app stays closed. The
 * days of this week before today are included too, for the Week view.
 */
export const WIDGET_DAYS_AHEAD = 14;

/** Weeks the Week view can page between: this one and the next. */
export const WIDGET_WEEK_COUNT = 2;

/** Caps that keep the snapshot small; a widget can never show more than this. */
export const WIDGET_MAX_EVENTS_PER_DAY = 12;
export const WIDGET_MAX_TASKS = 8;
export const WIDGET_MAX_DOTS_PER_CELL = 3;
