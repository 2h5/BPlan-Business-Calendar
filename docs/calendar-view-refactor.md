# CalendarView refactor

## Baseline

- Starting branch: `main` at `5b633e043732cf487cefb76c94b34382c5e19bfc` (local and remote verified before branching).
- New branch: `refactor/calendar-view`, created directly from that `main`.
- `apps/web/src/features/calendar/components/CalendarView.tsx`: **1,019 physical lines** before Phase 1.
- Goal: preserve behavior, markup, accessibility, styling, and timing while reducing the component's responsibilities in small reviewed phases.

## Current responsibilities

- Coordinates calendar mode, selected date, URL parameters, view transitions, and keyboard shortcuts.
- Reads the calendar window and preferences; composes the toolbar, month/timeline views, loading/error/empty states, and overlays.
- Owns Quick Create, event editor, calendar editor, draft, slot selection, and focus restoration state.
- Coordinates event move/resize persistence, optimistic timing overrides, delete and Undo callbacks.
- Owns toast state, hold/release timing, dismissal and exit timers, cleanup, and toast presentation.

## Behavioral invariants

- Loading and error replace the calendar view; empty state remains an overlay after a successful load with no occurrences. Loading takes precedence over error. Error retry calls `result.refetch`.
- Feedback copy, icon, DOM structure, CSS classes, and `status`/`alert` roles remain unchanged.
- Toast keeps `role="status"`, `aria-live="polite"`, the message key, restoring spinner, conditional action, exit class, and pointer/focus hold and release behavior (including related-target blur).
- Toast durations, exit timing, callbacks, event mutations, and Undo remain owned by `CalendarView`.
- Route-driven creation remains a one-shot URL intent; mode changes, editor lifecycles, and event persistence remain unchanged.

## Provisional decomposition areas

- Phase 1: stateless calendar state and toast presentation.
- Possible later seams for reassessment: view/URL coordination, Quick Create/editor coordination, event persistence and Undo, timing overrides, and focus restoration. No later phase is committed yet.

## Progress

| Phase | Status                   | Scope and result                                                                                                                                                                                                                                                         |
| ----- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | Implemented and verified | Added `CalendarFeedback.tsx` with `CalendarState` and `CalendarToastPresentation`. `CalendarView.tsx` is 963 physical lines after Phase 1, down 56 from 1,019. Added eight focused presentation tests. All toast lifecycle and event orchestration remain in the parent. |

Phase 1 checks: focused tests (8), all calendar tests (452), web typecheck, ESLint with zero warnings, Prettier, and `pnpm verify` passed. The full gate included 656 web, 348 domain, 11 mobile, 201 billing, and 8 release tests plus the web production build and bundle scan.

## Phase 1 ownership observations

- `CalendarPage` is the only direct `CalendarView` caller, through the calendar feature index.
- `useCalendarWindow` owns the query aggregation and exposes `refetch`; `CalendarView` still decides loading/error precedence and the empty overlay placement.
- `CalendarView.module.css` is shared by nearby calendar components. Phase 1 reuses it unchanged.
- Existing calendar component tests use Vitest and React server rendering, with direct callback inspection where needed. A DOM testing layer is deferred as requested.

Reassess ownership and the next phase after Phase 1 is pushed.
