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
- No failing or reproduction test was needed, and no production code was modified.

## Remaining DOM-test targets (later phases)

In rough priority order: `Select` keyboard and popup behavior (used by the inspector); `QuickCreatePopover` and `FindTimeBox` focus and outside-dismiss; `TaskListPane` / `TaskQuickAdd` / `TaskListSection` remount semantics; `TodayView`; `CalendarView` interactions. Playwright is out of scope until a real-browser phase.
