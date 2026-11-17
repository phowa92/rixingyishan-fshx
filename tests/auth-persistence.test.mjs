import test from 'node:test';
import assert from 'node:assert/strict';
import {handler} from '../netlify/functions/api.mjs';

test('后台登录可跨浏览器重启保留，访问令牌过期后续期，退出清除会话', async () => {
  const previous = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
  };
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'anon-test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test';
  const originalFetch = globalThis.fetch;
  let firstAccessExpired = false;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url);
    calls.push({path, options});
    if (path.endsWith('/auth/v1/token?grant_type=password')) {
      return Response.json({access_token: 'access-one', refresh_token: 'refresh-one', expires_in: 3600});
    }
    if (path.endsWith('/auth/v1/token?grant_type=refresh_token')) {
      assert.equal(JSON.parse(options.body).refresh_token, 'refresh-one');
      return Response.json({access_token: 'access-two', refresh_token: 'refresh-two', expires_in: 3600});
    }
    if (path.endsWith('/auth/v1/user')) {
      if (options.headers.Authorization === 'Bearer access-one' && firstAccessExpired) return new Response(null, {status: 401});
      if (['Bearer access-one', 'Bearer access-two'].includes(options.headers.Authorization)) {
        return Response.json({id: '11111111-1111-4111-8111-111111111111'});
      }
      return new Response(null, {status: 401});
    }
    if (path.includes('/rest/v1/admin_accounts?')) {
      return Response.json([{id: '11111111-1111-4111-8111-111111111111', email: 'owner@example.com', role: 'owner'}]);
    }
    if (path.endsWith('/auth/v1/logout?scope=local')) return new Response(null, {status: 204});
    throw Error(`Unexpected request: ${path}`);
  };
  try {
    const login = await handler({path: '/api/admin/login', httpMethod: 'POST', headers: {host: 'site.example'}, body: JSON.stringify({username: 'owner@example.com', password: 'secret'})});
    assert.equal(login.statusCode, 200);
    assert.match(login.headers['Set-Cookie'], /Max-Age=7776000/);
    assert.match(login.headers['Set-Cookie'], /HttpOnly; Secure; SameSite=Strict/);
    const originalCookie = login.headers['Set-Cookie'].split(';')[0];
    const sessionEvent = {path: '/api/admin/session', httpMethod: 'GET', headers: {cookie: originalCookie}};
    const savedSession = await handler(sessionEvent);
    assert.equal(savedSession.statusCode, 200);
    assert.equal(savedSession.headers['Set-Cookie'], undefined);
    firstAccessExpired = true;
    const renewed = await handler(sessionEvent);
    assert.equal(renewed.statusCode, 200);
    assert.match(renewed.headers['Set-Cookie'], /Max-Age=7776000/);
    const renewedCookie = renewed.headers['Set-Cookie'].split(';')[0];
    assert.notEqual(renewedCookie, originalCookie);
    const logout = await handler({path: '/api/admin/logout', httpMethod: 'POST', headers: {host: 'site.example', cookie: renewedCookie}});
    assert.equal(logout.statusCode, 200);
    assert.match(logout.headers['Set-Cookie'], /Max-Age=0/);
    assert.equal(calls.filter(call => call.path.endsWith('/auth/v1/token?grant_type=refresh_token')).length, 1);
    assert.equal(calls.filter(call => call.path.endsWith('/auth/v1/logout?scope=local')).length, 1);
    assert.equal((await handler({path: '/api/admin/session', httpMethod: 'GET', headers: {}})).statusCode, 401);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
