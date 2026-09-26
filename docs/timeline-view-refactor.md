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

- Active branch: `refactor/timeline-view` (from merged `main`)
- Baseline commit: `d8fd4e7ff4e5098fe0e1a75ab7a2bf47671aaac7`
  (`Merge branch 'web'`)
- Original baseline: `c58d2238b3f048f0de14e5ea99a02001fe8b3f78`
  (`feat(web): Search page redesign, workspace ordering, and login motion`)
  on `web`, before `web` was merged into `main`. The original phase 1–2
  commits lived on `web-refactor/timeline-view`, deleted after phase 4.
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
| `components/TimelineDraftEvent.tsx`   | Timed draft block and all-day draft chip (resp. 9) — both render `DraftEventState` with the same colour/title fallback.                                                                                                                         | 3 ✅  |
| `components/TimelineAllDayRow.tsx`    | All-day label + grid, click-to-create all-day slot, compact `EventButton`s, draft chip (resp. 8).                                                                                                                                               | 3 ✅  |
| `hooks/useTimelineSlotSelection.ts`   | `dragSelection` state, press/hold timer, column pointer handlers, anchor rect (resp. 11). Pure snapping maths goes to `utils/slot-selection.ts` so `slot-selection.test.ts` can test the production code.                                       | 4 ✅  |
| `hooks/useTimelineInitialScroll.ts`   | Scroll-key memo + `initialScrollHour` effect (resp. 6). Only if still worth a file after phase 4; otherwise stays inline.                                                                                                                       | 4 ✅  |
| `hooks/useTimelineGestureFeedback.ts` | Magnetic snap, conflict flag, snap direction, settle timer, exiting-ghost timer, click-suppression ref + release, their unmount cleanup (resp. 14). Shared by move and resize.                                                                  | 5 ✅  |
| `hooks/useTimelineAutoScroll.ts`      | rAF loop, `lastPointerRef`, `stop` / `check` / `step` (resp. 15). Gesture-agnostic: takes the scroll container, move/resize activity probes and move/resize "apply at pointer/scrollTop" callbacks.                                             | 6 ✅  |
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
| 3   | Draft event + all-day row components                             | complete |
| 4   | Slot selection hook (+ pure `slot-selection.ts`), initial scroll | complete |
| 5   | Shared gesture feedback hook                                     | complete |
| 6   | Shared auto-scroll hook                                          | complete |
| 7   | Resize hook                                                      | pending  |
| 8   | Move hook                                                        | pending  |
| 9   | Gesture recovery (window fallback + Escape)                      | pending  |
| 10  | CSS module split (conditional)                                   | pending  |

### Phase 1 — Presentational extraction · complete

Commit: `b5ac0bdc5f92a1b50d180cac72c9471980a70671` (replayed from
`b1858dea0304011e30719643d7f95e25dd7ac38c`).

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

Commit: `81708a9b99629f81142a832e3bf9ea7289477f7f` (replayed from
`a102904421cec42fb739dfe79bc07ffb2d5caf94`).

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

### Phase 3 — Draft + all-day row components · complete

Commit: `refactor(web): extract TimelineView draft and all-day row (phase 3)`
on `refactor/timeline-view` (the commit that adds this section).

Moved the remaining draft and all-day JSX out of `TimelineView`'s render into
two props-driven components (no hooks, no context, no state):

- `components/TimelineDraftEvent.tsx`
  - `TimelineDraftEvent` — the timed quick-create block. Props: `startMinute`,
    `endMinute`, `placement` (`layoutTimelineDay`'s `draftPlacement`, passed
    through untouched), `hourHeight`, `hourCycle`, `title`, `calendarColor`,
    `isClosing`. Owns `data-quick-create-draft="true"`, the
    `draftTimelineEvent` + `BubbleEnter`/`BubbleExit` classes, top/height
    (22 px minimum), the column `left`/`width`/`right: auto` override, the
    `--event-color` fallback (`var(--color-accent)`), the `(New event)` title
    fallback and the `start – end` time label.
  - `TimelineAllDayDraft` — the all-day chip: `timelineEvent` +
    `timelineEventCompact` + `monthEventDraft` + `Entering`/`Closing`, same
    colour and title fallbacks.
- `components/TimelineAllDayRow.tsx` — `TimelineAllDayRow` renders the
  `all-day` label and `allDayGrid` as a fragment (both stay direct children of
  the canvas grid), one `allDayColumn` per date key with compact
  `EventButton`s (`onSelectEvent(occurrence, anchorRect)` unchanged), the
  all-day draft chip, and the column click handler: the
  `closest(\`.${styles.timelineEvent}\`)`guard, then`onSelectSlot({ dateKey,
  allDay: true, anchorRect })` from the column's bounding rect.

