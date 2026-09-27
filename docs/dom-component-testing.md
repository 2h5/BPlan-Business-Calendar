# DOM component testing

## Baseline (Phase 1 start)

- Base: `main` at `54ae7c46bc5b9b9cef642aa0d6a54c282943cae4`.
- Test environment: `apps/web` runs `vitest run` (Vitest 2.1.9) with no `test` block in `vite.config.ts`, so every file runs in Vitest's default **Node** environment. There is no setup file and Vitest globals are off. The baseline was 91 files and 741 tests.
- Testing dependencies: only `vitest`. `apps/web` had no DOM implementation (`jsdom`/`happy-dom`) and no Testing Library packages. `playwright-core` is a root dev dependency used by release tooling, not by web tests.
- Existing TaskInspector coverage:
  - `taskInspectorForm.test.ts` covers the pure form hydration and payload serialization.
  - `TaskInspectorFields.test.tsx` calls the component as a function to inspect React element props, and uses `renderToStaticMarkup` for HTML. It invokes callback props directly.
  - `TaskInspector.tsx` itself has no committed test. Its lifecycle was proven equivalent during the refactor by a temporary review harness that replaced React's hooks with a deterministic fake runtime and a stub `document` (see `docs/task-inspector-refactor.md`).
- Behavior that rested only on source/static parity until now:
  - the 230 ms draft-title focus, its `preventScroll` option, and cancellation of the timer;
  - real ref attachment, and focus and caret preservation while typing and re-rendering;
  - delete confirmation outside-pointer handling against real `contains`, and capture-phase Escape handling with `stopPropagation` against other real document and target listeners;
  - the confirmation closing when the selected task changes;
  - `animationend` delivery through React's event system to `onCloseAnimationEnd`.
- Why DOM coverage is being added: the refactor reviews repeatedly listed these as residual limitations. Server rendering does not run effects, and a fake hook runtime cannot prove React commit timing or native event propagation. Further lifecycle extraction (for example the TaskInspector form-state seam) was explicitly deferred until real DOM tests exist.

## Dependencies and configuration added

`apps/web` dev dependencies (the lockfile was updated with `pnpm add`):

| Package                       | Range     | Resolved |
| ----------------------------- | --------- | -------- |
| `jsdom`                       | `^26.1.0` | 26.1.0   |
| `@testing-library/react`      | `^16.3.0` | 16.3.3   |
| `@testing-library/dom`        | `^10.4.0` | 10.4.2   |
| `@testing-library/user-event` | `^14.6.1` | 14.6.7   |
| `@testing-library/jest-dom`   | `^6.6.3`  | 6.9.1    |

- `@testing-library/dom` is listed explicitly because it is a required peer of `@testing-library/react` 16 and `user-event` 14.
- `jsdom` 26 is used rather than 27 because it is well established with Vitest 2 and supports Node 22. RTL 16.3 supports React 19.1.
- `vite.config.ts` is **unchanged**. There is no global environment switch and no global setup file.
- New shared helper: `apps/web/src/test/dom.ts`. It registers the `jest-dom` matchers for Vitest (including their types) and adds an `afterEach` hook that runs RTL `cleanup()`, restores real timers, and restores spies. RTL cannot auto-register its cleanup because Vitest globals are off.

## Environment strategy

- A DOM test opts in per file with a `// @vitest-environment jsdom` docblock on the first line and a side-effect import of `src/test/dom`. It is named `*.dom.test.tsx` so it is easy to spot.
- Every other web test stays in the Node environment and pays no jsdom start-up cost. The baseline tests keep their exact runtime semantics. For example, some existing tests depend on `document`/`window` being absent or stubbed.
- Why not a global switch or `environmentMatchGlobs`: switching all 91 files to jsdom changes globals under tests that were written for Node. A glob mapping moves the opt-in away from the test file into config. The docblock keeps each file's environment explicit, and the helper is the only shared code.
- No custom harness: the tests use `render`, `screen`, `user-event`, `fireEvent`, and Vitest fake timers directly.

## DOM tests added

`apps/web/src/features/tasks/components/TaskInspector.dom.test.tsx`, 19 tests:

