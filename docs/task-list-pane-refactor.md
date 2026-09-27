# TaskListPane refactor tracker

## Baseline

- Base: `2ec1eedb1c8eb0320d6a1d2ca39505dba88df1be` (`main`).
- `apps/web/src/features/tasks/components/TaskListPane.tsx`: 403 physical lines before Phase 1.
- Responsibilities at baseline: Quick Add form state and submission; list filter and new-task header; tab controls and counts; loading, error, and empty states; choosing task sections and their order; section tone, icon, title, count, and rows; selected-row calculation and task action forwarding; caught-up footer; empty-space click handling.

## Phase 1: task section presentation

- Extracted the inline `renderSection` presentation into `TaskListSection.tsx` in the same feature components folder. It owns the existing section wrapper, tone and icon selection from the title and `isOverdue`, title and count markup, and ordered `TaskRow` mapping with selection, display context, and action callbacks.
- `TaskListPane` still owns section existence through the same loading, error, empty, and active-tab branches. It chooses section titles, arrays, and order, and passes the shared row context to each section. Empty arrays still render no section.
- No CSS or `TaskRow` changes, no new DOM wrapper, and the string-based title rules remain as they were.
- Parent after Phase 1: 354 physical lines.

## Phase 1 verification

- Focused `TaskListSection.test.tsx`: eight Vitest tests covering empty output, all six named section cases, exact section header structure and SVG paths, tone classes, count, row order and selection, lists/now/timeZone, and callbacks.
- Relevant task feature tests: 35 passed across five files. Web typecheck, changed-file ESLint with zero warnings, and changed-file Prettier check passed.
- `pnpm verify`: passed (format, lint, workspace and billing typechecks, all tests, web and billing builds, and client bundle scan). The local Node 20 shell reported the repository's Node 22 engine warning, and Vite reported a chunk-size warning; neither failed verification.
- Final diff review: the original section presentation block is text-identical to the extracted block after indentation normalization. Section calls retain their titles, arrays, order, and overdue flag in each branch; no class, icon, selection, display-context, or callback drift found.

## Phase 2: Quick Add presentation

- Starting parent: 354 physical lines at `522ee8acb7fd392aabd59c26307ddd5ff2605a11`.
- Extracted the Quick Add form, plus icon, text input, submit button, and adjacent inline error into `TaskQuickAdd.tsx`. Its API receives `quickTitle`, `quickAddError`, `isQuickAdding`, `onTitleChange`, and `onSubmit`. A React fragment preserves the form/error DOM order without a wrapper element.
- The parent still owns `quickTitle`, `quickAddError`, `isQuickAdding`, `setQuickTitle`, and the unchanged `handleQuickSubmit` async logic, including trimming, blank-title return, pending/error ordering, success reset, error-message selection, and `finally` reset.
- Parent after Phase 2: 325 physical lines. CSS and all other task components remain unchanged.
- Focused `TaskQuickAdd.test.tsx`: seven Vitest tests for empty, non-empty, whitespace-only, pending, error, no-error, structure, ARIA linkage, and callback forwarding. The eight existing `TaskListSection` tests also pass.
- Relevant task feature tests: 42 passed across six files. Web typecheck, changed-file ESLint with zero warnings, and changed-file Prettier check passed.
- `pnpm verify`: passed (format, lint, workspace and billing typechecks, all tests, web and billing builds, and client bundle scan). The local Node 20 shell reported the repository's Node 22 engine warning, and Vite reported a chunk-size warning; neither failed verification.
- Final diff review: the original form and inline-error JSX lines match the extracted component after the two handler names and indentation are normalized. The parent's `handleQuickSubmit` is unchanged. No markup, ARIA, disabled-state, copy, DOM-order, or callback drift found.

## Phase 3: header controls and filter tabs

- Starting parent: 325 physical lines at `c33e0686b236bc7a4e5f52dd21f0cfbb25cc7d17`.
- Extracted the `titleRow` and `toolbar` presentation into `TaskListHeaderControls.tsx`. It renders the title, subtitle, list filter, New task button, and Inbox / All / Done tabs with their counts. A React fragment preserves the two sibling DOM elements and their order; `TaskQuickAdd` remains separately composed in the parent.
- The child receives `lists`, `selectedListId`, `activeTab`, `openCount`, `totalTaskCount`, `completedCount`, `onListChange`, `onTabChange`, and `onNewTaskClick`. The parent still owns these values and callbacks, including count calculations; the child only adapts the list filter's empty string to `null` as the original JSX did.
- Parent after Phase 3: 264 physical lines. CSS and the prior extracted components remain unchanged.
- Focused `TaskListHeaderControls.test.tsx`: seven Vitest/server-render/direct-element tests covering title/subtitle, fragment and sibling order, list value and option order, empty-list conversion, New task markup and callback, active state for all three tabs, counts, classes, ARIA, and tab callbacks. The 15 existing Quick Add and section tests also pass; all 49 task feature tests pass across seven files.
- Web typecheck, changed-file ESLint with zero warnings, and changed-file Prettier check passed.
- `pnpm verify`: passed (format, lint, workspace and billing typechecks, all tests, web and billing builds, and client bundle scan). The local Node 20 shell reported the repository's Node 22 engine warning, and Vite reported a chunk-size warning; neither failed verification.
- Final diff review: the original 70 nonblank title-row and toolbar JSX lines match the extracted block after indentation and `totalTaskCount` naming are normalized. No DOM structure, option-order, list-null conversion, tab-state/count, ARIA, class, icon, or callback drift found.

