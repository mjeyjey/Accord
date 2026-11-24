-- Converts the old 1:00 to 5:00 PM availability into the new 12:00 to 7:00 PM window
update public.availability set start_time = '12:00' where start_time = '13:00';
update public.availability set end_time   = '19:00' where end_time   = '17:00';
