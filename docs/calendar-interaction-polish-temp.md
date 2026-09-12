> **TEMPORARY WORKING TRACKER**
>
> This document exists only while the calendar interaction-polish phases are being implemented.
> Delete this file once the planned phases are complete and the durable documentation has been updated where appropriate.

# Web Calendar Interaction & Polish Roadmap

## Purpose

This document records the design decisions, current state, and execution order for direct manipulation and micro-interactions in BPlan's web calendar. It serves as an authoritative bridge across agent sessions so that future work can proceed without re-analyzing prior phases or re-pasting large implementation briefs.

### Key Questions Answered

1. **What already existed before this pass?** Empty-slot clicking, empty-range drag-to-create, 15-minute slot snapping, pointer capture, and floating quick-create popovers on the shared Day/Week `TimelineView`.
2. **What has been completed?** Phase 1 (timed event top/bottom resizing) and Phase 1.1 (small event `< 45m` layout and pop-in animation polish).
3. **What is currently being polished?** Verification and stabilization of the event resizing micro-interactions.
4. **What remains?** Whole-event drag-to-move (Phase 2), manipulation polish (magnetic snapping, conflict feedback, settle polish, edge auto-scroll), keyboard nudging, and spatial view transitions.
5. **What order should the remaining work happen in?** Core drag-to-move first, then manipulation feedback, followed by keyboard shortcuts and spatial transitions.
6. **What architecture/safety constraints must future agents preserve?** Single save on release, `useUpdateEvent` mutation authority, provider write-routing, timezone purity, and strict isolation between drag, resize, and click gestures.
7. **When should this temporary file be deleted?** Once the planned manipulation phases are complete and durable documentation is folded into permanent docs (e.g. `docs/calendar-views.md`).

---

## Baseline Architecture (Verified)

The following baseline features already exist in `apps/web/src/features/calendar/` and **must not be re-implemented**:

- **Shared Day & Week View Engine**: `TimelineView.tsx` powers both Day (`dateKeys.length === 1`) and Week (`dateKeys.length === 7`) views, sharing column geometry, hour lines, and event layout.
- **Empty-Slot Click Quick-Create**: Single-click on an empty slot schedules a hold timer (`HOLD_DELAY_MS = 180ms`). Releasing within 180ms opens `QuickCreatePopover` with the default duration (60m) without visual flicker.
- **Empty-Range Drag-to-Create**: Pressing and dragging downwards or upwards ($\ge 6\text{px}$) activates `.dragSelectionIndicator` with 15-minute snapping and pointer capture, opening `QuickCreatePopover` sized to the exact dragged range upon release.
- **Floating Quick-Create Popover**: Smart horizontal placement (`popover-position.ts`) positions the popover to the left or right of the anchor slot based on viewport boundaries.

---

## Phase 1 — Timed Event Resizing [COMPLETE]

Implemented in commit `c547c58` (`feat(web): add timed event resizing`).

### Capabilities:

- **Edge Resize Handles**: Two comfortable 8px hit targets inside the event card (`data-resize-edge="start"` at top, `data-resize-edge="end"` at bottom) with subtle hover/active indicator bars.
- **15-Minute Snapping**: Cursor vertical offset maps deterministically to 15-minute snapped intervals via `pointerYToSnappedMinute` and `resizeMinuteInterval` in `event-resize.ts`.
- **Live Visual Feedback**: Live geometry updates top and height instantly during pointer move; time range and duration feedback display in real time.
- **Single Authoritative Save**: No network calls or mutation dispatches occur during `pointermove`. Exactly one save is triggered on pointer release (`pointerup`).
- **Mutation Path**: Dispatches through `onResizeEvent`, delegating to `useUpdateEvent` in `CalendarView.tsx` and respecting provider write-routing (`provider-event-write`) for external calendars.
- **Optimistic Timing & Rollback**: `timingOverrides` map in `CalendarView` holds optimistic start/end times while backend data catches up. Mutation errors roll back to original timing and display an error toast with an **Undo** action.
- **Gesture Isolation**: `shouldSuppressSelect` prevents the normal event click popover from opening when releasing a resize handle. Empty-space slot selection remains completely isolated.

