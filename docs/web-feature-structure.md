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
- `pnpm verify` passes (web: 99 files / 862 tests). The top-level `pnpm` ran
  on Node 24.11.1, but its nested `pnpm` calls went through the Node 20 shim
  (see findings). Phase 2 re-ran everything on Node 24.

## Phase 2: Timeline (done)

### Starting layout

```
features/calendar/
  components/  CalendarView, CalendarToolbar, MonthView, EventEditor, ...,
               TimelineView (+ .test, .crossday.test, .ghost.test),
               TimelineAllDayRow, TimelineDraftEvent, EventButton, OriginGhost
  hooks/       useCalendar*, useTimeline{AutoScroll,GestureFeedback,GestureRecovery,
               InitialScroll,Move,Resize,SlotSelection}
  utils/       shared calendar utilities mixed with event-resize, event-conflict,
               event-magnetic-snap, event-auto-scroll, timeline-format,
               timeline-day-layout, timeline-initial-scroll, working-hours-bands,
               slot-selection
```

### Resulting layout

```
features/calendar/
  components/    CalendarView (+ .module.css), CalendarToolbar, CalendarEditor,
                 CalendarFeedback, CalendarSidebar, EventEditor, MonthView
  hooks/         useCalendar*, useCalendarWindow, useCalendars
  utils/         calendar-occurrences, calendar-preferences, calendar-window,
                 event-form, event-ownership, new-event-anchor, new-event-defaults,
                 animate-scroll, popover-position, timeline-slot-reveal,
                 view-transition
  quick-create/  (Phase 1)
  timeline/
    TimelineView.tsx (+ .test, .crossday.test, .ghost.test)
    components/  TimelineAllDayRow, TimelineDraftEvent, EventButton, OriginGhost (+ tests)
    hooks/       useTimelineAutoScroll, useTimelineGestureFeedback,
                 useTimelineGestureRecovery, useTimelineInitialScroll,
                 useTimelineMove, useTimelineResize, useTimelineSlotSelection (+ tests)
    utils/       event-auto-scroll, event-conflict, event-magnetic-snap,
                 event-resize, slot-selection, timeline-day-layout,
                 timeline-format, timeline-initial-scroll, working-hours-bands (+ tests)
```

No `timeline/index.ts`. Outside the subsystem, only `TimelineView.tsx` is
imported: `CalendarView` renders it, and `CalendarView`, `MonthView` and two
calendar hooks import its exported types. A barrel would not narrow that.

### Files moved (41)

- `components/` → `timeline/`: `TimelineView.tsx`, `TimelineView.test.tsx`,
  `TimelineView.crossday.test.tsx`, `TimelineView.ghost.test.tsx`.
- `components/` → `timeline/components/`: `TimelineAllDayRow(.test).tsx`,
  `TimelineDraftEvent(.test).tsx`, `EventButton.tsx`, `OriginGhost.tsx`.
- `hooks/` → `timeline/hooks/`: the seven `useTimeline*` hooks and their six
  tests (`useTimelineInitialScroll` has none).
- `utils/` → `timeline/utils/`: `event-auto-scroll`, `event-conflict`,
  `event-magnetic-snap`, `event-resize`, `slot-selection`,
  `timeline-day-layout`, `timeline-format`, `timeline-initial-scroll`,
  `working-hours-bands`, each with its test.

Importers updated outside the subsystem: `CalendarView`, `MonthView`,
`useCalendarEventTimingChanges` and `useCalendarTimingOverrides` (all for
`TimelineView` or its exported types). No file outside `features/calendar`
imported a moved Timeline file. QuickCreate files did not change.

### Ownership decisions

Each moved file is used only by Timeline code (or by its own test).

- **`EventButton`** has a generic name but only `TimelineView` and
  `TimelineAllDayRow` render it. `MonthView` has its own markup.
- **`event-resize`** (`MinuteInterval`, `ResizeEdge`, move/resize geometry,
  `isEventMovable`) is used by `EventButton`, `OriginGhost`, `TimelineView`,
  the gesture hooks and the Timeline layout utilities. Nothing at the calendar
  level uses it. Its own dependency, `event-ownership`, is shared with
  `useCalendarMutations` and stays in the root.
