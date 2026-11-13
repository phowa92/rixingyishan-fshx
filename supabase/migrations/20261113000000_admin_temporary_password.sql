alter table public.admin_accounts
  add column if not exists temporary_password_hash text,
  add column if not exists temporary_password_expires_at timestamptz,
  add column if not exists password_reset_requested_at timestamptz;
