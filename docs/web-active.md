# Web Application — Active Implementation Tracker

Status: WEB PHASES 0–6 COMPLETE + HARDENING; PHASE 7 FIND TIME NEXT

This document is the single source of truth for web client implementation, architecture boundaries, and handoff.

---

## Architectural Principles & Invariants

1. **Parallel Execution with Mobile Sprint 6:**
   - Web development operates in parallel to mobile/iOS work.
   - Mobile and RevenueCat tracks continue independently and must not be disrupted.
2. **Strict UI Isolation:**
   - Web UI is isolated from mobile UI.
   - `apps/web` must NEVER import from `apps/mobile/**`, `react-native*`, `expo*`, or `@cal/ui` (which currently carries React Native peer dependencies).
   - All web visual styling lives under `apps/web` using plain CSS, CSS custom properties, and CSS Modules. No external UI frameworks or utility-class engines (e.g., Tailwind).
3. **Shared Contracts & Domain:**
   - Shared domain logic lives in `packages/domain` (pure TypeScript, deterministic, platform-neutral).
   - Shared validation schemas live in `packages/schemas` (Zod).
   - Generated database types live in `packages/types`.
   - Backend logic, RLS, and Edge Functions in `supabase/` remain shared.
4. **Data Access & State Architecture:**
   - Server state belongs to TanStack Query (`@tanstack/react-query`).
   - Browser Supabase client lives in `apps/web/src/lib/supabase/client.ts` using the public anon key with RLS enforcement.
   - No database rows mirrored in UI state.
   - Web feature APIs stay inside `apps/web/src/features/<feature>/api`.
   - Web routes and pages must never call Supabase directly; they go through feature hooks and APIs.
5. **No Development Provenance Attribution:**
   - No AI model, agent, executor, or IDE attribution in tracked files.

---

## Roadmap & Progress

### Web Phase 0 — Architecture and Foundation

- **Goal:** Establish `@cal/web` workspace, TypeScript strict config, Vite build, environment validation, QueryClient, Supabase browser client, baseline theme/tokens, and CI/build integration.
- **Status:** Completed
- **Starting SHA:** `d01cb11518693f57340a25b3ba2e8fc017204729`
- **Implementation Completed:**
  - Workspace package `@cal/web` configured in `apps/web`
  - Strict TypeScript configuration (`tsconfig.json`) extending root
  - Vite + React 19 configuration (`vite.config.ts`, `index.html`, `src/vite-env.d.ts`)
  - Runtime environment validation (`apps/web/src/lib/env.ts`)
  - Browser Supabase client (`apps/web/src/lib/supabase/client.ts`) with `x-client-platform: web`
  - TanStack QueryClient with web defaults and error mapping (`apps/web/src/lib/query/query-client.ts`, `apps/web/src/lib/errors/app-error.ts`)
  - Semantic CSS custom properties design tokens and global reset (`apps/web/src/styles/theme.css`, `apps/web/src/styles/global.css`)
  - Monorepo integration scripts (`pnpm web`, `pnpm build`, root verification)
- **Tests / Verification:**
  - Strict typecheck passing (`tsc --noEmit`)
  - ESLint passing with web architectural boundary enforcement
  - Production Vite build passing (`dist/` asset bundles generated cleanly)
  - Full repo verification passing (`pnpm verify`)
