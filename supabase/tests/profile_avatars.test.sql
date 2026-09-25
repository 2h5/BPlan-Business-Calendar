-- ============================================================================
-- avatars bucket: public reads, owner-only writes inside the user's own folder.
-- Run with: supabase test db
-- ============================================================================

begin;
create extension if not exists pgtap;

select plan(8);

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000',
   '71717171-7171-7171-7171-717171717171',
   'authenticated', 'authenticated', 'avatar-alice@example.com', now(), now()),
  ('00000000-0000-0000-0000-000000000000',
   '72727272-7272-7272-7272-727272727272',
   'authenticated', 'authenticated', 'avatar-bob@example.com', now(), now());

select ok(
  (select public from storage.buckets where id = 'avatars'),
  'the avatars bucket exists and is public for reads'
);

select is(
  (select file_size_limit from storage.buckets where id = 'avatars'),
  2097152::bigint,
  'the avatars bucket caps uploads at 2 MiB'
);

-- Bob already has a photo, written with elevated rights.
insert into storage.objects (bucket_id, name, owner)
values ('avatars', '72727272-7272-7272-7272-727272727272/avatar',
        '72727272-7272-7272-7272-727272727272');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"71717171-7171-7171-7171-717171717171","role":"authenticated"}', true);

select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner)
    values ('avatars', '71717171-7171-7171-7171-717171717171/avatar',
            '71717171-7171-7171-7171-717171717171')$$,
  'a user can upload into their own folder'
);

select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner)
    values ('avatars', '72727272-7272-7272-7272-727272727272/avatar-2',
            '71717171-7171-7171-7171-717171717171')$$,
  '42501',
  null,
  'a user cannot upload into another user''s folder'
);

select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner)
    values ('avatars', 'avatar', '71717171-7171-7171-7171-717171717171')$$,
  '42501',
  null,
  'a user cannot upload outside any user folder'
);

select is_empty(
  $$select 1 from storage.objects
     where bucket_id = 'avatars'
       and name = '72727272-7272-7272-7272-727272727272/avatar'$$,
  'a user cannot list another user''s avatar object'
);

update storage.objects
   set metadata = '{"hijacked":true}'::jsonb
 where bucket_id = 'avatars'
   and name = '72727272-7272-7272-7272-727272727272/avatar';

reset role;

select is(
  (select metadata from storage.objects
    where bucket_id = 'avatars'
      and name = '72727272-7272-7272-7272-727272727272/avatar'),
  null,
  'a user cannot overwrite another user''s avatar'
);

-- Storage forbids direct SQL deletes (storage.protect_delete); removals go
-- through the Storage API, which applies this policy. Assert its scope.
select ok(
  (select qual like '%avatars%' and qual like '%foldername%' and qual like '%auth.uid()%'
     from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'avatars: owner can delete'
      and cmd = 'DELETE'
      and roles = '{authenticated}'),
  'avatar deletes are limited to the owner''s own folder'
);

select * from finish();
rollback;
