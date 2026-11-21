alter table public.rooms
  add column if not exists department_id uuid references public.departments(id) on delete set null;

alter table public.departments
  add column if not exists logo_url text;

notify pgrst, 'reload schema';