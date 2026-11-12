import test from 'node:test';
import assert from 'node:assert/strict';
import {handler} from '../netlify/functions/api.mjs';

test('批量提交逐条写入，同批同名也保留实际记录',async()=>{
  const original=globalThis.fetch;
  const prior={SUPABASE_URL:process.env.SUPABASE_URL,SUPABASE_ANON_KEY:process.env.SUPABASE_ANON_KEY,SUPABASE_SERVICE_ROLE_KEY:process.env.SUPABASE_SERVICE_ROLE_KEY};
  process.env.SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_ANON_KEY='anon-test';process.env.SUPABASE_SERVICE_ROLE_KEY='service-test';
  const calls=[];globalThis.fetch=async(url,options)=>{calls.push({url,options});return new Response('',{status:201});};
  try{
    const event={path:'/api/records',httpMethod:'POST',headers:{host:'site.example',origin:'https://site.example'},body:JSON.stringify({entries:[{group:'departed',minor:'deceased',name:'张三'},{group:'patients',minor:'',name:'张三'}]})};
    const ok=await handler(event);assert.equal(ok.statusCode,201);assert.equal(calls.length,1);
    const sent=JSON.parse(calls[0].options.body);assert.equal(sent.length,2);assert.equal(sent[0].group_key,'departed');assert.equal(sent[1].group_key,'patients');
    const duplicate=await handler({...event,body:JSON.stringify({entries:[{group:'patients',minor:'',name:'李四'},{group:'patients',minor:'',name:'李四'}]})});assert.equal(duplicate.statusCode,201);assert.equal(calls.length,2);
    assert.equal(JSON.parse(calls[1].options.body).length,2);
    assert.equal(calls[1].url.endsWith('/rest/v1/records'),true);
  }finally{globalThis.fetch=original;for(const [k,v] of Object.entries(prior)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});

const testId = '11111111-1111-4111-8111-111111111111';
function withEnv() {
  const prior = { SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY };
  process.env.SUPABASE_URL = 'https://example.supabase.co'; process.env.SUPABASE_ANON_KEY = 'anon-test'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test';
  return () => { for (const [key, value] of Object.entries(prior)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } };
}

test('前台同类同名只显示一条，后台翻页与 CSV 保留两次填写', async () => {
  const restore = withEnv(), original = globalThis.fetch;
  const records = [
    { id: testId, group_key: 'departed', minor_key: 'deceased', name: '张三丰', name_key: '张三丰', submitted_at: new Date().toISOString() },
    { id: '22222222-2222-4222-8222-222222222222', group_key: 'departed', minor_key: 'deceased', name: '张三丰', name_key: '张三丰', submitted_at: new Date(Date.now() - 1000).toISOString() }
  ];
  globalThis.fetch = async url => {
    const path = String(url);
    if (path.includes('/auth/v1/user')) return Response.json({ id: testId });
    if (path.includes('/rest/v1/admin_accounts')) return Response.json([{ id: testId, email: 'owner@example.com', role: 'owner' }]);
    if (path.includes('/rest/v1/records')) return new Response(JSON.stringify(records), { status: 200, headers: { 'Content-Range': '0-1/2' } });
    throw Error(`Unexpected URL: ${path}`);
  };
  try {
    const publicResult = await handler({ path: '/api/records', httpMethod: 'GET', headers: {} });
    assert.equal(JSON.parse(publicResult.body).groups.departed.count, 1);
    const base = { httpMethod: 'GET', headers: { cookie: 'session=token', host: 'site.example' } };
    const page = await handler({ ...base, path: '/api/admin/records', queryStringParameters: { page: '1', pageSize: '20' } });
    assert.equal(JSON.parse(page.body).total, 2);
    assert.equal(JSON.parse(page.body).records.length, 2);
    const exportResult = await handler({ ...base, path: '/api/admin/export' });
    assert.equal(exportResult.statusCode, 200);
    assert.equal((exportResult.body.match(/张三丰/g) || []).length, 2);
  } finally { globalThis.fetch = original; restore(); }
});

test('邮箱验证码验证成功后生成临时密码并更新该管理员账户', async () => {
  const restore = withEnv(), original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url); calls.push({ path, options });
    if (path.includes('/rest/v1/admin_accounts')) return Response.json([{ id: testId }]);
    if (path.includes('/auth/v1/recover')) return Response.json({});
    if (path.includes('/auth/v1/verify')) return Response.json({ user: { id: testId } });
    if (path.includes(`/auth/v1/admin/users/${testId}`)) return Response.json({ id: testId });
    throw Error(`Unexpected URL: ${path}`);
  };
  try {
    const base = { httpMethod: 'POST', headers: { host: 'site.example', origin: 'https://site.example' } };
    const sent = await handler({ ...base, path: '/api/admin/forgot-password', body: JSON.stringify({ email: 'owner@example.com' }) });
    assert.equal(sent.statusCode, 200);
    assert.equal(calls.some(call => call.path.includes('/auth/v1/recover')), true);
    const verified = await handler({ ...base, path: '/api/admin/verify-reset', body: JSON.stringify({ email: 'owner@example.com', code: '123456' }) });
    assert.equal(verified.statusCode, 200);
    assert.ok(JSON.parse(verified.body).temporaryPassword.length >= 12);
    assert.equal(calls.some(call => call.path.includes(`/auth/v1/admin/users/${testId}`) && call.options.method === 'PUT'), true);
  } finally { globalThis.fetch = original; restore(); }
});
