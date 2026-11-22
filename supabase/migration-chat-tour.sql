-- Private chat and first-login tour
alter table public.profiles add column if not exists tour_seen_at timestamptz;

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint chat_messages_body_length check (char_length(body) <= 1000),
  constraint chat_messages_not_self check (sender_id <> recipient_id)
);

create index if not exists chat_messages_recipient_idx on public.chat_messages (recipient_id, read_at);
create index if not exists chat_messages_thread_idx on public.chat_messages (sender_id, recipient_id, created_at desc);
alter table public.chat_messages enable row level security;

notify pgrst, 'reload schema';