Responsibility removed from `TimelineView`: resp. 8 (all-day row) and the
presentation half of resp. 9 (draft block/chip markup, fallbacks, classes,
geometry). `TimelineView` still owns `allDayByDate`/`hasAllDay` (they also
drive the canvas class), the `hasAllDay` gate around the row, and the timed
draft visibility condition (`dateKey` match, not all-day, both minutes
defined, no `dragSelection`). The draft's layout column still comes only from
`layoutTimelineDay`.

Design decisions:

- **Visibility stays in the caller.** The timed draft's condition depends on
  `dragSelection` (phase 4 state) and repeats the one inside
  `layoutTimelineDay`; moving it into the component or sharing a predicate
  with the layout would couple presentation to layout inputs. The component
  takes already-narrowed `startMinute`/`endMinute: number`. The all-day chip's
  condition (`dateKey` match and `allDay`) moved with the row, verbatim.
- **Fields, not the whole `DraftEventState`,** are passed to the draft
  components so they cannot render a draft the caller decided to hide.
- Both draft variants share one file (and a private `DraftAppearance` props
  type) because they share the fallbacks; the all-day chip is exported
  separately for `TimelineAllDayRow`.
- `TimelineAllDayRow` imports the `DraftEventState`/`SlotSelection` types from
  `TimelineView` (type-only, same pattern as `MonthView`), so the public types
  stay where consumers import them.
- Prettier folded the time label's `–{' '}` line break into one `–` text
  literal. Server markup is byte-identical (the existing `TimelineView` draft
  tests and the new ones assert the exact text); on the client the label is
  one fewer text node, with identical `textContent`.

Files changed:

- added `apps/web/src/features/calendar/components/TimelineDraftEvent.tsx`
- added `apps/web/src/features/calendar/components/TimelineDraftEvent.test.tsx`
  (4 tests: exact class/style/`data-quick-create-draft` markup with placement
  and colour, fallback title/colour + no placement + 22 px minimum + exit
  class + h23 label, all-day chip exact markup, all-day chip fallbacks while
  closing)
- added `apps/web/src/features/calendar/components/TimelineAllDayRow.tsx`
- added `apps/web/src/features/calendar/components/TimelineAllDayRow.test.tsx`
  (5 tests: label + one column per day + compact buttons, draft chip only in
  its column and never for a timed draft, empty-space click → all-day slot
  with the column's anchor rect and the exact `.timelineEvent` selector, click
  inside `.timelineEvent` creates nothing, no `onSelectSlot` is a no-op). The
  click tests call the column's `onClick` from the rendered element tree with
  a stub event, because the web Vitest setup has no DOM environment.
- changed `apps/web/src/features/calendar/components/TimelineView.tsx`
  (1,498 → 1,430 lines): renders `<TimelineAllDayRow>` and
  `<TimelineDraftEvent>`; no other change.
- changed this tracker.

Verification:

- `vitest run` on the two new test files: 9/9.
- `vitest run src/features/calendar`: 29 files / 252 tests pass (243 + 9).
- web `tsc --noEmit`: clean (after typing a CSS-module key in a test regex).
- `eslint apps/web/src/features/calendar`: clean. `prettier --check`: clean.
- `pnpm verify`: pass — apps/web 59 test files / 431 tests, domain 22 / 348,
  mobile 2 / 11, billing 10 / 201; web build succeeds.
- Browser: not run (calendar route requires sign-in; see phase 1).

Discoveries: see item 8 below (all-day draft hidden without all-day events).

### Phase 4 — Slot selection · complete

Commit: `refactor(web): extract TimelineView slot selection (phase 4)` on
`refactor/timeline-view` (the commit that adds this section).

Moved resp. 11 (timed-column slot selection) out of `TimelineView`, and resp. 6
(initial scroll) as a verbatim effect move.

`utils/slot-selection.ts` — pure maths lifted from the column handlers, same
expressions and operand order:

- `SLOT_HOLD_DELAY_MS = 180` (was `HOLD_DELAY_MS` in `TimelineView`).
- `snapSlotStart(rawMinute)` — press start, floored to 15 min, clamped to
  `[0, 23:45]`.
- `snapToSlot(rawMinute)` — drag pointer minute, floored to 15 min, clamped to
  `[0, 24:00]`.
- `holdSlotRange(start)` — the held 15-minute box, end clamped to 24:00.
- `dragSlotRange(start, rawMinute)` — snaps, then `min`/`max + 15`, end clamped.
- `clickSlotRange(start, defaultDurationMinutes)` — end clamped to 24:00.
- `hasSlotDragStarted(dx, dy)` (`dy >= 6 || dx >= 6`, pointer-move) and
  `isSlotClick(dx, dy)` (`dy < 6 && dx < 6`, pointer-up). Kept as two
  functions rather than one negation so each call site evaluates exactly the
  comparison it did before.
- `slotAnchorRect(colRect, range, hourHeight)` — popover anchor, 20 px minimum
  height. Takes `AnchorRect` from `utils/popover-position` (where it is
  defined), so `utils` still never imports `components`.

