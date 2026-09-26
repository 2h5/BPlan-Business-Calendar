# Quick Create Popover decomposition

## Baseline and scope

- Started 2026-09-26 from current `main` at `ee27488d745d6f06978f127f42cde695134de2a5`, as confirmed after the supplied expected base `4d64db5e0eb2dbf115d49a59aacca95e0eb75815` proved one commit behind. The intervening commit only removes `docs/calendar-interaction-polish-temp.md`.
- Baseline `apps/web/src/features/calendar/components/QuickCreatePopover.tsx`: **1,162 lines**.
- Phase 1 changes only the web Quick Create field presentation. `CalendarView.tsx` is the immediate rendering caller. `EventButton.tsx`, `MonthView.tsx`, `TimelineAllDayRow.tsx`, and `TimelineView.tsx` import its `AnchorRect` type only. Settings imports `QuickCreateTimePicker` directly from `QuickCreatePickers.tsx`.

## Current responsibilities at baseline

`QuickCreatePopover.tsx` owns event and task form state; edit/open/reset synchronization; writable calendar and task-list selection; time-option derivation and date/time formatting; create/update/delete submission; More options handoff; draft notifications; anchor lookup and positioning; close animation; keyboard and focus handling; and the dialog's header, fields, errors, and footer. `QuickCreatePickers.tsx` owns date/time picker UI and already exports `TimePickerOption`.

## Behavioral invariants

- The parent owns every field value and callback, mode selection, save/delete/More options behavior, positioning, anchor tracking, close animation, focus handling, draft notification, and date/time helpers.
- Event fields keep date/time, All day, calendar, location, and description in the same DOM order, with the same CSS-module classes, SVGs, labels, ARIA, and picker props. Changing the event start date still advances an earlier end date; changing its start time still preserves the prior duration. All-day time controls remain mounted but hidden and disabled.
- Only writable calendars appear in the calendar selector. The selected/default calendar ID and calendar color fallback are unchanged. Edit mode continues to show event fields and suppress the mode tabs.
- Task fields keep due date, optional due time, Set time, task list, priority, and description in the same DOM order, with the same CSS-module classes, SVGs, labels, ARIA, and picker props. The list selector still displays the first-list fallback when selection is empty and is absent when no lists exist. Priority values remain `low`, `normal`, `high`, and `urgent`.
- Event and task fields remain exclusive to their mode. No CSS or picker implementation changes are in scope.

## Existing test coverage

- `QuickCreatePopover.test.tsx`: 8 static-render tests for closed/open state, writable calendar filtering, all-day controls, formatted date/time, saving state, location/description visibility, and edit mode.
- `QuickCreatePickers.test.ts`: 2 duration-label tests. No picker interaction test or task-mode static-render test existed at baseline.

## Incremental phases

1. **Complete:** Extract the event and task field JSX into presentational `QuickCreateEventFields.tsx` and `QuickCreateTaskFields.tsx`, with explicit values and callbacks. Add focused static-render tests. Keep all state and behavior in the parent.
2. **Complete:** Extract anchor lookup, position calculation, viewport listeners, and `useFollowAnchorMotion` integration into `useQuickCreatePosition`. The parent passes `isOpen`, `anchorRect`, `editingOccurrence`, its popover ref, `mode`, and `errorMessage`; it renders from the returned `coords`.
3. **Complete:** Extract pure date/time display helpers, 15-minute time-option creation, custom time insertion, end-time duration filtering, and the duration formatter into `utils/quick-create-time.ts`. Keep memoization and form behavior in the parent, and preserve picker exports.
4. **Recommended next:** Extract form state initialization and the open/edit/reset synchronization effect into a `useQuickCreateDraft` hook. Keep `handleStartTimeChange`, submission, deletion, More options, positioning, focus, close behavior, field components, and CSS in their current owners. Preserve edit-mode event reset, new-create reset asymmetry (including only updating times when `initialStartTime` exists), calendar fallback, first task-list selection, and existing mode behavior. Test reopen/new-slot/edit transitions and late calendar/task-list data before changing the parent wiring.
5. Review submit/delete as a separate later seam after Phase 4 verification.

