export const GROUPS = {
  departed: { label: '往生者', minors: { deceased: '亡者', infants: '堕胎婴灵', animals: '旁生' }, prayer: '将今日放生功德回向给以下亡者、堕胎婴灵及旁生，愿其业障消除、蒙佛光摄受往生西方极乐世界。' },
  patients: { label: '病患', minors: {}, prayer: '将今日放生功德回向给以下病患，愿其早日康复，平安健康；若手术者，手术顺利。' },
  blessings: { label: '祈福', minors: {}, prayer: '将今日放生功德回向给以下众生，愿其具足一切顺缘，合家身体健康，家庭和睦，事业兴旺，学业有成，福慧增长，善缘成熟，愿望实现，早证菩提。' }
};

export function beijingDay(epoch = Date.now()) {
  return new Date(epoch + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// Per requested example: at Nov 12 00:00 CST, keep rows from Nov 5 00:00 CST.
export function cutoffEpoch(epoch = Date.now()) {
  const day = beijingDay(epoch);
  const [year, month, date] = day.split('-').map(Number);
  return Date.UTC(year, month - 1, date - 7) - 8 * 60 * 60 * 1000;
}

export function nextBeijingMidnight(epoch = Date.now()) {
  const [year, month, date] = beijingDay(epoch).split('-').map(Number);
  return Date.UTC(year, month - 1, date + 1) - 8 * 60 * 60 * 1000;
}

export function normalizeName(name) {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('zh-CN');
}

export function validateEntry(entry) {
  if (!entry || typeof entry !== 'object') return '名单格式不正确';
  const group = GROUPS[entry.group];
  if (!group) return '请选择类目';
  if (entry.group === 'departed' && !group.minors[entry.minor]) return '请选择往生者子类目';
  if (entry.group !== 'departed' && entry.minor) return '该类目无需子类目';
  if (typeof entry.name !== 'string' || !entry.name.trim()) return '姓名不能为空';
  if (entry.name.trim().length > 60) return '姓名不能超过60个字';
  if (!/^[\p{Script=Han}\p{Script=Latin}·.（）()\s\-’']+$/u.test(entry.name.trim())) return '姓名只能包含中文、英文、拼音备注及常见姓名符号';
  return null;
}

export function cleanEntry(entry) {
  const name = entry.name.trim().replace(/\s+/g, ' ');
  return { group: entry.group, minor: entry.group === 'departed' ? entry.minor : '', name, nameKey: normalizeName(name) };
}
