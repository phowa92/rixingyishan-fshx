export const GROUPS = {
  departed: { label: '往生者', minors: { deceased: '亡者', infants: '堕胎婴灵', animals: '旁生' }, prayer: '将今日善法功德回向给以下亡者、堕胎婴灵及旁生，愿其业障消除、蒙佛光摄受往生西方极乐世界。' },
  patients: { label: '病患', minors: {}, prayer: '将今日善法功德回向给以下病患，愿其身体健康、早日康复；若手术者，手术顺利。' },
  blessings: { label: '祈福', minors: { personal: '个人/家庭', organization: '公司/机构' }, prayer: '将今日善法功德回向给以下众生，愿其具足一切顺缘，合家身体健康，家庭和睦，事业兴旺，学业有成，福慧增长，善缘成熟，愿望实现，早证菩提。' }
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

export function beijingDateRange(from, to) {
  const startDate = from || to;
  const endDate = to || from;
  if (!startDate || !endDate) return null;
  if (![startDate, endDate].every(date => /^\d{4}-\d{2}-\d{2}$/.test(date))) return null;
  const start = Date.parse(`${startDate}T00:00:00+08:00`);
  const end = Date.parse(`${endDate}T00:00:00+08:00`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || beijingDay(start) !== startDate || beijingDay(end) !== endDate || start > end) return null;
  return { start, end: end + 86400000 };
}

export function normalizeName(name) {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('zh-CN');
}

export function validateEntry(entry, adminEntry = false) {
  if (!entry || typeof entry !== 'object') return '名单格式不正确';
  const group = GROUPS[entry.group];
  if (!group) return '请选择类目';
  if (Object.keys(group.minors).length && !group.minors[entry.minor]) return `请选择${group.label}子类目`;
  if (!Object.keys(group.minors).length && entry.minor) return '该类目无需子类目';
  if (typeof entry.name !== 'string' || !entry.name.trim()) return '姓名不能为空';
  const limit = adminEntry ? 60 : entry.minor === 'infants' ? 11 : entry.minor === 'organization' ? 15 : 5;
  if (Array.from(entry.name.trim()).length > limit) return `最多填写${limit}个字符`;
  if (!/^[\p{Script=Han}\p{Script=Latin}·.（）()\s\-’']+$/u.test(entry.name.trim())) return '姓名只能包含中文、英文、拼音备注及常见姓名符号';
  return null;
}

export function cleanEntry(entry) {
  const name = entry.name.trim().replace(/\s+/g, ' ');
  return { group: entry.group, minor: entry.group === 'patients' ? '' : entry.minor, name, nameKey: normalizeName(name) };
}
