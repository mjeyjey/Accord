create table if not exists public.trash (
  id uuid primary key default gen_random_uuid(),
  entity text not null,
  label text,
  payload jsonb not null,
  deleted_by uuid,
  deleted_by_name text,
  deleted_at timestamptz not null default now()
);

alter table public.trash enable row level security;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_read_idx on public.notifications (user_id, read);
alter table public.notifications enable row level security;

notify pgrst, 'reload schema';