- **`timeline-format`**: its consumers are all Timeline (`EventButton`,
  `TimelineDraftEvent`, `TimelineView`).
- **`event-conflict` / `event-magnetic-snap`**: only the move and resize hooks
  use them.

### Deliberately kept shared

- **`components/CalendarView.module.css`**: shared by CalendarView, Toolbar,
  Sidebar, Editor, Feedback, EventEditor, MonthView and Timeline. Splitting it
  is CSS work, not a move. Timeline imports
  `../../components/CalendarView.module.css`.
- **`utils/timeline-slot-reveal.ts`**: its only consumer is `new-event-anchor`
  (CalendarView reveals the new slot before QuickCreate opens). Moving it would
  make a root utility import from `timeline/`.
- **`utils/popover-position.ts`**: owns `AnchorRect`, which Timeline, Month,
  CalendarView and QuickCreate all use.
- **`hooks/useCalendarWindow.ts`, `utils/calendar-window.ts`,
  `utils/calendar-occurrences.ts`**: the core calendar model, used by Month,
  Today, QuickCreate and Timeline.
- **`hooks/useCalendarEventTimingChanges.ts`,
  `hooks/useCalendarTimingOverrides.ts`**: CalendarView orchestration. They
  import the `EventTiming` type from `TimelineView` but are not Timeline
  internals.
- **`components/MonthView.tsx`**: a sibling view. It imports the
  `DraftEventState` / `SlotSelection` types from `TimelineView`.

### AnchorRect cleanup

`EventButton`, `MonthView`, `TimelineAllDayRow`, `TimelineView` and
`CalendarView` now import `AnchorRect` from `utils/popover-position` instead of
through `QuickCreatePopover`'s re-export. In `CalendarView` this splits
`import { QuickCreatePopover, type AnchorRect }` into a value import plus a
type import. This change is type-only. `QuickCreatePopover` still has
`export type { AnchorRect }` (QuickCreate was left untouched), but nothing
imports it now.

### Non-path changes

- `TimelineView.ghost.test.tsx` reads the shared CSS from disk with
  `path.resolve(__dirname, 'CalendarView.module.css')`. The string became
  `'../components/CalendarView.module.css'`. The test logic is unchanged.
- Prettier collapsed one multi-line `event-conflict` import in
  `TimelineView.crossday.test.tsx` onto one line now that the path is shorter.
- `eslint --fix` re-sorted imports where the new paths changed `import/order`.

### Verification

- Moved Timeline tests: 20 files, 282 tests pass.
- `features/calendar` + `features/settings` + `features/today`: 69 files, 638
  tests pass.
- `pnpm verify` passes with every nested `pnpm` on Node 24.11.1 and no engine
  warning (web: 99 files / 862 tests, the same count as before).

## Phase 3: Tasks (done)

### Starting layout

```
features/tasks/
  api/         tasks.api (+ test)
  hooks/       useTasks, useTaskBuckets (+ test)
  utils/       taskInspectorForm (+ test)
  components/  TasksView (+ .module.css),
               TaskInspector (+ .module.css, .dom.test), TaskInspectorFields (+ test),
               TaskListPane (+ .module.css, .dom.test), TaskListHeaderControls (+ test),
               TaskListSection (+ test), TaskQuickAdd (+ test),
               TaskRow (+ .module.css, .dom.test)
  index.ts
```

### Resulting layout

```
features/tasks/
  api/         tasks.api (+ test)
  hooks/       useTasks, useTaskBuckets (+ test)
  components/  TasksView (+ .module.css)
  inspector/
    TaskInspector.tsx / .module.css / .dom.test.tsx
    TaskInspectorFields.tsx / .test.tsx
    utils/     taskInspectorForm (+ test)
  list/
    TaskListPane.tsx / .module.css / .dom.test.tsx
    TaskListHeaderControls.tsx / .test.tsx
    TaskListSection.tsx / .test.tsx
    TaskQuickAdd.tsx / .test.tsx
    TaskRow.tsx / .module.css / .dom.test.tsx
  index.ts
```

`tasks/utils/` is gone. Its only file was Inspector-specific.

### Files moved (19)

