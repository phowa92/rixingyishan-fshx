-- Use only after the website has been reverted to the previous public-list query.
drop function if exists public.public_records_since(timestamptz);
