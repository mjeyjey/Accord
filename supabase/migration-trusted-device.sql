-- Trusted devices (skip OTP for 14 days on a device the user trusted)
create table if not exists public.trusted_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token_hash text not null unique,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at timestamptz not null
);
create index if not exists trusted_devices_user_idx on public.trusted_devices (user_id, expires_at);
alter table public.trusted_devices enable row level security;

-- OTP sessions expire after 24 hours.
alter table public.otp_sessions
  add column if not exists expires_at timestamptz not null default (now() + interval '24 hours');
create index if not exists otp_sessions_user_idx on public.otp_sessions (user_id);
delete from public.otp_sessions where created_at < now() - interval '2 days';

notify pgrst, 'reload schema';
