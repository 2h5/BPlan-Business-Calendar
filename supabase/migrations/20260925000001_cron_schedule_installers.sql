-- ============================================================================
-- Working pg_cron schedule installers for sync and billing.
--
-- Two defects left every scheduled job uninstallable:
--
-- 1. `to_regproc('cron.schedule')` is NULL even when pg_cron is installed,
--    because pg_cron ships two overloads of `cron.schedule` and to_regproc
--    returns NULL for an ambiguous name. Both 0007 and
--    `ensure_revenuecat_reconcile_schedule()` used that guard, so they always
--    reported the extension as missing. The guard now names the exact
--    signature with to_regprocedure.
--
-- 2. 0007 read its URL and secret from `app.settings.*`, which the hosted
--    `postgres` role cannot set on Postgres 15+ ("permission denied to set
--    parameter"), and it copied the secret into `cron.job`. Sync schedules now
--    follow the billing pattern: an idempotent operator-run installer, with
--    the URL and secret read from Vault each time a job runs.
--
-- Operator setup (as postgres, once pg_cron and pg_net are enabled):
--
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/sync-cron', 'sync_cron_url');
--   select vault.create_secret('<same value as SYNC_CRON_SECRET>', 'sync_cron_secret');
--   select public.ensure_sync_schedules();
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Sync schedules (docs/sync-engine.md § Cron jobs).
-- ---------------------------------------------------------------------------
create function public.ensure_sync_schedules()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
  v_job record;
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null
     or to_regproc('net.http_post') is null then
    return 'EXTENSIONS_UNAVAILABLE';
  end if;
  if to_regclass('vault.decrypted_secrets') is null then
    return 'VAULT_UNAVAILABLE';
  end if;

  execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'sync_cron_url'$q$
    into v_url;
  execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'sync_cron_secret'$q$
    into v_secret;
  if coalesce(v_url, '') = '' or coalesce(v_secret, '') = '' then
    return 'MISSING_VAULT_SECRETS';
  end if;
  if v_url !~ '^https?://[^[:space:]?#]+/sync-cron$' then
    return 'INVALID_SYNC_CRON_URL';
  end if;

  -- Same names as 0007, so a legacy job that embedded the secret is replaced.
  -- The timeout keeps pg_net waiting while the function drains its batch.
  for v_job in
    select * from (values
      ('sync-renew-watches', '7 * * * *',    'renew-watches'),
      ('sync-retry-failed',  '*/15 * * * *', 'retry-failed'),
      ('sync-reconcile',     '20 4 * * *',   'reconcile'),
      ('sync-prune',         '40 5 * * *',   'prune')
    ) as jobs(name, schedule, task)
  loop
    execute format(
      $q$select cron.schedule(%L, %L, %L)$q$,
      v_job.name,
      v_job.schedule,
      format(
        $cmd$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets
               where name = 'sync_cron_url') || %L,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Sync-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets
                                where name = 'sync_cron_secret')),
      body := '{}'::jsonb,
      timeout_milliseconds := 55000
    )
  $cmd$,
        '?task=' || v_job.task
      )
    );
  end loop;

  return 'INSTALLED';
end;
$$;

revoke execute on function public.ensure_sync_schedules()
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Billing reconciliation: same body as 20260924000001, with the working guard.
-- CREATE OR REPLACE keeps the existing (revoked) privileges.
-- ---------------------------------------------------------------------------
create or replace function public.ensure_revenuecat_reconcile_schedule()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null
     or to_regproc('net.http_post') is null then
    return 'EXTENSIONS_UNAVAILABLE';
  end if;
  if to_regclass('vault.decrypted_secrets') is null then
    return 'VAULT_UNAVAILABLE';
  end if;

  execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'revenuecat_reconcile_url'$q$
    into v_url;
  execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'billing_reconcile_cron_secret'$q$
    into v_secret;
  if coalesce(v_url, '') = '' or coalesce(v_secret, '') = '' then
    return 'MISSING_VAULT_SECRETS';
  end if;
  if v_url !~ '^https?://[^[:space:]]+/revenuecat-reconcile$' then
    return 'INVALID_RECONCILE_URL';
  end if;

  -- cron.schedule replaces a job with the same name.
  execute $q$select cron.schedule('revenuecat-reconcile', '*/5 * * * *', $cmd$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets
               where name = 'revenuecat_reconcile_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Billing-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets
                                   where name = 'billing_reconcile_cron_secret')),
      body := '{}'::jsonb,
      timeout_milliseconds := 55000
    )
  $cmd$)$q$;

  return 'INSTALLED';
end;
$$;

do $$
begin
  raise notice 'Sync schedules: %', public.ensure_sync_schedules();
  raise notice 'RevenueCat reconciliation schedule: %', public.ensure_revenuecat_reconcile_schedule();
end;
$$;