`hooks/useTimelineSlotSelection.ts` — API:

```ts
useTimelineSlotSelection({ hourHeight, defaultDurationMinutes, onSelectSlot })
  → { dragSelection, handleColumnPointerDown, handleColumnPointerMove,
      handleColumnPointerUp, handleColumnPointerCancel }
```

- Owns `dragSelection` state (`TimelineDragSelection`), `dragRef`,
  `holdTimerRef`, the 180 ms hold timer, pointer capture/release (best-effort
  `try/catch`), click-vs-drag, 15-minute snapping, range expansion,
  finalisation, cancel, anchor-rect construction and its own hold-timer
  unmount cleanup.
- Handlers keep the `(e, dateKey)` signatures and stay plain functions
  recreated every render (no `useCallback`), so they read `dragSelection` from
  their render closure exactly as before (discovery 2). Statement order inside
  each handler is unchanged, including `setDragSelection(null)` before
  `onSelectSlot`.
- The `.timelineEvent` `closest` guard stays the first statement of
  pointer-down. The hook imports `CalendarView.module.css` for that selector:
  the column and the event must resolve the same module class (see phase 10),
  and taking the selector as an option would add API for no caller.
- `TimelineView` consumes only `dragSelection` (drag indicator,
  `hasDragSelection` for `layoutTimelineDay`, the `!dragSelection` timed-draft
  condition) and wires the four handlers onto each `dayColumn` unchanged.

Initial scroll — **extracted** to `hooks/useTimelineInitialScroll.ts`:
`useTimelineInitialScroll(scrollRef, { dateKeys, byDateKey, revealEventId,
todayKey, now, timeZone, hourHeight })`. The effect body, scroll key and
`initialScrollKeyRef` moved verbatim; the hook is called at the exact spot the
effect was declared (after the window-listener and Escape effects), so effect
order and timing are unchanged, and it shares nothing with slot selection.
The only difference is `scrollRef` in the dependency array (required by
`react-hooks/exhaustive-deps` once the ref arrives as a parameter); it is
`TimelineView`'s own `useRef` object, so it never changes and never re-runs
the effect.

Ownership decisions:

- Hook call order in `TimelineView` changed (the slot-selection hook replaces
  the first `useState`; its refs/effect used to be declared later). Hook order
  only has to be stable between renders, which it is. The hold-timer cleanup
  now runs from the hook's own unmount effect instead of the shared one; each
  cleanup only clears its own timer, so their relative order is irrelevant.
  `TimelineView`'s shared unmount effect keeps `stopAutoScroll` and the settle
  and ghost timers (phases 5–6).
- The drag-selection indicator JSX stays in `TimelineView` (day-column chrome;
  not in scope).

Files changed:

- added `apps/web/src/features/calendar/utils/slot-selection.ts`
- changed `apps/web/src/features/calendar/utils/slot-selection.test.ts` — now
  imports the production helpers and `timeline-format`'s `formatMinute`
  (12 tests: every previous snapping/range/format/threshold expectation kept,
  plus press-start clamp to 23:45, hold box, drag end-of-day clamp, click
  default duration + 24:00 clamp, anchor rect incl. 20 px minimum, the
  `24:00` label, exactly-6 px is a drag). The private popover-placement copy
  was removed: it re-implemented an older placement rule, not production;
  `utils/popover-position.test.ts` covers the real `calculatePopoverPosition`.
  The two constant-comparison tests now assert the production constant and
  threshold helpers.
- added `apps/web/src/features/calendar/hooks/useTimelineSlotSelection.ts`
- added `apps/web/src/features/calendar/hooks/useTimelineSlotSelection.test.tsx`
  (8 tests: initial `null`, quick click → default-duration slot + anchor
  geometry with the hold timer cleared before it fires, capture/release on
  pointer id, default duration clamped to 24:00, hold timer armed for exactly
  180 ms, presses on `.timelineEvent` or non-primary buttons ignored (exact
  selector), pointer-up on another column ignored, cancel releases capture
  and prevents selection, capture failures tolerated). The hook runs inside a
  `renderToStaticMarkup` harness (no DOM in web Vitest), so state updates are
  not observable; drag-range finalisation from `dragSelection` is covered by
  the pure helpers only.
- added `apps/web/src/features/calendar/hooks/useTimelineInitialScroll.ts`
  (no new test: verbatim effect move; `initialScrollHour` keeps its own tests,
  and effects do not run under static rendering)
- changed `apps/web/src/features/calendar/components/TimelineView.tsx`
  (1,430 → 1,270 lines): calls both hooks; drops `HOLD_DELAY_MS`,
  `dragSelection` state, `dragRef`, `holdTimerRef`, the four column handlers,
  the hold-timer cleanup, `initialScrollKeyRef`, the initial-scroll effect and
  the `initialScrollHour` import.
