-- AI event edits ("move Vermont to Saturday") share the Find Time request log,
-- so both kinds of AI call count against one hourly limit and one audit trail.
-- The kind column keeps them apart for reporting; edit requests never carry
-- suggestions, and cannot be confirmed through ai-confirm-time.

alter table public.ai_schedule_requests
  add column request_kind text not null default 'find_time'
    constraint ai_schedule_requests_request_kind_check
      check (request_kind in ('find_time', 'move_event'));

comment on column public.ai_schedule_requests.request_kind is
  'find_time for slot proposals; move_event for AI event edits, which propose a move the client confirms.';