- `components/` → `inspector/`: `TaskInspector.tsx`,
  `TaskInspector.module.css`, `TaskInspector.dom.test.tsx`,
  `TaskInspectorFields.tsx`, `TaskInspectorFields.test.tsx`.
- `utils/` → `inspector/utils/`: `taskInspectorForm.ts`,
  `taskInspectorForm.test.ts`.
- `components/` → `list/`: `TaskListPane` (`.tsx`, `.module.css`,
  `.dom.test.tsx`), `TaskListHeaderControls` (+ test), `TaskListSection`
  (+ test), `TaskQuickAdd` (+ test), `TaskRow` (`.tsx`, `.module.css`,
  `.dom.test.tsx`).

`list/` and `inspector/` sit at the same depth as `components/`, so the
`../../../test/dom` imports, the `../api` and `../hooks` imports and the shared
`components/forms/Select` imports in those files did not change. Only the
`taskInspectorForm` references (now `./utils/…`) and that file's own `../api`
import (now `../../api/…`) changed.

### Stayed at feature level

- **`components/TasksView`** composes the list and inspector and owns their
  shared selection and filter state. It is the feature's page-level
  orchestration and is what `pages/TasksPage` renders.
- **`api/tasks.api`**: used by the list, inspector, `useTasks`,
  `useTaskBuckets`, and by Search and Today.
- **`hooks/useTasks`**: used by `TasksView`, `useTaskBuckets`, Calendar
  (`CalendarView`, `QuickCreatePopover`), Search and Today.
- **`hooks/useTaskBuckets`**: used by `TasksView`, the list (the `TaskFilter` /
  `WebTaskBuckets` types) and Today (`useToday`).
- **`index.ts`**: same exports, updated paths. It still re-exports
  `TaskListPane`, `TaskRow` and `TaskInspector`, which were already part of it.
  It was not narrowed or broadened.

### External imports

No file outside `features/tasks` imported a moved file, so no external import
changed. The existing cross-feature imports all target the feature-level
`api/` and `hooks/`:

| Consumer                                                                                                              | Imports                                     |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `pages/TasksPage`                                                                                                     | `TasksView` via the `features/tasks` barrel |
| `calendar/components/CalendarView`                                                                                    | `useCreateTask` (`hooks/useTasks`)          |
| `calendar/quick-create/QuickCreatePopover` (+ its two tests mock it)                                                  | `useTaskLists` (`hooks/useTasks`)           |
| `search/api/search.api`, `search/utils/search-results.test`                                                           | `api/tasks.api`                             |
| `search/components/SearchView`                                                                                        | `useTaskLists`                              |
| `today/hooks/useToday`                                                                                                | `useTaskBuckets`, `useTaskLists`            |
| `today/components/TodayView` (+ `.dom.test` mocks `hooks/useTasks`), `TodaySearch`, `TodayTaskGroups`, `TodayTaskRow` | `TaskWithTags`, task hooks                  |

Tasks itself imports one other feature: `TasksView` uses `useProfile` from
`settings/hooks/useSettings`.

### Non-path changes

None. The staged diff is 19 renames plus path edits in `TasksView.tsx`,
`index.ts`, `TaskInspector.tsx`, `TaskInspectorFields(.test).tsx` and
`taskInspectorForm(.test).ts`. `eslint --fix` re-sorted one import in
`TaskInspectorFields.test.tsx`. No CSS, TaskRow exit, Inspector lifecycle or
TasksView logic changed.

### Verification

- Inspector: 3 files, 37 tests pass (including `TaskInspector.dom.test`).
- List: 5 files, 49 tests pass (including the `TaskListPane` and `TaskRow` DOM
  tests).
- All of `features/tasks`: 10 files, 95 tests pass.
- Consumers of task imports (`features/calendar`, `search`, `today`): 59
  files, 574 tests pass.
- `pnpm verify` passes with every nested `pnpm` on Node 24.11.1 and no engine
  warning (web: 99 files / 862 tests, unchanged).

### Deferred structural debt

- **The barrel is bypassed.** Every cross-feature consumer deep-imports
  `tasks/api/tasks.api` or `tasks/hooks/*` instead of `features/tasks`, and
  nothing outside Tasks uses the barrel's `TaskListPane`, `TaskRow` or
  `TaskInspector` re-exports. Routing consumers through the barrel, or
  narrowing it, is an API decision, not a move.
