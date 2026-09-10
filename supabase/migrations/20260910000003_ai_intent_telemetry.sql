-- Forward migration for Intent Observability & Data Minimization
-- 1. Adds dedicated intent telemetry columns to public.ai_schedule_requests so that
--    two-stage natural-language requests (intent parsing + candidate ranking) track
--    both model calls independently without telemetry overwrites.
-- 2. Updates the ai_schedule_requests_target_check constraint to allow clearing raw_text
--    (data minimization) once intent parsing completes or fails, while preserving
--    the validated parsed_intent, ad_hoc_title/duration, and error state.

alter table public.ai_schedule_requests
  add column if not exists intent_provider text,
  add column if not exists intent_model text,
  add column if not exists intent_prompt_version text,
  add column if not exists intent_latency_ms integer,
  add column if not exists intent_input_tokens integer,
  add column if not exists intent_output_tokens integer,
  add column if not exists intent_reasoning_tokens integer,
  add column if not exists intent_total_tokens integer;

alter table public.ai_schedule_requests
  add constraint ai_request_intent_latency_nonnegative
    check (intent_latency_ms is null or intent_latency_ms >= 0),
  add constraint ai_request_intent_input_tokens_nonnegative
    check (intent_input_tokens is null or intent_input_tokens >= 0),
  add constraint ai_request_intent_output_tokens_nonnegative
    check (intent_output_tokens is null or intent_output_tokens >= 0),
  add constraint ai_request_intent_reasoning_tokens_nonnegative
    check (intent_reasoning_tokens is null or intent_reasoning_tokens >= 0),
  add constraint ai_request_intent_total_tokens_nonnegative
    check (intent_total_tokens is null or intent_total_tokens >= 0);

comment on column public.ai_schedule_requests.intent_provider is
  'AI provider that performed natural-language intent parsing (e.g. openai).';
comment on column public.ai_schedule_requests.intent_model is
  'AI model used for intent parsing (e.g. gpt-5.6-luna).';
comment on column public.ai_schedule_requests.intent_prompt_version is
  'Prompt template version for intent parsing.';
comment on column public.ai_schedule_requests.intent_latency_ms is
  'End-to-end network latency in milliseconds for intent parsing.';
comment on column public.ai_schedule_requests.intent_input_tokens is
  'Prompt tokens billed for intent parsing.';
comment on column public.ai_schedule_requests.intent_output_tokens is
  'Completion tokens billed for intent parsing.';
comment on column public.ai_schedule_requests.intent_reasoning_tokens is
  'Reasoning tokens billed for intent parsing.';
comment on column public.ai_schedule_requests.intent_total_tokens is
  'Total tokens billed for intent parsing.';

-- Update the target check to support data minimization:
-- raw_text is stored on initial claim, but cleared to null once intent parsing succeeds
-- or fails, leaving parsed_intent, ad_hoc_title/duration, or failed status.
alter table public.ai_schedule_requests
  drop constraint if exists ai_schedule_requests_target_check;

alter table public.ai_schedule_requests
  add constraint ai_schedule_requests_target_check check (
    (
      task_id is not null
      and ad_hoc_title is null
      and ad_hoc_duration_minutes is null
      and raw_text is null
    )
    or (
      task_id is null
      and (
        (ad_hoc_title is not null and ad_hoc_duration_minutes is not null)
        or raw_text is not null
        or parsed_intent is not null
        or status in ('proposed', 'failed')
      )
    )
  );
