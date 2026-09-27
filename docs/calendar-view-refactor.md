# CalendarView refactor

## Baseline

- Starting branch: `main` at `5b633e043732cf487cefb76c94b34382c5e19bfc` (local and remote verified before branching).
- New branch: `refactor/calendar-view`, created directly from that `main`.
- `apps/web/src/features/calendar/components/CalendarView.tsx`: **1,019 physical lines** before Phase 1.
- Goal: preserve behavior, markup, accessibility, styling, and timing while reducing the component's responsibilities in small reviewed phases.

## Starting responsibilities

- Coordinates calendar mode, selected date, URL parameters, view transitions, and keyboard shortcuts.
- Reads the calendar window and preferences; composes the toolbar, month/timeline views, loading/error/empty states, and overlays.
- Owns Quick Create, event editor, calendar editor, draft, slot selection, and focus restoration state.
- Coordinates event move/resize persistence, optimistic timing overrides, delete and Undo callbacks.
- Owns toast state, hold/release timing, dismissal and exit timers, cleanup, and toast presentation.

## Behavioral invariants

- Loading and error replace the calendar view; empty state remains an overlay after a successful load with no occurrences. Loading takes precedence over error. Error retry calls `result.refetch`.
- Feedback copy, icon, DOM structure, CSS classes, and `status`/`alert` roles remain unchanged.
- Toast keeps `role="status"`, `aria-live="polite"`, the message key, restoring spinner, conditional action, exit class, and pointer/focus hold and release behavior (including related-target blur).
- Toast durations, exit timing, and callbacks remain behaviorally unchanged. Event mutations and Undo callback bodies remain owned by `CalendarView`.
- Route-driven creation remains a one-shot URL intent; mode changes, editor lifecycles, and event persistence remain unchanged.

## Provisional decomposition areas

- Phase 1: stateless calendar state and toast presentation.
- Phase 2: calendar toast lifecycle hook.
- Possible later seams for reassessment: view/URL coordination, Quick Create/editor coordination, event persistence and Undo, timing overrides, and focus restoration. No Phase 3 scope is committed yet.

## Progress

| Phase | Status                   | Scope and result                                                                                                                                                                                                                                                         |
| ----- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | Implemented and verified | Added `CalendarFeedback.tsx` with `CalendarState` and `CalendarToastPresentation`. `CalendarView.tsx` is 963 physical lines after Phase 1, down 56 from 1,019. Added eight focused presentation tests. All toast lifecycle and event orchestration remain in the parent. |
| 2     | Implemented and verified | Added `useCalendarToast.ts` for toast state, refs, timer scheduling, hold/release, success helper, and unmount cleanup. `CalendarView.tsx` is 877 physical lines after Phase 2, down 86 from 963.                                                                        |
| 3     | Implemented and verified | Moved `getNewEventAnchorRect` into `utils/new-event-anchor.ts`, preserving its geometry and scroll sequence. `CalendarView.tsx` is 816 physical lines after Phase 3, down 61 from 877. Added five focused utility tests.                                                 |
| 4     | Implemented and verified | Added `useCalendarViewTransition.ts` for visual transition state, origin/direction calculation, reduced-motion handling, timer replacement, and cleanup. `CalendarView.tsx` is 781 physical lines after Phase 4, down 35 from 816.                                       |
| 5     | Implemented and verified | Added `useCalendarTimingOverrides.ts` for the optimistic timing map, authoritative reconciliation, and single-event override setter. `CalendarView.tsx` is 754 physical lines after Phase 5, down 27 from 781.                                                           |

Phase 1 checks: focused tests (8), all calendar tests (452), web typecheck, ESLint with zero warnings, Prettier, and `pnpm verify` passed. The full gate included 656 web, 348 domain, 11 mobile, 201 billing, and 8 release tests plus the web production build and bundle scan.

## Phase 1 ownership observations

- `CalendarPage` is the only direct `CalendarView` caller, through the calendar feature index.
- `useCalendarWindow` owns the query aggregation and exposes `refetch`; `CalendarView` still decides loading/error precedence and the empty overlay placement.
- `CalendarView.module.css` is shared by nearby calendar components. Phase 1 reuses it unchanged.
- Existing calendar component tests use Vitest and React server rendering, with direct callback inspection where needed. A DOM testing layer is deferred as requested.

Phase boundaries are reassessed after each push.

## Phase 2 boundary and coverage

- `useCalendarToast()` returns `toast`, `setToast`, `isToastExiting`, `showToast`, `showSuccess`, `holdToast`, and `releaseToast` to `CalendarView`. The direct `setToast` paths remain untimed; `showToast` retains its default 6-second duration and accepts the caller's explicit 8-second delete/Undo duration. `showSuccess` retains 3 seconds.
- The hook owns only toast lifecycle state, refs, timers, grace and exit timing, and cleanup. It imports no calendar data, mutation hook, Quick Create code, or presentation component. `CalendarView` still supplies event and calendar action callbacks. `CalendarToastPresentation` remains unchanged.
- Focused hook tests use the repository's React server rendering pattern with fake timers to observe scheduling, replacement, holding, remaining time, grace, and exit timing. This pattern does not run React effects or expose state updates, so rendered exit-state transitions and unmount cleanup remain interaction-test gaps until a DOM-capable layer is added separately.
- Phase 2 checks passed: seven focused hook tests, 459 calendar tests, web typecheck, ESLint with zero warnings, Prettier, and `pnpm verify` (663 web, 348 domain, 11 mobile, 201 billing, and 8 release tests plus the web build and bundle scan). The extracted lifecycle callback/effect block matches the Phase 1 source text exactly.
- A provisional Phase 3 candidate is the standalone `getNewEventAnchorRect` DOM measurement/scroll helper. It has narrow inputs and is already separate from React state. Reassess that seam and the broader orchestration after Phase 2 is pushed.