- **Today has its own task presentation.** `TodayTaskRow` and
  `TodayTaskGroups` sit beside the Tasks list's `TaskRow` and share only the
  `TaskWithTags` type. Any convergence is product/UI work.

## Phase 4: Today (done)

### Starting layout

```
features/today/
  components/  TodayView (+ .module.css, .dom.test), TodayIcons, ProgressRing (+ .module.css),
               TodayQuickAdd (+ test), TodayScheduleSection (+ test),
               TodayTaskGroups (+ test), TodayTaskRow (+ test),
               DayGlanceCard (+ .module.css), DayBar (+ .module.css),
               TodaySearch (+ .module.css), TodaySearchResults
  hooks/       useToday
  utils/       day-bar, day-glance, today-clock (+ tests)
```

### Resulting layout

```
features/today/
  components/  TodayView (+ .module.css, .dom.test), TodayIcons, ProgressRing (+ .module.css),
               TodayQuickAdd (+ test), TodayScheduleSection (+ test),
               TodayTaskGroups (+ test), TodayTaskRow (+ test)
  glance/      DayGlanceCard (+ .module.css), DayBar (+ .module.css)
    utils/     day-bar, day-glance (+ tests)
  search/      TodaySearch, TodaySearchResults, TodaySearch.module.css
  hooks/       useToday
  utils/       today-clock (+ test)
```

Today has no `index.ts`. `pages/TodayPage` imports
`features/today/components/TodayView` directly, and that path did not change.

### Files moved (11)

- `components/` → `glance/`: `DayGlanceCard.tsx`, `DayGlanceCard.module.css`,
  `DayBar.tsx`, `DayBar.module.css`.
- `utils/` → `glance/utils/`: `day-bar.ts`, `day-bar.test.ts`,
  `day-glance.ts`, `day-glance.test.ts`.
- `components/` → `search/`: `TodaySearch.tsx`, `TodaySearchResults.tsx`,
  `TodaySearch.module.css`.

### Ownership decisions

The deciding factor was the stylesheet. `TodayView.module.css` and
`TodayIcons` are shared by `TodayView`, `TodayQuickAdd`,
`TodayScheduleSection`, `TodayTaskGroups` and `TodayTaskRow`. Those five are
sections of one page styled by one module. Moving any of them would only add
`../components/TodayView.module.css` and `../components/TodayIcons`
back-references. Only self-contained areas moved:

- **`glance/`**: `DayGlanceCard` renders `DayBar`, and together they are the
  only users of `day-bar` and `day-glance`. Each has its own CSS module. Only
  `TodayView` imports the subsystem (`DayGlanceCard`).
- **`search/`**: `TodaySearch` renders `TodaySearchResults`, and both use
  only `TodaySearch.module.css`. Only `TodayView` imports it. It is
  Today's embedded search. The standalone Search feature remains
  `features/search`, which it reuses (`useSearch`, `useMeasuredHeight`,
  `search-results`, `SearchIllustration`).

### Kept at feature level

- **`components/TodayView`**: page orchestration. It composes every section,
  runs the task mutations and owns quick-add, completion and snooze wiring.
- **`TodayQuickAdd`, `TodayScheduleSection`, `TodayTaskGroups`,
  `TodayTaskRow`, `TodayIcons`** (+ tests): styled by `TodayView.module.css`,
  as described above. A `quick-add/` or `schedule/` folder would each hold a
  single component. A `tasks/` folder would hold two components whose styles
  and icons live in `components/`, so it would not create a real boundary.
- **`ProgressRing`**: rendered only by `TodayView`'s header, not by the
  glance card.
- **`hooks/useToday`**: page-wide coordination of Calendar, Tasks and Settings
  data. `TodayView` and (as a type) `DayGlanceCard` use it.
- **`utils/today-clock`**: the page clock, used by `useToday`.

### Cross-feature paths changed

