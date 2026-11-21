-- notifications: what kind of notification it is (used for click-through)
alter table public.notifications add column if not exists kind text not null default 'info';

-- bulletin (announcements). department_id null = everyone
create table if not exists public.bulletins (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  department_id uuid references public.departments(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now()
);
create index if not exists bulletins_dept_idx on public.bulletins (department_id, created_at desc);
alter table public.bulletins enable row level security;

-- audit_log -> profiles
update public.audit_log set user_id = null
  where user_id is not null and user_id not in (select id from public.profiles);
alter table public.audit_log drop constraint if exists audit_log_user_id_fkey;
alter table public.audit_log add constraint audit_log_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete set null;
create index if not exists audit_log_user_idx on public.audit_log (user_id);
create index if not exists audit_log_created_idx on public.audit_log (created_at desc);

-- trash -> profiles
update public.trash set deleted_by = null
  where deleted_by is not null and deleted_by not in (select id from public.profiles);
alter table public.trash drop constraint if exists trash_deleted_by_fkey;
alter table public.trash add constraint trash_deleted_by_fkey
  foreign key (deleted_by) references public.profiles(id) on delete set null;

notify pgrst, 'reload schema';