- **Draft title focus (5).** Focus does not happen at 229 ms and does at 230 ms, on the title input, with `{ preventScroll: true }` observed through a spy on `HTMLElement.prototype.focus`. A draft re-render does not restart the delay. Replacing the draft with a selected task before 230 ms cancels the stale focus. Unmount clears the timer (`vi.getTimerCount()`). A selected existing task never schedules focus.
- **Delete confirmation (9).** Delete Task opens the dialog and sets `aria-expanded`, and Cancel closes it without deleting. Pointer presses inside the dialog keep it open, and a press outside (on the title input) closes it. Pressing Delete Task again toggles it closed. Escape closes it. Escape stops in the document capture phase: a window capture listener still sees it, but listeners on the focused target and document bubble listeners do not, and `defaultPrevented` stays `false`. After closing, the listener is removed and Escape propagates normally. Other keys keep the dialog open and propagate. Changing the selected task closes it, while a same-id refetch leaves it open. Delete calls `onDelete` once with the currently selected task and closes the dialog.
- **Title field stability (2).** Typing keeps the same `<input>` node with real DOM focus and the caret at the end, and this holds across parent re-renders (`isSaving` and `tags` changes). Editing the description and duration presets and then returning to the title keeps the same node.
- **Closing animation (3).** A DOM-dispatched `animationend` on the `<aside>` calls `onCloseAnimationEnd` while closing, in both the task and the empty-state branches. It does not call it when the inspector is not closing, and does call it once the same node switches to closing.

### Mutation check

Twelve planted mutations were each applied on their own, confirmed to fail at least one DOM test, and then reverted. They were: a 200 ms delay; removing `clearTimeout`; a non-capture Escape listener; removing `stopPropagation`; dropping `preventScroll`; always and never wiring `onAnimationEnd`; keying the confirmation reset on the task object instead of its ID; removing the reset; removing the `contains` check; passing the wrong task to `onDelete`; and keying the inner container on the title.

## What is now covered

The TaskInspector items in the baseline list above are now proven against real React commits and jsdom event dispatch. The existing `renderToStaticMarkup` and unit tests are unchanged and still own broad deterministic parity: markup, classes, option ordering, and serialization.

## Limitations and observations

- jsdom does not do layout, CSS animation, or scrolling. `preventScroll` is verified as the argument passed to `focus`, not as an observed scroll position. `animationend` is dispatched synthetically, so the tests prove the handler wiring and not CSS timing. Visual and animation checks still need a real browser (a later Playwright phase).
- **Observation (pre-existing, not changed):** `animationend` bubbles, so while `isClosing` is true, an animation ending on any descendant also calls `onCloseAnimationEnd`. Examples are the 360 ms task-switch rise or the confirmation pop. This could end the close early if the user closes the inspector within about 180 ms of switching tasks. This was noted from the source and is not pinned by a test.
- **Observation (pre-existing, not changed):** the form-sync effect depends on the `task` object, so a refetch that delivers a new object for the same task resets the form fields to server values and discards unsaved edits. Focus and the input node are kept (the switch key only changes on an ID change). This may be intended and is recorded for the planned form-state extraction.
- Phase 1 needed no failing or reproduction test and modified no production code.

## Phase 2: Select and the task-list surface

- Base: `test/dom-component-infrastructure` at `65c37e448dd792b290fdaf855f87b489bc808806`. No new dependencies or config. Each new file uses the per-file jsdom docblock and `src/test/dom`.

### DOM tests added

**`apps/web/src/components/forms/Select.dom.test.tsx` (19 tests).** The option fixture has disabled options at both ends and in the middle, so wrapping and Home/End must skip them.

- **Pointer:**
  - A closed combobox has `aria-haspopup`, `aria-expanded`, `aria-controls` and no active descendant.
  - Opening shows the listbox with the matching ID. The selected option is highlighted through `aria-activedescendant`, `aria-selected` is set, and disabled options carry `aria-disabled` and `disabled`.
  - Clicking the trigger again closes the menu without a change.
  - Clicking an option calls `onChange`, closes, and returns focus to the trigger. Disabled options ignore clicks.
  - Hover moves the highlight.
  - Presses inside the listbox keep it open, and outside presses close it.
  - Opening a second Select closes the first, and the two get distinct `useId` listbox IDs.
- **Keyboard:**
  - ArrowDown and ArrowUp open without moving off the selection, and after that move over enabled options only, wrapping both ways.
  - Home and End reach the first and last enabled options, and only while open.
  - Enter and Space open, then choose. Focus stays on the trigger.
  - Enter on a disabled selected option does nothing.
  - Escape closes without choosing, and calls `preventDefault` only while open.
  - Tab closes the menu and moves focus to the next control, never into the option buttons.
