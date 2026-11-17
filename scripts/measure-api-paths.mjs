// Synthetic local path measurements. No live credentials, names, or database access.
import {performance} from 'node:perf_hooks';
import {handler as api} from '../netlify/functions/api.mjs';
import {handler as cleanup} from '../netlify/functions/cleanup.mjs';

for(const key of ['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY'])
  process.env[key]=key==='SUPABASE_URL'?'https://example.supabase.co':'local-measurement-key';
const id='11111111-1111-4111-8111-111111111111';
let upstream=[];
function json(value,{status=200,headers={}}={}){
  const body=JSON.stringify(value);
  upstream.at(-1).bytes=Buffer.byteLength(body);
  upstream.at(-1).rows=Array.isArray(value)?value.length:1;
  return new Response(body,{status,headers});
}
globalThis.fetch=async (url,options={})=>{
  const path=String(url),method=options.method||'GET';
  upstream.push({endpoint:new URL(path).pathname,method,bytes:0,rows:0});
  if(path.includes('/auth/v1/token'))return json({access_token:'local-token',expires_in:3600});
  if(path.includes('/auth/v1/user'))return json({id});
  if(path.includes('/rest/v1/admin_accounts'))return json([{id,email:'owner@example.com',role:'owner'}]);
  if(path.includes('/rest/v1/rpc/public_records_since'))return json([['patients','','示例姓名']]);
  if(path.includes('/rest/v1/rpc/cleanup_expired_records'))return json(0);
  if(path.includes('/rest/v1/records')&&method==='GET')return json([{id,group_key:'patients',minor_key:'',name:'示例姓名',submitted_at:'2026-11-17T08:00:00Z'}],{headers:{'content-range':'0-0/1'}});
  if(path.includes('/rest/v1/records')&&['POST','PATCH','DELETE'].includes(method))return new Response(null,{status:204});
  throw Error('Unexpected synthetic path: '+path);
};
const auth={host:'site.example',cookie:'session=local-token'};
const operations=[
  ['public-list',()=>api({path:'/api/records',httpMethod:'GET',headers:{}})],
  ['submit-two',()=>api({path:'/api/records',httpMethod:'POST',headers:{host:'site.example'},body:JSON.stringify({acknowledged:true,entries:[{group:'patients',minor:'',name:'示例一'},{group:'patients',minor:'',name:'示例二'}]})})],
  ['admin-login',()=>api({path:'/api/admin/login',httpMethod:'POST',headers:{host:'site.example'},body:JSON.stringify({username:'owner@example.com',password:'local-only'})})],
  ['admin-list',()=>api({path:'/api/admin/records',httpMethod:'GET',headers:auth,queryStringParameters:{page:'1'}})],
  ['admin-edit',()=>api({path:'/api/admin/records/'+id,httpMethod:'PUT',headers:auth,body:JSON.stringify({group:'patients',minor:'',name:'示例改名'})})],
  ['admin-delete',()=>api({path:'/api/admin/records/'+id,httpMethod:'DELETE',headers:auth})],
  ['admin-export',()=>api({path:'/api/admin/export',httpMethod:'GET',headers:auth})],
  ['daily-cleanup',()=>cleanup()]
];
for(const [operation,run] of operations){
  upstream=[];
  const start=performance.now(),result=await run();
  const elapsedMs=+(performance.now()-start).toFixed(2);
  console.log(JSON.stringify({operation,functionCalls:1,supabaseCalls:upstream.length,upstreamRows:upstream.reduce((sum,x)=>sum+x.rows,0),upstreamBytes:upstream.reduce((sum,x)=>sum+x.bytes,0),functionElapsedMs:elapsedMs,responseBytes:Buffer.byteLength(result.body||''),status:result.statusCode}));
}
