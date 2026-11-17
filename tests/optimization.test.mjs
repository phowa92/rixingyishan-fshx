import test from 'node:test';
import assert from 'node:assert/strict';
import {handler} from '../netlify/functions/api.mjs';

function env() {
  const previous = Object.fromEntries(['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY'].map(key => [key, process.env[key]]));
  process.env.SUPABASE_URL='https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY='anon-test';
  process.env.SUPABASE_SERVICE_ROLE_KEY='service-test';
  return () => { for (const [key,value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key]=value; } };
}

test('公开名单通过一次实时 RPC 读取完整的去重结果', async () => {
  const restore=env(), original=globalThis.fetch, urls=[];
  const rows=Array.from({length:1201},(_,i)=>['patients','',`姓名${i}`]);
  rows.unshift(['blessings','personal','祈福甲']);
  globalThis.fetch=async (url) => {
    urls.push(String(url));
    if (String(url).includes('/rest/v1/rpc/public_records_since')) return Response.json(rows);
    throw Error('unexpected upstream path');
  };
  try {
    const result=await handler({path:'/api/records',httpMethod:'GET',headers:{}});
    assert.equal(result.statusCode,200);
    assert.equal(result.headers['Cache-Control'],'no-store');
    assert.equal(urls.length,1);
    const data=JSON.parse(result.body);
    assert.equal(data.groups.patients.count,1201);
    assert.equal(data.groups.patients.items.at(-1),'姓名1200');
    assert.deepEqual(data.groups.blessings.minors.personal,['祈福甲']);
  } finally { globalThis.fetch=original; restore(); }
});

test('后台登录响应直接给已验证账户，避免紧接着再查一次会话', async () => {
  const restore=env(), original=globalThis.fetch, urls=[];
  const id='11111111-1111-4111-8111-111111111111';
  globalThis.fetch=async (url) => {
    urls.push(String(url));
    if (String(url).includes('/auth/v1/token')) return Response.json({access_token:'token',refresh_token:'refresh-token',expires_in:3600});
    if (String(url).includes('/auth/v1/user')) return Response.json({id});
    if (String(url).includes('/rest/v1/admin_accounts')) return Response.json([{id,email:'owner@example.com',role:'owner'}]);
    throw Error('unexpected upstream path');
  };
  try {
    const result=await handler({path:'/api/admin/login',httpMethod:'POST',headers:{host:'site.example',origin:'https://site.example'},body:JSON.stringify({username:'owner@example.com',password:'secret'})});
    assert.equal(result.statusCode,200);
    assert.deepEqual(JSON.parse(result.body).account,{id,email:'owner@example.com',role:'owner'});
    assert.equal(urls.length,3);
  } finally { globalThis.fetch=original; restore(); }
});


test('后台空姓名筛选不附加无意义的模糊查询，日志只读取界面显示的12条', async () => {
  const restore=env(), original=globalThis.fetch, calls=[];
  const id='11111111-1111-4111-8111-111111111111';
  globalThis.fetch=async (url,options={}) => {
    const path=String(url);calls.push(path);
    if(path.includes('/auth/v1/user')) return Response.json({id});
    if(path.includes('/rest/v1/admin_accounts')) return Response.json([{id,email:'owner@example.com',role:'owner'}]);
    if(path.includes('/rest/v1/records')) return new Response('[]',{status:200,headers:{'content-range':'*/0'}});
    if(path.includes('/rest/v1/cleanup_logs')) return Response.json([]);
    throw Error('unexpected upstream path');
  };
  try {
    const event={httpMethod:'GET',headers:{cookie:'session=token',host:'site.example'}};
    assert.equal((await handler({...event,path:'/api/admin/records',queryStringParameters:{q:''}})).statusCode,200);
    assert.equal((await handler({...event,path:'/api/admin/cleanup-logs'})).statusCode,200);
    assert.ok(!calls.find(url=>url.includes('/rest/v1/records')).includes('name=ilike'));
    assert.ok(calls.find(url=>url.includes('/rest/v1/cleanup_logs')).includes('limit=12'));
  } finally {globalThis.fetch=original;restore();}
});