- **State:**
  - A disabled Select can't be opened or focused.
  - An unknown value is shown as-is and highlights the first enabled option.
  - The highlight follows a value change made while open, and an options replacement moves it to the first enabled option.

**`apps/web/src/features/tasks/components/TaskRow.dom.test.tsx` (13 tests).**

- Clicking the content selects the row without starting an action.
- Complete and reopen show immediately, but the callback fires exactly at 260 ms (not at 259).
- Snooze and Delete from the menu close the menu and report at 260 ms.
- Further clicks are ignored while a row is exiting.
- Unmounting before 260 ms clears the timer and drops the action.
- **Actions menu:** the button toggles it without selecting the row. Presses inside the menu keep it open, and outside presses (including on the row content) close it. Escape closes it, and opening another row's menu closes the first.
- A regression test for the bug below, plus a guard test: a task update _before_ the delay ends does not cancel or re-enable the exit.

**`apps/web/src/features/tasks/components/TaskListPane.dom.test.tsx` (14 tests).**

- **Quick Add:** state lives in the pane, and `TaskQuickAdd` is exercised through it.
  - Enter submits the trimmed title.
  - While pending, the input is disabled and the button reads `Adding…`.
  - On success the input clears and re-enables.
  - The Add button also submits. Blank titles don't submit.
  - On failure the title is kept and an alert is shown, with `aria-invalid` and `aria-describedby` set. The next submit clears the error. A non-`Error` rejection uses the fallback message.
- **Empty-space clicks:**
  - The page heading, section headers and the caught-up footer report `onEmptySpaceClick`.
  - Row content, row actions and menu items, tabs, the quick-add input, the list Select trigger, listbox and option, and New task do not.
  - The checkbox and actions don't select the row.
  - Retry is treated as a control, and a missing handler is tolerated.
- **Tabs and identity:**
  - Tab clicks report `onTabChange` and update `aria-pressed`.
  - Pinned invariant: `TaskListSection` keys its returned `<section>` by `title`. Switching Inbox ↔ All keeps the `Due Today` section and row DOM nodes, but replaces the final `Completed Today` ↔ `Completed` section and its rows. Row state follows: an open actions menu survives on the Due Today row and resets on the completed row. The tab switch in that test goes through the prop, because a tab click is itself an outside press that closes row menus.
  - Done shows only completed tasks, or its empty state.

### Mutation check

- Each mutation was applied on its own, confirmed to fail at least one DOM test, and then restored. There were 22 in total.
- **Select (10):**
  - no wrapping;
  - not skipping disabled options;
  - no close on Tab;
  - no refocus of the trigger after choosing;
  - no `contains` check;
  - a stale highlight after option or value changes;
  - allowing a disabled option to be chosen;
  - a shared listbox ID;
  - dropping `preventDefault` on Escape;
  - calling `preventDefault` on Escape while closed.
- **TaskRow (6):** a 200 ms delay; no exiting guard; no Escape handling; no timer cleanup; resetting the exit on any task change; never resetting it.
- **TaskListPane (5):** dropping the listbox filter; dropping the row and button filters; not clearing the title on success; not resetting the error; not trimming.
- **TaskListSection (1):** removing `key={title}` fails the two identity tests. The existing static `TaskListSection.test.tsx` still passes, confirming it could not see this.

### Production change: TaskRow could stay invisible after Snooze

- **Bug.** `TaskRow` enters an exit state (`completing`, `uncompleting`, `snoozing` or `deleting`) and calls its callback after 260 ms. It never leaves that state. The exit CSS ends at `opacity: 0`, `max-height: 0` and `pointer-events: none` with `forwards` fill, and the handlers ignore every click while exiting.
  - Toggle and delete are fine, because their optimistic cache updates move the task to another section or remove it. Rollbacks re-add it, and both paths mount a fresh row.
  - Snooze has no optimistic update. `TasksView.handleSnooze` moves the due date one day from the task's **existing** due date, not from today. A task overdue by two or more days therefore stays in Overdue, and a task already Upcoming stays in Upcoming.
  - In those cases, after the refetch the same row stays mounted, but invisible and inert until something remounts it (for example switching to Done and back).