- changed this tracker.

Verification:

- `vitest run` `slot-selection.test.ts` 12/12, `useTimelineSlotSelection.test.tsx`
  8/8.
- `vitest run src/features/calendar`: 30 files / 264 tests pass (252 − 3
  removed private-copy tests + 15 new).
- web `tsc --noEmit`: clean. `eslint apps/web/src/features/calendar`: clean
  (after adding `scrollRef` to the deps, above). `prettier --check`: clean.
- `pnpm verify`: pass — apps/web 60 files / 443 tests, domain 22 / 348,
  mobile 2 / 11, billing 10 / 201; web build succeeds (existing chunk-size
  warning only).
- Browser: not run (calendar route requires sign-in; see phase 1).

Discoveries: item 5 resolved as planned (test target only; no production
change). New item 9 below.

**Phase 4 follow-up — encoding correction:** commit `803ab73`
(`fix(web): restore en dash in TimelineView drag-selection label`). The phase 4
commit had saved the drag-selection indicator's range separator as the
mojibake `â€“` (UTF-8 en dash decoded as Windows-1252 and re-encoded) instead
of `–`. Restored from the phase 3 parent (`99c219c`); `TimelineView.tsx`'s set
of non-ASCII characters now matches that parent exactly. All other phase 4
files were scanned for double-encoded sequences and BOMs: none.

### Phase 5 — Shared gesture feedback · complete

Commit: `refactor(web): extract TimelineView gesture feedback (phase 5)` on
`refactor/timeline-view` (the commit that adds this section).

Moved resp. 14 (gesture feedback state) out of `TimelineView` into
`hooks/useTimelineGestureFeedback.ts`. No change to slot selection, layout,
drafts, all-day, auto-scroll, the window pointer fallback, or the move/resize
pointer logic; only the feedback statements inside it were redirected to the
hook's actions, in the same positions.

API:

```ts
useTimelineGestureFeedback()
  → { magneticSnap, hasConflict, snapDirection, settledOccurrenceKey, exitingGhost,
      setMagneticSnap, setHasConflict, setSnapDirection,
      triggerSettle, clearSettle, clearExitingGhost, showExitingGhost,
      suppressClick, releaseSuppressedClickSoon, shouldSuppressSelect }
```

Owned by the hook, moved verbatim:

- `magneticSnap`, `hasConflict`, `snapDirection`, `settledOccurrenceKey`,
  `exitingGhost` state (types exported as `TimelineMagneticSnap`,
  `TimelineSnapDirection`, `TimelineExitingGhost`; same shapes).
- `settleTimerRef`, `SETTLE_ANIMATION_MS = 180`, `triggerSettle(key)` (still
  the functional `current === key ? null : current` update), `clearSettle()`.
- `ghostExitTimerRef`, `GHOST_EXIT_ANIMATION_MS = 140`, `clearExitingGhost()`.
- `showExitingGhost(ghost)` — the sequence formerly written out in
  `finishMove` and the Escape listener: `setExitingGhost(ghost)`, clear the
  running timer (without nulling the ref, as before), arm a new 140 ms timer
  that nulls the ref then clears the ghost.
- `suppressedClickKeyRef` (private). `suppressClick(key)` replaces the four
  direct writes (resize pointer-down, move promotion, `finishMove`, Escape
  move branch) and the Escape resize branch's write.
  `releaseSuppressedClickSoon(key)` replaces the four
  `globalThis.setTimeout(…, 0)` releases (`finishResize`, `finishMove`, both
  Escape branches) — clears only if the ref still equals `key` when the timer
  fires. `shouldSuppressSelect(key)` is the consume-once check;
  `EventButton` still receives an inline `() => shouldSuppressSelect(sourceOccurrence.key)`.
- The settle and ghost timer unmount cleanups, split out of `TimelineView`'s
  shared unmount effect, which now only calls `stopAutoScroll` (phase 6).
- `setMagneticSnap`, `setHasConflict`, `setSnapDirection` are the raw state
  setters, exposed individually; there is no combined reset because the
  callers issue these in different orders and subsets.

Compatibility decisions:

- Actions are plain functions recreated each render (no `useCallback`), and
  each touches only refs and state setters. The Escape listener keeps its
  `[]` deps and first-render closure, so it calls the first render's actions;
  those behave identically to later ones. `react-hooks/exhaustive-deps` cannot
  see that for values returned by a custom hook and now warns on that effect,
  so it carries an `eslint-disable-next-line` with that justification (the
  deps array itself is unchanged).
- `clearExitingGhost()` stays before `setHasConflict(false)` in both
  pointer-downs; `setMagneticSnap/HasConflict/SnapDirection` calls keep their
  order everywhere; `showExitingGhost` sits exactly where the inline sequence
  was (before `preventDefault` in `finishMove`; after `setSnapDirection(null)`
  in Escape). `const suppressedKey` locals are kept so each call site reads as
  before.