## Phase 1 result and discoveries

- `QuickCreatePopover.tsx`: **1,162 → 887 lines** after formatting and import ordering. New files: `QuickCreateEventFields.tsx` (215 lines) and `QuickCreateTaskFields.tsx` (201 lines), each with an explicit props interface and a corresponding focused static-render test. Existing popover and picker tests remain unchanged; `QuickCreatePickers.tsx` remains unchanged because `TimePickerOption` was already public.
- The event start-date callback must stay in the parent because it also clamps `endDate`; the task due-date callback has no such coupling.
- The event form has no separate end-date control in the baseline JSX. Its `endDate` is parent-owned state used by submission and More options, and is advanced when a later start date is picked. Adding an end-date control would change the DOM and belongs outside this phase.
- The parent filters writable calendars and derives time options. Event fields receive those values; task fields receive the task lists and retain the existing first-list display fallback.
- The task-list display fallback and submission are distinct at baseline: the selector can display the first list when `selectedListId` is empty, while submission uses `selectedListId || null`. The existing open/reset effect normally fills the ID when lists load. Phase 1 leaves this behavior untouched.
- The event all-day path keeps time pickers mounted, hidden, and disabled; the task due-time path conditionally mounts its picker. The extracted components preserve both patterns.

## Verification log

| Check                                                   | Result                                                                                                    |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| New component tests + existing popover and picker tests | PASS: 4 files, 14 tests                                                                                   |
| Web typecheck                                           | PASS                                                                                                      |
| All calendar tests                                      | PASS: 37 files, 377 tests                                                                                 |
| ESLint, zero warnings                                   | PASS: `pnpm exec eslint . --max-warnings 0`                                                               |
| Prettier                                                | PASS: `pnpm exec prettier --check .`                                                                      |
| `pnpm verify`                                           | PASS: format, lint, typecheck, tests, build, and client bundle check                                      |
| Final diff and scope review                             | PASS: only Phase 1 files changed; unrelated `.claude/settings.local.json` remains untracked and untouched |

Visual QA is left to the user under the repository's proportional verification rule for this presentation-only extraction.

ESLint initially found only import-order errors in the three changed components. Its targeted autofix resolved them; the repository-wide zero-warning run passed afterward.

