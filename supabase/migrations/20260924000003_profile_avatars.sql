-- Profile photos.
--
-- Each user owns exactly one object at `avatars/<user id>/avatar`, overwritten on
-- every upload, so storage never grows past one small image per user. Clients
-- resize to a 256px square WebP/JPEG before uploading, so objects are ~15-40 KB;
-- the bucket limits below are a server-side backstop, not the normal path.
--
-- The bucket is public for reads: avatars are shown wherever the user appears,
-- and the path is keyed by an unguessable UUID. Writes are owner-only.
-- profiles.avatar_url stores the public URL (with a version query string so a
-- new upload busts CDN and browser caches).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152, -- 2 MiB
  array['image/webp', 'image/jpeg', 'image/png']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Owner-only access to the user's own folder. Public URL reads bypass RLS, but
-- an upsert (overwrite) needs select on the existing object, so it is explicit.
create policy "avatars: owner can select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "avatars: owner can insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "avatars: owner can update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "avatars: owner can delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