## Remaining parent responsibilities and assessment

- `TaskListPane` still owns Quick Add state and submission, loading/error/empty and active-tab content branching, section choice and order, count calculations, the caught-up footer, and empty-space click handling.
- At 264 lines, the parent is a coherent pane coordinator. `renderContent` is the only substantial candidate seam, but it owns the pane's state branching and section selection; a further extraction is not justified solely by size. Revisit only if that behavior grows or needs independent reuse.

## Independent review

- Scope: adversarial review of the cumulative `main` (`2ec1eedb1c8eb0320d6a1d2ca39505dba88df1be`) → `refactor/task-list-pane` (`b7297f45b0a98e9b4f9d67bc825a7a60fba4f944`) diff, three commits ahead and zero behind. Phase 4 was not started; no production code was changed by the review.
- Findings: no Critical, High, Medium, or Low regressions found.
- Source review: `handleQuickSubmit`, the counts, all `renderContent` branches, the caught-up footer, and the empty-space predicate are text-identical to the base. The extracted section, Quick Add, and header JSX match the base blocks after indentation and prop-name normalization. Each branch still chooses the same section titles, arrays, order, and `isOverdue` flag.
- Accepted differences:
  - `useId`-generated Select ids differ (for example `select-«R65»` becomes `select-«Rcl»`) because the Select now sits under an extra component. They stay internally consistent, and nothing references them.
  - `TaskListHeaderControls` and `TaskQuickAdd` return keyless fragments, and `TaskListSection` adds a composite layer. None of these adds a DOM node. Section and row identity is unchanged: the section keys (`key={title}`) are still honoured because they are now on the single element each `TaskListSection` returns. Switching between Inbox and All still remounts the last section (`Completed Today` ↔ `Completed`) and its rows, as before. Otherwise, fibers are remounted only once, when the new version first renders.
- Maintenance note: the `key={title}` inside `TaskListSection` is required. It can look like a redundant key but keeps the base remount semantics. Static markup cannot see it; the temporary harness below caught its removal. Keep it, or cover it with a test when DOM tests arrive.

### Parity work (temporary; deleted after review)

- Copied the base `TaskListPane` next to the branch version and compared them in Vitest with `react-dom/server` and a partial `react` mock that controlled the parent's three `useState` values and recorded their setters.
- Static markup (`useId` normalized): 2,304 combinations of tab × loading × error × all 64 non-empty/empty patterns of Overdue, Due Today, Upcoming, No Due Date, Completed Today, and Completed × consistent, empty, and inconsistent `allTasks` (including the `openCount` clamp). Also 480 combinations of selected task (every section, missing, null), list filter (null, '', known, unknown), and lists (undefined, [], one, reordered), plus 96 combinations of Quick Add title, error, pending, and tab. All were identical.
- Element tree and callbacks: after expanding the extracted children and flattening keyless fragments, the host trees matched in type, key, non-function props, `TaskRow` and Select props, and callback identity. Every inline handler (pane click, Retry, tabs, New task, Select change, Quick Add change and submit) was called with 15 argument probes. That covered the empty-space predicate for no target, a non-interactive target, and each of the nine excluded selectors, a missing `onEmptySpaceClick`, and Select values `''`, known, and unknown. Base and branch call traces matched.
- Quick Add transitions: blank, whitespace, and padded titles × a resolving, rejecting `Error`, rejecting a string, rejecting `undefined`, or synchronously throwing `onQuickAdd`. The traces matched before and after the gated promise settled: `preventDefault`, error cleared, pending set to true, the trimmed title passed, then either the title reset or the Error-vs-fallback message, and finally pending set to false.
- Deliberate regressions planted one at a time and all caught: section tone, section order, Quick Add disabled rule, list `'' → null` conversion, title reset before `await`, removal of the `[role="option"]` exclusion, removal of the inner section key, All count, selected-row predicate, footer condition, and error-message selection.

### Verification

- Task feature tests: 49 passed across seven files. Web typecheck, zero-warning ESLint, and Prettier passed.
- `pnpm verify`: passed. That covered format, lint, workspace and billing typechecks, and all tests: web 741, domain 348, mobile 11, and 201 + 8 in the other suites. It also ran the web and billing builds and the client bundle scan. The only warnings were the local Node 20 engine warning and the Vite chunk-size warning; neither failed verification.

### Residual DOM/browser limitations

- The review did not render in a DOM. Real click bubbling and `closest()` against real elements, form submission and Enter key handling, focus retention on the controlled input while it is disabled, Select keyboard and popup behavior, `role="alert"` announcements, `TaskRow` exit-animation timers across tab switches, and the Inbox ↔ All remount were checked only in source, statically, or by reasoning about React reconciliation. They need DOM/browser tests later.

### Merge readiness

- Ready to merge: behavior is preserved apart from the accepted differences above.
