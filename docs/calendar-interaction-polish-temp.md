> **TEMPORARY WORKING TRACKER**
>
> This document exists only while the calendar interaction-polish phases are being implemented.
> Delete this file once the planned phases are complete and the durable documentation has been updated where appropriate.

# Web Calendar Interaction & Polish Roadmap

## Purpose

This document records the design decisions, current state, and execution order for direct manipulation and micro-interactions in BPlan's web calendar. It serves as an authoritative bridge across agent sessions so that future work can proceed without re-analyzing prior phases or re-pasting large implementation briefs.

### Key Questions Answered

1. **What already existed before this pass?** Empty-slot clicking, empty-range drag-to-create, 15-minute slot snapping, pointer capture, and floating quick-create popovers on the shared Day/Week `TimelineView`.
2. **What has been completed?**
   - Baseline empty-slot click/drag quick-create
   - Phase 1: timed event top/bottom resizing (`c547c58`)
   - Phase 1.1: small-event `< 45m` layout and micro-animation polish (`31c0738`, `410881c`)
   - Phase 1.2: Chromium rendering & animation hardening (`989cd1d`, `31c0738`, `410881c`)
   - Phase 2: whole-event drag-to-move (`1692a9f`)
   - Phase 2.2: cross-day whole-event dragging in Week view
   - Phase 3.0: magnetic snapping for move and resize
   - Phase 3.1: live conflict warning feedback (`6841359`)
   - Phase 3.3: release settle animation (`8abbd0b`)
   - Phase 3.4: timeline edge auto-scroll
   - Phase 3.5: smooth motion, cross-day snap transitions, animated toasts, and Undo return animations
3. **What is currently next?** Phase 3.2: Origin Ghost Indicator (or Phase 4 Keyboard Manipulation / Phase 2.1 hardening).
4. **What remains beyond Phase 3.5?** Origin ghost (Phase 3.2), keyboard manipulation (Phase 4), spatial view transitions (Phase 5), and regression hardening (Phase 2.1).
5. **What order should the remaining work happen in?** Core drag-to-move first, then manipulation feedback, followed by keyboard shortcuts and spatial continuity transitions.
6. **What architecture/safety constraints must future agents preserve?** Single save on release, `useUpdateEvent` mutation authority, provider write-routing, timezone purity, strict isolation between gestures, and compositor/rendering safety (no retained transforms or persistent `will-change`).
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
- **Optimistic Timing & Rollback Semantics**:
  - `timingOverrides` map in `CalendarView` holds optimistic start/end times while backend data catches up.
  - A successful resize provides a temporary **Undo** opportunity in the UI.
  - If a resize mutation fails, the UI rolls back / reconciles to the authoritative timing and displays an error toast (Undo is not offered for a save that never succeeded).
- **Gesture Isolation**: `shouldSuppressSelect` prevents the normal event click popover from opening when releasing a resize handle. Empty-space slot selection remains completely isolated.

### Intentionally Deferred / Unsupported in Phase 1:

- **Generated Recurring Occurrences**: Occurrences with `recurrenceRule` or `recurringEventId` are non-resizable until recurring series edit semantics are designed.
- **All-Day Events**: All-day items in the top header row do not expose resize handles.
- **Multi-Day / Clipped Events**: Events spanning multiple days or clipped at midnight are excluded from single-day edge resizing.
- **Read-Only Calendars**: Events on calendars with `isReadOnly: true` do not render resize handles.

---

## Phase 1.1 — UI Polish: Small Events (< 45 min) & Animations [COMPLETE]

Committed in `31c0738` (`feat(web): restore spatial view transitions and event resize micro-animations without persistent compositing`) with horizontal alignment follow-up in `410881c` (`fix(web): prevent Day view drag animations from jumping horizontally by anchoring to left center`).

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
   - **Title Pop-In**: `@keyframes resize-title-pop-in` applies an in-place entrance when reaching $\ge 45\text{m}$.
   - **Duration Pill Badge**: `.timelineResizeDurationBadge` renders the duration in an accent pill, keyed by duration to play `@keyframes duration-pill-pop` on every 15-minute snap.
   - **Interpolated Vertical Transition**: CSS transitions on `bottom` smoothly glide feedback between center and bottom dock.
   - **Reduced Motion**: Full `@media (prefers-reduced-motion: reduce)` support disabling all resize animations.

