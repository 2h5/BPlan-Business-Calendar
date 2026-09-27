# Task inspector refactor

## Baseline (Phase 1 start)

- Base: `main` at `bb370589dcd79d3d16142f01ec53b3f71c62687b`.
- `apps/web/src/features/tasks/components/TaskInspector.tsx`: 577 physical lines (including blank lines).
- Responsibilities: React form state and task/draft resets; selected-task switching and animation; title focus; delete confirmation and outside/Escape handling; form validation, timezone conversion, and create/update payload construction; tag and due-date handlers; all inspector markup, copy, and accessibility attributes.
- `TasksView` owns task selection and passes the selected timezone and create/update mutation callback. `@cal/schemas` defines task payloads, and `@cal/domain` supplies the timezone conversion helpers.

## Phase 1 extraction

- Added `apps/web/src/features/tasks/utils/taskInspectorForm.ts` for draft defaults, existing-task hydration into local date/time fields, trimmed-title validation, and exact create/update payload serialization.
- The helper delegates wall-clock/UTC conversion to the existing `@cal/domain` functions. It performs no React state updates or side effects.
- `TaskInspector.tsx` remains responsible for state, effects, focus, switching and closing animations, confirmation, handlers, save ordering, and rendering. Its resulting size is **538 physical lines**, a reduction of 39 lines.

## Focused tests

- `taskInspectorForm.test.ts` pins draft defaults and fresh tag arrays; existing-task values and timezone-specific date/time hydration; date-only and cleared due-date behavior; exact create/update payload fields; title and description trimming; local-noon serialization in standard and daylight time; and DST gap/overlap conversion.

## Remaining natural seams after Phase 1

- The separate React state fields and their reset effect could later be grouped behind a form-state hook.
- Focus, switching animation, delete confirmation, and interaction handlers still live with the markup. Any presentation split should follow an interaction/lifecycle pass.

## Preserved behavior quirks

- A date with no time is stored as **local noon** with `hasDueTime: false`; enabling Time without filling its input also stores local noon but sets `hasDueTime: true`.
- The date/time parser retains the existing `2026`, `1`, and `1` defaults for missing date parts, and `12`, `0` for missing time parts. It does not add new validation of malformed strings.
- A cleared due date serializes as `dueAt: null` and `hasDueTime: false` even when the time toggle or time field still holds a value.
- Saving an existing task still sends the full set of editable fields, including explicit `null` values, rather than a minimal patch. Drafts omit `id`; edits include it. Whitespace-only descriptions become `null`, and an empty list ID becomes `null`.

## Phase 2 extraction

- Starting parent size: **538 physical lines**. Resulting `TaskInspector.tsx`: **403 physical lines**, a reduction of 135 lines.
- `TaskInspectorFields.tsx` renders the editable field groups from Title through Flexible scheduling as a fragment, with no added DOM wrapper. The field order, markup, copy, CSS classes, conditions, and value conversions are carried over from the parent.
- The component API takes a typed snapshot of the ten form values, the title ref, error state for title ARIA attributes, lists and tags, and narrow field change/clear/toggle callbacks. `TaskInspector` still owns every state value and setter, task/draft sync, focus, animations, delete confirmation, form submit and save, error banner, header, and footer.
- `TaskInspectorFields.test.tsx` adds eight focused direct-element and server-rendering tests for text fields, due-date variants, duration presets, Select values and ordering, tags, flexible state, fragment structure, and callback forwarding. Phase 1 serialization tests remain separate.

### Coverage and next seam

- These tests inspect rendered HTML and React element props without a browser DOM. They cannot verify live focus timing, real event propagation, CSS layout, or switch/delete animations.
- The cleanest remaining seam is the parent form state and task/draft reset effect. Extracting that lifecycle now would mix timing and interaction changes without DOM-level tests, so it is **not justified before those tests exist**. Phase 2 leaves that behavior in the parent.

## Independent review

- Reviewed the cumulative `main` (`bb37058`) → `refactor/task-inspector` (`66b9d23`) diff against the original 577-line component, not the completion notes. The branch was 2 commits ahead and 0 behind. **No production regression was found and no production code was changed.**

### Findings

