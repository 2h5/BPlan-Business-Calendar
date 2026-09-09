-- ============================================================================
-- RevenueCat webhook ledger privileges.
--
-- The webhook uses the service-role client for its server-only ledger. RLS
-- remains enabled with no browser policies; these grants only allow the
-- webhook's conflict-safe insert/upsert path to operate.
-- ============================================================================

grant insert on table public.subscription_events to service_role;
