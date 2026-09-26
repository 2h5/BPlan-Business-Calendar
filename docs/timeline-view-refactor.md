# TimelineView Decomposition Tracker

Source of truth for the behaviour-preserving decomposition of
`apps/web/src/features/calendar/components/TimelineView.tsx`. Update this file
in the same commit as every phase so the work can be resumed from here alone.

## Goal and rules

Turn `TimelineView` into an orchestration component: it derives view geometry,
wires focused hooks together, and composes focused components. Line count is a
side effect, not the goal.

This is a **refactor only**: no visual redesign, no UX change, no feature
addition, no behaviour "cleanup", no API/schema change. Quirks found along the
way are recorded under [Discoveries](#discoveries) and left alone; fixing any
of them is a separate, explicitly-scoped change.

Do not replace the component with one monolithic `useTimelineInteractions`
hook. Existing utilities (`event-resize`, `event-magnetic-snap`,
`event-conflict`, `event-auto-scroll`, `timeline-initial-scroll`,
`working-hours-bands`) stay authoritative; extracted code calls them, it never
re-implements them.

## Baseline

- Branch: `web-refactor/timeline-view` (from `web`)
- Starting commit: `c58d2238b3f048f0de14e5ea99a02001fe8b3f78`
  (`feat(web): Search page redesign, workspace ordering, and login motion`)
- `TimelineView.tsx` at baseline: 1,916 lines, exporting `TimelineView`,
  `EventButton`, `OriginGhost`, `EVENT_DETAILS_MIN_MINUTES` and the types
  `SlotSelection`, `DraftEventState`, `EventTiming`, `TimelineViewProps`,
  `EventButtonProps`, `OriginGhostProps`.
- Consumers: `CalendarView.tsx` (`TimelineView`, `EventTiming`,
  `SlotSelection`), `MonthView.tsx` (`DraftEventState`, `SlotSelection` types),
  and the three `TimelineView.*.test.tsx` files.
- Baseline calendar tests: 25 files / 228 tests passing
  (`npx vitest run src/features/calendar` in `apps/web`).

## Responsibilities owned by TimelineView at baseline

1. **Public contract** — prop/type definitions shared with `CalendarView` and
   `MonthView`.
2. **Formatting** — hour gutter labels, minute labels, event times, durations.
3. **Event presentation** (`EventButton`) — class composition for
   compact/details/resizing/moving/short/movable/magnetized/conflicted/settled/
   snap-direction states, feedback lines, resize handles, click → anchor rect,
   click suppression hook.
4. **Origin ghost presentation** (`OriginGhost`).
5. **View geometry** — `isWeek`, `hourHeight` (54/64), `todayKey`, now-line.
6. **Initial scroll** — scroll-key memo + `initialScrollHour`.
7. **Grid chrome** — day headers, hour labels, hour lines, off-hours bands,
   now line.
8. **All-day row** — per-day all-day events, click-to-create all-day slot,
   all-day draft chip.
9. **Quick-create draft rendering** — timed draft block placed as a real
   layout column (`DRAFT_LAYOUT_KEY`).
10. **Per-day layout** — timed-occurrence filtering by day (timing overrides,
    live move date), preview projection (resize/move current minutes),
    visible-interval clamping, gesture-stable column ordering, draft slot,
    `layoutOverlappingEvents`, **stable DOM ordering** (`sortByRenderOrder`),
    per-event geometry and capability (`canResize`/`canMove`).
11. **Slot selection** — press/hold (180 ms) and drag-to-select on columns,
    15-minute snapping, click-vs-drag threshold (6 px), default duration,
    anchor rect, `onSelectSlot`.
12. **Resize interaction** — pointer lifecycle on handles, magnetic snapping,
    conflict detection, preview, commit via `onResizeEvent`.
13. **Move interaction** — pending → dragging promotion, pointer capture,
    cross-day target column hit-testing, snap direction, magnetic snapping,
    conflict detection, preview, commit via `onMoveEvent`.
14. **Gesture feedback state** — magnetic guide, conflict flag, snap direction,
    settle animation (180 ms), exiting ghost (140 ms), post-gesture click
    suppression.
15. **Shared auto-scroll** — rAF loop driven by `calculateAutoScrollVelocity`
    / `clampScrollTop`, re-applying the active gesture after each scroll step.
16. **Gesture recovery** — window `pointermove/up/cancel` fallback when
    capture is lost (latest-handler ref), Escape to cancel, unmount timer
    cleanup.

## Target decomposition

All paths are under `apps/web/src/features/calendar/`.

| Target file                           | Owns                                                                                                                                                                                                                                            | Phase |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| `utils/timeline-format.ts`            | `formatHour`, `formatMinute`, `formatEventTime`, `formatDuration` (pure).                                                                                                                                                                       | 1 ✅  |
| `components/EventButton.tsx`          | `EventButton` + `EventButtonProps` — event block presentation (resp. 3).                                                                                                                                                                        | 1 ✅  |
| `components/OriginGhost.tsx`          | `OriginGhost` + `OriginGhostProps` (resp. 4).                                                                                                                                                                                                   | 1 ✅  |
| `utils/timeline-day-layout.ts`        | Pure per-day layout (resp. 10): day filtering, override/preview projection, visible interval, gesture ordering, draft slot, `layoutOverlappingEvents`, `sortByRenderOrder`, per-event minute geometry. Takes gesture snapshots as plain inputs. | 2 ✅  |
| `components/TimelineDraftEvent.tsx`   | Timed draft block and all-day draft chip (resp. 9) — both render `DraftEventState` with the same colour/title fallback.                                                                                                                         | 3     |
| `components/TimelineAllDayRow.tsx`    | All-day label + grid, click-to-create all-day slot, compact `EventButton`s, draft chip (resp. 8).                                                                                                                                               | 3     |
| `hooks/useTimelineSlotSelection.ts`   | `dragSelection` state, press/hold timer, column pointer handlers, anchor rect (resp. 11). Pure snapping maths goes to `utils/slot-selection.ts` so `slot-selection.test.ts` can test the production code.                                       | 4     |
| `hooks/useTimelineInitialScroll.ts`   | Scroll-key memo + `initialScrollHour` effect (resp. 6). Only if still worth a file after phase 4; otherwise stays inline.                                                                                                                       | 4     |
| `hooks/useTimelineGestureFeedback.ts` | Magnetic snap, conflict flag, snap direction, settle timer, exiting-ghost timer, click-suppression ref + release, their unmount cleanup (resp. 14). Shared by move and resize.                                                                  | 5     |
| `hooks/useTimelineAutoScroll.ts`      | rAF loop, `lastPointerRef`, `stop` / `check` / `step` (resp. 15). Gesture-agnostic: takes the scroll container, an "is a gesture active" probe and an "apply at pointer/scrollTop" callback.                                                    | 6     |
| `hooks/useTimelineResize.ts`          | Resize ref/preview, handle pointer handlers, `applyResizePosition`, `finishResize`, Escape/window-fallback entry points (resp. 12).                                                                                                             | 7     |
| `hooks/useTimelineMove.ts`            | Move ref/preview, pending→dragging, `findTargetDateKey`, `applyMovePosition`, `finishMove`, Escape/window-fallback entry points (resp. 13).                                                                                                     | 8     |
| `hooks/useTimelineGestureRecovery.ts` | Window pointer fallback + Escape listener arbitrating resize-before-move (resp. 16). May fold into phases 7/8 if the arbitration proves trivial — decide then and record why.                                                                   | 9     |
| `components/TimelineView.module.css`  | Timeline-only CSS moved out of `CalendarView.module.css` — only if ownership is clean (see phase 10 blockers).                                                                                                                                  | 10    |

Resulting `TimelineView` responsibility: public types, view geometry
(`isWeek`, `hourHeight`, `todayKey`), wiring the hooks above, and composing
headers, all-day row, hour gutter and day columns (chrome, draft, ghost,
events via `timeline-day-layout`, magnetic guide, now line).

Why this shape rather than one component per interaction: move and resize
share feedback state, auto-scroll and window recovery, and the per-day layout
has to see both gestures. Splitting the _shared_ layers out first (feedback,
auto-scroll, layout) lets move and resize become independent hooks that only
talk through those layers, instead of each owning copies or one hook owning
everything.

## Invariants (compatibility requirements)

- **Stable event DOM order.** Event buttons render in `allTimedOccurrences`
  order (`sortByRenderOrder`), never in layout-column order. React moving a
  node mid-drag drops pointer capture. The dragged event stays mounted in the
  same position in the list (it is filtered into its _current_ day column).
- **Gesture-stable column order.** While resizing/dragging, the active event is
  ordered by its _original_ interval (`getOrderInterval`); the draft is ordered
  last (`MAX_SAFE_INTEGER`).
- **Pointer capture.** Resize captures on the handle at pointerdown. Move
  captures on the button only when promoted from `pending` to `dragging`.
  Release is best-effort (`try/catch`). Window listeners take over if capture
  is lost; `e.buttons === 0` on a window move finishes the gesture.
- **Move lifecycle.** `pending` until `resolveMoveGesture` returns
  `move`/`noop`; promotion clears settle and arms click suppression. Only a
  dragging move leaves an exiting ghost. Escape does not cancel a `pending`
  move.
- **Resize/move commit.** Commit only when `hasTimingChanged(original, next)`;
  commit triggers settle on the occurrence key. Original timing comes from
  `timingOverrides` when present.
- **Click suppression.** The occurrence key is suppressed during/after a
  gesture and released on a `setTimeout(0)`; `shouldSuppressSelect` consumes it.
- **Magnetic snapping / conflicts** come only from `event-magnetic-snap` /
  `event-conflict`; targets and candidates are recomputed for the target day on
  cross-day moves.
- **Cross-day moves** keep wall-clock minutes; snap direction is `right` when
  moving to a later column; ghost stays in the original column.
- **Timing overrides** move an event to the override's day and times.
- **Slot creation.** Click = default duration (clamped to 24:00); drag =
  15-minute range; hold shows the 15-minute box after 180 ms; pointerdown on an
  event (`.timelineEvent`) never starts a selection. All-day click creates an
  all-day slot.
- **Timed draft** is hidden while a drag selection exists, and takes a real
  layout column.
- **Auto-scroll** runs only for a dragging move or an active resize, and
  re-applies the gesture at the new scroll top each frame.
- **Closure semantics** (see Discoveries) must be preserved exactly when
  handlers move into hooks.
- **DOM/test contract:** CSS-module class names, `data-event-id`,
  `data-occurrence-key`, `data-resize-edge`, `data-date-key`,
  `data-timeline-viewport`, `data-quick-create-draft`,
  `data-testid="timeline-origin-ghost"`, `data-origin-ghost`, `data-exiting`,
  `data-snap-edge`, `data-snap-minute`, `title`, `aria-*`.
- **Public API:** `TimelineView` props and the exported types used by
  `CalendarView`/`MonthView` do not change.

## Phases

| #   | Phase                                                            | Status   |
| --- | ---------------------------------------------------------------- | -------- |
| 1   | Presentational extraction: formatters, `EventButton`, ghost      | complete |
| 2   | Pure per-day layout (`timeline-day-layout.ts`) + unit tests      | complete |
| 3   | Draft event + all-day row components                             | pending  |
| 4   | Slot selection hook (+ pure `slot-selection.ts`), initial scroll | pending  |
| 5   | Shared gesture feedback hook                                     | pending  |
| 6   | Shared auto-scroll hook                                          | pending  |
| 7   | Resize hook                                                      | pending  |
| 8   | Move hook                                                        | pending  |
| 9   | Gesture recovery (window fallback + Escape)                      | pending  |
| 10  | CSS module split (conditional)                                   | pending  |

### Phase 1 — Presentational extraction · complete

Commit: `b1858dea0304011e30719643d7f95e25dd7ac38c`.

Moved verbatim (byte-identical bodies, verified with `diff` against the
baseline):

- `EventButton`, `EventButtonProps` → `components/EventButton.tsx`
- `OriginGhost`, `OriginGhostProps` → `components/OriginGhost.tsx`
- `formatHour`, `formatEventTime`, `formatMinute`, `formatDuration`, `pad` →
  `utils/timeline-format.ts` (now exported)

Files changed:

- added `apps/web/src/features/calendar/components/EventButton.tsx`
- added `apps/web/src/features/calendar/components/OriginGhost.tsx`
- added `apps/web/src/features/calendar/utils/timeline-format.ts`
- added `apps/web/src/features/calendar/utils/timeline-format.test.ts`
  (pins current output, incl. the `24:00` / `12:00 AM` end-of-day label)
- changed `apps/web/src/features/calendar/components/TimelineView.tsx`
  (1,916 → 1,628 lines; imports the extracted modules; no logic change)
- changed `TimelineView.test.tsx` and `TimelineView.ghost.test.tsx`: import
  paths only (`EventButton` / `OriginGhost` from their new modules). No
  re-exports were left in `TimelineView.tsx`; nothing outside tests imported
  them.
- added this tracker.

Verification:

- `npx vitest run src/features/calendar` (apps/web): 26 files / 232 tests pass
  (baseline 228 + 4 new formatter tests).
- `tsc --noEmit -p tsconfig.json` (apps/web): clean.
- `eslint apps/web/src/features/calendar`: clean.
- `prettier --check` on changed paths: clean.
- `pnpm verify` (repo root: format, lint, typecheck, all workspace tests,
  build): pass — apps/web 54 test files, domain 22, mobile 2, billing 10.
- Browser: dev server boots and the app loads with no console errors; the
  calendar route requires sign-in, so the timeline was **not** exercised
  visually in this phase (no DOM or logic change beyond module boundaries).

Decisions:

- File names match the exported component (`EventButton.tsx`,
  `OriginGhost.tsx`), following the feature's existing convention.
- `EVENT_DETAILS_MIN_MINUTES` stays in `TimelineView.tsx`: it drives the
  layout decision (`showDetails`), not `EventButton` itself. `EventButton`'s own
  hard-coded `45` is the separate "short preview" threshold — deliberately not
  merged (would be a behaviour-coupling change).
- `OriginGhost` gets its own file rather than sharing one with `EventButton`:
  it is independently tested and phase 5 (exiting-ghost lifecycle) consumes it.
- Styles stay in `CalendarView.module.css` for now (see phase 10).

### Phase 2 — Pure per-day layout · complete

Moved the per-column timed-layout computation out of the `dateKeys.map` render
body into `layoutTimelineDay(input): TimelineDayLayout` in
`utils/timeline-day-layout.ts`. Statements are moved as-is; only the names of
the gesture inputs changed (see API).

API (typed object in, object out):

- `TimelineDayLayoutInput`: `dateKey`, `timeZone`, `occurrences` (all timed
  occurrences, in render order), `timingOverrides`, `resize`
  (`TimelineGestureSnapshot | null` — from `resizeRef.current`),
  `resizePreviewKey` (`resizePreview?.occurrenceKey`), `move`
  (`TimelineMoveSnapshot | null` — passed only when the move is dragging and
  its preview matches, i.e. the old `isDraggingMove`; `dateKey` comes from
  `movePreview.dateKey`), `draft` (`draftEvent`), `hasDragSelection`.
- `TimelineDayLayout`: `events` (`LaidOutItem<EventOccurrence>` plus visible
  `startMinute`/`endMinute`, in stable render order) and `draftPlacement`
  (`{ left, width } | undefined`).
- `resizePreviewKey` is separate from `resize` on purpose: the old code
  re-timed the resized event only when `resizePreview`'s key matched, while
  gesture ordering used the ref alone. Keeping both inputs keeps that exact.
- The module imports `EventOccurrence` from `utils/calendar-occurrences` and
  types overrides structurally, so `utils` does not import from
  `components`/`hooks`.

Responsibility that left `TimelineView` (resp. 10 minus capability/geometry
rendering): day membership (overrides and live cross-day move), resize/move
preview projection, visible-interval clamping, gesture-original column
ordering, draft layout slot + rightmost ordering, `layoutOverlappingEvents`,
stable render ordering (`sortByRenderOrder`), and visible start/end minutes.
Still in `TimelineView`: reading the refs/preview state to build the
snapshots, `sourceOccurrence`, pixel geometry (`top`/`height`),
`canResize`/`canMove`, preview/feedback props and handler wiring, and draft
rendering (which still repeats the draft visibility condition — phase 3).

Files changed:

- added `apps/web/src/features/calendar/utils/timeline-day-layout.ts`
- added `apps/web/src/features/calendar/utils/timeline-day-layout.test.ts`
  (11 tests: overlap columns, stable render order vs column order, day
  membership and midnight clamping, timing overrides incl. to another day,
  resize preview with original-interval ordering (and the contrast without
  it), resize not re-timed until its preview shows, same-day move, cross-day
  move placement over an override, draft rightmost column, draft excluded
  during drag selection / other day / all-day)
- changed `apps/web/src/features/calendar/components/TimelineView.tsx`
  (1,628 → 1,498 lines): calls `layoutTimelineDay`; drops
  `DRAFT_LAYOUT_KEY`, `DraftLayoutSlot`, `isOccurrence`, `sortByRenderOrder`,
  `dayStart`/`dayEnd` and now-unused `@cal/domain` imports.
- changed this tracker.

Verification:

- `vitest run src/features/calendar/utils/timeline-day-layout.test.ts`: 11/11.
- `vitest run src/features/calendar`: 27 files / 243 tests pass (232 + 11).
- web `tsc --noEmit`, `eslint apps/web/src/features/calendar`, `prettier`:
  clean (after eslint `--fix` for import order).
- `pnpm verify`: pass — apps/web 55 test files, domain 22, mobile 2, billing
  10; web build succeeds.
- Browser: not re-run (calendar route requires sign-in; see phase 1).

Discoveries: see item 7 below (cross-day ordering uses original minutes).

### Phase 3 — Draft + all-day row components · pending

`TimelineDraftEvent.tsx` (timed draft block, all-day draft chip) and
`TimelineAllDayRow.tsx`. Pure props-in rendering; `onSelectSlot` /
`onSelectEvent` passed through.

### Phase 4 — Slot selection · pending

`useTimelineSlotSelection(hourHeight, defaultDurationMinutes, onSelectSlot)`
returning `dragSelection` and `getColumnHandlers(dateKey)` (or the four
handlers). Keep reading `dragSelection` from the render closure exactly as now.
Move `snapToSlot`/range maths into `utils/slot-selection.ts` and point
`slot-selection.test.ts` at it. Hold-timer cleanup moves into the hook.

### Phases 5–9 — Gesture machinery · pending

Order is deliberate: shared layers first (feedback, auto-scroll), then the
two gestures, then recovery. Each phase must re-run the full TimelineView test
set and manually exercise move/resize/cross-day/auto-scroll/Escape in the
browser, since jsdom does not cover pointer capture or rAF timing.

### Phase 10 — CSS split · pending (conditional)

Blockers to resolve first: `TimelineView.ghost.test.tsx` and
`CalendarView.transition.test.tsx` read `CalendarView.module.css` from disk for
reduced-motion rules; the all-day draft uses `monthEventDraft*` classes shared
with `MonthView`; `closest(\`.${styles.timelineEvent}\`)` requires the column
and the event to use the same module. Split only if these can move cleanly.

## Discoveries

Recorded, **not** changed — each is a candidate for a separate fix PR.

1. **Resize conflict badge never shows in the timeline.** `TimelineView`
   passes `hasConflict` only when `movePreview?.dateKey === dateKey`, and
   `movePreview` is `null` during a resize. `EventButton` supports a resize
   conflict badge (and tests cover it in isolation), but the live view never
   enables it.
2. **Stale closures in gesture code.** `applyMovePosition` compares against
   `movePreview` from its render closure; the auto-scroll rAF loop reschedules
   the _same_ `stepAutoScroll` closure, so during auto-scroll it sees the
   `movePreview` from when the loop started (worst case an extra identical
   `setMovePreview`). Column handlers read `dragSelection` from their render
   closure. Window listeners use the latest-handler ref (`moveHandlersRef`).
   Extraction must keep each of these semantics as they are.
3. **Duplicated auto-scroll probe.** `stepAutoScroll` and
   `checkAndTriggerAutoScroll` repeat the same velocity/clamp logic. Phase 6
   may share a private helper _inside_ the hook as long as call order and
   early-exit conditions are identical.
4. **Escape duplicates the cancel paths.** The Escape listener re-implements
   `finishMove`/`finishResize`(cancelled) inline instead of calling them, and it
   ignores a `pending` move (only a dragging move or an active resize is
   cancelled). Phase 9 must keep both behaviours.
5. **`slot-selection.test.ts` tests private copies** of the snapping and
   formatting helpers rather than production code (its `formatMinute` copy
   also lacks the `24:00` branch). Phase 4 fixes the test target.
6. `isSettled` matches either the occurrence key or the event id; `canMove`
   stays true for the event currently being moved even if it would otherwise
   be immovable in the target column.
7. **Cross-day moves keep original-minute column ordering on the target
   day.** Gesture ordering projects the dragged event's _original_ wall-clock
   minutes onto whatever day it is previewed on, so in the target column it is
   ordered as if it started at its original time (e.g. a 9:30 event dragged to
   14:30 next to a 14:00 event keeps the left column). Pinned by a
   `timeline-day-layout` test; not changed.

## Verification log

| Phase | Checks                                                                                                                                          | Result                        |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| base  | `vitest run src/features/calendar`                                                                                                              | 25 files / 228 tests pass     |
| 1     | `vitest run src/features/calendar`; web `tsc --noEmit`; `eslint` (calendar feature); `prettier --check`; `pnpm verify`; body `diff` vs baseline | all pass (232 calendar tests) |
| 2     | new layout tests; `vitest run src/features/calendar`; web `tsc --noEmit`; `eslint`; `prettier`; `pnpm verify`                                   | all pass (243 calendar tests) |

## Current checkpoint

Phase 2 complete and committed on `web-refactor/timeline-view`
(`refactor(web): extract TimelineView per-day layout (phase 2)`), pushed to
`origin`. `TimelineView.tsx` is 1,498 lines and still owns responsibilities
1, 5–9, 11–16 plus the render-side half of 10.

## Next step

Start **Phase 3**: extract `components/TimelineDraftEvent.tsx` (the timed
draft block rendered in each day column, and the all-day draft chip) and
`components/TimelineAllDayRow.tsx` (all-day label + grid, click-to-create
all-day slot, compact `EventButton`s, draft chip). Pure props-in rendering;
keep class names, `data-quick-create-draft`, and the `.timelineEvent`
`closest` check on the all-day column exactly as they are. The timed draft
takes `draftPlacement` from `layoutTimelineDay`.

---

## Broader web decomposition backlog

Prioritised, **not started**, and not part of this branch. When a file becomes
active, inspect it fresh and design its decomposition independently; the notes
below are expectations, not a plan. Finish and verify TimelineView first.

| Priority | File                                                                                                    | Expected direction                                                                                                                                                      |
| -------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | `calendar/components/QuickCreatePopover.tsx` (1,162 lines)                                              | Separate event vs task form state, date/time logic, picker concerns, positioning, validation, and edit/delete workflows where appropriate.                              |
| 2        | `scheduling/components/FindTimeBox.tsx` (1,098 lines)                                                   | Separate session-storage persistence and the scheduled-notice/banner lifecycle from the primary Find Time UI/workflow.                                                  |
| 3        | `calendar/components/CalendarView.tsx` (1,019 lines)                                                    | Reduce toward top-level calendar orchestration: extract substantial editor, quick-create, navigation, timing-override and toast workflows where clean boundaries exist. |
| 4        | `today/components/TodayView.tsx` (999 lines)                                                            | Extract task quick-add / mutation / snooze or section-level responsibilities; keep page composition in the parent.                                                      |
| 5        | Large CSS modules (`CalendarView.module.css` 2,631 lines, `QuickCreatePopover.module.css` 759 lines, …) | Split alongside component extraction once ownership is clear, never as a standalone shuffle. Watch for tests that read CSS files from disk.                             |