- **Blocking / high / medium: none.**
- Hydration: the draft defaults, the task-to-form mapping (including `description ?? ''`, the `tagIds ?? []` reference, the local date/time from `getZonedParts`, and clearing `hasDueTime` when there is no `dueAt`), and the setter order in the sync effect all match the base.
- Save: the blank-title check still runs before the due-date conversion. Both versions compute the payload outside `try`, clear the error before `onSave`, include `id` first only for non-draft edits (a draft that still has a `task` prop sends a create payload), and use the same field order and `null` conversions.
- Fields: the fragment keeps the base element order, IDs, labels, placeholders, input types, conditions, classes, ARIA, Select options, preset and tag order, and value conversions. It adds no wrapper.
- Lifecycle: the four effects are unchanged in body, dependencies, and order. Ref ownership, delete confirmation, header, footer, and form submit markup remain in the parent.
- Low, pre-existing and preserved: a malformed non-empty `dueDate` (for example `garbage`) makes `zonedWallClockToUtc(...).toISOString()` throw `RangeError` before the `try`, so the submit handler rejects without setting an error banner. The native date input should not produce this. Both versions behave identically, so it is recorded here and not fixed in this refactor.
- Accepted differences: none that change behavior. React now sees a `TaskInspectorFields` element boundary between `<form>` and the field groups. It renders the same DOM, and the component type is stable, so the fields are not remounted. Select `useId` values are still assigned in the same client mount order.

### Parity work (temporary, deleted after the review)

- A review-only Vitest harness ran a verbatim copy of the base component beside the branch component. It swapped React's `useState`/`useEffect`/`useRef` for a small deterministic hook runtime (fake timers, a stub `document`, and refs attached the way React attaches them). Every setter call, effect run, callback, listener add/remove, `stopPropagation`, focus call, and normalized element tree was recorded in order. The base and branch traces were required to match exactly.
- Coverage:
  - Hydration: 10 tasks × 7 timezones, plus drafts. The timezones were UTC, New York, Tokyo, Kiritimati (+14), Pago Pago (−11), Kolkata, and Lord Howe (+10:30/+11). The cases included local-day and year boundaries, DST gaps and overlaps, undefined `tagIds`, and an empty `listId`. The `selectedTagIds` reference identity was also checked.
  - Lifecycle: an 11-step selection sequence covered same-id refetches, task switches, timezone changes, draft-to-task, task-to-empty, and closing. It checked switch keys, error reset, confirmation reset, 229/230 ms focus timing, cancellation of the draft focus timer, and unmount cleanup. A delete-confirmation script covered toggling, inside and outside pointer events, Enter and Escape in the capture phase, Cancel, Delete, and a selection change.
  - Handlers: every handler on the rendered tree was invoked with two input variants, from 4 prop scenarios × 5 form states.
  - Save: 17 form states × 3 create/update scenarios × 5 `onSave` outcomes × 6 timezones. The outcomes were void, resolve, reject `Error`, reject non-`Error`, and synchronous throw. The form states included whitespace titles, blank descriptions, dates with and without a time, Time enabled with an empty time, stale time after a cleared date, DST times, partial dates, and a malformed date.
  - Static markup: `renderToStaticMarkup` with injected state compared 10 prop variants × 15 state variants, plus uninjected renders. The comparison covered the error banner, open confirmation, switch animation, saving, closing, missing callbacks, empty lists and tags, and the empty state. Server `useId` strings were normalized.
- Mutation check: all 16 planted mutations were caught, each on its own and then reverted. They were: an untrimmed description; unpadded minutes; the order of the `id` key; copying `tagIds`; the noon default; the Inbox label; a wrapper `div`; the `listId || null` conversion; reversed tag order; a missing `aria-describedby`; sending an `id` for a draft that still has a task; a 200 ms focus delay; a non-capture Escape listener; a narrowed update guard; a swapped setter; and a removed pre-save error reset.

### Verification

- Focused and task-feature tests: `vitest run src/features/tasks` (4 files, 27 tests) passed. Web typecheck, zero-warning ESLint, Prettier, and `pnpm verify` passed on the final tree.

### Residual limitations (need future DOM/browser tests)

- The harness replaces React's hook runtime, and server rendering does not run effects. They do not prove real commit timing, real ref attachment, focus and caret preservation while typing, native event propagation and capture against other document listeners, `animationend` delivery, CSS layout and animation, or Select keyboard and popup behavior. These rest on the source equivalence and element-tree equivalence above until DOM/browser tests exist.

### Merge readiness

- Ready to merge. Behavior is preserved, and the only change on the branch after review is this documentation section.
