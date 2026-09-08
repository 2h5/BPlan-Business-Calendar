# Calendar views

How the calendar renders, and why it is split the way it is.

## One bounded window, platform views

Both clients have a `useCalendarWindow` hook and platform-specific view
components. The hooks share the same bounded-window pipeline:

1. Computes the window the current view needs.
2. Fetches the events overlapping it.
3. Expands recurring events into occurrences.
4. Filters hidden calendars.
5. Buckets occurrences by local date key.

Mobile exposes day, week, month, and agenda views; the current web toolbar
exposes day, week, and month. None of the view components fetches, expands, or
filters on its own — a view that did would drift from the others the first time
a recurrence or visibility rule changed. Shared recurrence, timezone, and
layout behavior lives in `@cal/domain`; window hooks and rendering remain
platform-specific.

## Why occurrences, not events

A recurring series is represented by a master row in `events` with an RRULE;
provider-materialized exception rows may also be present. The window read
therefore cannot filter recurring masters by start time — a weekly series that
began last year still has occurrences this week — so the platform API modules
pull master rows and `@cal/domain` decides what lands in range. Moved or
cancelled provider instances retain their recurring-series identity and
original occurrence start so they can override the master without changing its
RRULE.

Each occurrence gets a key of `<eventId>:<occurrenceIndex>`. Using the event id
alone would collapse a whole series into one item.

## Time zones

Occurrences are generated as **wall-clock date parts in the event's own zone**
and converted to instants afterwards. This is the property that keeps a 09:00
standup at 09:00 across a DST change rather than sliding to 08:00 or 10:00.

Day bucketing steps in local days via `addZonedDays`, never by adding
86,400,000 ms — a fixed-millisecond step drifts across a DST boundary and can
skip or repeat a day.

## Layout

Overlap layout is pure geometry in `@cal/domain`
(`layoutOverlappingEvents`): it takes intervals and returns fractional
left/width offsets. Views multiply by their own pixel dimensions. Each day
column runs its own layout pass, so a busy Tuesday cannot squeeze Wednesday.

## What each view is for

| View   | Question it answers                     | Detail shown                           |
| ------ | --------------------------------------- | -------------------------------------- |
| Day    | What does today look like hour by hour? | Full timeline, now indicator           |
| Week   | Where is my free time this week?        | Seven columns, compact chips           |
| Month  | How busy am I?                          | Coloured dots per calendar, not titles |
| Agenda | What is coming up?                      | Chronological list, empty days skipped |

Month deliberately shows dots rather than titles. At that density a title is
unreadable, and pretending otherwise costs the whole grid its legibility.
Tapping a day drops into the day view for the detail.

## Recurrence support

`parseRRule` implements a deliberate expansion subset: daily, weekly (including
WKST), absolute and ordinal monthly/yearly patterns, INTERVAL, COUNT, and UNTIL.
Anything outside that subset returns `null`. That parser capability is not a
persistence gate: `recurrence_rule` is opaque text at the database/API
boundary. An adapter may preserve provider text or translate it into the
normalized RRULE representation, but it must not silently rewrite a series into
a different meaning.

The adapters have provider-specific behavior. Google currently extracts and
stores the `RRULE` line; auxiliary `EXDATE`, `RDATE`, and `EXRULE` lines are not
represented in the single `recurrence_rule` field, while separately synced
exception rows retain their identity. Microsoft translates supported Graph
patterns and fails closed for unsupported or malformed inbound patterns; its
outbound translator likewise rejects constructs Graph cannot represent. This
is an implementation limitation worth preserving in the documentation, not a
reason to claim that every provider rule is rejected before persistence.

For rendering, an unsupported stored rule is treated as one occurrence. For
availability, `schedulingEventsToBusyIntervals` fails closed for an unsupported
non-cancelled recurrence rather than inventing free time. The web editor keeps
an unchanged unsupported recurrence string and requires a supported replacement
when the user edits the recurrence. This separates safe provider-data
preservation from the subset the local recurrence engine can expand.

## Alerts

Event alerts and task reminders share `PlannedReminder` and are reconciled in
**one** pass by `useReminderSync`. They compete for the same capped OS queue,
and the reconcile cancels any pending notification it did not plan — so two
independent reconciles would each tear down the other's alerts on every run.

Keys are namespaced (`event:<id>:<index>:<minutes>` vs `task:<id>:<kind>`) so a
collision cannot cancel the wrong notification.
