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

## Remaining candidate seams

- Header controls and filter tabs are the cleanest remaining presentation seam; keep their state and callbacks in the parent if extracted later.
- Loading, error, and empty states plus active-tab content branching could be separated after their behavior contract is captured.
- Caught-up footer and empty-space click handling remain in the parent for now.