---

## Phase 1.2 — Chromium Rendering & Animation Hardening [COMPLETE]

Committed in `989cd1d` (`fix(web): remove calendar view transition compositing and transforms to fix text blur`), `31c0738`, and `410881c`.

### Problem & Root Cause:

During testing on Chrome/Windows, calendar event text could render noticeably blurry immediately after page load or navigation. Resizing or maximizing the Chrome window forced Chromium to re-rasterize the layer, temporarily making text crisp again.

The root cause was persistent GPU compositing and retained transforms on large calendar view containers:

- `.calendarViewTransition` had permanent `will-change: transform, opacity`.
- View animations used `scale(...)` transforms with `animation-fill-mode: both / forwards`, causing Chromium to retain fractional-pixel texture scaling across the entire calendar subtree.

### Durable Hardening Rules:

1. **No Permanent Compositing on View Containers**: Do not apply permanent `will-change: transform, opacity` to full calendar wrappers or page transition containers.
2. **Terminal State Must Settle to `transform: none`**: Large container animations must finish cleanly with `transform: none` and remove transforms from the active style state.
3. **No Retained Transforms**: Avoid `animation-fill-mode: both` or `forwards` on wrappers containing text if the terminal keyframe leaves any transform.
4. **No Filter Transitions on Events**: Event hover and drag states avoid `filter: brightness(...)` or blur-inducing CSS filters.
5. **No Speculative Hacks**: Do not reintroduce font-smoothing hacks (`-webkit-font-smoothing: antialiased`) or broad geometry `Math.round()` workarounds solely as blur mitigations.

### Restored Polish with Safe Mechanics (`31c0738` & `410881c`):

- **Transient Month/Week/Day Transitions**: View zoom/fade transitions (~220ms, subtle scale `0.985` / `1.015` to `1.0`) finish strictly at `transform: none` with no permanent `will-change`.
- **In-Place Micro-animations**: Local resize title and duration pill animations operate on isolated child elements without compositing the full card or column.
- **Left-Anchored Origins (`410881c`)**: Set `transform-origin: left center` on `.timelineResizeFeedback` and title animations. In wide single-column views (Day view $\approx 1000\text{px}$ wide), this eliminates jarring horizontal swings that occurred when scaling from the default 50% element center.
- **Unified Draft Bubble Transitions**: Draft event entry/exit animations unfold cleanly on the Y-axis without horizontal shifts across both Day and Week views.

---

## Phase 2 — Whole-Event Drag-to-Move [COMPLETE]

Implemented direct manipulation whole-event dragging for timed events in Day and Week views.

### Capabilities:

- **Body Drag Trigger**: Dragging the event card body outside the top/bottom resize handles begins a vertical move gesture once exceeding the $\ge 6\text{px}$ movement threshold.
- **Click Disambiguation**: Pointer movement $< 6\text{px}$ remains a normal click, opening the event details / editor popover without triggering move state.
- **Resize Handle Collision Safety**: Pointer events on top (`data-resize-edge="start"`) and bottom (`data-resize-edge="end"`) handles stop propagation and are strictly reserved for edge resizing. Move and resize gestures are completely mutually exclusive.
- **Duration Invariant**: Event duration is strictly invariant across all drag offsets and day boundary clamps.
- **15-Minute Grid Snapping**: Snaps vertically to 15-minute intervals via `moveMinuteInterval` and `resolveMoveGesture`.
- **Live Visual Feedback**: Event card updates top position in real time tracking snapped minutes while preserving card height and layout. Live feedback displays formatted start and end time range (`timelineMoveFeedback`), with title dynamically collapsing for short events (`< 45m`).
- **Compositor & Rendering Safety**: Strictly complies with Phase 1.2 rules (no permanent `will-change`, no retained transforms, no filters, left-anchored origins).
- **Single Authoritative Mutation**: No network updates during motion. Exactly one authoritative save is dispatched on `pointerup` via `onMoveEvent` -> `CalendarView` -> `useUpdateEvent`.
- **Optimistic State, Rollback & Undo**:
  - `timingOverrides` holds optimistic start/end times preventing server flashback.
  - Successful move shows `Event moved · Undo` toast; clicking Undo restores original timing through `useUpdateEvent`.
  - Failed move rolls back optimistic override and displays error toast without offering Undo.
  - No-op drag (releasing in original slot) and cancellation (pointercancel or Escape) dispatch zero network mutations and restore original visual position.