`pnpm verify` completed with a Node engine advisory (local Node 20.19.6 versus the repository's `>=22` declaration) and Vite's existing large-chunk advisory; neither failed the gate. Workspace test totals included 348 domain, 11 mobile, 556 web, 201 billing, and 8 release tests.

## Phase 2 result and discoveries

- `QuickCreatePopover.tsx`: **887 → 775 lines**. Added `hooks/useQuickCreatePosition.ts` and `hooks/useQuickCreatePosition.test.ts`. The hook owns the initial centered `coords`, edited-occurrence and new-draft anchor lookup, their distinct geometry rules, `calculatePopoverPosition` invocation and result mapping, layout-triggered repositioning, resize and capture-phase scroll listeners with cleanup, and `useFollowAnchorMotion` wiring. The parent still renders with the returned `coords` and owns the popover ref, close/focus behavior, form state, and mutations.
- Edited events still search every `[data-occurrence-key]` element and match `editingOccurrence.key` against `dataset.occurrenceKey`. New drafts still use `[data-quick-create-draft="true"]`, with `offsetWidth`/`offsetHeight` preferred over the entrance transform's collapsed rect and the rect as a fallback. Missing DOM anchors still use the supplied `anchorRect`.
- The 440×440 measurement fallbacks, 8px gap, `bottom` empty-style mapping, and `mode`/`errorMessage` layout invalidators were carried over. The popover ref was added to the position callback dependencies; it is stable because the parent creates it with `useRef`. The anchor lookup and position callbacks remain memoized, so `useFollowAnchorMotion` does not restart on mode/error-only changes.
- Web Vitest runs without a DOM environment. Focused hook tests use a small React-hook/effect harness with stubbed browser geometry and listeners; they exercise the real `useFollowAnchorMotion` integration without repeating the position algorithm's unit tests.
- The remaining parent has a cohesive date/time derivation seam near its top: `pad`, `addMinutesToTime`, `formatDateDisplay`, `formatTimeDisplay`, the 15-minute option list, custom time insertion, and end-time duration filtering. This is the basis for the Phase 3 recommendation above.

## Phase 2 verification log

| Check                                                                             | Result                                                                         |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| New hook tests                                                                    | PASS: 7 tests                                                                  |
| Focused hook, popover, Phase 1 fields, pickers, position, and anchor-motion tests | PASS: 7 files, 43 tests                                                        |
| All calendar tests                                                                | PASS: 38 files, 384 tests                                                      |
| Web typecheck                                                                     | PASS                                                                           |
| ESLint, zero warnings                                                             | PASS: `pnpm exec eslint . --max-warnings 0`                                    |
| Prettier                                                                          | PASS: `pnpm exec prettier --check .`                                           |
| `pnpm verify`                                                                     | PASS: format, lint, workspace typechecks/tests, build, and client bundle check |

`pnpm verify` test totals were 348 domain, 11 mobile, 563 web, 201 billing, and 8 release tests. The local Node 20.19.6 engine advisory (repository requires `>=22`) and Vite large-chunk advisory did not fail the gate.

## Phase 3 result and discoveries

- `QuickCreatePopover.tsx`: **775 → 721 lines**. Added `utils/quick-create-time.ts` and `utils/quick-create-time.test.ts`; changed `QuickCreatePickers.tsx` only to import and re-export the moved type/function. The utility exports `TimePickerOption`, `pad`, `addMinutesToTime`, `formatDateDisplay`, `formatTimeDisplay`, `createTimeOptions`, `withCustomTimeOption`, `formatDurationBetweenTimes`, and `createEndTimePickerOptions`. The picker continues exporting `TimePickerOption` and `formatDurationBetweenTimes` for existing callers.
- The parent retains `useMemo` around the base grid, the two selected-time lists, and the filtered end-time list. It retains initial start/end state calculations and `handleStartTimeChange`, including its positive-duration/default-duration fallback. No picker UI or field markup changed.
- `formatDurationBetweenTimes` was implemented in `QuickCreatePickers.tsx`, so moving its implementation required a compatibility re-export there. The option type moved with it to keep the pure utility independent of the picker component.
- The base grid is 96 entries from `00:00` through `23:45`. A custom selected time is inserted only when absent; the on-grid path returns the original grid array. Non-future end times remain filtered except the selected end time, which can have `detail: undefined`. The duration formatter remains same-day only; no overnight or malformed-input interpretation was added.
- The remaining parent has a large form-state initialization block and an open/edit/reset effect. Fresh create intentionally leaves some prior values alone (for example, start/end times when no `initialStartTime` is supplied, and mode unless editing forces event). Phase 4 must preserve these asymmetries.

## Phase 3 verification log

| Check                                                  | Result                                                                         |
| ------------------------------------------------------ | ------------------------------------------------------------------------------ |
| New pure utility tests                                 | PASS: 10 tests                                                                 |
| Utility, picker, field, popover, and positioning tests | PASS: 8 files, 53 tests                                                        |
| All calendar tests                                     | PASS: 39 files, 394 tests                                                      |
| Web typecheck                                          | PASS                                                                           |
| ESLint, zero warnings                                  | PASS: `pnpm exec eslint . --max-warnings 0`                                    |
| Prettier                                               | PASS: `pnpm exec prettier --check .`                                           |
| `pnpm verify`                                          | PASS: format, lint, workspace typechecks/tests, build, and client bundle check |

`pnpm verify` test totals were 348 domain, 11 mobile, 573 web, 201 billing, and 8 release tests. The local Node 20.19.6 engine advisory (repository requires `>=22`) and Vite large-chunk advisory did not fail the gate.
