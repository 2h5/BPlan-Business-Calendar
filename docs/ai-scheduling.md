# AI scheduling

Status: **engine, deterministic server Find Time path, provider foundation,
Phase 3 proposal implementation, and Phase 4 confirmation path are built; full
verification is tracked in** [`sprint-6-active.md`](sprint-6-active.md). The
engine is `packages/domain/src/scheduling/availability.ts`. Live model
evaluation, production model selection, web/mobile Find Time UX, and the real
RevenueCat purchase E2E remain pending.

## Checkpoint — 2026-09-09 (web Find Time box)

`supabase/functions/ai-find-time/` generates and persists proposals, and
`supabase/functions/ai-confirm-time/` safely revalidates and creates the
internal event.

The web Today page now has a free-text Find Time box
(`apps/web/src/features/scheduling/`) that calls `ai-find-time`, renders the
top three ranked slots, and books the chosen one through `ai-confirm-time`.
Mobile has no Find Time UI.

No AI provider is configured. `ai-find-time` requires `OPENAI_API_KEY` and will
fail without it, so the box cannot return suggestions until a model is chosen
(`AI_MODEL`, default `gpt-5.6-luna`).

### Natural-language scheduling intent (Luna)

The Find Time box accepts human language (e.g. `"meeting with Andrew lasting 15m"`, `"30-ish minutes Friday sometime after 4"`, `"find me an hour or two toward the end of this weekend"`, `"dentist next Tuesday around 2 at the Paramus office"`).

1. **Pre-Model Quota Gate**: Before calling any billable intent model, the server claims a quota unit in `ai_schedule_requests` under an advisory lock (`claim_ai_schedule_request` with `p_raw_text`). A rate-limited user (10/hour) fails immediately with HTTP 429 without making a model request.
2. **Intent Interpretation & Fail Closed**: Luna (`gpt-5.6-luna`, reasoning effort `low` by default) extracts structured intent adhering strictly to `schedulingIntentSchema` (`packages/schemas/src/intent.schema.ts`). Validation is strictly fail-closed: malformed variants (missing weekday, invalid hour/minute, inverted duration ranges) throw `AI_INVALID_OUTPUT` instead of silently degrading to unconstrained constraints. Impossible calendar dates (e.g., `2026-02-30`) and past dates prompt clarification.
3. **Data Minimization**: Raw user text is stored only transiently in `ai_schedule_requests.raw_text`. Immediately upon successful parsing or terminal clarification/error, `raw_text` is nullified (`raw_text = null`). Only validated structured intent (`parsed_intent`) and extracted target fields (`ad_hoc_title`, `ad_hoc_duration_minutes`, `ad_hoc_location`, `ad_hoc_description`) are retained.
4. **Independent Intent Telemetry**: Intent interpretation metrics are tracked independently from ranking metrics in `ai_schedule_requests`: `intent_provider`, `intent_model`, `intent_prompt_version`, `intent_latency_ms`, `intent_input_tokens`, `intent_output_tokens`, `intent_reasoning_tokens`, and `intent_total_tokens`.
5. **Clarification Flow**: If the user's intent is ambiguous or missing essential details (e.g. `"schedule something"`), Luna returns `requiresClarification: true` with a polite clarification question. The server updates the request row with `errorCode: 'AI_CLARIFICATION_REQUIRED'`, records token/latency usage, and returns a 200 clarification response. No slots are generated or booked, and the attempt consumes 1 quota unit.
6. **Deterministic Normalization (`@cal/domain/scheduling`)**:
   - `resolveIntentDuration`: Bounded duration ranges (e.g. 1–2 hours) are resolved deterministically into candidate durations `allowedDurationsMinutes: [60, 90, 120]`.
   - `resolveIntentDateWindow`: Deterministic date arithmetic converts relative dates ("Friday", "next Tuesday", "this weekend" with `early`/`late` preferences) into UTC window bounds using the user's timezone.
   - `resolveIntentTimeBounds`: Maps time intent into deterministic minute-of-day constraints (`earliestMinute`, `latestMinute`, `exactStartMinute`, `preferredTimeOfDay`). Exact start times use `exactStartMinute`, so duration ranges (e.g. "at 3 for 1-2 hours") keep every valid duration at the requested start without allowing later starts.
   - `generateIntentReadback`: Produces clean UI readback metadata (`title`, `durationLabel`, `dateLabel`, `timeLabel`, `location`).
7. **Deterministic Availability Engine**: `generateCandidateSlots` produces candidate slots across all allowed durations on the local grid. Only conflict-free slots within working hours are generated.
8. **Candidate Ranking**: Luna ranks the verified candidates and explains its choices, respecting placement preferences (`early`, `late`).
9. **Ad-Hoc Confirmation**: On confirmation, `confirm_ai_schedule_suggestion` creates the internal event, populating `location` and `description` from the persisted request row.
10. **Pro UI Teaser**: For users without an active Pro entitlement, `FindTimeBox` renders a locked teaser card linking directly to `/subscription` with a disabled input, avoiding broken 402/403 submissions while preserving confirmation cards and banners.

### Ad-hoc requests

A request targets an existing task, a raw natural language text string, or an explicit ad-hoc title + duration. `aiScheduleRequestSchema` enforces exactly one mode, and `ai_schedule_requests` mirrors it with a check constraint: `task_id` is nullable, and an ad-hoc row carries `raw_text` (cleared post-parse), `ad_hoc_title`, `ad_hoc_duration_minutes`, `ad_hoc_location`, `ad_hoc_description`, and `parsed_intent`.

### Ad-hoc confirmation