- **Unsupported Event Protection**: Read-only calendars, recurring series occurrences, all-day events, and multi-day/clipped segments are strictly ineligible for movement via shared `isEventMovable` check.

---

## Next Phase: Phase 2.1 — Move/Resize Regression Hardening & Gesture Collision Tests [PENDING]

---

## Phase 3.0 — Magnetic Snapping [COMPLETE]

Implemented subtle magnetic snapping supplementing the foundational 15-minute grid during move and resize gestures on the active day.

### Capabilities:

- **Magnetic Targets**:
  - Start and end of other visible timed events on the active day (excluding the event being manipulated).
  - Start and end of user-configured working hours for the active day's weekday.
  - Strict scope: ignores other days, all-day events, recurring mutation series logic, and hidden/off-window events.
- **Threshold & Catch Behavior**:
  - Restrained threshold of 7 minutes (~6.3–7.5px across Week/Day views).
  - Approaching a target within threshold subtly engages magnetic lock; continuing past threshold releases cleanly back to the 15-minute grid.
  - Nearest deterministic target selection with tie-breaking preferring on-grid targets, event boundaries over working hours, and start over end.
- **Move Semantics**:
  - Whole-event movement preserves duration invariant across both start and end snap locks.
  - Respects same-day bounds [0, 1440m].
- **Resize Semantics**:
  - Top resize: start edge magnetizes, end edge remains strictly fixed.
  - Bottom resize: end edge magnetizes, start edge remains strictly fixed.
  - Minimum duration (15m) strictly authoritative; candidate snaps resulting in < 15m are rejected.
- **Visual Feedback**:
  - Restrained 1px accent guide line (`.timelineMagneticGuide`) spanning the active day column at the snapped boundary with a 6px circular edge anchor.
  - Subtle accent border on the event card (`.timelineEventMagnetized`).
  - Clears immediately upon releasing the gesture or dragging past the threshold.
- **Pure Interaction Math**:
  - Implemented in `event-magnetic-snap.ts` with zero side effects on provider writes, database persistence, or recurrence logic.
  - Fully hardened for Chromium blur safety (no permanent `will-change`, no filters, no retained transforms).

---

## Phase 3.1 — Live Conflict Feedback [COMPLETE]

Implemented live, advisory visual conflict feedback during whole-event moving and resizing in Day and Week views.

### Capabilities:

- **Strict Overlap Math**:
  - Confined strictly to the active day column.
  - An overlap occurs if and only if `proposedStart < otherEnd && proposedEnd > otherStart`.
  - Exact touching boundaries (`proposedStart === otherEnd` or `proposedEnd === otherStart`) are strictly excluded and never flag a conflict.
  - Active event being moved or resized is completely excluded from candidate comparisons.
  - All-day events and events on other days are excluded.
- **Evaluation Pipeline Order**:
  - Pointer position $\to$ drag / resize snapping (with magnetic snapping taking precedence where active) $\to$ resulting interval $\to$ pure conflict overlap check $\to$ live UI state.
- **Advisory-Only Interaction Contract**:
  - Releasing a drag or resize in a conflicting slot proceeds with saving normally via `onMoveEvent` / `onResizeEvent` (or optimistic rollback / error handling on mutation failure).
  - No blocking modal, confirmation dialog, or prevented drops.
- **Visual Presentation**:
  - Event card receives `.timelineEventConflicted` warning border and subtle background tint (`--color-warning`, `--color-warning-subtle`).
  - When simultaneously magnetized and conflicted, `.timelineEventConflicted.timelineEventMagnetized` gracefully balances both indicators without clipping or illegible contrast.
  - Timing feedback bar displays a crisp `· Conflict` pill badge (`.timelineConflictBadge`).
  - Clears immediately upon moving away from the conflicting range, releasing the gesture, cancelling, or pressing Escape.
