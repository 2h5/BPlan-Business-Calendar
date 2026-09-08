-- OAuth return-target boundary regression tests.

begin;
create extension if not exists pgtap;
select plan(8);

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
values (
  '00000000-0000-0000-0000-000000000000',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'authenticated',
  'authenticated',
  'oauth-target@example.com',
  now(),
  now()
);

select ok(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'oauth_states'
      and column_name = 'return_target'
      and is_nullable = 'NO'
  ),
  'oauth_states has a required return_target column'
);

insert into public.oauth_states (user_id, provider, state, code_verifier, redirect_uri)
values (
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'google',
  'oauth-target-default',
  'verifier-default',
  'https://project.supabase.co/functions/v1/oauth-google-callback'
);

select is(
  (select return_target from public.oauth_states where state = 'oauth-target-default'),
  'mobile',
  'omitted return_target preserves mobile behavior'
);

insert into public.oauth_states (user_id, provider, state, code_verifier, redirect_uri, return_target)
values (
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'microsoft',
  'oauth-target-web',
  'verifier-web',
  'https://project.supabase.co/functions/v1/oauth-microsoft-callback',
  'web'
);

select is(
  (select return_target from public.oauth_states where state = 'oauth-target-web'),
  'web',
  'web return_target is accepted'
);

select throws_ok(
  $$insert into public.oauth_states (
      user_id, provider, state, code_verifier, redirect_uri, return_target
    ) values (
      'cccccccc-cccc-cccc-cccc-cccccccccccc', 'google', 'oauth-target-invalid',
      'verifier-invalid', 'https://project.supabase.co/callback', 'desktop'
    )$$,
  '23514',
  null,
  'unsupported return targets cannot be stored'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.oauth_states'::regclass),
  'oauth_states keeps RLS enabled'
);

select is(
  (select count(*)::int
   from pg_policies
   where schemaname = 'public' and tablename = 'oauth_states'),
  0,
  'oauth_states remains server-only without client policies'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';

select is(
  (select count(*)::int from public.oauth_states),
  0,
  'authenticated users cannot read OAuth handshakes'
);

select throws_ok(
  $$insert into public.oauth_states (
      user_id, provider, state, code_verifier, redirect_uri
    ) values (
      'cccccccc-cccc-cccc-cccc-cccccccccccc', 'google', 'oauth-target-client',
      'verifier-client', 'https://project.supabase.co/callback'
    )$$,
  '42501',
  null,
  'authenticated users cannot write OAuth handshakes'
);

reset role;
select * from finish();
rollback;