- **Fix.** This is the smallest change in `TaskRow.tsx`. A ref records that the exit callback has fired. An effect on `task` then clears the exit state the next time the task object changes while the row is still mounted. Updates that arrive _before_ the callback fires are ignored, so a background refetch can't cancel or duplicate an action.
- **Regression tests:** the two tests under "TaskRow after an exit action". The first failed before the fix on exactly the expected assertion.
- **Remaining limitation:** a _failed_ snooze leaves the task data unchanged. TanStack Query's structural sharing then keeps the same task object, so the row still stays hidden until remounted. Surfacing snooze failures (which currently have no UI) is a product decision and was left alone.

### Notable behaviors recorded (not changed)

- **Snooze semantics:** "Snooze until tomorrow" on an overdue task sets it to the day after its old due date, which can still be in the past. This is product logic in `TasksView`, reported for a decision.
- **Select Escape is not stopped.** Select calls `preventDefault` on Escape but not `stopPropagation`, so a surrounding document Escape handler (for example a popover or dialog) also receives it. This is harmless in the task surfaces. It is a Phase 3 check for Select inside `QuickCreatePopover` and `FindTimeBox`.
- **TaskRow drops pending actions on unmount.** Completing a row and switching to Done within 260 ms unmounts it, and the action is silently dropped. This is pinned as current behavior.
- **Row actions menu keyboard support.** `role="menu"` has no arrow-key navigation, and Escape closes it without restoring focus. A menu item that had keyboard focus unmounts and focus falls back to `<body>`.
- **Quick Add focus after submit.** The input is disabled while pending. Real browsers drop focus from a disabled element, so the user may have to click back in to add another task. jsdom does not model this focus fixup, so a real-browser test is needed.
- **Phase 1 observations re-checked (unchanged):**
  - The same-ID refetch reset only happens when the server returns _changed_ data. Structural sharing keeps the object identity for unchanged refetches.
  - The descendant `animationend` risk is unchanged.
  - Neither warranted an immediate change.

### Harness note

Testing Library's async wrapper waits on a real 0 ms `setTimeout` and only auto-advances Jest's fake timers. With Vitest fake timers, every `user-event` call therefore hangs. Timed tests use fake timers with synchronous `fireEvent`, and untimed interaction tests use `user-event` with real timers. The shared helper already restores real timers after each test.

## Phase 3: QuickCreate, Find Time, Today and the calendar toolbar

- Base: `test/dom-component-infrastructure` at `b2fb40f21957aebae60fe6d392f23cbf6d79ed9f`. No new dependencies or config. Each new file uses the per-file jsdom docblock and `src/test/dom`.

### Where DOM coverage was added, and where it was not