- **Chromium Blur Hardening Compliance**:
  - Zero permanent `will-change`, no filters (`filter: brightness(...)`), left-anchored origins, and clean terminal state.
- **Zero Network Allocation**:
  - All conflict calculations occur synchronously and deterministically in pure memory ($O(N)$ active-day candidates pre-filtered at `pointerdown`). Zero network calls during gesture movement.

---

## Next Phase: Phase 3.2 — Origin Ghost Indicator [PENDING]

Execute these as discrete, focused sub-phases after core drag-to-move and snapping are solid:

- **Phase 3.2 — Origin Ghost Indicator [OPTIONAL / PENDING]**:
  Faint ghost outline at the event's original position during drag if user testing indicates it aids spatial orientation.

---

## Phase 3.3 — Release Settle Animation [COMPLETE]

Implemented a short, restrained visual settle animation when a timed event is released following a successful local move or resize gesture in Day and Week views.

### Capabilities:

- **When Settle Plays**:
  - Plays strictly after a successful local whole-event move or edge resize that resulted in actual timing modification (`hasTimingChanged(...) === true`).
  - Does NOT play for ordinary clicks, cancelled gestures (`pointercancel`, Escape), no-op gestures (releasing in original slot), or unsupported/read-only events.
- **Visual Feel & Dynamics**:
  - Duration: 160ms with cubic-bezier(0.16, 1, 0.3, 1).
  - Keyframe progression:
    - `0%`: `scale(0.985)` with `box-shadow: var(--shadow-sm)` (subtle compression communicating arrival).
    - `50%`: `scale(1.008)` with `box-shadow: var(--shadow-md)` (restrained elastic rebound).
    - `100%`: `transform: none` and `box-shadow: none` (landed firmly in place).
  - Strictly in-place: event geometry (top, height, left, width) is already in its exact target slot immediately; the animation never translates the event away from its slot.
- **Zero Interference with Drag**:
  - While pointer is actively dragging or resizing, settle state is inactive and cleared (`clearSettle()`). Zero transition on top or height fighting cursor coordinates.
- **Conflict & Magnetic Cleanliness**:
  - Magnetic guide lines, magnetic borders, and live conflict indicators clear immediately upon gesture release. The settle animation plays strictly on clean card styling.
- **Optimistic Integration & Lifetime Cleanup**:
  - Works seamlessly with optimistic `timingOverrides` so there is no layout jump or position flash.
  - Bounded transient state (`settledOccurrenceKey`) managed by a single timeout ref (`SETTLE_ANIMATION_MS = 180ms`).
  - Safely clears on component unmount, gesture initiation, or subsequent event manipulation.
- **Compositor & Text-Blur Hardening Compliance**:
  - Local to the individual `.timelineEvent` card element.
  - Zero permanent `will-change`.
  - Terminal keyframe settles strictly to `transform: none` with no retained `forwards` or `both` compositing layers.
  - Fully respects `@media (prefers-reduced-motion: reduce)` with `animation: none !important` and `transform: none !important`.

---

## Phase 3.4 — Timeline Edge Auto-Scroll [COMPLETE]

Implemented smooth timeline container edge auto-scrolling during whole-event move and edge-resize gestures in Day and Week views.

### Capabilities:

- **When Auto-Scroll Is Active**:
  - Runs strictly during an active gesture:
    - Move: only when `status === 'dragging'` (drag threshold of 6px exceeded; never runs during pending click).
    - Resize: active during resize manipulation.
  - Zero auto-scroll during normal clicks, column drag-to-create, empty slot clicks, or ordinary non-gesture mouse movements.
- **Edge Detection & Velocity Curve**:
  - Edge zones: top 44px and bottom 44px of the `.timelineViewport` container.
  - Directional quadratic velocity response:
    - Top edge zone: upward scroll (`velocity < 0`).
    - Bottom edge zone: downward scroll (`velocity > 0`).
    - Center zone (deadband): velocity is exactly 0.
    - Smooth non-linear acceleration: `minSpeed` (2px/frame) up to `maxSpeed` (16px/frame) as pointer approaches or exceeds the viewport edge.