Only `glance/utils/day-glance.ts` and its test changed depth. Their
`EventOccurrence` type import is now
`../../../calendar/hooks/useCalendarWindow`. The `search/` files are at the
same depth as `components/`, so their Calendar, Search, Settings and Tasks
imports did not change. `TodayView.dom.test.tsx` kept its
`../../../test/dom` import and the `../../tasks/hooks/useTasks` and
`../../scheduling` mocks. Only its `./TodaySearch` and `./DayGlanceCard` mocks
became `../search/TodaySearch` and `../glance/DayGlanceCard`. No Calendar or
Tasks file changed.

### Non-path changes

None. No Today test reads files through `__dirname` or `readFileSync`. The
staged diff is 11 renames plus import/mock path edits in `TodayView.tsx`,
`TodayView.dom.test.tsx`, `DayBar.tsx`, `DayGlanceCard.tsx` and
`day-glance(.test).ts`.

### Verification

- `TodayView.dom.test`: 11 tests pass. These include the mocked
  `TodaySearch` / `DayGlanceCard`, which would render for real, and fail
  without providers, if the new mock paths missed.
- All of `features/today`: 8 files, 46 tests pass.
- Consumers and neighbours (`tasks`, `calendar`, `search`, `scheduling`): 72
  files, 685 tests pass.
- `pnpm verify` passes with every nested `pnpm` on Node 24.11.1 and no engine
  warning (web: 99 files / 862 tests, unchanged).

## Phase 5: Scheduling / Find Time (done)

### Starting layout

```
features/scheduling/
  index.ts
  api/         find-time.api (+ test)
  components/  FindTimeBox (+ .module.css, .test, .dom.test), FindTimeIcons,
               FindTimePromptPresentation (+ test), FindTimeProposalResults (+ test),
               FindTimeRotatingPrompt (+ .module.css, test), FindTimeScheduledNotice (+ test)
  hooks/       useConfirmSlot, useFindTime (+ test)
  utils/       find-time-format, find-time-prompts, scheduled-notice-storage (+ tests)
```

### Resulting layout

```
features/scheduling/
  index.ts
  find-time/
    api/         find-time.api (+ test)
    components/  FindTimeBox (+ .module.css, .test, .dom.test), FindTimeIcons,
                 FindTimePromptPresentation (+ test), FindTimeProposalResults (+ test),
                 FindTimeRotatingPrompt (+ .module.css, test), FindTimeScheduledNotice (+ test)
    hooks/       useConfirmSlot, useFindTime (+ test)
    utils/       find-time-format, find-time-prompts, scheduled-notice-storage (+ tests)
```

Every Scheduling file belongs to Find Time. The dependency graph is a single
tree rooted at `FindTimeBox`: the API module, both hooks and all three
utilities are used only by Find Time components and hooks. So the whole
implementation moved as a unit, keeping its internal `api/`, `components/`,
`hooks/` and `utils/` split. Internal relative imports between those folders
did not change. There is no `find-time/index.ts`, because the feature-level
`index.ts` is already the public entry point.

### Files moved (25)

- `api/` → `find-time/api/`: `find-time.api.ts`, `find-time.api.test.ts`.
- `components/` → `find-time/components/`: `FindTimeBox.tsx`,
  `FindTimeBox.module.css`, `FindTimeBox.test.tsx`,
  `FindTimeBox.dom.test.tsx`, `FindTimeIcons.tsx`,
  `FindTimePromptPresentation.tsx` (+ test),
  `FindTimeProposalResults.tsx` (+ test), `FindTimeRotatingPrompt.tsx`,
  `FindTimeRotatingPrompt.module.css`, `FindTimeRotatingPrompt.test.tsx`,
  `FindTimeScheduledNotice.tsx` (+ test).
- `hooks/` → `find-time/hooks/`: `useConfirmSlot.ts`, `useFindTime.ts`,
  `useFindTime.test.ts`.
- `utils/` → `find-time/utils/`: `find-time-format.ts`,
  `find-time-prompts.ts`, `scheduled-notice-storage.ts` (+ tests).

### Retained at `scheduling/` root

- **`index.ts`**: the only root file. Its exports are unchanged —
  `FindTimeBox`, `useConfirmSlot`, `useFindTime` and the types
  `FindTimeConfirmation`, `FindTimeProposal`, `FindTimeSuggestion`. Only the
  four `from` paths gained `./find-time/`.

