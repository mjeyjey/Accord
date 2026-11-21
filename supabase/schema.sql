-- Exam Scheduler schema. Run once in Supabase > SQL Editor.
create extension if not exists "pgcrypto";

create table departments (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  logo_url text
);

create table programs (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references departments(id) on delete cascade,
  code text unique not null,
  name text not null,
  floor text not null default 'Ground' check (floor in ('Ground','1st','2nd','3rd','4th','5th'))
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text,
  avatar_url text,
  role text not null check (role in ('admin','head','proctor')),
  department_id uuid references departments(id) on delete set null
);

create table subjects (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs(id) on delete cascade,
  year_level int not null check (year_level between 1 and 6),
  semester int not null default 1,
  code text not null,
  title text not null
);
create unique index subjects_uniq on subjects (program_id, year_level, semester, code);

create table sections (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs(id) on delete cascade,
  year_level int not null check (year_level between 1 and 6),
  name text not null,
  student_count int not null default 0 check (student_count >= 0),
  unique (program_id, year_level, name)
);

create table rooms (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  floor text not null check (floor in ('Ground','1st','2nd','3rd','4th','5th')),
  capacity int not null check (capacity > 0),
  department_id uuid references departments(id) on delete set null
);

create table availability (
  id uuid primary key default gen_random_uuid(),
  proctor_id uuid not null references profiles(id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,
  check (end_time > start_time)
);

create table exam_periods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date not null,
  end_date date not null,
  semester int not null default 1,
  days_per_year int not null default 2 check (days_per_year >= 1),
  program_ids uuid[] not null default '{}',
  status text not null default 'draft',
  created_at timestamptz not null default now()
);

create table schedules (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references exam_periods(id) on delete cascade,
  program_id uuid not null references programs(id) on delete cascade,
  section_id uuid not null references sections(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  room_id uuid references rooms(id) on delete set null,
  proctor_id uuid references profiles(id) on delete set null,
  exam_date date,
  start_time time,
  end_time time,
  status text not null default 'scheduled' check (status in ('scheduled','unscheduled')),
  reason text,
  emergency boolean not null default false,
  emergency_note text
);
create index on schedules (period_id);
create index on schedules (proctor_id);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete set null,
  user_name text,
  action text not null,
  entity text not null,
  details jsonb,
  created_at timestamptz not null default now()
);

create table trash (
  id uuid primary key default gen_random_uuid(),
  entity text not null,
  label text,
  payload jsonb not null,
  deleted_by uuid references profiles(id) on delete set null,
  deleted_by_name text,
  deleted_at timestamptz not null default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null default 'info',
  title text not null,
  body text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_user_read_idx on notifications (user_id, read);

create table bulletins (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  department_id uuid references departments(id) on delete cascade,
  created_by uuid references profiles(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now()
);
create index bulletins_dept_idx on bulletins (department_id, created_at desc);

-- All access goes through the Vercel API (service role). Block direct browser access.
alter table departments enable row level security;
alter table programs enable row level security;
alter table profiles enable row level security;
alter table subjects enable row level security;
alter table sections enable row level security;
alter table rooms enable row level security;
alter table availability enable row level security;
alter table exam_periods enable row level security;
alter table schedules enable row level security;
alter table audit_log enable row level security;
alter table trash enable row level security;
alter table notifications enable row level security;
alter table bulletins enable row level security;

-- Seed: departments
insert into departments (code, name) values
('EDUC','Education'),('CAD','AB English (CAD)'),('BSPSYCH','Psychology'),
('BSIS','Information Systems'),('BSBA','Business Administration'),('BSCRIM','Criminology'),
('BSHM','Hospitality Management'),('BSCE','Civil Engineering'),('BSA','Accountancy'),
('BSAIS','Accounting Information Systems');

-- Seed: programs
insert into programs (department_id, code, name)
select d.id, p.code, p.name from (values
('EDUC','BSED-SOC','BSED Major in Social Studies'),
('EDUC','BSED-VAL','BSED Major in Values Education'),
('EDUC','BSED-FIL','BSED Major in Filipino'),
('EDUC','BSED-MATH','BSED Major in Mathematics'),
('EDUC','BSED-SCI','BSED Major in Science'),
('EDUC','BSED-ENG','BSED Major in English'),
('EDUC','BEED','Bachelor of Elementary Education'),
('EDUC','BPE','Bachelor of Physical Education'),
('CAD','ABENG','AB English'),
('BSPSYCH','BSPSYCH','BS Psychology'),
('BSIS','BSIS','BS Information Systems'),
('BSBA','BSBA-MKT','BSBA Major in Marketing'),
('BSBA','BSBA-HRM','BSBA Major in HRM'),
('BSBA','BSBA-FM','BSBA Major in Financial Management'),
('BSCRIM','BSCRIM','BS Criminology'),
('BSHM','BSHM','BS Hospitality Management'),
('BSCE','BSCE','BS Civil Engineering'),
('BSA','BSA','BS Accountancy'),
('BSAIS','BSAIS','BS Accounting Information Systems')
) as p(dept, code, name) join departments d on d.code = p.dept;

update programs set floor = '3rd' where code in ('BSIS','BSCRIM');

-- Seed: sample rooms (edit later in the app)
insert into rooms (name, floor, capacity) values ('B01','Ground',55),('101','1st',50),('301','3rd',45);
