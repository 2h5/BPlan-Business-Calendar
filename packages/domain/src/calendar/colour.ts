/**
 * How an event's colour is decided.
 *
 * Colour comes from the event's calendar unless the event overrides it. Every
 * view resolves it the same way, so a colour set in the editor shows up in the
 * month grid, the timelines, and the agenda without each of them re-deciding.
 */
export function resolveEventColor(
  eventColor: string | null | undefined,
  calendarColor: string | null | undefined,
  fallback: string,
): string {
  return eventColor ?? calendarColor ?? fallback;
}

/** A named colour a user can pick for a calendar or a single event. */
export interface CalendarColorOption {
  label: string;
  /** Hex, `#RRGGBB`. */
  value: string;
}

/**
 * The palette offered wherever a colour is chosen.
 *
 * Deliberately soft and mid-toned: every one of these has to stay legible as a
 * chip label on a dark card and as a thin bar in the month grid, and they have
 * to be distinguishable from each other at a glance in a crowded week.
 */
export const CALENDAR_COLORS: readonly CalendarColorOption[] = [
  { label: 'Lemon', value: '#F7EF85' },
  { label: 'Cream', value: '#F9E3C4' },
  { label: 'Apricot', value: '#FBBE7E' },
  { label: 'Salmon', value: '#F6938A' },

  { label: 'Citron', value: '#DEE289' },
  { label: 'Green', value: '#9CE49A' },
  { label: 'Mint', value: '#96EFCC' },
  { label: 'Sky', value: '#B2E0EF' },

  { label: 'Periwinkle', value: '#9CB9F6' },
  { label: 'Lavender', value: '#C9B1F4' },
  { label: 'Orchid', value: '#FAADFA' },
  { label: 'Pink', value: '#FAB2C3' },

  { label: 'Taupe', value: '#B8ACA1' },
  { label: 'Sand', value: '#D1C092' },
  { label: 'Silver', value: '#DDDDDD' },
  { label: 'Slate', value: '#59656F' },
];
