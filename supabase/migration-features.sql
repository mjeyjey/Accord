-- Account approval
alter table public.profiles add column if not exists status text not null default 'active';
alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles add constraint profiles_status_check check (status in ('pending','active'));
alter table public.profiles add column if not exists created_at timestamptz not null default now();

-- Bulletin kind (so exam period announcements can link to availability)
alter table public.bulletins add column if not exists kind text not null default 'info';

-- OTP codes
create table if not exists public.otp_codes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  purpose text not null,
  code_hash text not null,
  attempts int not null default 0,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists otp_codes_idx on public.otp_codes (email, purpose);
alter table public.otp_codes enable row level security;

-- A login session is trusted only after its OTP has been entered.
create table if not exists public.otp_sessions (
  session_id text primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.otp_sessions enable row level security;

notify pgrst, 'reload schema';
