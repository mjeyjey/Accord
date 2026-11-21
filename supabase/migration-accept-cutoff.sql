alter table public.exam_periods
  add column if not exists accept_cutoff_hours integer not null default 1
  check (accept_cutoff_hours >= 0 and accept_cutoff_hours <= 168);

notify pgrst, 'reload schema';