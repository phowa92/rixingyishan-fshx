import test from 'node:test';
import assert from 'node:assert/strict';
import {cutoffEpoch,beijingDay,validateEntry,cleanEntry,GROUPS} from '../lib.mjs';

test('北京时间 11 月 12 日 00:00 的保留边界是 11 月 5 日 00:00',()=>{
  const now=Date.parse('2026-11-11T16:00:00.000Z');
  assert.equal(new Date(cutoffEpoch(now)).toISOString(),'2026-11-04T16:00:00.000Z');
  assert.equal(beijingDay(now),'2026-11-12');
});
test('跨北京时间午夜时边界推进一天',()=>{
  assert.equal(beijingDay(Date.parse('2026-11-11T15:59:59Z')),'2026-11-11');
  assert.equal(beijingDay(Date.parse('2026-11-11T16:00:00Z')),'2026-11-12');
});
test('三个大类和往生者三个子类的校验',()=>{
  assert.equal(validateEntry({group:'departed',minor:'infants',name:'王一'}),null);
  assert.equal(validateEntry({group:'departed',minor:'',name:'王一'}),'请选择往生者子类目');
  assert.equal(validateEntry({group:'patients',minor:'infants',name:'王一'}),'该类目无需子类目');
  assert.equal(validateEntry({group:'blessings',minor:'',name:'Li Hua'}),null);
  assert.equal(cleanEntry({group:'patients',minor:'',name:'  Li   Hua  '}).nameKey,'li hua');
  assert.equal(Object.keys(GROUPS).length,3);
});
