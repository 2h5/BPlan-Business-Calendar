-- Per-event colour override.
--
-- Colour has always come from the event's calendar. This column lets one event
-- differ from the rest of its calendar without moving calendars. NULL means
-- "inherit the calendar's colour", which is how every existing row behaves —
-- so the column is added without a default and nothing needs backfilling.
alter table public.events
  add column color text
    check (color is null or color ~ '^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$');

comment on column public.events.color is
  'Hex colour overriding the calendar''s colour for this event. NULL = inherit.';