`confirm_ai_schedule_suggestion` makes its task steps conditional on `task_id`: an ad-hoc confirmation takes the event title from `ad_hoc_title`, location from `ad_hoc_location`, description from `ad_hoc_description`, links no task, and requires `task_version` to be absent. Everything else is shared with the task path and unchanged — the per-user advisory lock, the start-time guard, the profile and default-calendar version checks, the recurrence-aware conflict predicate, and the single-transaction commit. A repeated confirmation returns the same event and creates no duplicate.

The only currently scoped Pro capability is **Find Time with AI**. Other AI
ideas in the product plan remain potential future features and are not part of
the current launch promise.

## The division of labour

```
Task
  ↓  normalise constraints                       (deterministic)
Fetch calendar events + working hours            (deterministic)
  ↓
Free-slot engine                                 (deterministic)
  ↓  candidate slots — every one is genuinely free
AI ranking / intent interpretation               (model)
  ↓  ordered slot ids + reasons
Structured proposal
  ↓
Persisted suggestion ID confirmation             (always, in v1)
  ↓
Server revalidation against current state
  ↓
Atomic internal BCal event + task linkage
```

The engine guarantees: no overlap, correct time maths across DST, buffers
honoured, working hours respected, deadline met. The model ranks sanitized
candidates for preferences such as morning versus afternoon, earliest/latest,
deadline urgency, and avoiding a slot immediately next to busy time.
Entity-specific instructions such as _"after my class"_ are out of scope for
v1 because event titles/descriptions are not sent to the model.

## The engine

`generateCandidateSlots({ constraints, busy })`:

1. Expand per-weekday working hours into UTC intervals covering the window.
   Windows are interpreted as local wall-clock time, so 09:00 stays 09:00 across
   a DST boundary.
2. Clip to any earliest/latest local minute band.
3. Subtract busy intervals, each grown by `bufferMinutes` on both sides.
4. Emit every placement of `durationMinutes` on the granularity grid, aligned to
   local clock time so proposals land on 10:15, not 10:07.

`rankSlotsHeuristically` provides an explainable offline baseline/test oracle.
Find Time remains server-gated to Pro users, and v1 does not use heuristic
ranking as a production fallback for a failed model call.

Intervals are half-open `[start, end)`, so back-to-back meetings do not
"overlap" — which is what users expect.

## Model contract

The v1 provider seam is one narrow operation:

```text
rankCandidateSlots(sanitizedInput) -> AIScheduleProposal
```

The model receives no tools, database access, provider APIs, or event content.
It cannot create or reschedule anything. OpenAI is the first server-side
adapter, using the Responses API with `store: false`, strict JSON Schema
Structured Outputs, configurable low reasoning, and post-response Zod plus
candidate-set validation.

Output must satisfy `aiScheduleProposalSchema`:

```ts
{
  suggestions: [{ slotId, rank, score, reason }];
}
```

`slotId` must be one opaque request-scoped id the server mapped to an engine
candidate and persisted for this request. Duplicate/unknown ids, non-contiguous
ranks, extra fields, or raw timestamps are rejected as `AI_INVALID_OUTPUT`.
That is the structural reason the model cannot put an appointment on top of an
existing meeting.

## Server-side gates

After authentication and the Pro entitlement check, deterministic preparation
validates task ownership and scheduling input, loads events, and generates the
candidate set. A valid request then passes through the atomic server-side
attempt limit before any model call:

1. Atomic per-user limit of 10 claimed attempts per rolling 60 minutes
   (server-configurable).
2. The request is persisted as pending before the provider call.

If the engine returns zero slots, no model call happens at all: the answer is
persisted as a failed `AI_NO_VALID_SLOT` request and counts against the valid
attempt limit; the UI offers to widen the window or relax the buffer.

## Privacy

The model receives opaque candidate ids, candidate start/end and derived local
time features, task duration/priority/deadline, explicit preferences, and the
untrusted task title/optional note. It receives no raw calendar rows, event
titles/descriptions, attendees, locations, email content, OAuth data, or
provider credentials. Full prompts and provider bodies are neither persisted
nor logged.

## Sprint 6 v1 product boundary

- Whole-duration tasks only; deterministic split scheduling is deferred.
- The task estimate is required; a profile default is not silently substituted.
- The horizon ends at the task deadline (or a bounded explicit window), is
  capped at 14 days, and uses the profile timezone/working hours.
- Hidden calendars still block time. Recurrence and provider exceptions must be
  expanded in shared domain code before candidates are generated.
- Confirmation targets only the provisioned internal default BCal calendar in
  Sprint 6 v1. The client sends a persisted suggestion ID; the server reloads
  the request, suggestion, task, profile, default calendar, and current busy
  events, then reuses the deterministic availability engine to revalidate the
  exact persisted slot. The final transaction also expands the supported
  recurrence representation and provider exceptions while holding the
  per-user event-write lock, so a recurring occurrence cannot be missed in the
  revalidation/commit race. One transaction creates the internal event, links
  the task, marks the suggestion/request accepted, and stores the canonical
  event ID. A repeated confirmation returns that event and creates no duplicate.
  Empty events do not block without a buffer, matching interval normalization;
  a positive buffer grows an empty event into a point blocker. Pro is checked
  when the proposal is generated; Phase 4 intentionally grandfathered that
  persisted proposal through confirmation so it does not invent the Phase 5
  billing dependency.
- Provider-calendar targets are outside Sprint 6 v1. Any later provider target
  must use the existing provider-first write architecture.

## Autonomy

v1 proposes only. "Auto-schedule flexible tasks" is a later opt-in, and requires
an undo history before it ships.