## Phase 3 boundary and coverage

- `utils/new-event-anchor.ts` exports `getNewEventAnchorRect(dateKey, startMinute, endMinute, mode): AnchorRect | null`. It imports `CalendarViewMode` and `AnchorRect` from calendar utility modules, with no dependency on a UI component. The helper owns the existing day lookup, month/timeline geometry, slot reveal calculation, anchor adjustment, and scroll call. Its function body matches the Phase 2 source text exactly.
- Both route-driven creation and toolbar New Event still call the helper at their original points. `CalendarView` retains opening decisions, Quick Create state, default-slot and writable-calendar checks, URL logic, and the toolbar button-rect fallback.
- Five focused tests use the existing Vitest global-stubbing pattern for the missing day, month passthrough, visible week slot, late week slot with scrolling, and minimum day draft height. No DOM library or new infrastructure was added. These stubs verify returned geometry and the scroll call, but do not exercise real browser layout or animation frames.
- Phase 3 checks passed: five focused tests, 464 calendar tests, web typecheck, ESLint with zero warnings, Prettier, and `pnpm verify`.
- A provisional Phase 4 candidate is the view-transition state/timer around `changeMode`. Its interaction with mode and URL coordination needs inspection before setting that scope; no Phase 4 work has started.

## Phase 4 boundary and coverage

- `useCalendarViewTransition()` returns `transitionState` and a stable `startTransition({ fromMode, toMode, selectedDateKey, targetDateKey?, timeZone, weekStartsOn, dateKeys })` callback. The hook owns only the visual transition state, direction/origin calculation, reduced-motion branch, 240 ms timer and its replacement/cleanup. Each call receives current context, including `targetDateKey ?? selectedDateKey` for the origin.
- `CalendarView` still rejects same-mode changes, persists the selected mode, calls `startTransition` before `setMode`, then closes dependent UI state in the original order. Mode initialization, URL coordination, hotkeys, and render classes/transform-origin style remain in the parent.
- `CalendarView.transition.test.tsx` now invokes the real hook for timer duration, rapid replacement, fresh origin inputs, reduced motion, and no-direction clearing. It retains the existing direction/origin utility assertions and CSS hardening/reduced-motion assertions. The file has eight tests, up from six; the two handwritten lifecycle simulations were replaced by four hook tests.
- React server rendering exposes the hook callback and timer behavior but does not run effects or make state updates observable. Rendered transition-state changes and unmount cleanup therefore remain interaction-test gaps until a DOM-capable test layer exists. The cleanup effect was moved without changing its timer-clear logic.
- Phase 4 checks passed: eight focused transition tests, 466 calendar tests, web typecheck, ESLint with zero warnings, Prettier, and `pnpm verify`.
- A provisional Phase 5 candidate is the optimistic timing-override map and its reconciliation with authoritative occurrences. Its type dependencies and coupling to move/resize persistence need inspection before setting scope; no Phase 5 work has started.

## Phase 5 boundary and coverage

- `useCalendarTimingOverrides(result.occurrences)` returns `{ timingOverrides, setTimingOverride }`. It owns the initially empty read-only Map, immutable Map replacement for set/delete, and the effect that removes all reflected IDs in one state update. The helper `reflectedTimingOverrideIds` retains the original event-ID `find` and exact start/end comparison, including first-match behavior for repeated IDs. The effect remains at its original position relative to the parent's other effects.
- The hook imports `EventTiming` from `TimelineView` using `import type`, so it creates no runtime dependency and requires no type movement. `CalendarView` still owns previous-timing selection, move/resize persistence, rollback, Undo, refetch, toast messages, and the `TimelineView` prop.
- Five focused tests cover empty initial state, missing/unrelated occurrences, exact and partial matches, multiple independent overrides, and first-match event-ID behavior. React server rendering cannot observe setter-driven state changes or run the reconciliation effect; set/replace/delete and effect scheduling therefore remain interaction-test gaps. The setter and Map update block were moved textually without changing their operations. Existing `CalendarView.move.test.tsx` remains unchanged.
- Phase 5 checks: focused tests, move/resize tests, all calendar tests, web typecheck, ESLint with zero warnings, Prettier, and `pnpm verify`.
- Move/resize persistence with Undo now appears to be a cohesive provisional Phase 6 seam: the two handlers share the timing map API and contain their own mutation, rollback, toast, and Undo coordination. Reassess mutation contracts and testability before fixing that scope; no Phase 6 work has started.
