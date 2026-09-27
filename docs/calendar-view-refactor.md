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
| 6     | Implemented and verified | Added `useCalendarEventTimingChanges.ts` for shared move/resize persistence, rollback, toast, and Undo coordination. `CalendarView.tsx` is 652 physical lines after Phase 6, down 102 from 754.                                                                          |

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

## Phase 6 boundary and coverage

- `useCalendarEventTimingChanges({ timingOverrides, setTimingOverride, updateEvent, showToast, showSuccess, refetch })` returns `{ handleMoveEvent, handleResizeEvent }`. The hook contains one shared handler for previous-timing selection, no-op comparison, optimistic override, `eventInputWithTiming` payloads, fire-and-forget persistence, success and failure toasts, Undo, and Undo failure refetch. Only the copy differs between move and resize.
- `CalendarView` still creates `useUpdateEvent(result.calendars)` and passes its `mutateAsync` capability through the typed `updateEvent` dependency. Both forward and Undo writes continue through its writable-calendar checks, supported-move validation, internal/provider routing, and query invalidation. The hook does not query calendars or own toast or timing-override state.
- `CalendarView.move.test.tsx` retains the payload-preservation test and replaces three handwritten simulations with eleven tests calling the real extracted handlers through React server rendering. They cover move and resize no-ops, synchronous optimistic ordering, payloads, delayed success and Undo action, immediate Undo restoration, previous optimistic timing, forward failure without refetch, Undo success, and Undo failure with one refetch and exact messages. The tests use deferred mutation promises where ordering matters.
- Server rendering exposes the handlers and their callback coordination but does not exercise React state updates, actual provider/internal writes, or browser gestures. Those remain integration coverage limits. The mutation hook itself was not changed.
- Phase 6 checks: focused move/resize tests (12), all calendar tests, web typecheck, ESLint with zero warnings, Prettier, and `pnpm verify`.
- Remaining parent groups are mode/date/URL and hotkey coordination; route-driven new-event opening; Quick Create, draft, editor, and focus lifecycles; calendar visibility and CRUD actions; and composition of toolbar, views, overlays, and feedback. These concerns are more interleaved than the extracted timing subsystem. Reassess a specific interaction seam with stronger DOM coverage before another extraction; the behavior-preserving refactor is nearing a natural stopping point. No Phase 7 work has started.

## Independent review

- **Reviewed:** cumulative diff `main` `5b633e043732cf487cefb76c94b34382c5e19bfc` → `refactor/calendar-view` `96044df5f67559e8d6f458f69690a15749d9e884` (six commits ahead, zero behind), reviewed as one change rather than per phase.
- **Scope:** `CalendarView.tsx`, `CalendarFeedback.tsx`, `useCalendarToast.ts`, `new-event-anchor.ts`, `useCalendarViewTransition.ts`, `useCalendarTimingOverrides.ts`, `useCalendarEventTimingChanges.ts`, all new and rewritten tests, plus the surrounding `useCalendarWindow` (`refetch`, `occurrences`), `useUpdateEvent` call site, `QuickCreatePopover`/`popover-position` (`AnchorRect`), `view-transition` and `timeline-slot-reveal` utilities.
- **Parent orchestration:** apart from removing the extracted blocks and calling the new hooks, the only `CalendarView` changes are adding the stable `setToast` setter to three dependency arrays and `startTransition` to `changeMode`'s. Mode/date/search-param handling, route-driven one-shot new-event opening (including the toolbar-rect fallback), linked-event opening, Quick Create, event/calendar editor lifecycles, focus restoration, writable-calendar checks, calendar visibility, MonthView/TimelineView props, loading/error/empty precedence and draft behavior have no diff hunks. `startTransition` is still called before `setMode` and the dependent UI resets. The timing-override reconciliation effect is still the last effect in the component; only the two unmount-only timer-cleanup effects moved, and both just clear their own timers.
- **Moved code, mechanically compared with `main`:** `getNewEventAnchorRect`, `CalendarState`, the toast lifecycle block (`dismissToast` through `showSuccess`, plus cleanup) and `setTimingOverride` are byte-identical to the base source. `AnchorRect` resolves to the same `popover-position` type that `QuickCreatePopover` re-exports. The direct untimed `setToast` paths, 6 s default, 3 s success, explicit 8 s delete/Undo duration, 1.5 s release grace and 180 ms exit are unchanged. `result.refetch` is an arrow function that does not depend on `this`, so passing it detached is safe.
- **Differential parity (temporary, deleted):** a review-only Vitest file compiled the move/resize `useCallback` bodies, the reconciliation filter and the toast JSX directly from `git show 5b633e0:…/CalendarView.tsx` (via `typescript.transpileModule`) and compared them with the branch hook and components. No branch logic was copied into the comparison.
  - Move and resize × eight scenarios (success, initial failure, Undo success, Undo failure, existing override as previous timing, unchanged versus occurrence, unchanged versus override, override for a different event) produced identical ordered traces of override writes, `mutateAsync` payloads, toast/success calls (message, action label, action presence, duration) and refetches, including the synchronous/asynchronous split.
  - The reconciliation filter returned identical IDs across mixed, partial, missing-ID and repeated-ID inputs.
  - Toast markup was byte-identical across four toast shapes × exiting/not exiting.
  - The harness was checked for vacuity: an early version used an incomplete event fixture that made both sides throw into the same catch path, so it was fixed and re-checked. Injected mutations (Undo copy, dropped refetch, ignored existing override, action shown while exiting, `aria-live` change) each failed the comparison.
- **Findings:** no correctness, lifecycle, async-ordering, accessibility or stale-state regression. No behavioral drift was accepted, and no production code changed during this review.
- **Pre-existing, unchanged behavior noted:** a direct untimed `setToast` shown while a timed toast's dismissal timer is still pending is dismissed by that timer. This is identical on `main`.
- **Documentation note:** the "Behavioral invariants" line saying event mutation and Undo bodies stay in `CalendarView` predates Phase 6. Only delete/Undo remains in the parent; move/resize Undo now lives in `useCalendarEventTimingChanges`.
- **Verification (Node 20.19.6, with the repository's Node `>=22` engine warning):** 479 calendar tests in 47 files; web typecheck; zero-warning ESLint on the calendar feature; Prettier check; `pnpm verify` (web 683, domain 348, mobile 11, billing 201, release 8; typecheck, lint, web build and client-bundle scan). The existing Vite chunk-size warning was emitted.
- **What each form of evidence covers:**
  - _Exercised by tests:_ toast scheduling, hold/release remaining time, grace, replacement and exit timers; transition timer duration, replacement, reduced motion and no-direction clearing, with the current origin inputs; anchor geometry and scroll calls under global stubs; reconciliation ID selection; move/resize handler coordination and ordering; toast and state markup.
  - _Supported by source/diff equivalence:_ React state updates and effect scheduling inside the hooks, unmount cleanup, reconciliation actually clearing the map, the parent's hook and effect ordering, and every unchanged parent flow listed above.
  - _Still requires browser/DOM smoke testing:_ drag/resize gestures end to end, rendered toast exit animation and pointer/focus hold on a real element, view transitions rendering and settling, real layout and animated scroll for the new-event anchor, and focus restoration. The web workspace still has no DOM test layer, and no browser check was run for this review.
- **Merge readiness:** ready to merge from a behavior-preservation standpoint, subject to the browser smoke checks above if the team wants interaction coverage before merging.