### Intentionally Deferred / Unsupported in Phase 1:

- **Generated Recurring Occurrences**: Occurrences with `recurrenceRule` or `recurringEventId` are non-resizable until recurring series edit semantics are designed.
- **All-Day Events**: All-day items in the top header row do not expose resize handles.
- **Multi-Day / Clipped Events**: Events spanning multiple days or clipped at midnight are excluded from single-day edge resizing.
- **Read-Only Calendars**: Events on calendars with `isReadOnly: true` do not render resize handles.

---

## Phase 1.1 — UI Polish: Small Events (< 45 min) & Animations [COMPLETE]

Implemented locally on branch `web-ui-changes`.

### Motivation:

In the initial Phase 1 implementation, resizing an event down to small durations (15m or 30m) caused the bottom-docked resize feedback text (`<time span> · <duration>`) to collide with and overlap the event title, making both unreadable.

### Implemented Polish:

1. **Dynamic Layout for Short Events (`< 45m`)**:
   - When resized under 45 minutes (`isShortResize`), the event title smoothly collapses and hides (`.timelineEventTitleResizingShort` with `max-height: 0`, `opacity: 0`, `line-height: 0`).
   - The feedback container (`.timelineResizeFeedbackShort`) is positioned vertically centered inside the card (`bottom: calc(50% - 6px)`), eliminating text collision.
2. **Reverting to Full Display (`>= 45m`)**:
   - Once the event reaches at least 45 minutes, the title smoothly pops in at the top (`.timelineEventTitleResizingNormal`), and feedback docks cleanly to the bottom (`bottom: 2px`).
3. **Animations & Micro-interactions**:
   - **Feedback Entry**: `@keyframes feedback-pop-in` gently scales in the feedback badge on drag start.
   - **Title Pop-In**: `@keyframes resize-title-pop-in` applies a spring entrance when reaching $\ge 45\text{m}$.
   - **Duration Pill Badge**: `.timelineResizeDurationBadge` renders the duration in an accent pill, keyed by duration to play `@keyframes duration-pill-pop` on every 15-minute snap.
   - **Interpolated Vertical Transition**: CSS transitions on `bottom` smoothly glide feedback between center and bottom dock.
   - **Reduced Motion**: Full `@media (prefers-reduced-motion: reduce)` support disabling all resize animations.

---

## Next Phase: Phase 2 — Whole-Event Drag-to-Move [PENDING]

The next major interaction is whole-event direct manipulation.

### Desired Behavior:

- **Trigger**: Dragging the event body (outside the top/bottom resize handles) initiates movement.
- **Duration Invariant**: The event duration (`end - start`) remains constant; both start and end shift together.
- **15-Minute Grid Snapping**: Reuses `event-resize.ts` / `pointerYToSnappedMinute` concepts for consistent time math.
- **Live Geometry & Feedback**: Event card tracks pointer vertically with live time range pill feedback.
- **Single Save on Release**: No network updates during motion; one authoritative mutation dispatched on `pointerup`.
- **Optimistic State & Rollback**: Uses `timingOverrides` pattern with error rollback and Undo toast.
- **Gesture Disambiguation**:
  - Distance threshold: Pointer movement $< 6\text{px}$ is treated as a click (opens details popover).
  - Movement $\ge 6\text{px}$ begins whole-event drag.
  - Resize handles remain strictly resize-only.
  - Empty-space click/drag remains unaffected.
- **Scope for Initial Iteration**: Same-day vertical movement within the active day column. Cross-day and multi-day dragging deferred.

---

## Subsequent Manipulation Polish (Post-Phase 2)

Execute these as discrete, focused sub-phases after core drag-to-move is solid:

- **Phase 3.0 — Magnetic Snapping**:
  Subtle magnetic affinity when approaching adjacent event boundaries or working-hours lines, without overriding the foundational 15-minute grid.
