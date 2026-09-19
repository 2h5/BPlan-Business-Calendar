-- The read-only billing assertion uses the tooling-only service_role client to
-- compare RevenueCat state with the subscription mirror. RLS remains enabled;
-- grant only the table privilege required for that server-side read.

grant select on table public.subscriptions to service_role;
