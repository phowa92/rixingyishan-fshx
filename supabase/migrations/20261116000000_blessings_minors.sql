alter table public.records drop constraint if exists records_check;
alter table public.records drop constraint if exists records_minor_key_check;
alter table public.records add constraint records_minor_key_check check (
  (group_key = 'departed' and minor_key in ('deceased', 'infants', 'animals'))
  or (group_key = 'patients' and minor_key = '')
  or (group_key = 'blessings' and minor_key in ('', 'personal', 'organization'))
);
