-- ============================================================================
-- Restrict RevenueCat entitlement RPCs to the server role.
--
-- SECURITY DEFINER functions must not retain the implicit PUBLIC EXECUTE grant.
-- The webhook and server-side Pro gates call these through service_role; browser
-- roles must not be able to invoke them directly.
-- ============================================================================

revoke execute on function public.apply_revenuecat_event(
  uuid, text, text, timestamptz, timestamptz, text
) from public, anon, authenticated;
grant execute on function public.apply_revenuecat_event(
  uuid, text, text, timestamptz, timestamptz, text
) to service_role;

revoke execute on function public.has_active_entitlement(uuid, text)
  from public, anon, authenticated;
grant execute on function public.has_active_entitlement(uuid, text)
  to service_role;
