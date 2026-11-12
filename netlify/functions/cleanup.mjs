import {request} from '../shared.mjs';
// 16:00 UTC is 00:00 the following day in Asia/Shanghai.
export async function handler(){const deleted=await request('/rest/v1/rpc/cleanup_expired_records',{method:'POST',body:'{}'});console.log(`Daily cleanup deleted ${deleted} records`);return {statusCode:200,body:'ok'};}
