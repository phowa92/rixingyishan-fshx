import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const migration = new URL('../supabase/migrations/20261117000000_public_records_rpc.sql',import.meta.url);

async function database() {
  const db=new PGlite();
  await db.exec(`create role service_role; create role anon; create role authenticated; create schema if not exists public;
    create table public.records(id uuid primary key,group_key text not null,minor_key text not null,name text not null,name_key text not null,submitted_at timestamptz not null);
    create index records_submitted_at_idx on public.records(submitted_at);
    create index records_visible_dedupe_idx on public.records(group_key,minor_key,name_key,submitted_at desc);`);
  if (existsSync(migration)) await db.exec(readFileSync(migration,'utf8'));
  return db;
}

test('数据库函数保留最新同名记录、同时间按 ID 决定顺序、祈福历史空子类目合并', async () => {
  const db=await database();
  try {
    await db.exec(`insert into public.records values
      ('00000000-0000-4000-8000-000000000001','departed','deceased','旧名','同名','2026-11-17T10:00:00Z'),
      ('00000000-0000-4000-8000-000000000002','departed','deceased','新名','同名','2026-11-17T10:00:00Z'),
      ('00000000-0000-4000-8000-000000000003','blessings','','旧祈福','祈福','2026-11-17T10:00:00Z'),
      ('00000000-0000-4000-8000-000000000004','blessings','personal','新祈福','祈福','2026-11-17T11:00:00Z'),
      ('00000000-0000-4000-8000-000000000005','patients','','到期','到期','2026-11-09T15:59:59Z'),
      ('00000000-0000-4000-8000-000000000006','patients','','有效','有效','2026-11-10T16:00:00Z');`);
    const result=await db.query('select public.public_records_since($1::timestamptz) as rows',['2026-11-10T16:00:00Z']);
    assert.deepEqual(result.rows[0].rows,[['blessings','personal','新祈福'],['departed','deceased','新名'],['patients','','有效']]);
  } finally { await db.close(); }
});

test('数据库函数在原始记录和最终结果都超过千条时不截断', async () => {
  const db=await database();
  try {
    await db.exec(`insert into public.records
      select ('00000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,'patients','','姓名'||n,'姓名'||n,'2026-11-17T10:00:00Z'::timestamptz
      from generate_series(1,1205) n;
      insert into public.records
      select ('00000000-0000-4000-9000-' || lpad(n::text,12,'0'))::uuid,'patients','','姓名'||n,'姓名'||n,'2026-11-16T10:00:00Z'::timestamptz
      from generate_series(1,1205) n;`);
    const result=await db.query('select public.public_records_since($1::timestamptz) as rows',['2026-11-10T16:00:00Z']);
    assert.equal(result.rows[0].rows.length,1205);
    assert.equal(new Set(result.rows[0].rows.map(row=>row[2])).size,1205);
  } finally { await db.close(); }
});


test('数据库函数结果与原始名单排序去重一致，且仅 service_role 可执行', async () => {
  const db=await database();
  try {
    const values=[
      ['departed','deceased','旧张','张','2026-11-17T09:00:00Z'],
      ['departed','deceased','新张','张','2026-11-17T10:00:00Z'],
      ['departed','infants','婴灵','婴灵','2026-11-17T10:00:00Z'],
      ['patients','','张','张','2026-11-17T10:00:00Z'],
      ['blessings','','旧福','福','2026-11-17T08:00:00Z'],
      ['blessings','personal','新福','福','2026-11-17T10:00:00Z'],
      ['blessings','organization','公司','公司','2026-11-17T10:00:00Z'],
      ['patients','','过期','过期','2026-11-01T10:00:00Z']
    ];
    for(let i=0;i<values.length;i++){
      const [group,minor,name,key,time]=values[i];
      await db.query('insert into public.records values ($1::uuid,$2,$3,$4,$5,$6::timestamptz)',[
        `00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,group,minor,name,key,time
      ]);
    }
    const cutoff='2026-11-10T16:00:00Z';
    const raw=(await db.query('select group_key,minor_key,name,name_key,submitted_at,id from public.records where submitted_at >= $1::timestamptz order by submitted_at desc,id desc',[cutoff])).rows;
    const seen=new Set(),expected=[];
    for(const row of raw){
      const minor=row.group_key==='blessings'&&!row.minor_key?'personal':row.minor_key;
      const key=[row.group_key,minor,row.name_key].join('|');
      if(seen.has(key))continue;
      seen.add(key);expected.push([row.group_key,minor,row.name]);
    }
    const actual=(await db.query('select public.public_records_since($1::timestamptz) as rows',[cutoff])).rows[0].rows;
    assert.deepEqual(actual,expected);
    const permissions=(await db.query("select has_function_privilege('service_role','public.public_records_since(timestamptz)','EXECUTE') as service,has_function_privilege('anon','public.public_records_since(timestamptz)','EXECUTE') as anonymous,has_function_privilege('authenticated','public.public_records_since(timestamptz)','EXECUTE') as authenticated")).rows[0];
    assert.deepEqual(permissions,{service:true,anonymous:false,authenticated:false});
  } finally {await db.close();}
});
