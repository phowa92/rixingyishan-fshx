import { createHash, randomBytes } from 'node:crypto';
import { request } from './shared.mjs';

const resetResponse = '如果该邮箱是管理员账户，请查收临时密码邮件。';
const hashPassword = password => createHash('sha256').update(password).digest('hex');

export async function sendTemporaryPassword(email) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ADMIN_RESET_FROM_EMAIL;
  if (!apiKey || !from) return null;

  const now = Date.now();
  const cutoff = encodeURIComponent(new Date(now - 5 * 60_000).toISOString());
  const password = randomBytes(24).toString('base64url');
  const hash = hashPassword(password);
  const accountPath = '/rest/v1/admin_accounts?email=eq.' + encodeURIComponent(email);
  const accounts = await request(accountPath + '&or=(password_reset_requested_at.is.null,password_reset_requested_at.lte.' + cutoff + ')', {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      temporary_password_hash: hash,
      temporary_password_expires_at: new Date(now + 30 * 60_000).toISOString(),
      password_reset_requested_at: new Date(now).toISOString()
    })
  });
  if (!accounts.length) return resetResponse;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [accounts[0].email],
        subject: '日行一善 · 后台临时密码',
        text: '您的后台临时密码为：' + password + '\n请在 30 分钟内前往 https://fshx.netlify.app/admin 登录，然后在后台修改自己的密码。'
      }),
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) throw new Error('Mail provider rejected request');
  } catch {
    await request(accountPath + '&temporary_password_hash=eq.' + hash, {
      method: 'PATCH',
      body: JSON.stringify({ temporary_password_hash: null, temporary_password_expires_at: null })
    });
    console.error('Unable to send admin temporary password');
  }
  return resetResponse;
}

export async function useTemporaryPassword(email, password) {
  if (typeof password !== 'string' || !/^[A-Za-z0-9_-]{32}$/.test(password)) return false;
  const hash = hashPassword(password);
  const now = encodeURIComponent(new Date().toISOString());
  const accounts = await request('/rest/v1/admin_accounts?email=eq.' + encodeURIComponent(email)
    + '&temporary_password_hash=eq.' + hash + '&temporary_password_expires_at=gt.' + now, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ temporary_password_hash: null, temporary_password_expires_at: null })
  });
  if (!accounts.length) return false;
  await request('/auth/v1/admin/users/' + accounts[0].id, {
    method: 'PUT',
    body: JSON.stringify({ password })
  });
  return true;
}