- Render gates unchanged: `isSettled` matches occurrence key or event id
  (discovery 6); `hasConflict` still gated on `movePreview?.dateKey`
  (discovery 1, not fixed); magnetic guide and `snapDirection` conditions
  unchanged.
- Hook call order in `TimelineView` changed (the feedback hook sits where
  `snapDirection` state was declared; `suppressedClickKeyRef` and
  `settleTimerRef` used to be declared after the move/resize refs). Stable
  between renders, so irrelevant. Unmount cleanups now run as separate
  effects; each only clears its own timer or rAF.
- `moveHandlersRef` still holds `finishMove`/`finishResize` (and the rest);
  the window listeners are untouched.

Files changed:

- added `apps/web/src/features/calendar/hooks/useTimelineGestureFeedback.ts`
- added `apps/web/src/features/calendar/hooks/useTimelineGestureFeedback.test.tsx`
  (12 tests: initial display state and no timers; suppress → consumed once,
  other keys not suppressed; release on the next tick; suppression still
  active before the tick; no release when the key changed; release compares
  the key at fire time; settle timer 180 ms and restart on a new settle;
  `clearSettle` with and without a running timer; ghost timer 140 ms; ghost
  timer restarted by a second `showExitingGhost`; `clearExitingGhost`; settle
  and ghost timers independent). Same static-render harness as phase 4:
  state values after an action and the unmount cleanup are not observable
  without a DOM, so the cleanup is covered by review only.
- changed `apps/web/src/features/calendar/components/TimelineView.tsx`
  (1,270 → 1,204 lines): calls the hook; drops the five `useState`s,
  `ghostExitTimerRef`, `suppressedClickKeyRef`, `settleTimerRef`, both
  animation constants, `triggerSettle`, `clearSettle`, `clearExitingGhost`,
  the two inline ghost-timer sequences, the four inline suppression releases,
  the inline consume-once check and the two timer cleanups.
- changed this tracker.

Verification:

- `vitest run useTimelineGestureFeedback.test.tsx`: 12/12.
- `vitest run src/features/calendar/components/TimelineView` (base, ghost,
  cross-day): 3 files / 61 tests pass unchanged.
- `vitest run src/features/calendar`: 31 files / 276 tests pass (264 + 12).
- web `tsc --noEmit`: clean. `eslint src/features/calendar --max-warnings 0`:
  clean (with the Escape-effect disable above). `prettier --check`: clean.
- `pnpm verify`: pass — apps/web 61 files / 455 tests, domain 22 / 348,
  mobile 2 / 11, billing 10 / 201, release 2 / 8; web build succeeds (existing chunk-size
  warning only).
- Browser: not run (calendar route requires sign-in; see phase 1). jsdom-level
  gesture coverage is still absent: no test drives a real move/resize through
  pointer events and timers together.

Discoveries: new item 11 below. None fixed.

### Phase 6 — Shared auto-scroll · complete

Scope: resp. 15 only. Feedback, slot selection, layout, drafts, all-day, the
window pointer fallback, Escape and the move/resize pointer logic are
unchanged apart from the redirected auto-scroll calls.

API — `hooks/useTimelineAutoScroll.ts`:

```ts
useTimelineAutoScroll(scrollRef, {
  isMoveDragging, // () => moveRef.current?.status === 'dragging'
  isResizeActive, // () => Boolean(resizeRef.current)
  applyResizeAt, // applyResizePosition of the calling render
  applyMoveAt, // applyMovePosition of the calling render
}): { stopAutoScroll, checkAndTriggerAutoScroll, trackPointer, clearPointer }
```

It exports `UseTimelineAutoScrollOptions` and `TimelineAutoScroll`.

Owned by the hook, moved verbatim:

- `autoScrollRafRef` and `lastPointerRef`, both private.
- `stopAutoScroll()`, `stepAutoScroll()` (private) and
  `checkAndTriggerAutoScroll()`. These are unchanged:
  - their bodies, early exits and statement order;
  - the `calculateAutoScrollVelocity` / `clampScrollTop` calls;
  - the guard that allows only one rAF while one is pending.

  The duplicated probe (discovery 3) is still duplicated.

- The rAF unmount cleanup. This was `TimelineView`'s last shared unmount
  effect, now deleted from the component.
- `trackPointer(clientX, clientY)` replaces the six
  `lastPointerRef.current = { clientX: e.clientX, clientY: e.clientY }`
  writes:
  - resize pointer-down and pointer-move;
  - move pointer-down and pointer-move;
  - both window pointer-move branches.
- `clearPointer()` replaces the three `lastPointerRef.current = null` writes:
  `finishResize`, `finishMove` and Escape.
- Each call sits exactly where its write was.

Compatibility decisions:

