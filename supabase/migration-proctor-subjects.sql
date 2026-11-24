create table if not exists public.proctor_subjects (
  proctor_id uuid not null references public.profiles(id) on delete cascade,
  subject_code text not null,
  primary key (proctor_id, subject_code)
);
alter table public.proctor_subjects enable row level security;
notify pgrst, 'reload schema';
