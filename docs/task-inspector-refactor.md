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