- `stepAutoScroll` is still a plain per-render function that reschedules
  **itself**. The options object it reads is the one passed on its render, so
  a running loop keeps calling the `applyMovePosition` / `applyResizePosition`
  of the render that started it (discovery 2). No latest-callback ref was
  introduced.
- The probes are read at the same points as the refs were.
  - After scrolling, `isResizeActive && resizeRef.current` became
    `isResizeActive && gesture.isResizeActive()`. This is the same re-read.
  - The move branch `isMoveActive && moveRef.current` became
    `isMoveActive && gesture.isMoveDragging()`, so the re-read now also checks
    `status === 'dragging'`. This is equivalent:
    - no script runs between the two reads, because setting `scrollTop`
      dispatches `scroll` asynchronously;
    - a move never goes from `dragging` back to `pending`.
- `finishResize` / `finishMove` keep `stopAutoScroll()` as their first
  statement. Escape keeps `stopAutoScroll(); clearPointer();` first.
- `moveHandlersRef` still holds `checkAndTriggerAutoScroll`, now the hook's
  from the latest render, alongside the other handlers.
- The window-listener effect keeps `[]` deps and its first-render closure. It
  now calls the first render's `trackPointer`, which only writes a ref.
  - `react-hooks/exhaustive-deps` flags that, so the effect got the same
    justified `eslint-disable-next-line` as Escape. The deps are unchanged.
  - Escape's existing justification now mentions the auto-scroll actions too.
- Hook call order changed.
  - The auto-scroll hook is called after `applyMovePosition`, where
    `stepAutoScroll` used to be, because it needs both apply functions.
  - The rAF cleanup is now registered after the feedback hook's timer
    cleanup. Each cleanup only touches its own timer or frame.

Files changed:

- added `apps/web/src/features/calendar/hooks/useTimelineAutoScroll.ts`
- added `apps/web/src/features/calendar/hooks/useTimelineAutoScroll.test.tsx`
  (17 tests). `requestAnimationFrame` / `cancelAnimationFrame` are stubbed
  with `vi.stubGlobal`, and the scroll container is a stub. The tests cover:
  - no loop without a tracked pointer, an active gesture or a scroll
    container, away from the edges, or with no room left to scroll;
  - only one frame scheduled while one is pending;
  - a frame scrolls by the clamped velocity, and by the full velocity when
    there is room;
  - an active resize is re-applied after scrolling;
  - a dragging move is re-applied when no resize is active;
  - resize wins when both report active;
  - the loop stops when the gesture ends, once `scrollTop` cannot change, and
    when the pointer leaves the edge;
  - `stopAutoScroll` cancels the pending frame;
  - `trackPointer` enables the probe and `clearPointer` stops the loop.

  The rAF unmount cleanup is not observable without a DOM, so it is covered
  by review only.

- changed `apps/web/src/features/calendar/components/TimelineView.tsx`
  (1,204 → 1,121 lines):
  - calls the hook;
  - drops both refs, the three functions, the unmount effect and the
    `event-auto-scroll` import;
  - redirects the pointer writes;
  - adds the window-effect justification.
- changed this tracker, including removing a stale duplicate of the old
  phase 5 plan that sat under the "Phases 7–9" heading.

Verification:

- `vitest run useTimelineAutoScroll.test.tsx`: 17/17.
- `vitest run src/features/calendar/components/TimelineView` (base, ghost,
  cross-day): 3 files / 61 tests pass unchanged.
- `vitest run src/features/calendar`: 32 files / 293 tests pass (276 + 17).
- web `tsc --noEmit`, `eslint src/features/calendar --max-warnings 0` and
  `prettier --check`: all clean.
- `pnpm verify`: pass.
  - apps/web 62 files / 472 tests, domain 22 / 348, mobile 2 / 11,
    billing 10 / 201, release 2 / 8.
  - The web build succeeds with only the existing chunk-size warning, and the
    client-bundle check is clean.
- Browser: not run. The calendar route requires sign-in and no signed-in
  session was available, so edge auto-scroll was not exercised manually
  during move or resize. No test drives a real gesture through pointer events
  and rAF together.

Discoveries: none new. Existing ones (2, 3) are preserved, not fixed.

### Phase 7 — Resize gesture · next

Scope: resp. 12 only. No change to move (phase 8), feedback, auto-scroll,
slot selection, layout, or the window fallback / Escape structure (phase 9).

**Plan adjustment found while inspecting.** Within one render, the resize code
and auto-scroll depend on each other:

- auto-scroll needs `applyResizePosition` and the resize-active probe;
- the resize handlers need `stopAutoScroll`, `trackPointer`, `clearPointer`
  and `checkAndTriggerAutoScroll` from that same render.

Today this works because `applyResizePosition` is declared above the
`useTimelineAutoScroll` call and the handlers below it. A hook must be called
whole, so the plan is:

