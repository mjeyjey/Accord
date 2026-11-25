alter table profiles add column if not exists skip_otp boolean not null default false;
alter table exam_periods add column if not exists dept_approvals uuid[] not null default '{}';
notify pgrst, 'reload schema';
