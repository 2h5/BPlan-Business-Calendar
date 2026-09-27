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

## Remaining DOM-test targets (Phase 3)

- `QuickCreatePopover` and `FindTimeBox`: focus entry and return, outside dismissal, Escape layering with a nested Select, and picker interaction.
- `TodayView` quick add and task rows (a separate `TodayTaskRow` implementation).
- `CalendarView` interactions that jsdom can model (toolbar, view switching, and event selection). Gesture, layout and animation behavior (timeline drag and resize, scroll) needs a real browser.
- Real-browser (Playwright) candidates: Quick Add focus after submit, CSS exit animations and row collapse, TaskInspector close timing and descendant `animationend`, and `preventScroll`.
