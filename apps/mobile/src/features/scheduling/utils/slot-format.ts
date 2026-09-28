/** e.g. "Thu, Sep 10". */
export function formatSlotDay(startAt: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone,
  }).format(new Date(startAt));
}

/**
 * e.g. "3:45 – 4:00 PM", or "11:45 AM – 12:15 PM" when the slot crosses noon or
 * midnight. Repeating a meridiem that has not changed only costs width.
 */
export function formatSlotRange(startAt: string, endAt: string, timeZone: string): string {
  const start = new Date(startAt);
  const end = new Date(endAt);
  const startParts = clockParts(start, timeZone);
  const endParts = clockParts(end, timeZone);

  return startParts.meridiem === endParts.meridiem
    ? `${startParts.time} – ${endParts.time} ${endParts.meridiem}`
    : `${startParts.time} ${startParts.meridiem} – ${endParts.time} ${endParts.meridiem}`;
}

/** e.g. "Thu, Sep 10 · 3:45 PM – 4:00 PM". Used where width is not scarce. */
export function formatSlot(startAt: string, endAt: string, timeZone: string): string {
  return `${formatSlotDay(startAt, timeZone)} · ${formatSlotRange(startAt, endAt, timeZone)}`;
}

function clockParts(value: Date, timeZone: string): { time: string; meridiem: string } {
  const formatted = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).format(value);

  // "3:45 PM" -> { time: "3:45", meridiem: "PM" }. A 24-hour locale has no
  // meridiem to split off, in which case the whole string is the time.
  const separator = formatted.lastIndexOf(' ');
  if (separator === -1) return { time: formatted, meridiem: '' };

  return {
    time: formatted.slice(0, separator),
    meridiem: formatted.slice(separator + 1),
  };
}

/**
 * An all-day span by its days, e.g. "Sat, Sep 26 – Mon, Sep 28". The stored end
 * is the midnight after the last day, so the label steps back to that day.
 */
export function formatAllDaySpan(startAt: string, endAt: string, timeZone: string): string {
  const first = formatSlotDay(startAt, timeZone);
  const last = formatSlotDay(new Date(new Date(endAt).getTime() - 1).toISOString(), timeZone);
  return first === last ? `${first} · All day` : `${first} – ${last}`;
}
