-- ============================================================================
-- Security boundary hardening for client-owned relationship writes.
--
-- A child row's user_id does not by itself protect foreign-key relationships:
-- without these checks a user could attach their row to another user's
-- calendar, provider account, list, or event. Keep the existing delete/null
-- behavior; enforce ownership only at the authenticated write boundary.
-- ============================================================================

drop policy if exists "Users insert their own calendars" on public.calendars;
create policy "Users insert their own calendars"
  on public.calendars for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (
      provider_account_id is null
      or exists (
        select 1
        from public.provider_accounts pa
        where pa.id = calendars.provider_account_id
          and pa.user_id = (select auth.uid())
      )
    )
  );

drop policy if exists "Users update their own calendars" on public.calendars;
create policy "Users update their own calendars"
  on public.calendars for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (
      provider_account_id is null
      or exists (
        select 1
        from public.provider_accounts pa
        where pa.id = calendars.provider_account_id
          and pa.user_id = (select auth.uid())
      )
    )
  );

drop policy if exists "Users insert their own events" on public.events;
create policy "Users insert their own events"
  on public.events for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.calendars c
      where c.id = events.calendar_id
        and c.user_id = (select auth.uid())
    )
    and (
      provider_account_id is null
      or exists (
        select 1
        from public.provider_accounts pa
        where pa.id = events.provider_account_id
          and pa.user_id = (select auth.uid())
      )
    )
    and (
      provider_account_id is null
      or exists (
        select 1
        from public.calendars c
        where c.id = events.calendar_id
          and c.user_id = (select auth.uid())
          and c.provider_account_id = events.provider_account_id
      )
    )
  );

drop policy if exists "Users update their own events" on public.events;
create policy "Users update their own events"
  on public.events for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.calendars c
      where c.id = events.calendar_id
        and c.user_id = (select auth.uid())
    )
    and (
      provider_account_id is null
      or exists (
        select 1
        from public.provider_accounts pa
        where pa.id = events.provider_account_id
          and pa.user_id = (select auth.uid())
      )
    )
    and (
      provider_account_id is null
      or exists (
        select 1
        from public.calendars c
        where c.id = events.calendar_id
          and c.user_id = (select auth.uid())
          and c.provider_account_id = events.provider_account_id
      )
    )
  );

drop policy if exists "Users insert their own tasks" on public.tasks;
create policy "Users insert their own tasks"
  on public.tasks for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (
      list_id is null
      or exists (
        select 1
        from public.task_lists l
        where l.id = tasks.list_id
          and l.user_id = (select auth.uid())
      )
    )
    and (
      scheduled_event_id is null
      or exists (
        select 1
        from public.events e
        where e.id = tasks.scheduled_event_id
          and e.user_id = (select auth.uid())
      )
    )
  );

drop policy if exists "Users update their own tasks" on public.tasks;
create policy "Users update their own tasks"
  on public.tasks for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (
      list_id is null
      or exists (
        select 1
        from public.task_lists l
        where l.id = tasks.list_id
          and l.user_id = (select auth.uid())
      )
    )
    and (
      scheduled_event_id is null
      or exists (
        select 1
        from public.events e
        where e.id = tasks.scheduled_event_id
          and e.user_id = (select auth.uid())
      )
    )
  );

-- Trigger functions are invoked by their triggers, not by client SQL calls.
-- Remove the default PUBLIC EXECUTE privilege from these SECURITY DEFINER
-- functions without changing trigger execution.
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.create_default_calendar() from public, anon, authenticated;
