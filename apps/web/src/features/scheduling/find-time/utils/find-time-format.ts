export function getEventDateKey(startAt?: string): string {
  try {
    if (!startAt) return '';
    const date = new Date(startAt);
    if (isNaN(date.getTime())) return '';
    return date.toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

/** e.g. "Thu, Sep 10 · 10:15 AM – 10:30 AM". */
export function formatSlot(startAt?: string, endAt?: string, timeZone?: string): string {
  if (!startAt || !endAt) return '';
  try {
    const tz = timeZone || 'UTC';
    const start = new Date(startAt);
    const end = new Date(endAt);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return '';
    const day = new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: tz,
    }).format(start);

    return `${day} · ${clockTime(start, tz)} – ${clockTime(end, tz)}`;
  } catch {
    return '';
  }
}

function clockTime(value: Date, timeZone: string): string {
  try {
    if (isNaN(value.getTime())) return '';
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone,
    }).format(value);
  } catch {
    return '';
  }
}
