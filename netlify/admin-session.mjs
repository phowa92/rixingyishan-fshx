import {config, user} from './shared.mjs';

const SESSION_SECONDS = 90 * 24 * 60 * 60;

export function sessionCookie(session) {
  if (typeof session?.access_token !== 'string' || typeof session?.refresh_token !== 'string') {
    throw Error('登录会话不完整');
  }
  const value = Buffer.from(JSON.stringify({a: session.access_token, r: session.refresh_token})).toString('base64url');
  return `session=v1.${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_SECONDS}`;
}

export const clearSessionCookie = () => 'session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0';

function cookieToken(event) {
  return (event.headers?.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith('session='))?.slice(8);
}

function savedSession(event) {
  const token = cookieToken(event);
  if (!token?.startsWith('v1.')) return null;
  try {
    const session = JSON.parse(Buffer.from(token.slice(3), 'base64url').toString('utf8'));
    return typeof session.a === 'string' && typeof session.r === 'string' ? session : null;
  } catch { return null; }
}

async function refresh(refreshToken) {
  const {url, anon} = config();
  const response = await fetch(url + '/auth/v1/token?grant_type=refresh_token', {
    method: 'POST',
    headers: {apikey: anon, 'Content-Type': 'application/json'},
    body: JSON.stringify({refresh_token: refreshToken})
  });
  if (response.status === 400 || response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw Error('登录会话续期失败');
  const session = await response.json();
  if (typeof session.access_token !== 'string' || typeof session.refresh_token !== 'string') {
    throw Error('登录会话续期结果不完整');
  }
  return session;
}

function accountFor(accessToken) {
  return user({headers: {cookie: `session=${encodeURIComponent(accessToken)}`}});
}

export async function authenticate(event) {
  const saved = savedSession(event);
  if (!saved) return {account: await user(event)}; // Existing one-hour cookies remain valid until expiry.
  const account = await accountFor(saved.a);
  if (account) return {account};
  const renewed = await refresh(saved.r);
  if (!renewed) return {account: null, clear: true};
  const refreshedAccount = await accountFor(renewed.access_token);
  return refreshedAccount ? {account: refreshedAccount, renewed} : {account: null, clear: true};
}

export async function revokeSession(event) {
  const saved = savedSession(event);
  const accessToken = saved?.a || (cookieToken(event)?.startsWith('v1.') ? null : cookieToken(event));
  if (!accessToken) return;
  const {url, anon} = config();
  const signOut = token => fetch(url + '/auth/v1/logout?scope=local', {
    method: 'POST', headers: {apikey: anon, Authorization: `Bearer ${token}`}
  });
  try {
    let response = await signOut(accessToken);
    if (response.status === 401 && saved?.r) {
      const renewed = await refresh(saved.r);
      if (renewed) response = await signOut(renewed.access_token);
    }
    if (!response.ok && response.status !== 401 && response.status !== 403 && response.status !== 404) {
      console.warn('Supabase local logout did not confirm revocation');
    }
  } catch {
    // Local sign-out still clears the browser cookie when the auth service is unavailable.
    console.warn('Supabase local logout unavailable');
  }
}
