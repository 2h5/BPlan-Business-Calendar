-- ============================================================================
-- 0019 — Provider-neutral OAuth return targets.
--
-- OAuth handshakes are server-owned and short-lived. Persisting the small
-- allowlisted target here lets one callback safely serve both the native app
-- and the browser without accepting a client-supplied URL.
-- ============================================================================

alter table public.oauth_states
  add column return_target text not null default 'mobile';

alter table public.oauth_states
  add constraint oauth_states_return_target_check
  check (return_target in ('mobile', 'web'));

comment on column public.oauth_states.return_target is
  'Allowlisted OAuth callback destination: mobile or web. Server-only.';
