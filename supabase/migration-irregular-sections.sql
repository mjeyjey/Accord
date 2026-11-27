alter table public.sections
  add column if not exists is_special boolean not null default false;

drop table if exists public.special_exams;

notify pgrst, 'reload schema';