Today still imports `FindTimeBox` from `../../scheduling`, and
`TodayView.dom.test` still mocks `'../../scheduling'`. No Today file changed.

### External relative paths updated

Every path out of the feature gained one `../`:

- `lib/supabase/client`: import in `find-time.api.ts`; `vi.mock` in
  `find-time.api.test.ts`, `FindTimeBox.test.tsx` and
  `FindTimeBox.dom.test.tsx`.
- `lib/errors/app-error`: import in `find-time.api.ts`.
- `lib/query/query-client`: imports in `useConfirmSlot.ts` and
  `useFindTime.ts`.
- `billing/hooks/useBilling`: import in `FindTimeBox.tsx` and
  `FindTimeBox.test.tsx`; `vi.mock` in `FindTimeBox.test.tsx` and
  `FindTimeBox.dom.test.tsx`.
- `billing/utils/subscription-display`: import in `FindTimeBox.tsx`.
- `test/dom`: side-effect import in `FindTimeBox.dom.test.tsx`.

Internal `../api`, `../hooks` and `../utils` imports and mocks, and all
`./*.module.css` imports, stayed the same.

### Non-path changes

None. No Scheduling file reads the filesystem (`__dirname`, `readFileSync`,
`path.resolve`, `import.meta.url`), and the CSS modules have no `composes`,
`url()` or `@import`. The staged diff is 25 renames plus 17 changed import,
export and `vi.mock` lines, in 8 files. Import order and Prettier needed no
changes.

### Verification

- `FindTimeBox.dom.test`: 9 tests pass. These include the mocked
  `useFindTime`, `useConfirmSlot`, `useBilling` and Supabase client, which
  would fail without the corrected paths.