- **Pushed SHA:** `6c1bfc61fc9bd78b24d6a354df5b6896a0282dcf`
- **CI:** PASS — [CI run 33909446293](https://github.com/Andrewy530/BCalAI/actions/runs/33909446293)
- **Blockers:** None
- **Next Action:** Evaluated and verified; proceed to Web Phase 2 planning

---

### Web Phase 1 — Authentication and Application Shell

- **Goal:** Browser Supabase authentication (email/password sign-in, session restoration, auth listener, sign-out), protected route guards, and desktop application shell with semantic sidebar navigation.
- **Status:** Completed
- **Starting SHA:** `d01cb11518693f57340a25b3ba2e8fc017204729`
- **Implementation Completed:**
  - Auth API network layer (`apps/web/src/features/auth/api/auth.api.ts`) using `@cal/schemas`
  - Session state listener and `AuthProvider` (`apps/web/src/features/auth/hooks/`)
  - Accessible controlled sign-in form (`apps/web/src/features/auth/components/SignInForm.tsx`)
  - Protected route guard (`apps/web/src/components/auth/ProtectedRoute.tsx`)
  - Desktop-first application shell (`apps/web/src/components/layout/AppShell.tsx`) with left sidebar navigation, user session info, and sign-out action
  - Foundation routes: `/login`, `/today`, `/calendar`, `/tasks`, `/search`, `/settings`
- **Tests / Verification:**
  - Typecheck, lint, formatting, production build (`pnpm verify`) all passing
- **Pushed SHA:** `6c1bfc61fc9bd78b24d6a354df5b6896a0282dcf`
- **CI:** PASS — [CI run 33909446293](https://github.com/Andrewy530/BCalAI/actions/runs/33909446293)
- **Blockers:** None
- **Next Action:** Pre-Phase 2 Evaluate shared data-access extraction

---

### Architectural Checkpoint: Evaluate Shared Data-Access Extraction

- **Evaluation:** Inspected `apps/mobile/src/features/tasks/api/tasks.api.ts`. The task data access layer consists of ~150 lines of PostgREST queries plus Zod row-to-domain schemas. Pure domain logic (`bucketTasks`, `compareTasks`, `formatDueDate`, `formatDuration`) is already shared via `@cal/domain`. Data schemas and types are already shared via `@cal/schemas` and `@cal/types`.
- **Decision:** Leave `apps/mobile` unchanged and implement web-specific task APIs under `apps/web/src/features/tasks/api`.
- **Rationale:** Creating a shared `@cal/data` package or abstracting Supabase clients across mobile (Expo/SecureStore/AsyncStorage) and web (Vite/localStorage) introduces heavy ceremony, client injection complexity, and cross-package versioning without providing tangible architectural benefits for a few lightweight PostgREST queries. Strict isolation between mobile and web is maintained.

---

### Web Phase 2 — Tasks / Inbox

- **Goal:** Desktop task list, task CRUD, completion toggle, snooze/due handling, lists/tags, and desktop task inspector.
- **Status:** Completed
- **Starting SHA:** `d80ff85a5c8dc0a6810b9f76beeb85df8466bd19`
- **Architectural Decision:** Implemented web-specific task APIs under `apps/web/src/features/tasks/api/tasks.api.ts` using web's typed Supabase client and `@cal/schemas`, leaving `apps/mobile` unchanged and maintaining strict isolation.
- **Implementation Completed:**
  - Extended centralized `queryKeys.tasks` with `lists` and `tags` helpers (`apps/web/src/lib/query/query-client.ts`).
  - Web tasks API module (`apps/web/src/features/tasks/api/tasks.api.ts`): row mapping schemas, PostgREST queries for `fetchTasks`, `fetchTask`, `fetchTaskLists`, `fetchTags`, `createTask`, `updateTask`, `setTaskCompleted` (with atomic status/completed_at constraint compliance), `deleteTask`, `snoozeTask`, `createTaskList`, `deleteTaskList`.
  - TanStack Query hooks (`apps/web/src/features/tasks/hooks/useTasks.ts`): queries with 30s stale time, optimistic completion toggle and deletion with error rollback, invalidation on settle.
  - Task grouping hook (`apps/web/src/features/tasks/hooks/useTaskBuckets.ts`): consuming `@cal/domain`'s `bucketTasks` and `compareTasks` to group work into overdue, due today, upcoming, someday, and completed.
  - Desktop-first UI components:
    - `TaskRow` (`apps/web/src/features/tasks/components/TaskRow.tsx` + CSS Module): accessible row with completion checkbox, title strike-through, priority badges, due date badges with semantic tones, duration pills, list indicators, fixed status, and hover quick actions (snooze, delete).
    - `TaskListPane` (`apps/web/src/features/tasks/components/TaskListPane.tsx` + CSS Module): desktop left pane with view tabs (Inbox, All, Done), list selector, quick-add form, section headers with item counts, empty and loading states.
    - `TaskInspector` (`apps/web/src/features/tasks/components/TaskInspector.tsx` + CSS Module): desktop right-side inspector panel for viewing and editing task title, notes, due date & time, duration presets, priority, list assignment, tag assignment, flexibility flag, snooze, delete, and save/cancel actions.
    - `TasksView` (`apps/web/src/features/tasks/components/TasksView.tsx` + CSS Module): 2-pane desktop workspace container with responsive layout.
    - AppShell integration (`apps/web/src/components/layout/AppShell.tsx` + CSS Module): full-bleed content layout for `/tasks`.
    - Page integration (`apps/web/src/pages/TasksPage.tsx`): mounts `TasksView`.
- **Tests / Verification:**
  - Automated unit tests in `apps/web/src/features/tasks/api/tasks.api.test.ts` (6 tests: row transformations, schema validation, invalid input rejection).
  - Automated unit tests in `apps/web/src/features/tasks/hooks/useTaskBuckets.test.ts` (3 tests: partitioning, priority/due-date ordering, list filtering).
  - Full repo verification passing (`pnpm verify`: format check, lint, typecheck, 165 unit tests, production build).
  - Production build passing (`pnpm --filter @cal/web build`).
  - Git whitespace check passing (`git diff --check`).
- **Pushed SHA:** `d8c3eb9e1754bae19f25c702699ee23506af67a8`
- **CI:** PASS — [CI run 33929579271](https://github.com/Andrewy530/BCalAI/actions/runs/33929579271)
- **Blockers:** None
- **Remaining Work:** Web Phase 3 — Calendar Read Surface
- **Next Action:** Proceed to Web Phase 3 planning

---

### Web Phase 2 — UI/UX Polish Checkpoint

- **Status:** Complete
- **Starting SHA:** `c9d4fad239b00d97cc013b0fb071104cb4a2203b`
- **Visual Areas Changed:** Web visual tokens and global states; sign-in; authenticated sidebar, account area, and page header; Tasks filters, counts, list selector, quick-add, grouped rows, metadata hierarchy, selection/hover/focus states, empty/error/loading presentation, and task inspector.
- **Meaningful UX Fixes:** Quick-add now preserves text and exposes an inline error when creation fails; task rows use native buttons without nested interactive semantics; destructive inspector actions are separated from save/cancel; narrow layouts use a reachable rail plus overlay inspector; the application is viewport-contained so task panes scroll independently instead of expanding the page.
- **Browser Inspection:** Authenticated seeded data and placeholder routes checked at 1440px, 1200px, 900px, 768px, and 360px-equivalent viewports. Verified Inbox, All, Done-empty, list filtering, selected tasks, long-form inspector scrolling, visible focus, and zero horizontal document overflow.
- **Verification:** `pnpm verify` passed (format, lint, typecheck, 156 tests, production build); focused `pnpm --filter @cal/web build` passed; `git diff --check` passed.
- **Pushed SHA:** `977536c46463f35ec9cccfe456a4757b820f5c52`
- **CI:** PASS — [CI run 34040818259](https://github.com/Andrewy530/BCalAI/actions/runs/34040818259)
- **Remaining Work:** Web Phase 3 — Calendar Read Surface. Future Today, Calendar, Search, and Settings work should reuse the restrained surface hierarchy, compact controls, selected-state treatment, viewport-contained panes, responsive overlay editor pattern, and accessible interaction states established here.

---

### Web Phase 3 — Calendar Read Surface

- **Goal:** Calendar list, bounded event reads, recurrence expansion via `@cal/domain`, day/week/month desktop calendar architecture, all-day event handling, hidden calendar filtering, and timezone correctness.
- **Status:** Complete — checkpoint committed
- **Starting SHA:** `d6b0af7ec654c2d306fecda95dec80907f59df82`
- **Implementation Completed:**
  - Added a web-only calendar API boundary under `apps/web/src/features/calendar/api` with Zod-validated snake_case-to-camelCase mappings for calendars, events, and profile preferences.
  - Added bounded overlap reads for one visible Day, Week, or six-week Month range, including recurring masters and provider exception rows required for correct expansion.
  - Added a shared calendar-window hook using TanStack Query for profile, calendar, and event server state; profile timezone, week start, and hour cycle drive the rendered range.
  - Reused `expandSchedulingCalendarEvents`, local-day timezone helpers, and overlap layout from `@cal/domain`; web does not duplicate recurrence or scheduling rules.
  - Added a calendar identity rail with per-view visibility controls that respects persisted `is_visible` state without adding Phase 4 calendar mutations.
  - Replaced the `/calendar` placeholder with desktop Day, Week, and Month views, previous/today/next navigation, current range headings, all-day lanes, calendar colors, current-time treatment, empty/loading/error states, and responsive contained scrolling.
  - Added a read-only event details inspector with occurrence-aware dates/times, calendar/source identity, location, recurrence summary, description, and provider ownership context.
- **Tests / Verification:**
  - `pnpm verify` passed: formatting, lint, strict typecheck, 156 shared domain tests, and production build.
  - Added and explicitly ran 7 focused Phase 3 web tests covering Monday-first and six-week windows, DST boundaries, month navigation clamping, recurrence expansion, persisted/per-view hidden calendars, and multi-day all-day bucketing.
  - `pnpm --filter @cal/web build` passed; `git diff --check` passed.
  - Authenticated browser inspection against the real local Supabase seed passed at 1440px, 900px, and 390px. Verified Day/Week/Month, previous/today/next, event selection/details, calendar hiding/showing, `America/New_York` rendering, zero narrow-width document overflow, and no browser console warnings/errors.
- **Pushed SHA:** `ba01e0c704f281cd2841e6e21a4df55fb63472b6`
- **CI:** PASS — [CI run 34055861246](https://github.com/Andrewy530/BCalAI/actions/runs/34055861246)
- **Blockers:** None
- **Next Action:** Web Phase 4 — Calendar / Event Editing

---

### Web Phase 4 — Calendar / Event Editing

- **Goal:** Internal event CRUD, calendar CRUD/visibility, recurrence editing, provider-owned event write rules, desktop event editor.
- **Status:** Complete — checkpoint committed
- **Starting SHA:** `d3a339fbdae28481841090b1d2d3fb98c3f27655`
- **Implementation Completed:**
  - Added web-only, Zod-validated calendar and event mutation APIs with snake_case contained at the API boundary and TanStack Query invalidation/optimistic visibility updates.
  - Added internal event creation, editing, and hard deletion using the existing database ownership semantics, including title, description, location, calendar assignment, date/time, all-day, timezone, and recurrence fields.
  - Added provider-first create/update/delete routing through `provider-event-write`; synced events cannot be moved across provider calendars or between provider and internal ownership, and provider errors remain visible to the editor.
  - Replaced the read-only detail panel with a desktop event inspector/editor that distinguishes whole-series edits from materialized provider-exception edits, preserves unsupported existing recurrence rules, and uses the shared recurrence presets/parser and timezone conversion helpers.
  - Added internal calendar creation, name/color editing, guarded deletion, persisted calendar visibility, provider-managed calendar messaging, and explicit read-only calendar/event behavior.
  - Added pending, inline error, success toast, sync-conflict, confirmation, focus trapping, Escape-to-close, focus restoration, and responsive editor behavior while preserving the Phase 3 Day/Week/Month visual language.
- **Tests / Verification:**
  - `pnpm verify` passed: formatting, lint, strict typecheck, 156 shared domain tests, and the production build.
  - Added and explicitly ran 16 focused web calendar tests covering row/schema mapping, provider exception identity, authority routing, forbidden calendar moves, timed/all-day UTC conversion across DST, recurrence preservation/rejection, invalid event ranges, and the existing calendar window/occurrence behavior.
  - `pnpm --filter @cal/web build` passed; `git diff --check` passed.
  - Authenticated browser inspection against real local Supabase data passed for event creation/editing, all-day events, weekly recurrence expansion, calendar creation/editing/assignment, persisted visibility after refresh, Day/Week/Month rendering, read-only provider inspection, keyboard focus/Escape behavior, and a 390×844 viewport with no document overflow or console errors. Internal deletion was confirmed through the authenticated RLS API and disappearance after refresh; isolated QA rows were removed afterward.
- **Pushed SHA:** `4e6f172b925b17f00b43da1d7b4a0da3bea3b93e`
- **CI:** PASS — [CI run 34158010169](https://github.com/Andrewy530/BCalAI/actions/runs/34158010169)
- **Blockers:** None
- **Next Action:** Web Phase 5 — Today / Search / Settings

---

### Web Phase 5 — Today / Search / Settings

- **Goal:** Merged Today surface, unified search across events/tasks, planning preferences, account settings, and integration overview.
- **Status:** Complete — checkpoint committed
- **Starting SHA:** `5a053bc`
- **Implementation Completed:**
  - Replaced `/today` with a timezone-correct daily workspace using the existing profile, task buckets, bounded Day calendar window, shared recurrence expansion, and `calculateFreeTime`. The surface includes timed and all-day events, overdue/due-today/eligible unscheduled tasks, completion toggles, completed-today handling, useful day summaries, and direct navigation into task and event inspectors.
  - Replaced `/search` with a 260ms-debounced, keyboard-operable unified search across non-archived tasks, non-cancelled events, calendars, and task lists. PostgREST search text is sanitized, input is length-bounded, entity reads are capped, results are grouped, and Enter/arrow navigation opens the relevant inspector or context.
  - Replaced `/settings` with profile/account information, timezone, week start, clock, default task/event durations, editable per-day working hours, persistence feedback, sign-out, and supported account deletion.
  - Added a client-safe Google/Microsoft connection overview using `provider_accounts_public`, with existing-account status, last-sync context, manual sync, and secure Edge Function disconnect controls. New browser OAuth connection setup and provider calendar import remain Phase 6.
  - Added query keys and web-only feature API/hook/component boundaries under `apps/web`; pages and components do not call Supabase directly, secrets are not selected, and snake_case remains at API mapping boundaries.
  - Added query-parameter deep links so Today and Search can open the existing Tasks and Calendar inspectors without duplicating their editors.
- **Tests / Verification:**
  - Focused web suite passed (29 tests across nine files), including four new Phase 5 contract tests for PostgREST search sanitization/input bounds, client-safe provider-account mapping, and profile patch mapping.
  - Authenticated browser inspection against real local Supabase data passed for Today with open tasks, a timed event and an all-day event; completion behavior; the empty Today state; search matches/no matches and keyboard result navigation; settings load/save; timezone, clock, and working-hours refresh persistence; provider empty-state/status copy; and task/event inspector deep links.
  - Today, Search, and Settings passed responsive inspection at a 390px viewport with no horizontal document overflow. A clean browser session reported no console warnings or errors.
  - `pnpm verify` passed: formatting, lint, strict typecheck, 156 shared domain tests, and production build. Focused `pnpm --filter @cal/web build` and final `git diff --check` also passed.
- **Pushed SHA:** `a1e418c1ab3399479099e67a76821b5871c3fa3a`
- **CI:** PASS — [CI run 34172447318](https://github.com/Andrewy530/BCalAI/actions/runs/34172447318)
- **Blockers:** None
- **Next Action:** Web Phase 6 — Provider Integrations

---

### Web Phases 4/5 — Review Hardening Checkpoint

- **Goal:** Fix concrete review findings in the completed web event editor, search, Today, settings, and calendar-window surfaces without changing ownership or shared-domain architecture.
- **Status:** Complete — targeted hardening
- **Starting SHA:** `b359fe4`
- **Implementation Completed:**
  - Existing event edits now use the event's stored timezone for both wall-clock form conversion and submitted writes; new events retain the profile/device default. Existing alerts are carried through edits.
  - Unchanged unsupported recurrence strings remain editable and are submitted byte-for-byte unchanged. Replaced recurrence rules still require the supported shared parser, and the same rule is safe for internal and provider-first writes.
  - Added `@cal/web`'s Vitest script and dependency so the existing root recursive `pnpm test` and CI unit-test step execute all web tests.
  - Replaced search punctuation stripping with bounded whitespace normalization, literal LIKE escaping, and quoted PostgREST OR values. Search remains browser-anon-key/RLS-backed and capped per entity.
  - Today schedules one timeout for the next profile-local midnight and recomputes its day window after rollover, including timezone offset changes.
  - Historical checkpoint note: the follow-up below supersedes the midnight-only
    current-time refresh detail with recalculation at most once per minute; this
    earlier checkpoint remains historical evidence.
  - Working-hours end-of-day `1440` is represented by an explicit end-of-day toggle while the HTML time input receives only the valid `23:59` display boundary; the shared schema/domain meaning is unchanged.
  - Item 7 remains intentionally unchanged in code. `recurrence_rule` is opaque text at the web API boundary, so a safe database expiry predicate cannot be derived without risking infinite, finite, provider, or moved/cancelled exception occurrences. The bounded view read therefore continues to include all recurring masters and lets `@cal/domain` preserve correctness.
- **Tests / Verification:**
  - Added or updated focused web tests for event timezone/alert preservation, unsupported recurrence preservation and replacement validation, special-character search filters, profile-local midnight rollover, and the `1440` HTML time conversion boundary.
  - `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm --filter @cal/web test`, `pnpm --filter @cal/web build`, and `git diff --check` passed locally. The normal root test ran 156 domain tests and 37 web tests across 11 web files.
  - `.github/workflows/ci.yml` still runs the normal root `pnpm test` command for unit tests, so web tests participate in CI without a manual side path.
- **Remaining Work:** Item 7 requires a future schema/provider-derived series-end field before a safe recurring-master query bound can be introduced.
- **Next Action:** Web Phase 6 — Provider Integrations

#### Remaining hardening follow-up

- **Starting SHA:** `8d381c8`
- **Completed/pushed SHA:** `8eda12cc00a542a79b1ac942845e86816c6f5c35`
- **Implementation Completed:**
  - Isolated the task row/schema tests from the eagerly validated browser Supabase client with a Vitest module mock. Production environment validation remains unchanged, and the schema tests still import and exercise the intended exports from `tasks.api.ts`.
  - Kept Today’s profile-local midnight rollover while scheduling current-time recalculation at most once per minute, with the midnight boundary taking priority when it is near.
- **Tests / Verification:**
  - `pnpm test` passed with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` unset: 156 shared domain tests and 39 web tests across 11 files.
  - Focused task API and Today clock tests passed: 10 tests.
  - `pnpm verify` passed: formatting, lint, strict typecheck, all repository tests, and the production web build. The build retained the existing non-blocking large-chunk warning.
- **Scope:** Phase 6 remains planned; no provider integration work was started.

---

### Web Phase 6 — Provider Integrations

- **Goal:** Google and Microsoft browser OAuth connection/reconnection, provider calendar discovery/import controls, detailed per-calendar sync health, and OAuth callback handling while preserving the provider-first write architecture. Basic existing-account status, manual sync, and secure disconnect controls are already present in Settings from Phase 5.
- **Status:** Complete — checkpoint committed
- **Starting SHA:** `9a99ccf6ca6a0ec1c787bb410e0811e37ebd7be0`
- **Implementation Completed:**
  - Added provider-neutral, server-controlled OAuth return targets (`mobile` / `web`) with a forward `oauth_states.return_target` migration, validation, safe fallback behavior, and preserved mobile defaults. Google and Microsoft callbacks consume valid state before success, denial, or code exchange and return only fixed provider/status values.
  - Extended the web Settings feature boundary with browser connect/reconnect, client-safe sync-health mapping and polling, provider calendar discovery, import/un-import mutations, and stable Edge Function error-code handling. The browser uses a same-tab OAuth redirect into `/settings/integrations/callback` and refreshes integration/calendar/event state after success.
  - Expanded the existing ConnectionsSection with provider actions, account recovery states, manual sync, secure disconnect, and a keyboard-accessible native calendar picker with per-row pending/failure state. Import remains distinct from visibility and never deletes provider data; provider-first event writes and server-only secrets/watch details are unchanged.
- **Tests / Verification:**
  - `pnpm verify` passed: format check, lint, strict typecheck, 156 domain tests, 50 web tests across 14 files, and production build (existing non-blocking large-chunk warning only).
  - Deno format/lint/check passed for changed functions; `deno task test` passed with 147 tests. Local Supabase reset, `supabase test db --local` passed all 113 database tests, `pnpm db:types` completed with only the intended `return_target` generated-type additions, and `git diff --check` passed.
  - Authenticated local browser inspection used the real seeded account at the normal 1280×720 desktop viewport. Verified the empty provider state, safe simulated connected/failed/invalid callback messages, no horizontal document overflow, and no browser console errors. A narrow-width harness was blocked by the browser URL policy, so the responsive CSS remains locally reviewed but was not claimed as browser-verified in this checkpoint.
- **Pushed SHA:** Pending checkpoint commit record
- **CI:** Not checked after this push
- **Blockers:** Live Google/Microsoft OAuth requires provider client credentials and deployed callback configuration; live provider sync/import/webhook behavior was not exercised. Local automated implementation is complete.
- **Next Action:** Web Phase 7 — Find Time

---

### Web Phase 7 — Find Time

- **Goal:** Consume hardened Sprint 6 proposal endpoint, proposal selection UX, confirmation flow, Pro entitlement rendering (no client-side availability calculation).
- **Status:** Planned
- **Starting SHA:** TBD
- **Implementation Completed:** TBD
- **Tests / Verification:** TBD
- **Pushed SHA:** TBD
- **CI:** TBD
- **Blockers:** Finalized subscription/entitlement architecture
- **Next Action:** Pending Phase 6

---

### Web Phase 8 — Production Web Hardening

- **Goal:** Accessibility audit, keyboard shortcuts, responsive behavior, performance optimization, error boundaries, browser compatibility matrix, security/privacy review, deployment configuration.
- **Status:** Planned
- **Starting SHA:** TBD
- **Implementation Completed:** TBD
- **Tests / Verification:** TBD
- **Pushed SHA:** TBD
- **CI:** TBD
- **Blockers:** None
- **Next Action:** Pending Phase 7
