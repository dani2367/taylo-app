create table public.email_seen (
  user_id uuid not null references public.profiles (id) on delete cascade,
  message_id text not null,
  subject text,
  disposition text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, message_id)
);

create index email_seen_user_id_idx on public.email_seen (user_id);

alter table public.email_seen enable row level security;

create policy "own email_seen"
  on public.email_seen
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.email_seen to authenticated;
grant all on public.email_seen to service_role;

do $$
begin
  perform cron.unschedule('outlook-sync-every-10-minutes');
exception when others then
  null;
end $$;

do $$
begin
  perform cron.unschedule('outlook-calendar-sync-every-30-minutes');
exception when others then
  null;
end $$;

select cron.schedule(
  'outlook-sync-hourly',
  '0 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/outlook-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key'),
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) as request_id;
  $$
);

select cron.schedule(
  'outlook-calendar-sync-every-2-hours',
  '0 */2 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/outlook-calendar-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key'),
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) as request_id;
  $$
);
