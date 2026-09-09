-- ============================================================================
-- RevenueCat webhook ledger upsert privilege.
--
-- PostgreSQL requires SELECT for the conflict-safe ON CONFLICT path used by
-- the webhook's insert-if-new operation. The table remains server-only.
-- ============================================================================

grant select on table public.subscription_events to service_role;