- **Dynamic Wall-Clock & Snapping Coordination**:
  - As the viewport auto-scrolls underneath a stationary pointer, the event's proposed position dynamically and continuously updates to reflect newly exposed wall-clock time.
  - Re-evaluates the complete coordinate pipeline on each RAF frame:
    `pointer coordinates + scroll offset -> 15m grid -> magnetic snapping -> interval -> conflict detection -> visual preview`.
  - Same-day bounds [0, 1440m] are strictly respected.
  - Live conflict feedback and magnetic snap guides update dynamically as the viewport auto-scrolls.
- **Clean Lifecycle & Boundary Protection**:
  - Auto-scroll stops immediately and cancels RAF loop when:
    - Pointer moves into center deadband.
    - Scroll reaches physical container boundaries (`scrollTop === 0` or `scrollTop === maxScrollTop`).
    - Pointer is released (`pointerup`).
    - Gesture is cancelled (`pointercancel`, `Escape`).
    - Component unmounts.
  - Release settle animation (Phase 3.3) plays cleanly upon release if event timing changed.
- **Compositor & Blur Safety Compliance**:
  - Zero permanent `will-change`, no filters, no retained GPU layers. Pure DOM `scrollTop` manipulation without layout thrashing.

---

## Phase 2.2 — Cross-Day Week Dragging [COMPLETE]

Implemented cross-day horizontal and diagonal whole-event dragging in Week view, extending Phase 2 move semantics.

### Capabilities:

- **Horizontal & Diagonal Movement in Week View**:
  - Pure horizontal drag moves the event to another day column while preserving its exact local wall-clock start time and duration (e.g. Mon 10:00–11:00 $\to$ Tue 10:00–11:00).
  - Diagonal drag changes both the date and start time (e.g. Mon 10:00–11:00 $\to$ Wed 14:00–15:00).
  - Duration invariant is strictly preserved across all cross-day moves and odd durations.
- **Target Day Column Detection**:
  - Uses real DOM geometry via `container.querySelectorAll('[data-date-key]')` bounding rects (`clientX >= rect.left && clientX < rect.right`), smoothly mapping pointer X to the active day column.
  - Graceful boundary clamping prevents dragging outside visible week boundaries.
- **Dynamic Context Switching**:
  - Crossing into a new day column instantly switches magnetic targets (`collectMagneticTargets`) and conflict candidates (`collectConflictCandidates`) to the target day.
  - Magnetic guide line and conflict styling render cleanly on the target day column.
  - Dragging back to the origin day cleanly restores the original day's magnetic targets and conflict context.
- **Preview & Optimistic Rendering**:
  - Rendered dynamically in the target day column with live overlap layout (`layoutOverlappingEvents`) without leaving a ghost or duplicate copy on the origin day.
  - Optimistic updates via `timingOverrides` in `CalendarView` position the event on the new day without clamping to `24:00` on the original day.
- **Window Pointer Event Tracking**:
  - Window-level pointer listeners (`pointermove`, `pointerup`, `pointercancel`) prevent pointer-capture loss during DOM reparenting across day columns.
- **Day View Isolation**:
  - Day view (`dateKeys.length === 1`) remains strictly vertical-only movement within the same day.
- **Single Authoritative Save & Undo**:
  - Authoritative save dispatched via `useUpdateEvent` on release.
  - Reversible optimistic UI with full Undo affordance restoring both original date and time.
- **Ineligible Event Protection**:
  - Read-only calendars, recurring event occurrences, all-day events, and clipped events remain non-movable.

---

## Phase 3.5 — Smooth Motion & Undo Polish [COMPLETE]

Implemented fluid micro-motion polish for direct manipulation, cross-day snap transitions, animated notifications, and FLIP-based Undo return animations.

### Capabilities:

- **Intra-Day Move & Resize Smoothness**:
  - Separated `.timelineEventMoving` from `.timelineEventResizing` CSS classes.
  - Both moving and resizing apply snappy `110ms cubic-bezier(0.16, 1, 0.3, 1)` transitions (`top 110ms`, `height 110ms` for resizing; `top 110ms`, `left 120ms`, `width 120ms` for moving), giving 15-minute grid clicks and magnetic snaps the same smooth, cushioned glide feel when dragging either the event body or the top/bottom resize handles.
