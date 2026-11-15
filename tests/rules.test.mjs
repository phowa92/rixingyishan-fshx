import test from 'node:test';
import assert from 'node:assert/strict';
import {cutoffEpoch,beijingDay,beijingDateRange,validateEntry,cleanEntry,GROUPS} from '../lib.mjs';

test('北京时间 11 月 12 日 00:00 的保留边界是 11 月 5 日 00:00',()=>{
  const now=Date.parse('2026-11-11T16:00:00.000Z');
  assert.equal(new Date(cutoffEpoch(now)).toISOString(),'2026-11-04T16:00:00.000Z');
  assert.equal(beijingDay(now),'2026-11-12');
});
test('跨北京时间午夜时边界推进一天',()=>{
  assert.equal(beijingDay(Date.parse('2026-11-11T15:59:59Z')),'2026-11-11');
  assert.equal(beijingDay(Date.parse('2026-11-11T16:00:00Z')),'2026-11-12');
});
test('单日筛选按北京时间从零点到次日零点',()=>{
  assert.deepEqual(beijingDateRange('2026-11-15',''),{
    start:Date.parse('2026-11-14T16:00:00Z'),
    end:Date.parse('2026-11-15T16:00:00Z')
  });
});
test('三个大类和往生者三个子类的校验',()=>{
  assert.equal(validateEntry({group:'departed',minor:'infants',name:'王一'}),null);
  assert.equal(validateEntry({group:'departed',minor:'',name:'王一'}),'请选择往生者子类目');
  assert.equal(validateEntry({group:'patients',minor:'infants',name:'王一'}),'该类目无需子类目');
  assert.equal(validateEntry({group:'blessings',minor:'personal',name:'LiHua'}),null);
  assert.equal(cleanEntry({group:'patients',minor:'',name:'  Li   Hua  '}).nameKey,'li hua');
  assert.equal(Object.keys(GROUPS).length,3);
});
test('祈福子类目及各类汉字上限',()=>{
  assert.equal(validateEntry({group:'blessings',minor:'',name:'平安'}),'请选择祈福子类目');
  assert.equal(validateEntry({group:'blessings',minor:'personal',name:'张三李四王'}),null);
  assert.equal(validateEntry({group:'blessings',minor:'personal',name:'张三李四王赵'}),'最多填写5个字符');
  assert.equal(validateEntry({group:'blessings',minor:'organization',name:'天地玄黄宇宙洪荒日月盈昃辰宿'}),null);
  assert.equal(validateEntry({group:'blessings',minor:'organization',name:'天地玄黄宇宙洪荒日月盈昃辰宿列张'}),'最多填写15个字符');
  assert.equal(validateEntry({group:'departed',minor:'infants',name:'某某的堕胎婴灵'}),null);
  assert.equal(validateEntry({group:'patients',minor:'',name:'abcdef'}),'最多填写5个字符');
  assert.equal(validateEntry({group:'departed',minor:'infants',name:'一二三四五六七八九十百千'}),'最多填写11个字符');
});
test('管理员可手动填写较长姓名，但仍受数据库长度限制',()=>{
  const entry={group:'patients',minor:'',name:'甲'.repeat(12)};
  assert.equal(validateEntry(entry),'最多填写5个字符');
  assert.equal(validateEntry(entry,true),null);
  assert.equal(validateEntry({...entry,name:'甲'.repeat(61)},true),'最多填写60个字符');
});
