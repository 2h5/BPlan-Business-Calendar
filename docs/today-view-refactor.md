# TodayView refactor

## Baseline

- Starting branch and SHA: `main` at `495bf8022ee37caba88342ede4c5e4e5515380e7` (also `origin/main` after fetch).
- Target: `apps/web/src/features/today/components/TodayView.tsx`.
- Baseline physical line count: **999** (`Get-Content` line count before edits).

## Current responsibilities

`TodayView` currently owns `useToday` consumption, navigation, task mutations, Quick Add form state and submission, snooze date calculation, delete handling, search open state, greeting/date/daytime calculations, loading and error states, hero actions, Find Time and Day Glance composition, schedule rendering, task grouping, completed-section state, and overall page composition. It also defines a stateless `TodayTaskRow` and eleven Today-specific SVG icon components at the bottom of the file.

## Behavioral invariants

- Preserve every route target, mutation argument, Quick Add action, snooze calculation, and task grouping.
- Preserve the row's completed styling, list lookup/pill/color, due description and visibility/tone, notable-priority labels/classes, duration, checkbox/open/action callbacks, labels, titles, DOM structure, and CSS classes.
- Keep all task state and mutation hooks in `TodayView`; pass task, lists, clock settings, and callbacks to the row.
- Preserve each SVG's markup and attributes, including its current accessibility behavior.
- Keep page composition, copy, styling, accessibility attributes, and `TodayView.module.css` unchanged.

## Provisional decomposition areas

- **Phase 1:** Extract only the stateless task row and Today-specific SVG helpers.
- Later candidates to assess after Phase 1: Quick Add presentation and state boundary, schedule presentation, task-group composition, and page-level derived display values. These are observations, not committed phases or planned moves.

## Progress

### Phase 1 — complete

- Extracted `TodayTaskRow` into `apps/web/src/features/today/components/TodayTaskRow.tsx` and the eleven SVG helpers into `apps/web/src/features/today/components/TodayIcons.tsx`. The parent only imports and composes them; it still owns every hook, callback, mutation, and page state value.
- `TodayView.tsx` physical lines: **999 before → 699 after**. `TodayView.module.css` was not changed.
- Added `apps/web/src/features/today/components/TodayTaskRow.test.tsx` with four focused tests. They cover rendered list/priority/due/duration metadata, open and complete/incomplete labels and callbacks, completed due-pill suppression, overdue styling, and snooze/delete callback forwarding.
- Verification: focused row tests 4/4; Today/task tests 30/30; web typecheck passed; touched-file ESLint with `--max-warnings 0` passed; touched-file Prettier passed; `pnpm verify` passed (format, lint, workspace typechecks, tests, build, bundle check). Comparing the extracted row body and icon markup to the starting source after removing only `export` showed exact text equality. The parent diff changes imports and removes those definitions; its page body is unchanged.
- Coverage limit: server rendering checks static output and direct React-element callbacks. They do not simulate browser events, CSS rendering, or full `TodayView` integration. No new DOM testing infrastructure was added.
- Phase 2 observation: four task groups repeat the same row prop wiring, while Quick Add, schedule, and task-group composition are still in the parent. Assess one boundary at a time against this baseline before choosing further extraction; no later phase is locked in.
