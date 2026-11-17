-- Additive migration: old Netlify code continues to read public.records directly.
-- PostgREST returns one JSON value, so its row limit cannot truncate the list.
create or replace function public.public_records_since(p_cutoff timestamptz)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  with active as (
    select id, group_key,
      case when group_key = 'blessings' and minor_key = '' then 'personal' else minor_key end as minor_key,
      name, name_key, submitted_at
    from public.records
    where submitted_at >= p_cutoff
  ), ranked as (
    select *, row_number() over (
      partition by group_key, minor_key, name_key
      order by submitted_at desc, id desc
    ) as position
    from active
  )
  select coalesce(
    jsonb_agg(jsonb_build_array(group_key, minor_key, name) order by submitted_at desc, id desc),
    '[]'::jsonb
  )
  from ranked
  where position = 1;
$$;
revoke all on function public.public_records_since(timestamptz) from public, anon, authenticated;
grant execute on function public.public_records_since(timestamptz) to service_role;