- All of `features/scheduling`: 11 files, 62 tests pass.
- `features/today` (the barrel's consumer): 8 files, 46 tests pass.
- `features/billing` (imported and mocked by `FindTimeBox`): 3 files, 25
  tests pass.
- `pnpm verify` passes with every nested `pnpm` on Node 24.11.1 and no engine
  warning (web: 99 files / 862 tests, unchanged; domain 348, mobile 11,
  tooling 201 and 8).

## Structural phase status

All five planned moves (QuickCreate, Timeline, Tasks, Today, Scheduling / Find
Time) are implemented on `refactor/feature-structure`, one commit per
subsystem. The independent cumulative review (below) found no blocking issue.
The findings below are deliberately out of scope for these commits.

## Findings for later phases

- **Shared calendar types live in `TimelineView.tsx`.** `EventTiming`,
  `SlotSelection` and `DraftEventState` are exported from the Timeline
  component. `CalendarView`, `MonthView`, `useCalendarEventTimingChanges` and
  `useCalendarTimingOverrides` import them from `timeline/TimelineView`.
  Moving them to a calendar-level types module would be a code change, not a
  move. It is worth its own small commit.
- **`QuickCreatePopover`'s `export type { AnchorRect }` is now unused.** It
  can be removed in a QuickCreate-scoped commit.
- **String paths escape import rewriting.** Tests that read files through
  `__dirname` (`TimelineView.ghost.test.tsx`,
  `CalendarView.transition.test.tsx`) need a manual check whenever a file
  moves.
- **Settings deep-imports `QuickCreateTimePicker`.** If more features reuse the
  pickers, promote them to a shared web component.
- **`popover-position` mixes a shared type with QuickCreate-only logic.** A
  future split would be a code change.
- **The local `pnpm` shim runs a bundled Node 20** (`Z:\Dev\Tools\Node`), and
  `pnpm verify` spawns nested `pnpm` calls that also go through it. Put a Node
  22+ `pnpm` first on `PATH`, or update the bundled Node.
- **Other features deep-import calendar internals.** Today (`useToday`,
  `day-glance`, `TodayScheduleSection`, `TodaySearch`), Search (`SearchView`)
  and Settings (`SettingsView`) import `calendar/hooks/useCalendarWindow`,
  `useCalendars`, `calendar/utils/calendar-occurrences`,
  `calendar-preferences` and `calendar-window` directly. None of these moved
  in Phases 1–2. They are the calendar feature's real cross-feature surface and
  should stay put, or get an explicit boundary, during the Today phase.
- **Today depends on Tasks through deep imports as well** (`useTaskBuckets`,
  `useTaskLists`, `TaskWithTags`, and a `vi.mock('../../tasks/hooks/useTasks')`
  in `TodayView.dom.test`). If Today components move to a different depth,
  those relative mock paths must move with them. Tasks' `api/` and `hooks/`
  are stable targets now, so nothing on the Tasks side needs to change for the
  Today phase. (Phase 4 kept those files at their depth.)
- **Scheduling's only consumer is Today.** `TodayView` imports `FindTimeBox`
  from the `features/scheduling` barrel, and `TodayView.dom.test` mocks
  `'../../scheduling'`. Scheduling's `index.ts` exports `FindTimeBox`,
  `useConfirmSlot`, `useFindTime` and the `FindTime*` API types. As long as
  the barrel's exports stay, Scheduling can reorganize internally without
  touching Today.
- **Scheduling's own relative paths to watch.** `FindTimeBox(.dom).test` mock
  `../../../lib/supabase/client` and `../../billing/hooks/useBilling`, and the
  DOM test imports `../../../test/dom`. `find-time.api.test` mocks
  `../../../lib/supabase/client`. `FindTimeBox` imports
  `billing/hooks/useBilling` and `billing/utils/subscription-display`. No
  Scheduling test reads files through `__dirname`. (Phase 5 updated all of
  these; they now start one `../` deeper from `find-time/`.)
- **The QuickCreate `AnchorRect` re-export is now unused.** After Phase 2,
  nothing imports `AnchorRect` from `QuickCreatePopover`, but its
  `export type { AnchorRect }` remains. Removing it is a public-surface
  decision for its own commit.
- **Historical docs still cite pre-move paths.** `docs/find-time-box-refactor.md`,
  `docs/quick-create-popover-refactor.md`, `docs/task-inspector-refactor.md`,
  `docs/timeline-view-refactor.md` and `docs/web-active.md` are dated records
  and keep their original paths. (`docs/dom-component-testing.md`, the living
  guide, was refreshed during the final review.)

## Remaining phases

1. ~~QuickCreate~~ (Phase 1).
2. ~~Timeline~~ (Phase 2).
3. ~~Tasks~~ (Phase 3).
4. ~~Today~~ (Phase 4).
5. ~~Scheduling / Find Time~~ (Phase 5).

## Final independent review

Reviewed `c64b503..ff445ff` (5 commits ahead of `main`, 0 behind) as one
cumulative diff: 133 paths, 122 renames (67 byte-identical), 10 modified, 1
added (this document). No production code was changed by the review.

### Method

- **Normalised source diff.** Every renamed or modified `.ts`/`.tsx`/`.css`
  file was compared with its base version after removing `import`/`export …
from` statements and replacing `vi.mock` / `import()` path literals. The only
  remaining difference in the whole branch is the expected
  `TimelineView.ghost.test.tsx` string
  (`'CalendarView.module.css'` → `'../components/CalendarView.module.css'`).
- **Resolved import graph.** Every import, side-effect import, `export … from`
  and `vi.mock` specifier was resolved to a file at base and at HEAD. Base
  targets were mapped through the rename table and compared, with bindings, per
  file. All match except the documented type-only `AnchorRect` source change
  (Phase 2) in 5 files. No specifier is unresolved, so no `vi.mock` targets a
  missing module and no test falls through to a real implementation it used to
  mock. The only filesystem-relative strings in `apps/web/src` are the two
  `__dirname` reads, and both resolve.
- **Built-bundle comparison.** `vite build` of base and HEAD, minified and
  unminified. Unminified JS is line-for-line identical once Rollup's `$N`
  deconfliction suffixes are normalised. The CSS bundle is byte-for-byte the
  same size with the same rules and the same CSS Module hashes. The only
  difference is stylesheet order (below).
- **Module side effects.** None of the moved non-test modules has top-level
  statements other than declarations, so the changed evaluation order has no
  runtime effect.

### Findings

No blocking or medium findings.

- **Low: CSS Module emission order changed in two places.** The import
  re-sorts in `TasksView.tsx` and `TodayView.tsx` change where their CSS
  Modules land in the bundle. `TasksView.module.css` now comes before the
  TaskInspector, TaskListPane and TaskRow modules instead of after. `DayBar`,
  `DayGlanceCard` and `TodaySearch` modules now come after `ProgressRing`,
  `TodayView`, `FindTimeBox` and `FindTimeRotatingPrompt` instead of before.
  The Phase 3 and 4 notes ("no CSS changed") miss this. It has no computed-style
  effect. CSS Module class names are unique per module, and no moved component
  takes a `className` from another module. The only selectors in the affected
  modules that reach another module's elements are:
  - `.glanceCell > *` (TodayView). It hits `DayGlanceCard`'s root and sets only
    `flex: 1`. `.card`/`.free`/`.busy` set no `flex*` property.
  - `.listSelect :global([class*='trigger'])` (TaskListPane). Its order
    relative to `Select.module.css` did not change.

  The residual hazard: `.glanceCell > *` now precedes `.card` at equal
  specificity. If `.card` ever sets `flex`, the card rule would win. Not worth
  un-sorting imports to restore the old order.

- **Info: empty leftover directory.** After Phase 3 a local checkout could keep
  an empty `features/tasks/utils/` directory. Git does not track it and it has
  no effect.

### Per-move assessment

- **QuickCreate → `calendar/quick-create/`.** Path-only. QuickCreate depends
  on `calendar/utils` (`calendar-occurrences`, `event-form`,
  `popover-position`), `tasks/hooks/useTasks` and the shared `Select`. Nothing
  depends on Timeline. Consumers are `CalendarView` and Settings
  (`QuickCreatePickers`, a known deep import).
- **Timeline → `calendar/timeline/`.** Path-only, plus the documented `__dirname`
  string and the type-only `AnchorRect` source. Timeline depends only on
  `calendar/hooks/useCalendarWindow` and `calendar/utils`. It never imports
  QuickCreate or `calendar/components`. `calendar/components` and
  `calendar/hooks` depend on it only for `TimelineView` and its exported
  shared types (deferred).
- **Tasks → `tasks/inspector/` + `tasks/list/`.** Path-only. The inspector and
  list never import each other. Both depend only on `tasks/api`, `tasks/hooks`
  and `Select`. `tasks/index.ts` exports the same modules, so its public
  symbols are unchanged.
- **Today → `today/glance/` + `today/search/`.** Path-only. Glance and search
  never import each other. `TodayView` and the other page-level pieces
  (`ProgressRing`, `TodayIcons`, `TodayQuickAdd`, `TodayScheduleSection`,
  `TodayTaskGroups`) stay in `today/components`. `TodayView.dom.test` mocks
  the moved `../glance/DayGlanceCard` and `../search/TodaySearch`, which
  resolve to the modules `TodayView` imports.
- **Scheduling → `scheduling/find-time/`.** Path-only. `scheduling/index.ts`
  exports the same three values and three types from the same modules.
  Nothing outside Scheduling imports `find-time/` directly: Today uses the
  barrel. The Supabase client, `query-client`, `app-error` and billing
  imports and mocks resolve to the same files as at base.

### Verification

- `pnpm verify` passes: format, lint, typecheck, tests, build and the
  client-bundle check. Correction: the review's own `pnpm verify` runs, and the
  first run on the merged tree, had the top-level process on Node 24.11.1, but
  their nested `pnpm` calls went through the `Z:\Dev\Tools\Node` shim on Node
  20.19.6 and emitted "Unsupported engine" warnings. The final pre-push run on
  the merged tree was repeated with every nested `pnpm` on Node 24.11.1, and it
  passed with no engine warnings.
- Test counts: web 99 files / 862 tests, the same as `main` (run on a base
  worktree). Domain 348, mobile 11, tooling 201 and 8. There are 175 test files
  at both revisions.
- Refreshed the five stale test paths in `docs/dom-component-testing.md`
  (docs only). Every `apps/web/src/...` path in that guide now exists.

### Verdict

Ready to merge. The branch is behaviour-preserving and every public entry
point still resolves. The dependencies run from page, to subsystem, to
feature-level `api`/`hooks`/`utils`. The debt under "Findings for later
phases" remains deferred.
