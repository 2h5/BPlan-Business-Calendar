-- Scheduled-job installers must actually install when their prerequisites
-- exist. An earlier guard reported pg_cron missing even when it was installed,
-- and the looser assertion elsewhere accepted that outcome.
begin;
create extension if not exists pgtap;
select plan(14);

select ok(
  not has_function_privilege('service_role', 'public.ensure_sync_schedules()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.ensure_sync_schedules()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.ensure_sync_schedules()', 'EXECUTE'),
  'only an operator (the owner) can install the sync schedules'
);

-- Everything below is rolled back with the transaction.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select is(
  public.ensure_sync_schedules(),
  'MISSING_VAULT_SECRETS',
  'the sync installer names missing Vault secrets once the extensions exist'
);
select is(
  public.ensure_revenuecat_reconcile_schedule(),
  'MISSING_VAULT_SECRETS',
  'the billing installer names missing Vault secrets once the extensions exist'
);

select vault.create_secret('https://example.supabase.co/functions/v1/sync-cron?x=1', 'sync_cron_url');
select vault.create_secret('sync-secret-value-for-test', 'sync_cron_secret');
select is(
  public.ensure_sync_schedules(),
  'INVALID_SYNC_CRON_URL',
  'a sync URL that is not exactly the sync-cron function is refused'
);

select vault.update_secret(
  (select id from vault.decrypted_secrets where name = 'sync_cron_url'),
  'https://example.supabase.co/functions/v1/sync-cron'
);
select is(public.ensure_sync_schedules(), 'INSTALLED', 'the sync schedules install');
select is(public.ensure_sync_schedules(), 'INSTALLED', 'reinstalling is idempotent');

select is(
  (select count(*)::int from cron.job
    where jobname in ('sync-renew-watches', 'sync-retry-failed', 'sync-reconcile', 'sync-prune')),
  4,
  'exactly the four sync jobs exist after two installs'
);
select is(
  (select schedule from cron.job where jobname = 'sync-retry-failed'),
  '*/15 * * * *',
  'the retry job keeps its fifteen-minute cadence'
);
select ok(
  (select bool_and(command like '%?task=' || replace(jobname, 'sync-', '') || '''%')
     from cron.job where jobname like 'sync-%'),
  'each sync job calls its own task'
);
select ok(
  (select bool_and(command not like '%sync-secret-value-for-test%'
                   and command like '%timeout_milliseconds := 55000%')
     from cron.job where jobname like 'sync-%'),
  'sync jobs read the secret from Vault at run time and wait long enough for a drain'
);

select vault.create_secret(
  'https://example.supabase.co/functions/v1/revenuecat-reconcile', 'revenuecat_reconcile_url');
select vault.create_secret('billing-secret-value-for-test', 'billing_reconcile_cron_secret');
select is(
  public.ensure_revenuecat_reconcile_schedule(),
  'INSTALLED',
  'the billing reconciliation schedule installs when pg_cron is present'
);
select is(
  (select schedule from cron.job where jobname = 'revenuecat-reconcile'),
  '*/5 * * * *',
  'billing reconciliation runs every five minutes'
);
select ok(
  (select command not like '%billing-secret-value-for-test%'
     from cron.job where jobname = 'revenuecat-reconcile'),
  'the billing job does not copy its secret into cron.job'
);
select ok(
  (public.revenuecat_billing_health() -> 'schedule' ->> 'installed')::boolean,
  'the billing health report sees the installed schedule'
);

select * from finish();
rollback;
