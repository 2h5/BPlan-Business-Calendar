# Engineering Rules

These rules apply to both developers and to any AI coding tool working in this
repository. They exist because the biggest risk on a two-person, AI-assisted
project is not speed — it is architecture drift.

Read `docs/architecture.md` before making a structural change.

## Non-negotiable

- TypeScript strict mode. No `any`, no `@ts-expect-error` without a comment
  saying what will remove it.
- **Keep route/page components thin.** Expo Router route files
  (`apps/mobile/app/**`) and web route/page components
  (`apps/web/src/routes.tsx`, `apps/web/src/pages/**`) read route state, call
  feature hooks, compose feature components, and trigger navigation. Business
  logic, data access, and provider calls belong in feature APIs/hooks or shared
  domain code. ESLint enforces the Supabase part of this for mobile.
- **Never call a provider API or Supabase directly from a React component.**
  Go through `features/<feature>/api/*` and a hook.
- **All schema changes are migrations.** Never edit a table by hand in Studio
  and never edit a migration that has been merged.
- **RLS is mandatory** on every user-owned table, with explicit policies for
  select / insert / update / delete. If a table should be server-only, enable
  RLS and write no policies.
- **Never expose the service-role key or a provider refresh token to the app.**
  Anything named `EXPO_PUBLIC_*` or `VITE_*` ships in a client bundle and is
  public.
- **Calendar conflict calculation is deterministic code, not LLM reasoning.**
  See `packages/domain/src/scheduling/availability.ts`.
- **Validate every external input with Zod** — user input, provider payloads,
  webhook bodies, and model output alike.
- **AI output must be validated before it changes user data.** The model ranks
  and explains slots the engine produced; it never invents a time.

## Structure

- Feature-first. New code goes in `src/features/<feature>/`, not in a global
  `utils` or `components` folder.
- Pure domain logic goes in `packages/domain` and must not import React,
  React Native, Expo, or Supabase. ESLint enforces this.
- `@cal/ui` is the React Native/mobile presentation package. Reuse its
  primitives in `apps/mobile`; do not import it, React Native, or Expo into
  `apps/web`. Web presentation uses browser-native semantics and its CSS token,
  global CSS, and CSS Module layer while maintaining design parity.
- One clear responsibility per file. A file over ~250–350 lines is a prompt to
  ask whether it is doing two things, not an automatic refactor.
- Do not add a dependency the existing stack can handle cleanly.

## Data

- Server state belongs to TanStack Query. UI-only state belongs to Zustand.
  Never mirror database rows into a Zustand store.
- Every query key comes from the owning app's `queryKeys` in
  `apps/mobile/src/lib/query/query-client.ts` or
  `apps/web/src/lib/query/query-client.ts`; never invent an ad-hoc key or mix
  the two clients' query clients.
- Snake_case ends at the API module. Everything above it is camelCase.
- Timestamps are stored and transported as UTC ISO strings. Convert to local
  wall-clock time only through `@cal/domain`'s timezone helpers.

## Sync

- The provider owns provider events; this database holds a normalised copy.
- Provider-owned event mutations must use the approved server/provider path
  (`provider-event-write` through the feature API): resolve ownership on the
  server, write to the provider first, then update the local mirror. Do not
  treat a locally readable mirrored row as the write authority. Internal
  events remain database-owned.
- Webhooks are hints, not truth. Everything must also converge via periodic
  reconciliation.
- Every provider upsert must be idempotent and keyed on
  `(provider_account_id, provider_event_id)`.

## Pull requests

Every PR: one coherent problem, type-checks, lints, tests pass, screenshots or
video for UI changes, a migration when the database contract changed, and no
unrelated refactors.

Run before pushing:

```bash
pnpm verify
```

For backend, migration, RLS, generated-type, or Edge Function changes, also
run the relevant Supabase database checks (`supabase test db` / local reset and
generated types) and Deno checks. CI performs those database/RLS/generated-type
checks in addition to the ordinary workspace verification.
