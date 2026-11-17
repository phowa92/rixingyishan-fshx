import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';

const migration=readFileSync(new URL('../supabase/migrations/20261117000000_public_records_rpc.sql',import.meta.url),'utf8');
const cutoff='2026-11-10T16:00:00Z';
const cases=[['small',12,8],['duplicates',2400,100],['over1000-results',2200,2200]];
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
for(const [label,count,distinct] of cases){
  const db=new PGlite();
  try{
    await db.exec(`create role service_role; create role anon; create role authenticated;
      create table public.records(id uuid primary key,group_key text not null,minor_key text not null,name text not null,name_key text not null,submitted_at timestamptz not null);
      create index records_submitted_at_idx on public.records(submitted_at);
      create index records_visible_dedupe_idx on public.records(group_key,minor_key,name_key,submitted_at desc);`);
    await db.exec(migration);
    await db.query(`insert into public.records
      select ('00000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
       'patients','','姓名'||((n-1)%$1),'姓名'||((n-1)%$1),
       '2026-11-17T10:00:00Z'::timestamptz - n * interval '1 second'
      from generate_series(1,$2) n`,[distinct,count]);
    const oldTimes=[],newTimes=[];
    let oldCalls=0,oldBytes=0,newBytes=0,oldNames,newNames;
    for(let repeat=0;repeat<5;repeat++){
      const start=performance.now(),old=[];let calls=0,bytes=0;
      for(let offset=0;;offset+=1000){
        const page=(await db.query(`select group_key,minor_key,name,name_key,submitted_at from public.records
          where submitted_at >= $1::timestamptz order by submitted_at desc,id desc limit 1000 offset $2`,[cutoff,offset])).rows;
        calls++;bytes+=Buffer.byteLength(JSON.stringify(page));old.push(...page);
        if(page.length<1000)break;
      }
      const seen=new Set();oldNames=[];
      for(const row of old){const key=[row.group_key,row.minor_key,row.name_key].join('|');if(!seen.has(key)){seen.add(key);oldNames.push(row.name);}}
      oldTimes.push(performance.now()-start);oldCalls=calls;oldBytes=bytes;
      const next=performance.now();
      const compact=(await db.query('select public.public_records_since($1::timestamptz) as rows',[cutoff])).rows[0].rows;
      newNames=compact.map(row=>row[2]);newBytes=Buffer.byteLength(JSON.stringify(compact));newTimes.push(performance.now()-next);
    }
    if(JSON.stringify(oldNames)!==JSON.stringify(newNames))throw Error(label+' result mismatch');
    let oldPlanMs=0,oldPlanBuffers=0;
    for(let offset=0;offset<oldCalls*1000;offset+=1000){
      const plan=(await db.query(`explain (analyze,buffers,format json) select group_key,minor_key,name,name_key,submitted_at from public.records where submitted_at >= $1::timestamptz order by submitted_at desc,id desc limit 1000 offset $2`,[cutoff,offset])).rows[0]['QUERY PLAN'][0];
      oldPlanMs+=plan['Execution Time'];oldPlanBuffers+=plan.Plan['Shared Hit Blocks'];
    }
    const newPlan=(await db.query('explain (analyze,buffers,format json) select public.public_records_since($1::timestamptz)',[cutoff])).rows[0]['QUERY PLAN'][0];
    console.log(JSON.stringify({dataset:label,rawRows:count,visibleRows:oldNames.length,oldCalls,newCalls:1,oldBytes,newBytes,oldMedianMs:+median(oldTimes).toFixed(2),newMedianMs:+median(newTimes).toFixed(2),oldPlanMs:+oldPlanMs.toFixed(2),newPlanMs:+newPlan['Execution Time'].toFixed(2),oldPlanBuffers,newPlanBuffers:newPlan.Plan['Shared Hit Blocks']}));
  }finally{await db.close();}
}