- `useTimelineAutoScroll` is called first, where it is now.
- `useTimelineResize` is called right after it.
- Auto-scroll gets the resize side through forwarding arrows:
  - `isResizeActive: () => Boolean(resizeRef.current)`
  - `applyResizeAt: (clientY, scrollTop) => applyResizePosition(clientY, scrollTop)`

The arrows refer to the resize hook's return values, which are declared below.
They only run after render, so each render's arrow still calls that render's
`applyResizePosition`. This keeps discovery 2's loop-closure semantics exactly,
and no latest-callback ref is added. There is no `no-use-before-define` rule,
and TypeScript allows a later `const` to be referenced inside a closure.

1. **`hooks/useTimelineResize.ts`** owns, moved verbatim:
   - the `resizeRef` shape (as `TimelineActiveResize`) and `resizeRef`;
   - the `resizePreview` state;
   - `applyResizePosition`, `handleResizePointerDown`,
     `handleResizePointerMove` and `finishResize`, with their bodies and
     statement order unchanged.

   Inputs:
   - `scrollRef`, `hourHeight`, `timeZone`, `byDateKey`, `workingHours`,
     `timingOverrides`, `onResizeEvent`;
   - the feedback actions it uses: `setMagneticSnap`, `setHasConflict`,
     `clearSettle`, `clearExitingGhost`, `suppressClick`,
     `releaseSuppressedClickSoon`, `triggerSettle`;
   - the auto-scroll actions: `stopAutoScroll`, `checkAndTriggerAutoScroll`,
     `trackPointer`, `clearPointer`, all from the same render.

   Returns:
   - `resizeRef`, a stable ref object, so these readers stay verbatim until
     phase 9:
     - the window fallback's `resize.pointerId` / `initialScrollTop` reads;
     - Escape's `else if (resizeRef.current)` branch;
     - the per-day layout's `activeResize` snapshot;
   - `resizePreview`, `applyResizePosition`, `handleResizePointerDown`,
     `handleResizePointerMove` and `finishResize`.

2. **Escape's resize branch stays inline** in phase 7.
   - It calls `setResizePreview(null)`, so the hook also returns
     `setResizePreview` as the raw setter, like the feedback setters.
   - Phase 9 decides whether that branch becomes a hook action.
   - `finishResize` keeps `stopAutoScroll()` first and `clearPointer()` right
     after `resizeRef.current = null`.
3. **Must stay identical:**
   - `handleResizePointerDown` keeps its statement order: `trackPointer` →
     `clearSettle` → `clearExitingGhost` → `suppressClick` →
     `setResizePreview` → `setMagneticSnap(null)` → `setHasConflict(false)` →
     pointer capture.
   - Magnetic targets and conflict candidates are still computed from
     `byDateKey` at pointer-down.
   - `moveHandlersRef` keeps holding `applyResizePosition` and `finishResize`,
     now the hook's from the latest render.
   - `EventButton` still gets `onResizePointerDown` / `Move` / `Up` / `Cancel`
     as the same inline arrows around the hook's handlers.
   - Resize still wins over move in auto-scroll.
   - Discovery 1 (the resize conflict badge gated on `movePreview`) stays
     unfixed.
4. **Tests.** Hook tests use the static-render harness with stub handle and
   column elements. They cover what is observable without a DOM:
   - pointer-down ignores a non-primary button, a missing `onResizeEvent` and
     a handle outside a column;
   - a pointer-down arms `resizeRef`, tracks the pointer, and calls the
     feedback actions in order;
   - move and finish ignore another `pointerId`;
   - `finishResize` stops auto-scroll first, clears the ref and pointer, and
     releases the suppression;
   - a cancelled or unchanged finish does not commit;
   - a changed finish settles and calls `onResizeEvent` with the snapped
     timing.

   Also run:
   - the existing `TimelineView` / ghost / cross-day tests, unchanged;
   - all calendar tests;
   - web `tsc` / eslint / prettier and `pnpm verify`;
   - a browser check of resize and resize auto-scroll, if a signed-in session
     is available.

### Phases 8–9 — Move, gesture recovery · pending

- Phase 8 extracts the move gesture (resp. 13) the same way, forwarding
  `isMoveDragging` / `applyMoveAt` into auto-scroll.
- Phase 9 covers the window fallback and Escape (resp. 16).

The order is deliberate: shared layers first (feedback, auto-scroll), then the
two gestures, then recovery. Each phase must re-run the full TimelineView test
set and manually exercise move, resize, cross-day, auto-scroll and Escape in
the browser, because jsdom does not cover pointer capture or rAF timing.

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
   moved both into `useTimelineAutoScroll` still duplicated. Sharing them is a
   separate change.
4. **Escape duplicates the cancel paths.** The Escape listener re-implements
   `finishMove`/`finishResize`(cancelled) inline instead of calling them, and it
   ignores a `pending` move (only a dragging move or an active resize is
   cancelled). Phase 9 must keep both behaviours.