- **Phase 3.1 — Live Conflict Feedback**:
  Non-blocking visual cues (e.g. subtle warning border/tint or conflict badge) while an event is dragged into an overlapping slot; clears instantly on exit.
- **Phase 3.2 — Origin Ghost Indicator**:
  Faint ghost outline at the event's original position during drag if user testing indicates it aids spatial orientation.
- **Phase 3.3 — Settle Physics / Animation**:
  Snappy, restrained settle transition upon release into the target slot (0ms lag while actively dragging).
- **Phase 3.4 — Edge Auto-Scroll**:
  Smooth timeline container scrolling when dragging within 40px of the top or bottom viewport edges.

---

## Future Polish Phases

- **Phase 4 — Keyboard Manipulation**:
  15-minute keyboard nudging for selected events (e.g. `Alt + Up/Down` to move, `Alt + Shift + Up/Down` to resize) with ARIA live announcements.
- **Phase 5 — Spatial View Transitions**:
  Fluid visual continuity between Month $\leftrightarrow$ Week $\leftrightarrow$ Day views, preserving the focused date without disruptive layout shifts.

---

## Hard Cases & Deferred Architecture Rules

Future agents working on this roadmap must strictly obey these boundaries:

1. **Recurring Event Safety**:
   - Expanding recurring instances is deterministic via `@cal/domain`.
   - Modifying a single occurrence must NOT overwrite the recurrence master without explicit series scope choice (`this_event`, `following_events`, `all_events`).
   - Keep recurring occurrences non-manipulable until recurrence mutation endpoints and UI confirmation dialogs are built.
2. **Multi-Day & Clipped Segments**:
   - A multi-day event rendered on a day column is visually clipped at `00:00` or `24:00`.
   - Never treat a clipped segment boundary as the event's true start or end time.
3. **Provider Synchronization**:
   - Never mutate provider rows directly or bypass `useUpdateEvent`.
   - External provider accounts (Google, Outlook) require server-authoritative write routing via `provider-event-write`.
4. **Timezone Authority**:
   - All time conversions must use `@cal/domain` timezone helpers (`dateMinuteToInstant`, `toZonedDateKey`, `zonedWallClockToUtc`).
   - Never use browser-local `Date` getters for calendar math.

---

## Architectural Invariants

- **Component Layering**: `TimelineView` manages pointer events and visual feedback only; `CalendarView` coordinates data mutations and optimistic state.
- **Mutation Authority**: `useUpdateEvent` remains the single write path for all event edits.
- **Zero In-Flight Network Spam**: Never dispatch mutations during `pointermove`. Save exactly once on release.
- **Reversible Optimism**: Every direct manipulation must support rollback on server error and provide an Undo affordance.

---

## Execution Checklist

- [x] Baseline empty-slot click/drag quick-create
- [x] Phase 1 — timed-event top/bottom resizing (`c547c58`)
- [x] Phase 1.1 — small-event `< 45m` layout & text animation polish
- [ ] Phase 2 — whole-event drag-to-move
- [ ] Phase 2.1 — move/resize regression hardening & gesture collision tests
- [ ] Phase 3.0 — magnetic snapping
- [ ] Phase 3.1 — live conflict warning feedback
- [ ] Phase 3.2 — origin ghost outline
- [ ] Phase 3.3 — release settle animation
- [ ] Phase 3.4 — timeline edge auto-scroll
- [ ] Phase 4 — keyboard nudging shortcuts
- [ ] Phase 5 — Month / Week / Day spatial view transitions
- [ ] Deferred — safe recurring occurrence mutation
- [ ] Deferred — multi-day / clipped event direct manipulation

---

## Delete This File When

Delete `docs/calendar-interaction-polish-temp.md` when:

1. The planned calendar interaction phases decided for release are complete.
2. Important durable behavior and architecture rules have been folded into permanent documentation (e.g. `docs/calendar-views.md`).
3. No remaining implementation sessions depend on this temporary roadmap.
