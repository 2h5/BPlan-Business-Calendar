# Web feature structure reorganization

Tracks the structural-only reorganization of `apps/web/src/features/**`. Each
phase is `git mv` plus import-path updates. No behavior, state, effect, CSS or
public-API changes. One subsystem per commit.

Branch: `refactor/feature-structure` (from `main` at `c64b503`).

## Phase 1: QuickCreate (done)

### Starting layout

All QuickCreate code sat in the broad calendar buckets, next to the Timeline,
Month and CalendarView code:

```
features/calendar/
  components/  CalendarView, Timeline*, MonthView, EventEditor, ...,
               QuickCreatePopover(.tsx/.module.css/.test/.dom.test),
               QuickCreateEventFields, QuickCreateHeader, QuickCreateTaskFields,
               QuickCreatePickers(.tsx/.module.css)  (+ tests)
  hooks/       useCalendar*, useTimeline*, useQuickCreate{Actions,Draft,Lifecycle,Position},
               useFollowAnchorMotion  (+ tests)
  utils/       ~25 calendar utilities, including quick-create-time and anchor-motion
```

### Resulting layout

```
features/calendar/
  components/    CalendarView, CalendarToolbar, Timeline*, MonthView, EventEditor, ...
  hooks/         useCalendar*, useTimeline*
  utils/         shared calendar utilities (incl. popover-position, event-form, new-event-*)
  quick-create/
    QuickCreatePopover.tsx
    QuickCreatePopover.module.css
    QuickCreatePopover.test.tsx
    QuickCreatePopover.dom.test.tsx
    components/  QuickCreateEventFields, QuickCreateHeader, QuickCreateTaskFields,
                 QuickCreatePickers(.tsx/.module.css)  (+ tests)
    hooks/       useQuickCreateActions, useQuickCreateDraft, useQuickCreateLifecycle,
                 useQuickCreatePosition, useFollowAnchorMotion  (+ tests)
    utils/       quick-create-time, anchor-motion  (+ tests)
```

No `index.ts` was added: QuickCreate has one entry point (`QuickCreatePopover`),
and the calendar feature's public API (`features/calendar/index.ts` →
`CalendarView`) is unchanged.

### Files moved (26, all 100% content-identical except import paths)

| From `features/calendar/`                       | To `features/calendar/quick-create/` |
| ----------------------------------------------- | ------------------------------------ |
| `components/QuickCreatePopover.tsx`             | `QuickCreatePopover.tsx`             |
| `components/QuickCreatePopover.module.css`      | `QuickCreatePopover.module.css`      |
| `components/QuickCreatePopover.test.tsx`        | `QuickCreatePopover.test.tsx`        |
| `components/QuickCreatePopover.dom.test.tsx`    | `QuickCreatePopover.dom.test.tsx`    |
| `components/QuickCreateEventFields(.test).tsx`  | `components/`                        |
| `components/QuickCreateHeader(.test).tsx`       | `components/`                        |
| `components/QuickCreateTaskFields(.test).tsx`   | `components/`                        |
| `components/QuickCreatePickers.tsx`, `.test.ts` | `components/`                        |
| `components/QuickCreatePickers.module.css`      | `components/`                        |
| `hooks/useQuickCreateActions(.test).ts`         | `hooks/`                             |
| `hooks/useQuickCreateDraft(.test).ts`           | `hooks/`                             |
| `hooks/useQuickCreateLifecycle(.test).ts`       | `hooks/`                             |
| `hooks/useQuickCreatePosition(.test).ts`        | `hooks/`                             |
| `hooks/useFollowAnchorMotion.ts`                | `hooks/`                             |
| `utils/quick-create-time(.test).ts`             | `utils/`                             |
| `utils/anchor-motion(.test).ts`                 | `utils/`                             |

