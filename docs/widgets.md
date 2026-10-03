# iOS Home Screen widgets

A running log for the widget work on the `ios` branch. Newest status first;
update it whenever the widget changes.

## Status

| Piece                                         | State                                    |
| --------------------------------------------- | ---------------------------------------- |
| Calendar widget — Month view                  | Built (v1)                               |
| Calendar widget — Today view                  | Built (v1)                               |
| Tick tasks from the Home Screen               | Built (v1), sent when the app next opens |
| Calendar widget — Week view                   | Built (v2)                               |
| Calendar widget — Agenda view                 | Built (v2)                               |
| Default view per widget (Edit Widget)         | Built (v2)                               |
| "Next up" small widget                        | Not started                              |
| Control Center "New event" button (iOS 18+)   | Not started                              |
| Server push refresh (iOS 26+)                 | Not started                              |
| Real bundle id + Apple team for the App Group | **Needed before TestFlight**             |

## What the widget is

One widget, **Calendar**, in medium, large, and (iOS 27+) extra-large portrait
sizes. A square Today / Week / Month / Agenda switcher (the app's order) at
the top changes the view in place. It is icons only — the header's title already names the view —
with the chosen one raised and in the accent colour.

Each widget also has a **Default View** under Edit Widget (touch and hold →
Edit Widget). That is where the widget rests: a view switched to, or a month
or week paged to, settles back on it after ten minutes untouched, so the next
glance opens where the person chose.

- **Month** — the month grid with colour dots for busy days (event titles on
  the extra-large size). ‹ › page between last month and three months ahead; a
  dot appears to jump back. Tapping a day opens it in the app's day view. The
  medium size shows what is left of today beside the grid; the large size
  shows a "Next" line under it.
- **Today** — the date, an "up next" card in the event's colour with a live
  countdown, the rest of the day's events, and today's tasks with working
  checkboxes. Overdue tasks lead. Tapping a task title opens it in the app.
  Once today runs out, spare rows look ahead: tomorrow on large, the coming
  days on extra-large; the medium size shows tomorrow beside the tasks.
- **Week** — this week, with ‹ › to next week. Medium shows seven columns of
  event chips (titles fade out at the edge rather than end in "…"); today sits
  on a raised card and past days fade back. Large and up lay the week on a
  time grid like the app's week view: an all-day row, hour labels in the
  user's 12/24-hour clock, overlapping events side by side, and a "now" line
  across today. The grid shows at least 8–18 and stretches for early or late
  events, up to 18 hours; anything outside is left off rather than squashed.
- **Agenda** — the next two weeks grouped by day with a date column, skipping
  empty days and anything already over today. Medium uses two columns, with
  later days carrying on in the second. When everything ahead fits, it ends
  with "Clear for two weeks" so the space after reads as intentional.

## What iOS allows (as of iOS 27)

- Taps only, through buttons and toggles that run an App Intent; each tap
  redraws the widget (roughly 0.3–1 s). No scrolling, no typing, no swipes.
- Links that open the app at a specific screen.
- About 40–70 background refreshes a day; taps and app-triggered reloads
  don't count against that.
- The widget process is killed above 30 MB of memory, so the snapshot stays
  small (a few tens of KB).

## How it works

```
App (React Native)                          Widget (SwiftUI, separate process)
──────────────────                          ─────────────────────────────────
TanStack Query data                         CalendarProvider (timeline)
  → buildWidgetSnapshot()  (pure TS)          reads snapshot every 15 min
  → Zod-validated JSON                        and at midnight
  → App Group UserDefaults  ───────────────→  Month / Today views draw it
  → WidgetCenter reload
                                            Taps → App Intents:
usePendingWidgetToggles  ←───────────────    SetModeIntent, ShiftPageIntent,
  sends ticks on foreground                  ToggleTaskIntent (records a tick)
                                            Edit Widget → CalendarWidgetIntent
                                              (default view)
```

- **All calendar logic stays in TypeScript.** Recurrence expansion, time
  zones, colours, labels, task bucketing, and hidden calendars are resolved in
  `buildWidgetSnapshot` using `@cal/domain` — including each event's place in
  its day in minutes (`startMinute`/`endMinute`, clipped at midnight), which
  the Week grid draws from. Swift only works out "what day and minute is it
  now", so a widget left alone overnight moves on and the "now" line moves.
- **The widget never talks to the server.** A checkbox tick is stored in the
  App Group and drawn immediately; the app sends it through the normal
  `useToggleTaskComplete` mutation (so repeating tasks advance correctly) the
  next time it comes to the foreground.
- **Signing out clears the snapshot**, so nobody's calendar is left on the
  Home Screen.

## Where the code lives

App side — `apps/mobile/src/features/widgets/`

| File                               | Job                                                                              |
| ---------------------------------- | -------------------------------------------------------------------------------- |
| `constants.ts`                     | App Group id, storage keys, size caps. Twin of `SharedStore.swift`.              |
| `schema.ts`                        | Zod contract for the snapshot and pending ticks. Twin of `WidgetSnapshot.swift`. |
| `utils/build-snapshot.ts`          | Pure builder for the whole snapshot: months, weeks, days, tasks (tested).        |
| `utils/event-days.ts`              | Expands and buckets events into local days.                                      |
| `utils/labels.ts`                  | Weekday/month labels from date keys.                                             |
| `api/widget-storage.ts`            | The only code that touches App Group storage.                                    |
| `hooks/useWidgetSnapshotSync.ts`   | Rebuilds and writes the snapshot when data changes.                              |
| `hooks/usePendingWidgetToggles.ts` | Sends Home Screen ticks on foreground.                                           |
| `hooks/useForegroundDay.ts`        | Moves the data window on to a new day.                                           |
| `components/WidgetSync.tsx`        | Mounted once in `app/_layout.tsx`.                                               |

Deep links: `calendar?date=YYYY-MM-DD` is handled by
`features/calendar/hooks/useFocusDateFromParam.ts`; `tasks?taskId=` by the
existing `useOpenTaskFromParam`.

Widget side — `apps/mobile/targets/widget/` (Swift; `ios/` is generated)

| Folder          | Files                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------- |
| root            | `CalendarWidgetBundle.swift` (entry), `CalendarWidget.swift` (config, view switch), `expo-target.config.js`   |
| `Model/`        | `WidgetSnapshot` (decoded JSON), `SharedStore` (App Group), `WidgetClock`, `SampleSnapshot` (gallery preview) |
| `Provider/`     | `CalendarProvider` (timeline)                                                                                 |
| `Intents/`      | `CalendarWidgetIntent` (Edit Widget), `SetModeIntent`, `ShiftPageIntent`, `ToggleTaskIntent`                  |
| `Views/Shared/` | `Theme`, `GlassAware`, `ModeSwitcher`, `PageArrows`, `StackedHeader`, `EventRow`, `EventChip`, `TaskRow`, …   |
| `Views/Month/`  | `MonthWidgetView`, `MonthHeader`, `MonthGrid`                                                                 |
| `Views/Week/`   | `WeekWidgetView`, `WeekStrip` (medium), `WeekTimeGrid` (large+), `WeekDayLane` (blocks, lanes, now line)      |
| `Views/Today/`  | `TodayWidgetView`, `TodayHeader`, `UpNextCard`                                                                |
| `Views/Agenda/` | `AgendaWidgetView` (with `AgendaPlan`, which fills the room day by day)                                       |

Rule of thumb: one view or one job per file, aim under ~150 lines. A new view
(a three-day view, say) gets its own folder under `Views/` and its own case in
`WidgetMode`; it should not grow an existing file.

## Building

The widget target is added by `@bacons/apple-targets` (pinned to 4.x, the line
that supports Expo SDK 54) during prebuild:

```bash
cd apps/mobile && npx expo prebuild -p ios --clean
```

Then build the `Calendar` scheme as usual. Edit Swift under
`apps/mobile/targets/widget`; in Xcode it appears as `expo:targets/widget`.
`Assets.xcassets` and `generated.entitlements` in that folder are rewritten on
every prebuild from `expo-target.config.js`.

## Liquid Glass

An app cannot switch its own widget to glass. Glass comes from the Home Screen
style the person picks (Edit → Customize → **Clear** or **Tinted**), and it
applies to every widget at once. Tested on iOS 27: a clear or `glassEffect`
container background still draws the system's opaque platter in the normal
style, and widgets cannot read the wallpaper to fake a blur.

What the widget does instead is look right on glass. iOS tints every opaque
thing one colour there, so `Views/Shared/GlassAware.swift` provides:

- `SurfaceFill` — controls, the today badge, and checkboxes draw as a faint
  white wash on glass instead of a solid white block.
- `ColorMark` — event bars and busy-day dots are drawn as a one-pixel colour
  image with `widgetAccentedRenderingMode(.fullColor)`, stretched and clipped
  to shape, so calendar colours survive on glass (iOS 18+).
- The up-next card turns translucent on glass with its colour in a side bar:
  iOS warps a card-sized full-colour image there (bowed edges), so the card
  no longer tries to stay solid.

Use these for any new fill or calendar colour so a new view behaves on glass
too.

In the app, Settings has a **Home Screen widget** card
(`features/widgets/components/WidgetGuideCard.tsx`, iOS only) that previews the
standard and glass looks and gives the steps to add the widget and turn on
Clear. It is guidance, not a toggle, because no toggle could work.

## Known limits and decisions

- **Placeholder identity.** The bundle id is still `com.example.calendarapp`
  and the App Group is `group.com.example.calendarapp`. Both must be
  registered under a real Apple team (and `ios.appleTeamId` set in
  `app.json`) before a device or TestFlight build. Change the group id in
  `app.json`, `constants.ts`, and `SharedStore.swift` together.
- **View state per kind of widget.** WidgetKit does not tell a button which
  widget it is in, so view state is keyed by default view and size
  (`SharedStore.slot`). Two widgets that differ in either are independent; two
  identical ones share state, which is harmless since they show the same.
- **Ticks wait for the app.** A tick made on the Home Screen shows at once but
  reaches the server only when the app is next opened. Sending it straight
  from the widget would need a server endpoint and a session the widget can
  use — a later step.
- **Haptics on sync.** Sending pending ticks uses the in-app mutation, which
  plays its completion haptic as the app opens.
- **Snapshot window.** One month back, three ahead; full event lists from the
  start of this week to two weeks from today (this week and next for Week,
  the fortnight for Agenda); at most 12 events a day and 8 tasks. Snapshot
  version 2 — the widget ignores a snapshot of any other version.

## Log

- **2026-10-03** — v2: Week and Agenda views; four-view icon switcher; a
  Default View per widget under Edit Widget, with view state per widget kind
  and a ten-minute drift back to it. Snapshot v2 adds weeks, the full current
  week of days, per-day event minutes, and the hour cycle. Medium Month: the
  grid drops an all-next-month last row so the header keeps its margin.
  Verified on the simulator: medium Week and Agenda, large Week grid, Agenda,
  Month, and Today, and the Edit Widget sheet. Glass: the up-next card now
  goes translucent with a colour bar (a solid colour image warped there).

- **2026-10-03** — Settings: added the Home Screen widget card (previews and
  steps for adding the widget and the glass look).
- **2026-10-03** — Glass: confirmed apps cannot force Liquid Glass; made the
  widget glass-aware for Clear/Tinted Home Screens (translucent controls,
  calendar colours kept). Verified in Clear mode on the simulator.
- **2026-10-03** — Verified on the iPhone 18 Pro simulator (iOS 27) with real
  data: medium, large, and extra-large render; Month/Today switching, month
  paging, and the "back to this month" dot work; a Home Screen tick shows at
  once and reaches the server when the app opens (pending queue cleared,
  snapshot rewritten); tapping a day opens the app's day view; the widget
  rolled over to the new day at midnight with the app closed. Fixes from that
  pass: switcher labels truncating, month title overflowing, empty space on
  the large Today view (now fills with the days ahead).
- **2026-10-02** — v1: Calendar widget with Month and Today views, month
  paging, task checkboxes, deep links, sample gallery preview.
