-- Per-user app behavior preferences (menus, keyboard shortcuts, ...).
--
-- Stored as one JSON object so a new preference never needs a migration. The
-- shape is owned by `appPreferencesSchema` in @cal/schemas: clients validate on
-- read with per-field defaults, so unknown or stale keys are harmless. The
-- database only guarantees it is an object and stays small.
--
-- The existing profiles RLS policies (own row only, for select / insert /
-- update / delete) and the authenticated table grant already cover this column.
alter table public.profiles
  add column preferences jsonb not null default '{}'::jsonb
    constraint profiles_preferences_is_object
      check (jsonb_typeof(preferences) = 'object')
    constraint profiles_preferences_size
      check (pg_column_size(preferences) <= 16384);

comment on column public.profiles.preferences is
  'Per-user app behavior preferences. Shape: appPreferencesSchema in @cal/schemas.';
