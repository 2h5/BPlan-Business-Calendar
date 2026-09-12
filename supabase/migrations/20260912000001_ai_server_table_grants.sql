-- The Find Time Edge Functions use the server-only service_role client for
-- context reads and for persisting model proposals.  RLS does not grant table
-- privileges, and this project intentionally created its tables without the
-- default service_role grants.  Keep these grants scoped to the tables and
-- operations used by ai-find-time and ai-confirm-time; the service-role key is
-- never shipped to either client.

grant select on table
  public.profiles,
  public.calendars,
  public.events,
  public.tasks,
  public.ai_schedule_requests,
  public.ai_schedule_suggestions
  to service_role;

grant update on table public.ai_schedule_requests to service_role;

grant insert on table public.ai_schedule_suggestions to service_role;
