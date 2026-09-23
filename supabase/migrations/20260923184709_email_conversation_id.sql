alter table public.items
  add column if not exists conversation_id text;

alter table public.source_emails
  add column if not exists conversation_id text,
  add column if not exists message_id text;

create index if not exists items_user_conversation_idx
  on public.items (user_id, conversation_id)
  where conversation_id is not null;

create index if not exists source_emails_user_conversation_idx
  on public.source_emails (user_id, conversation_id)
  where conversation_id is not null;

create unique index if not exists source_emails_user_message_idx
  on public.source_emails (user_id, message_id)
  where message_id is not null;
