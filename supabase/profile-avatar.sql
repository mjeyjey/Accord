-- Run once in Supabase > SQL Editor to enable profile pictures.
alter table public.profiles add column if not exists avatar_url text;
