-- ============================================================================
-- profiles.preferences: defaults, shape constraints, and owner-only access.
-- Run with: supabase test db
-- ============================================================================

begin;
create extension if not exists pgtap;

select plan(6);

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000',
   '61616161-6161-6161-6161-616161616161',
   'authenticated', 'authenticated', 'prefs-alice@example.com', now(), now()),
  ('00000000-0000-0000-0000-000000000000',
   '62626262-6262-6262-6262-626262626262',
   'authenticated', 'authenticated', 'prefs-bob@example.com', now(), now());

select is(
  (select preferences from public.profiles where id = '61616161-6161-6161-6161-616161616161'),
  '{}'::jsonb,
  'new profiles start with empty preferences'
);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"61616161-6161-6161-6161-616161616161","role":"authenticated"}', true);

select lives_ok(
  $$update public.profiles
      set preferences = '{"accountMenuTrigger":"hover"}'::jsonb
    where id = '61616161-6161-6161-6161-616161616161'$$,
  'a user can update their own preferences'
);

select throws_ok(
  $$update public.profiles
      set preferences = '["not","an","object"]'::jsonb
    where id = '61616161-6161-6161-6161-616161616161'$$,
  '23514',
  null,
  'preferences must be a JSON object'
);

select throws_ok(
  format(
    $$update public.profiles set preferences = jsonb_build_object('blob', %L)
       where id = '61616161-6161-6161-6161-616161616161'$$,
    (select string_agg(md5(i::text), '') from generate_series(1, 1000) as i)
  ),
  '23514',
  null,
  'preferences are size-limited'
);

update public.profiles
   set preferences = '{"accountMenuTrigger":"hover"}'::jsonb
 where id = '62626262-6262-6262-6262-626262626262';

select is_empty(
  $$select 1 from public.profiles where id = '62626262-6262-6262-6262-626262626262'$$,
  'a user cannot read another user''s preferences'
);

reset role;

select is(
  (select preferences from public.profiles where id = '62626262-6262-6262-6262-626262626262'),
  '{}'::jsonb,
  'a user cannot update another user''s preferences'
);

select * from finish();
rollback;
