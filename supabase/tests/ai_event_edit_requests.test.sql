begin;

create extension if not exists pgtap;

select plan(4);

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
values (
  '00000000-0000-0000-0000-000000000000',
  '91919191-9191-9191-9191-919191919191',
  'authenticated',
  'authenticated',
  'ai_event_edit_test@example.com',
  now(),
  now()
);

insert into public.ai_schedule_requests (id, user_id, raw_text, status)
values (
  '81818181-8181-8181-8181-818181818181',
  '91919191-9191-9191-9191-919191919191',
  'find time for lunch',
  'pending'
);

select is(
  (select request_kind from public.ai_schedule_requests
   where id = '81818181-8181-8181-8181-818181818181'),
  'find_time',
  'existing Find Time inserts retain the default request kind'
);

select lives_ok(
  $$insert into public.ai_schedule_requests (user_id, raw_text, status, request_kind)
    values ('91919191-9191-9191-9191-919191919191',
            'move lunch to Friday', 'pending', 'move_event')$$,
  'an Event Edit request can use the shared request table'
);

select is(
  (select count(*)::integer from public.ai_schedule_requests
   where user_id = '91919191-9191-9191-9191-919191919191'
     and request_kind = 'move_event'),
  1,
  'Event Edit requests remain distinguishable from Find Time requests'
);

select throws_ok(
  $$insert into public.ai_schedule_requests (user_id, raw_text, status, request_kind)
    values ('91919191-9191-9191-9191-919191919191',
            'unknown request', 'pending', 'unknown')$$,
  '23514',
  null,
  'unknown request kinds are rejected'
);

select * from finish();
rollback;
