-- ============================================================================
-- 0021 — Client API privileges.
--
-- RLS policies decide which rows a signed-in user may access, but PostgREST
-- also requires table privileges for the `authenticated` role. The hosted
-- project was created from migrations without these explicit grants, so every
-- client query failed with 42501 even though the RLS policies were present.
-- Keep the grants limited to the operations exposed by the browser client.
-- ============================================================================

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.calendars to authenticated;
grant select, insert, update, delete on public.events to authenticated;
grant select, insert, update, delete on public.task_lists to authenticated;
grant select, insert, update, delete on public.tags to authenticated;
grant select, insert, update, delete on public.tasks to authenticated;
grant select, insert, delete on public.task_tags to authenticated;

grant select on public.provider_accounts_public to authenticated;
grant select on public.calendar_sync_health to authenticated;
grant select on public.ai_schedule_requests to authenticated;
grant select on public.ai_schedule_suggestions to authenticated;
grant select on public.subscriptions to authenticated;