5. **`slot-selection.test.ts` tests private copies** of the snapping and
   formatting helpers rather than production code (its `formatMinute` copy
   also lacks the `24:00` branch). **Resolved in phase 4** (test target only).
6. `isSettled` matches either the occurrence key or the event id; `canMove`
   stays true for the event currently being moved even if it would otherwise
   be immovable in the target column.
7. **Cross-day moves keep original-minute column ordering on the target
   day.** Gesture ordering projects the dragged event's _original_ wall-clock
   minutes onto whatever day it is previewed on, so in the target column it is
   ordered as if it started at its original time (e.g. a 9:30 event dragged to
   14:30 next to a 14:00 event keeps the left column). Pinned by a
   `timeline-day-layout` test; not changed.
8. **An all-day draft is invisible when the view has no all-day events.**
   The all-day row (and so the draft chip) only renders when `hasAllDay`, which
   counts real all-day events only. Choosing "all-day" in quick create on a
   week with no all-day events shows no chip. The draft chip also carries
   `timelineEvent`, so clicking it never starts a second all-day slot (pinned
   by a `TimelineAllDayRow` test). Not changed.
9. **`slot-selection.test.ts` also carried a private popover-placement
   copy** (left of the anchor, flip right, else centre) that is not the
   production `calculatePopoverPosition` rule. Removed from that file in
   phase 4 (it tested nothing real); the production rule is covered by
   `popover-position.test.ts`. No production change.
10. **A drag released before a re-render finalises as a click range.**
    Pointer-up reads `dragSelection` from its render closure; if the pointer
    moved 6 px or more but no render has happened since the first
    `setDragSelection`, `!isClick && dragSelection` is false and the default
    duration from the press minute is selected. Part of discovery 2's closure
    semantics; preserved by the phase 4 hook. Not changed.
11. **A pending suppression release compares keys at fire time, not
    ownership.** Each `setTimeout(0)` release clears the suppression if the
    ref equals its key when it fires. If the same occurrence is suppressed
    again (e.g. a new resize on it) before an earlier gesture's release tick
    runs, that stale release clears the new suppression. Only reachable within
    one macrotask of a gesture ending; preserved by
    `releaseSuppressedClickSoon` (pinned by a hook test). Not changed.

## Verification log

| Phase | Checks                                                                                                                                                  | Result                                         |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| base  | `vitest run src/features/calendar`                                                                                                                      | 25 files / 228 tests pass                      |
| 1     | `vitest run src/features/calendar`; web `tsc --noEmit`; `eslint` (calendar feature); `prettier --check`; `pnpm verify`; body `diff` vs baseline         | all pass (232 calendar tests)                  |
| 2     | new layout tests; `vitest run src/features/calendar`; web `tsc --noEmit`; `eslint`; `prettier`; `pnpm verify`                                           | all pass (243 calendar tests)                  |
| 3     | new draft/all-day tests; `vitest run src/features/calendar`; web `tsc --noEmit`; `eslint`; `prettier`; `pnpm verify`                                    | all pass (252 calendar tests)                  |
| 4     | slot-selection + hook tests; `vitest run src/features/calendar`; web `tsc --noEmit`; `eslint`; `prettier`; `pnpm verify`                                | all pass (264 calendar tests)                  |
| 5     | feedback hook tests; TimelineView/ghost/cross-day tests; `vitest run src/features/calendar`; web `tsc --noEmit`; `eslint`; `prettier`; `pnpm verify`    | all pass (276 calendar tests)                  |
| 6     | auto-scroll hook tests; TimelineView/ghost/cross-day tests; `vitest run src/features/calendar`; web `tsc --noEmit`; `eslint`; `prettier`; `pnpm verify` | all pass (293 calendar tests); browser not run |

## Current checkpoint

Phase 6 is complete on `refactor/timeline-view`, which branched from merged
`main` (phases 1–2 were replayed there).

- The phase 4 encoding correction is commit `803ab73`.
- The old `web-refactor/timeline-view` branch was deleted locally and on
  `origin` after phase 4. Its calendar changes were identical to the replayed
  commits: `git diff a102904 81708a9` touches only `main`'s own non-calendar
  changes.
- `TimelineView.tsx` is 1,121 lines, down from 1,916 at baseline.
- It still owns:
  - responsibilities 1, 5, 7, 12, 13 and 16;
  - the render-side half of 10;
  - the draft visibility condition of 9;
  - the drag-selection indicator JSX;
  - the render-side use of the feedback values;
  - the `useTimelineAutoScroll` wiring.

## Next step

Start **Phase 7** exactly as planned under
[Phase 7 — Resize gesture](#phase-7--resize-gesture--next). It adds
`hooks/useTimelineResize.ts`, which owns `resizeRef`, `resizePreview`,
`applyResizePosition`, the resize pointer handlers and `finishResize`. It is
called right after `useTimelineAutoScroll`, which reaches the resize side
through forwarding arrows.

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