| Area                                | Before                                                                                                                         | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QuickCreatePopover`                | Static markup, plus a fake-hook runtime for `useQuickCreateLifecycle` and `useQuickCreateDraft`.                               | **Covered (26 tests).** This is the highest-risk surface: a window capture listener, a focus trap, a delete confirmation layered on Escape, nested Selects and portaled pickers, and the draft-sync effect. Two bugs were found.                                                                                                                                                                                                                   |
| `FindTimeBox`                       | Static markup of each restored phase only.                                                                                     | **Covered (9 tests).** Every phase change is timer-driven (280 ms proposal exit, 5 s confirmation, 30 s banner, 350 ms banner exit, 50 ms refocus) and persisted to `sessionStorage`. One bug was found.                                                                                                                                                                                                                                           |
| `TodayView` quick add and task rows | `TodayQuickAdd`, `TodayTaskRow` and `TodayTaskGroups` were tested as static markup and element props. `TodayView` had no test. | **Covered through `TodayView` (11 tests).** The quick-add state machine (rAF focus, `transitionend` filtering, submit, cancel) lives in `TodayView`. `TodayTaskRow` is stateless and acts immediately, so it gets wiring tests through the view instead of its own DOM file.                                                                                                                                                                       |
| `CalendarToolbar`                   | No test.                                                                                                                       | **Covered (9 tests).** It has its own dropdown lifecycle: a 150 ms close fallback, `animationend`, outside press and Escape.                                                                                                                                                                                                                                                                                                                       |
| `CalendarView` itself               | Hook- and utility-level tests for move, resize, slot selection, gesture recovery, transitions and hotkeys (48 calendar files). | **Not given a DOM test.** It is a 650-line orchestrator over about ten data hooks. A full jsdom render would mostly test the mocks. Its risky interactions are pointer gestures, geometry and scrolling, which jsdom cannot model, and its keyboard and transition logic already has deterministic tests. The toolbar was the part jsdom could exercise reliably. Wiring from an event click to QuickCreate is left for a real-browser smoke test. |

### DOM tests added

**`apps/web/src/features/calendar/components/QuickCreatePopover.dom.test.tsx` (26 tests).** Task lists come from a stable mocked `useTaskLists`, as TanStack Query would provide. Untimed tests first wait for the real 50 ms autofocus so it cannot steal focus from a control opened afterwards.

- **Autofocus:** the title is focused at 50 ms (not 49) with `{ preventScroll: true }`. Closing or unmounting first clears the timer, and reopening schedules a new one.
- **Closing:**
  - Close and the backdrop start the animated close: the closing class is set and `onClosing` is called, but `onClose` is not called until the dialog's own `animationend`.
  - A descendant `animationend` that bubbles up is ignored. Unlike TaskInspector, QuickCreate checks the event target.
  - A second close request while closing is ignored.
  - Escape starts the same close, and its capture-phase `stopPropagation` keeps it from other window listeners.
  - While saving, the backdrop, Close and Escape all do nothing, and the controls are disabled.
  - Cancel (task mode) and More options close **immediately**, without the exit animation or `onClosing`. More options passes the draft.
- **Focus trap and modes:**
  - Tab from Save wraps to the Event tab, and Shift+Tab wraps back.
  - The disabled time controls of an all-day event are skipped.
  - Switching Event → Task keeps focus on the tab, keeps the typed title (the same input node), changes the placeholder and clears the error.
- **Submission:**
  - An empty title shows the alert and refocuses the title.
  - Enter creates the event (trimmed title, default calendar, zoned times) and then closes.
  - A failure keeps the draft open with the error.
  - Task mode creates the task in the first list with the due time.
- **Delete confirmation:**
  - The delete button toggles the confirmation and `aria-expanded`, and Cancel closes it.
  - The first Escape closes only the confirmation; the second closes the popover.
  - Confirm deletes, then closes.
  - A failed delete shows the error and stays open.
  - Opening a different event closes the confirmation and loads the new event.
  - A read-only calendar offers no delete.
- **Nested controls (regression tests for the fixes below):**
  - Escape with the calendar Select open closes only the Select, and focus stays on its trigger.
  - Escape inside the portaled date picker or time menu closes only that picker and returns focus to its trigger.
  - Choosing another calendar or task list keeps the draft and saves to the new choice.
  - When editing an event, a new calendar and the edits both stick.

**`apps/web/src/features/scheduling/components/FindTimeBox.dom.test.tsx` (9 tests).** `useFindTime` and `useConfirmSlot` are replaced by small stateful fakes with the same shape. A test settles a request the way the query would. The real `sessionStorage` notice storage is used.

- The request submits as typed. A blank request cannot submit, and the pending state disables the button. A search error clears as soon as the request is edited.
- Escape clears the request. The results then play their 280 ms exit (not reset at 279 ms, reset at 280 ms). Clearing the field starts the same exit, and typing again cancels it.
- Booking a slot calls `confirm` and `onScheduled`, and clears the request and draft.
- **Notice lifecycle:**
  - The confirmation card shows for exactly 5 s.
  - It then becomes the compact banner (stored as `banner`) for exactly 30 s.
  - The banner then exits over exactly 350 ms, and storage is cleared.
- "Schedule another" docks the banner at once and focuses the request at 50 ms.
- Dismiss and a new search both clear the stored notice and remove the banner after 350 ms.
- Unmounting clears every timer. A remount (route navigation) resumes the confirmation phase for its remaining time.

**`apps/web/src/features/today/components/TodayView.dom.test.tsx` (11 tests).** The data hooks and router are mocked. Unrelated panels (Find Time, search, day glance, schedule) are stubbed out.

- **Quick add:**
  - It opens from the header or the empty state, and focuses on the next animation frame with `preventScroll`.
  - It becomes fully open only when the accordion's own `grid-template-rows` transition ends while open. A child's transition, another property, or a transition after cancelling does not count. jsdom has no `TransitionEvent`, so the test builds the event with `propertyName` itself.
  - Escape in the title, and Cancel, both close it and clear the title.
  - Escape with the priority Select open closes only the Select.
  - Submit sends the trimmed title, list, priority and an 18:00-today due time. While pending, the input and buttons are disabled.
  - On success it closes and resets title, list and priority.
  - A failure keeps it open with the title and shows no error.
  - A blank title does not submit.
- **Task rows (`TodayTaskRow` through the view):**
  - Complete, open, snooze and delete act immediately, through the task hooks and navigation.
  - An all-day task snoozes to noon on the day after its old due date, which is still overdue. A timed task keeps its time.
  - The completed-today accordion toggles, and a completed task can be reopened.

**`apps/web/src/features/calendar/components/CalendarToolbar.dom.test.tsx` (9 tests).**

- **Calendars menu:**
  - The badge shows the visible count, and the rows expose their visibility through `aria-pressed`, with default and read-only notes and the time zone.
  - The menu closes over exactly 150 ms, or sooner on its own `animationend`; a descendant `animationend` is ignored.
  - Presses inside keep it open. A press outside or Escape closes it.
  - The trigger is ignored while the menu is already closing.
  - Toggling visibility keeps the menu open. Create and Edit close it.
  - With no calendars, an empty state is shown.
- **Navigation and views:** Previous and Next are named for the current view. Today and New event report their clicks. The view buttons mark the current view with `aria-pressed` and report changes. The fetch indicator is shown while fetching.

The existing `useQuickCreateDraft.test.ts` also gained one unit test: the open draft survives a calendar or list change, for both new and edited events.

### Mutation check

- 27 mutations were each applied on their own against the new DOM test file for their surface, then restored from a copy. The uncommitted fixes were never touched by `git checkout`.
- 26 were caught. The first run missed two because the tests were too loose: a 300 ms banner exit and "clear storage on dismiss". Those assertions were tightened (349/350 ms, and checking storage after a manual dismiss), and both mutations are now caught. A snooze-time mutation was hidden by a noon fixture, so the fixture moved to 18:00, which is what Today's quick add creates.
- **Caught:**
  - **QuickCreate (10):** a 40 ms autofocus; no autofocus cleanup; `animationend` from any target; no `stopPropagation`; no Tab wrap; no nested-Escape guard; no delete-confirmation Escape layer; the draft always adopting the default calendar; Enter in the title ignored; no close after delete.
  - **FindTimeBox (5):** a 300 ms results exit; Escape keeping the text; a 300 ms banner exit; a 10 ms refocus; dismiss keeping storage.
  - **TodayView (6):** a transition from any target; priority not reset; due at 17:00; no Escape cancel; focus without `preventScroll`; snooze always keeping the stored hour.
  - **CalendarToolbar (5):** a 200 ms close; `animationend` from any target; inside presses closing; visibility toggles closing; Escape ignored.
- **Survived (1, equivalent):** skipping "show new proposal" while the old results are exiting. A new proposal can only come from a submit, and `handleSubmit` already clears the exiting state first.

### Production fixes

**1. Escape on an open Select or picker closed the whole QuickCreate popover.** (`useQuickCreateLifecycle.ts`)

- **Symptom:** with the calendar or task-list Select, the date picker, or a time menu open, one Escape started closing the popover. The nested menu stayed visibly open during the exit animation.
- **Cause:** the popover's Escape listener is on `window` in the **capture** phase and calls `stopPropagation`. It therefore runs before, and blocks, every nested handler. The pickers' own Escape code (close, then `stopPropagation`, then refocus the trigger) and Select's Escape handling never ran.
- **Intended semantics:** Escape is already layered: the delete confirmation closes first, then the popover. The pickers were clearly written to consume their own Escape. The capture listener defeated that design; the design itself is unchanged.
- **Fix:** the capture listener lets Escape through, without closing or stopping it, when the target is an expanded trigger (`aria-expanded="true"`, which is where a Select keeps focus). It does the same when the target is inside a dialog or listbox outside the popover (the portaled picker menus). The delete-confirmation layer still takes priority.
  - Every other Escape behaves as before, including the capture-phase `stopPropagation`.
  - Select still does not stop propagation. With this fix, its Escape can reach window bubble listeners, but none of them act while the popover is open. The timeline gesture listener only cancels an active drag, and view hotkeys ignore Escape and modal targets.
- **Regression tests:** the three nested Escape tests. All three failed without the fix, and the delete-confirmation Escape test still passes.

**2. Choosing a calendar or task list wiped the QuickCreate draft.** (`useQuickCreateDraft.ts`)

- **Symptom:**
  - In a new event, choosing another calendar cleared the typed title, location and description.
  - In task mode, choosing another list cleared the title.
  - When editing an event, choosing another calendar snapped back to the event's own calendar and discarded the edits, so an event could not be moved to another calendar from QuickCreate.
- **Cause:** the open-sync effect, which resets the draft for a new slot or event, also depended on `calendarId`, `selectedListId`, `defaultCalendar` and `taskLists`. It needed them only to fill an empty selection. Any selection change therefore re-ran the full reset. This predates the draft extraction refactor (`05247c9`). The existing fake-runtime tests only checked across close and reopen, never a change while open.
- **Fix:** split the effect.
  - The sync keeps its open, slot and event dependencies.
  - A second effect only fills an empty calendar (for new events) or list selection.
  - Open, slot and event resets, and filling defaults, behave as before.
  - Changing a selection no longer clears the error banner or delete confirmation as a side effect. Both still reset on open.
- **Regression tests:** the three QuickCreate draft tests, plus the new hook unit test. All failed without the fix.

**3. Clearing or escaping Find Time never dismissed the results.** (`FindTimeBox.tsx`)

- **Symptom:** after Escape, or after clearing the request, the input was empty but the old slot results stayed on screen indefinitely, and `findTime.reset()` never ran. The 280 ms exit was cancelled as soon as it started.
- **Cause:** commit `35a49a8` added `isProposalExiting` to the dependencies of the effect that shows a newly arrived proposal. Starting the exit re-ran that effect, which saw the proposal still present, set `isProposalExiting` back to false and cleared the exit timer.
- **Fix:** split the effect.
  - Showing a new proposal, and cancelling any exit for it, depends only on `findTime.proposal`.
  - A second effect keeps the existing "drop the displayed proposal after a reset" branch with its original dependencies.
  - The real hook reads the proposal through `useSyncExternalStore`, so its identity is stable between renders.
- **Regression tests:** the two exit tests. Both failed without the fix.

All three fixes are small (effect splits and one guard), contain no refactoring, and leave the surrounding tests unchanged and passing. None was checked in a real browser: that needs a signed-in local session, which was not set up here.

### Notable behaviors recorded (not changed)

- **QuickCreate has two close paths.** Close, the backdrop and Escape animate and call `onClosing` (CalendarView uses it to fade the draft block). Save, Delete, Cancel and More options call `onClose` directly, with no exit animation and no `onClosing`. This looks deliberate for completed actions, but Cancel in task mode is a dismissal that skips the animation.
- **QuickCreate autofocus can steal focus.** The 50 ms title autofocus would take focus from a picker opened within 50 ms of the popover opening. This is only reachable with scripted input.
- **Today quick add failure is silent.** On a failed create the accordion stays open with the title, but nothing tells the user it failed. The comment says the mutation handles the error, but `TodayView` renders no mutation error.
- **Today rows act immediately.** Complete, snooze and delete call the mutations at once, with no exit delay or undo, unlike the Tasks page `TaskRow`. Snooze uses the same one-day-after-old-due-date rule, so an overdue task can stay overdue.
- **Toolbar menu:**
  - The trigger is ignored during the 150 ms close; a quick second click does not reopen the menu.
  - Escape closes the menu without returning focus to the trigger. Focus inside the menu falls back to `<body>` when it unmounts.
- **Find Time refocus timer.** The 50 ms refocus timer after "Schedule another" is not cleared on unmount. It is harmless because the ref is null-safe.

### Harness notes

- jsdom has no `TransitionEvent`. `fireEvent.transitionEnd(el, { propertyName })` produces an event without `propertyName`, so `TodayView.dom.test.tsx` builds the event itself.
- Portaled picker menus focus their selected option on the next animation frame. Tests wait for focus to arrive (`waitFor`) instead of assuming it.

## Closing out the DOM-testing phases

### What Phases 1–3 cover

- **8 DOM test files, 120 DOM tests,** all opted in per file and alongside the existing Node and static tests:
  - **Phase 1 (19):** TaskInspector.
  - **Phase 2 (46):** Select, TaskRow, and TaskListPane with TaskQuickAdd and TaskListSection.
  - **Phase 3 (55):** QuickCreatePopover, FindTimeBox, TodayView with TodayTaskRow and TodayQuickAdd, and CalendarToolbar.
- **Proven against real React commits and jsdom events:**
  - delayed focus and its cleanup;
  - capture and bubble Escape layering and `stopPropagation`;
  - outside-press dismissal against real `contains`;
  - focus traps and focus return;
  - `animationend` and `transitionend` target filtering;
  - timer-driven exits and phase changes at exact boundaries;
  - `sessionStorage` phase restore across remounts;
  - keyed remount identity;
  - memoized-row state across data updates;
  - nested Select and picker composition inside popovers.
- **Mutation checks:** 22 in Phase 2 and 27 in Phase 3, plus 12 in Phase 1. Every one was caught except a single equivalent mutation.

### Production bugs found and fixed

1. **Phase 2:** TaskRow stayed invisible and inert after a snooze that left the task in place.
2. **Phase 3:** Escape on a nested Select or picker closed the whole QuickCreate popover.
3. **Phase 3:** choosing a calendar or list wiped the QuickCreate draft, and editing could not change an event's calendar.
4. **Phase 3:** clearing or escaping Find Time never dismissed its results.

### Known unresolved behaviors (tracker)

| Behavior                                                                                                  | Found   | Status                                                                                        |
| --------------------------------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------- |
| TaskInspector: a descendant `animationend` bubbles and can end the close early                            | Phase 1 | Open; needs a real browser to confirm the timing                                              |
| TaskInspector: a refetch returning changed data resets unsaved form edits                                 | Phase 1 | Open; input for the planned form-state extraction                                             |
| TaskRow: a failed snooze (no task update follows) leaves the row in its exit state                        | Phase 2 | Open; needs snooze-failure UI, a product decision                                             |
| Snooze moves one day from the old due date, so an overdue task can stay overdue (Tasks and Today)         | Phase 2 | Open; product decision                                                                        |
| TaskRow: completing, then switching to Done within 260 ms, drops the action                               | Phase 2 | Open; pinned as current behavior                                                              |
| TaskRow actions menu: no arrow keys, and Escape does not restore focus                                    | Phase 2 | Open; accessibility follow-up                                                                 |
| Quick Add inputs (Tasks, Today, QuickCreate title) are disabled while saving, so real browsers drop focus | Phase 2 | Open; needs a real browser                                                                    |
| Select calls `preventDefault` but not `stopPropagation` on Escape                                         | Phase 2 | **Resolved as a QuickCreate bug** (fix 1). Select itself unchanged; no other surface affected |
| QuickCreate: Cancel and More options skip the exit animation and `onClosing`                              | Phase 3 | Open; confirm intent                                                                          |
| Today quick add: a failed create shows no error                                                           | Phase 3 | Open; UX follow-up                                                                            |
| Calendar toolbar: the trigger is ignored during the 150 ms close, and Escape does not return focus        | Phase 3 | Open; minor                                                                                   |

### What jsdom still cannot prove

- Layout, geometry and positioning: popover placement and arrows, picker anchoring, and the timeline grid.
- CSS animation and transition timing: whether `animationend` and `transitionend` actually fire, and when. Tests dispatch these events themselves.
- Real scrolling and `preventScroll`: the tests check the argument passed, not the scroll position.
- The browser's focus fix-up when a focused element becomes disabled or is removed.
- Pointer gestures with capture: timeline drag, resize and slot selection.
- `inert`, and the view-transition and reduced-motion rendering paths.

### Is real-browser (Playwright) work warranted now?

It can wait until after the reorganization, with a small, targeted scope. The jsdom suite now covers the event, focus-order and timer logic that a move of files could break. The remaining gaps are visual and timing checks that do not depend on folder layout.

When it is added, a first Playwright pass should cover:

- Quick Add focus after submit (Tasks and Today);
- TaskInspector close timing with descendant animations;
- one QuickCreate open → pick → save → close smoke test, including the event-click wiring from CalendarView;
- one timeline drag.

### Ready for the structural reorganization?

Yes. The foundation is in place: per-file jsdom opt-in, one shared helper, a documented fake-timer strategy, and stable-identity fakes for server hooks. Each high-risk interactive surface has behavior-level tests that assert on roles, labels and user-visible state rather than file paths or internals. Those tests will catch a reorganization that changes lifecycle, focus or event behavior. When files move:

- keep each `*.dom.test.tsx` next to its component;
- update the relative `vi.mock` paths;
- keep each file's `src/test/dom` import (or move the helper and update the imports together).