Importers updated outside the subsystem: `CalendarView`, `EventButton`,
`MonthView`, `TimelineAllDayRow`, `TimelineView` (all for `AnchorRect` /
`QuickCreatePopover`) and `settings/components/SettingsView` (for
`QuickCreateTimePicker`). Relative `vi.mock` paths in the moved hook tests
(`../../utils/event-form`, `../../utils/popover-position`) were updated with
their imports. `QuickCreatePopover(.dom).test.tsx` stayed at the same depth,
so their `../../../test/dom` import and `../../tasks/hooks/useTasks` mock
did not change. Import order was re-sorted by `eslint --fix` (`import/order`)
where the new paths changed sort position.

### Ownership decisions

- **Moved:** everything whose only consumers are QuickCreate.
  `useFollowAnchorMotion` / `anchor-motion` have generic names, but their only
  consumer is `useQuickCreatePosition`, so they live with it.
  `quick-create-time` is used only by the popover, pickers and draft hook.
- **`QuickCreatePickers` moved despite a cross-feature consumer.** It is
  QuickCreate's picker set; `SettingsView` reuses `QuickCreateTimePicker`
  through a deep import. The import path was updated and the dependency left
  as-is (see next phases).

### Deliberately left in the calendar root

| File                            | Why it stays                                                                                                                                                                                   |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `utils/popover-position.ts`     | Owns `AnchorRect`, which `slot-selection` and `new-event-anchor` also use. Moving it would make root utilities import from the subsystem. Only `calculatePopoverPosition` is QuickCreate-only. |
| `utils/event-form.ts`           | Shared with `EventEditor`, `CalendarView` and `useCalendarEventTimingChanges`.                                                                                                                 |
| `utils/calendar-occurrences.ts` | Core calendar model (`EventOccurrence`), used everywhere.                                                                                                                                      |
| `utils/new-event-anchor.ts`     | Used only by `CalendarView`. It computes the anchor and scroll before QuickCreate opens. That is CalendarView orchestration, not popover internals.                                            |
| `utils/new-event-defaults.ts`   | Same: CalendarView seeds the slot defaults it passes into QuickCreate.                                                                                                                         |
| `utils/animate-scroll.ts`       | Used by `new-event-anchor`.                                                                                                                                                                    |
| `components/TimelineDraftEvent` | Timeline rendering of the draft slot; belongs to the Timeline phase.                                                                                                                           |

### Verification

- Moved QuickCreate tests: 12 files, 116 tests (26 DOM) pass.
- `features/calendar` + `features/settings`: 61 files, 592 tests pass.
- `pnpm verify` on Node 24.11.1 passes (web: 99 files / 862 tests).

## Findings for later phases

- **`AnchorRect` is imported through `QuickCreatePopover`.** `EventButton`,
  `MonthView`, `TimelineAllDayRow` and `TimelineView` get the type from the
  popover's re-export rather than from `utils/popover-position`, so Timeline
  and Month depend on the QuickCreate subsystem for a shared type. Pointing them
  at `utils/popover-position` is a one-line, type-only change per file and fits
  the Timeline phase.
- **Settings deep-imports `QuickCreateTimePicker`.** If more features reuse the
  pickers, promote them to a shared web component. Until then the deep import
  documents the coupling.
- **`popover-position` mixes a shared type with QuickCreate-only logic.** A
  future split (type stays, `calculatePopoverPosition` moves) would be a code
  change, not a move, so it was left out of this phase.
- **The local `pnpm` shim runs a bundled Node 20** (`Z:\Dev\Tools\Node`), so
  `pnpm verify` warns about the `>=22` engine. Run it through Node 24's
  `corepack/dist/pnpm.js`, or update the bundled Node.

## Remaining phases

1. ~~QuickCreate~~ (done, above).
2. Timeline: `TimelineView`, `TimelineAllDayRow`, `TimelineDraftEvent`,
   `useTimeline*` hooks and timeline/slot/resize/move utilities.
3. Tasks.
4. Today.
5. Scheduling / Find Time.
