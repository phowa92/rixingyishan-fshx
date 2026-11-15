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

test('临时密码只通过邮件发送，申请时不修改原密码', async () => {
  const restore = withEnv(), original = globalThis.fetch;
  process.env.RESEND_API_KEY = 'test-key';
  process.env.ADMIN_RESET_FROM_EMAIL = 'admin@example.com';
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('/rest/v1/admin_accounts')) return Response.json([{ id: testId, email: 'owner@example.com' }]);
    if (url === 'https://api.resend.com/emails') return Response.json({ id: 'email-id' });
    throw Error('Unexpected request');
  };
  try {
    const result = await handler({ httpMethod: 'POST', headers: {}, path: '/api/admin/forgot-password', body: JSON.stringify({ email: 'owner@example.com' }) });
    assert.equal(result.statusCode, 200);
    const payload = JSON.parse(calls[1].options.body);
    const password = payload.text.match(/[A-Za-z0-9_-]{32}/)[0];
    assert.deepEqual(payload.to, ['owner@example.com']);
    assert.ok(!result.body.includes(password));
    assert.match(JSON.parse(calls[0].options.body).temporary_password_hash, /^[a-f0-9]{64}$/);
    assert.equal(calls.length, 2);
  } finally {
    delete process.env.RESEND_API_KEY;
    delete process.env.ADMIN_RESET_FROM_EMAIL;
    globalThis.fetch = original;
    restore();
  }
});

test('后台批量删除只提交所选记录 ID', async () => {
  const restore = withEnv(), original = globalThis.fetch;
  const ids = [testId, '22222222-2222-4222-8222-222222222222'];
  let deletedUrl = '';
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url);
    if (path.includes('/auth/v1/user')) return Response.json({ id: testId });
    if (path.includes('/rest/v1/admin_accounts')) return Response.json([{ id: testId, email: 'owner@example.com', role: 'owner' }]);
    if (options.method === 'DELETE') { deletedUrl = path; return new Response(null, { status: 204 }); }
    throw Error(`Unexpected URL: ${path}`);
  };
  try {
    const result = await handler({ path: '/api/admin/records/batch-delete', httpMethod: 'POST', headers: { cookie: 'session=token' }, body: JSON.stringify({ ids }) });
    assert.equal(result.statusCode, 200);
    assert.equal(JSON.parse(result.body).count, 2);
    assert.ok(deletedUrl.endsWith(`id=in.(${ids.join(',')})`));
  } finally { globalThis.fetch = original; restore(); }
});
