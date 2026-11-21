-- Run once in Supabase > SQL Editor to upgrade an existing database.
-- The default semester keeps existing subject rows compatible with curriculum import.
alter table public.subjects
  add column if not exists semester int not null default 1;

-- Replace the older (program_id, code) uniqueness rule with the curriculum import key.
alter table public.subjects
  drop constraint if exists subjects_program_id_code_key;
create unique index if not exists subjects_uniq
  on public.subjects (program_id, year_level, semester, code);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_read_idx
  on public.notifications (user_id, read);
alter table public.notifications enable row level security;
