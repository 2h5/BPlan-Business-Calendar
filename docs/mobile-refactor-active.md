# Mobile Component Refactor — Active Tracker

Status (2026-10-01): CODE COMPLETE AND VERIFIED on branch
`refactor/mobile-editor-findtime`; ON-DEVICE SMOKE CHECK PENDING.

This tracker covers the targeted break-up of the two mobile components that
had outgrown one responsibility. It is a behaviour-preserving refactor: no
visual, copy, or data-flow change is intended.

---

## Why these two files

A review of `apps/mobile` found no monolithic route or screen files: routes
are thin and features already follow `features/<feature>/{api,hooks,components,screens,utils}`.
Four files exceeded the ~250–350 line prompt in `AGENTS.md`; only two were
judged worth splitting:

| File                                              | Lines | Reason to split                                                                                                               |
| ------------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------- |
| `features/events/components/EventEditorSheet.tsx` | 492   | Untested pure logic (alert labels, default start time, date/time merge, validation, payload) was locked inside a component.   |
| `features/scheduling/components/FindTimeBox.tsx`  | 581   | Mixed a submit router, derived UI state, an auto-close timer, and five sub-components. The most actively growing mobile file. |

`PlanningPreferencesSheet.tsx` (418) and `SearchResults.tsx` (409) were left
alone: their helpers are private, single-use, and colocated with their only
caller, so splitting would add files without adding testability or reuse.

## Testing approach

Mobile tests run with Vitest in Node (`pnpm --filter @cal/mobile test`,
`vitest run src`) and cover pure modules in `utils/` only — there is no React
Native renderer in the toolchain, and adding one is out of scope (see
`AGENTS.md`: no new dependency the stack can handle). The refactor therefore
moves every piece of decision logic into pure, framework-free `utils/`
modules with unit tests, leaving components as presentation. The iOS
simulator was unavailable during this work; on-device smoke checks are listed
under [Pending](#pending).

---

## Plan

### Phase 1 — Event editor

- [x] `events/utils/event-alerts.ts` — `ALERT_PRESETS`, `alertLabel`,
      `alertOptions`, `toggleAlert` + tests.
- [x] `events/utils/event-form.ts` — `EventFormState`, `defaultStart` (with an
      injectable `now`), `newEventForm`, `eventFormFrom`, `mergeDateAndTime`,
      `withStart`, `eventColorSwatches`, `validateEventForm`,
      `toEventPayload` + tests.
- [x] `events/hooks/useEventForm.ts` — form initialisation and `patch`.
- [x] `events/components/EventColorPicker.tsx`, `EventAlertPicker.tsx`, and
      `EventDateTimeField.tsx` (the Starts/Ends block, previously duplicated).
- [x] `EventEditorSheet.tsx` reduced to composition, save, and delete.

### Phase 2 — Find Time box

- [x] `scheduling/utils/find-time-box-state.ts` — `deriveFindTimeBoxState`
      (pending, can-submit, error precedence, upgrade, finished, has-results,
      idle) and `staleResultsOnEdit` + tests.
- [x] `scheduling/hooks/useFindTimeAutoClose.ts` — the follow-up wait and
      close-up animation.
- [x] `scheduling/components/FindTimeProposalResults.tsx` — heading and slot
      rows (mirrors the web component of the same name).
- [x] `scheduling/components/FindTimeReadback.tsx` — readback chips.
- [x] `scheduling/components/FindTimeNotices.tsx` — follow-up prompt,
      clarification, scheduled confirmation, and error notices.
- [x] `FindTimeBox.tsx` reduced to the field, submit routing, and composition.

### Phase 3 — Verification

- [x] `pnpm --filter @cal/mobile test`
- [x] `pnpm --filter @cal/mobile typecheck`
- [x] `pnpm lint`, `pnpm format:check`
- [x] `pnpm verify` (full)

## Pending

On-device smoke check when the simulator is available:

- Event editor: create, edit, change start (end follows), all-day toggle,
  colour inherit/custom/legacy swatch, alert toggles including a synced
  non-preset alert, delete single and series, read-only calendar footer.
- Find Time: search → slots → book; edit request → move; clarification;
  error with upgrade button; follow-up auto-close after 12 s; idle blur
  folds the box.

## Checkpoint log

### 2026-10-01 — Phases 1–3

- `aa822c4` — event editor: `EventEditorSheet.tsx` 492 → 239 lines; logic in
  `event-form.ts` / `event-alerts.ts` (unit-tested), `useEventForm`, and
  `EventColorPicker`, `EventAlertPicker`, `EventDateTimeField`.
- `5dd97da` — Find Time: `FindTimeBox.tsx` 581 → 235 lines; logic in
  `find-time-box-state.ts` (unit-tested), `useFindTimeAutoClose`, and
  `FindTimeProposalResults`, `FindTimeReadback`, `FindTimeNotices`.
- `pnpm verify` passed: mobile 9 files / 114 tests (was 6 files), web 881,
  domain 393. The new tests also pass under device time zones UTC,
  Asia/Kolkata, Pacific/Auckland, and America/St_Johns.
