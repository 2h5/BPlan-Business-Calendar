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