- **Cross-Day Snap Transitions in Week View**:
  - Detects day column transitions in real time during horizontal drag gestures (`snapDirection`: `'left' | 'right'`).
  - Applies directional CSS keyframes (`@keyframes event-snap-from-left` and `@keyframes event-snap-from-right` over 140ms `cubic-bezier(0.16, 1, 0.3, 1)`) settling cleanly to `transform: none` as the event reparents into the new day column.
- **Animated Toast Notifications**:
  - Replaced abrupt toast mount/unmount with a 220ms springy slide-fade entrance (`@keyframes toast-enter`) and an animated 180ms slide-fade exit (`@keyframes toast-exit`).
  - Tactile button press feedback (`transform: scale(0.94)`) on toast action buttons.
  - Active spinner (`.toastSpinner`) and smooth text pop animation during "Restoring event…" in-flight state.
- **Clean Instant Undo Restoration**:
  - When clicking "Undo", the event immediately snaps back to its prior timing/date without awkward intermediate deform or spring transitions, instantly restoring state and presenting the "Restoring event…" spinner.
- **Compositor & Accessibility Compliance**:
  - Full `@media (prefers-reduced-motion: reduce)` coverage instantly disabling transitions and animations.
  - All animated elements settle to `transform: none` with zero persistent `will-change: transform`.

---

## Future Polish Phases

- **Phase 3.2 — Origin Ghost Indicator [OPTIONAL / PENDING]**:
  Faint ghost outline at the event's original position during drag if user testing indicates it aids spatial orientation.
- **Phase 4 — Keyboard Manipulation**:
  15-minute keyboard nudging for selected events (e.g. `Alt + Up/Down` to move, `Alt + Shift + Up/Down` to resize) with ARIA live announcements.
- **Phase 5 — Spatial View Transitions**:
  - **Current Foundation**: Polished, transient scale/fade view transitions already exist between Month, Week, and Day views (`CalendarView.module.css`).
  - **Future Phase 5 Scope**: A richer spatial-continuity pass creating stronger spatial relationships between Month $\leftrightarrow$ Week $\leftrightarrow$ Day. For example, expanding or collapsing around the selected date, focusing the clicked cell/column smoothly, avoiding disruptive layout shifts, and strictly preserving the compositor safety rules established in Phase 1.2.

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
- **Reversible Optimism**: Every direct manipulation must support rollback on server error and provide an Undo affordance upon successful save.
- **Rendering / Compositor Safety**: Large wrappers containing calendar text must not retain transforms, filters, or permanent `will-change: transform` after transitions. Large view transitions must settle to `transform: none`; small local child micro-animations are acceptable when transient and isolated.

---

## Execution Checklist

- [x] Baseline empty-slot click/drag quick-create
- [x] Phase 1 — timed-event top/bottom resizing (`c547c58`)
- [x] Phase 1.1 — small-event `< 45m` layout & text animation polish (`31c0738`, `410881c`)
- [x] Phase 1.2 — Chromium rendering & animation hardening (`989cd1d`, `31c0738`, `410881c`)
- [x] Phase 2 — whole-event drag-to-move
- [ ] Phase 2.1 — move/resize regression hardening & gesture collision tests
- [x] Phase 2.2 — cross-day whole-event dragging in Week view
- [x] Phase 3.0 — magnetic snapping (`24d8a33`)
- [x] Phase 3.1 — live conflict warning feedback (`6841359`)
- [ ] Phase 3.2 — origin ghost outline [OPTIONAL / PENDING]
- [x] Phase 3.3 — release settle animation (`8abbd0b`)
- [x] Phase 3.4 — timeline edge auto-scroll
- [x] Phase 3.5 — smooth motion & undo polish
- [ ] Phase 4 — keyboard nudging shortcuts
- [ ] Phase 5 — Month / Week / Day spatial continuity transitions
- [ ] Deferred — safe recurring occurrence mutation
- [ ] Deferred — multi-day / clipped event direct manipulation

---

## Delete This File When

Delete `docs/calendar-interaction-polish-temp.md` when:

1. The planned calendar interaction phases decided for release are complete.
2. Important durable behavior and architecture rules have been folded into permanent documentation (e.g. `docs/calendar-views.md`).
3. No remaining implementation sessions depend on this temporary roadmap.
