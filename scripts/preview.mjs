// Local preview only. No Supabase connection and no real email delivery.
import http from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GROUPS, cutoffEpoch, validateEntry, cleanEntry } from '../lib.mjs';

const project = join(dirname(fileURLToPath(import.meta.url)), '..');
const root = join(project, 'public');
const stateFile = join(project, 'data', 'preview-records.json');
let rows = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : [
  { id: 1, group: 'departed', minor: 'deceased', name: '张三', nameKey: '张三', submittedAt: Date.now() },
  { id: 2, group: 'departed', minor: 'infants', name: '李四', nameKey: '李四', submittedAt: Date.now() },
  { id: 3, group: 'departed', minor: 'animals', name: '小白', nameKey: '小白', submittedAt: Date.now() },
  { id: 4, group: 'patients', minor: '', name: '王五', nameKey: '王五', submittedAt: Date.now() },
  { id: 5, group: 'blessings', minor: '', name: '赵六', nameKey: '赵六', submittedAt: Date.now() }
];
let nextId = Math.max(0, ...rows.map(row => Number(row.id))) + 1;
const files = { '/': 'index.html', '/submit': 'submit.html', '/records': 'records.html', '/complete': 'complete.html', '/admin': 'admin.html' };
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png' };
const accounts = [{ id: 1, username: 'preview@example.com', role: 'owner', password: 'PreviewOnly123!' }];
let nextAccountId = 2;
const sessions = new Map(), resetCodes = new Map();
function save() { mkdirSync(dirname(stateFile), { recursive: true }); writeFileSync(stateFile, JSON.stringify(rows, null, 2)); }
function send(res, status, value, headers = {}) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }); res.end(JSON.stringify(value)); }
function body(req) { return new Promise((resolve, reject) => { let raw = ''; req.on('data', chunk => { raw += chunk; if (raw.length > 1024 * 1024) reject(Error('请求内容过大')); }); req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch { reject(Error('请求格式错误')); } }); }); }
function currentAccount(req) { const token = req.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith('preview-session='))?.slice(16); return accounts.find(item => item.id === sessions.get(token)); }
function sortedRows(query) { const term = query.searchParams.get('q') || '', group = query.searchParams.get('group') || ''; return rows.filter(row => row.name.includes(term) && (!group || row.group === group)).sort((a, b) => b.submittedAt - a.submittedAt || b.id - a.id); }
function publicData() { const groups = Object.fromEntries(Object.keys(GROUPS).map(key => [key, { count: 0, items: [], minors: {} }])); const seen = new Set(); for (const row of [...rows].sort((a, b) => b.submittedAt - a.submittedAt || b.id - a.id)) { if (row.submittedAt < cutoffEpoch()) continue; const group = groups[row.group]; if (!group) continue; const key = `${row.group}|${row.minor}|${row.nameKey}`; if (seen.has(key)) continue; seen.add(key); group.count++; if (row.group === 'departed') (group.minors[row.minor] ||= []).push(row.name); else group.items.push(row.name); } return { groups, asOf: Date.now() }; }
function csvCell(value) { return `"${String(value ?? '').replaceAll('"', '""')}"`; }
function csv(data) { const format = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }); const lines = [['记录ID', '姓名', '回向类目', '子类目', '填写时间（北京时间）']]; for (const row of data) lines.push([row.id, row.name, GROUPS[row.group]?.label || row.group, GROUPS[row.group]?.minors[row.minor] || '', format.format(new Date(row.submittedAt))]); return '\uFEFF' + lines.map(line => line.map(csvCell).join(',')).join('\r\n') + '\r\n'; }
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost'), path = url.pathname;
  try {
    if (req.method === 'GET' && !path.startsWith('/api/')) {
      const file = files[path] || path.slice(1);
      if (!['index.html', 'submit.html', 'records.html', 'complete.html', 'admin.html', 'style.css', 'app.js', 'hero-ocean.png'].includes(file)) return send(res, 404, { error: '不存在' });
      res.writeHead(200, { 'Content-Type': types[extname(file)] }); return res.end(readFileSync(join(root, file)));
    }
    if (path === '/api/records' && req.method === 'GET') return send(res, 200, publicData());
    if (path === '/api/records' && req.method === 'POST') {
      const input = await body(req); if (!Array.isArray(input.entries) || !input.entries.length) return send(res, 400, { error: '请填写姓名' });
      const clean = []; for (const entry of input.entries) { const issue = validateEntry(entry); if (issue) return send(res, 400, { error: issue }); clean.push(cleanEntry(entry)); }
      for (const entry of clean) rows.push({ id: nextId++, ...entry, submittedAt: Date.now() }); save();
      return send(res, 201, { ok: true, count: clean.length });
    }
    if (path === '/api/admin/login' && req.method === 'POST') {
      const input = await body(req), account = accounts.find(item => item.username === input.username && item.password === input.password);
      if (!account) return send(res, 401, { error: '预览账号或密码错误' });
      const token = randomBytes(24).toString('hex'); sessions.set(token, account.id);
      return send(res, 200, { ok: true }, { 'Set-Cookie': `preview-session=${token}; HttpOnly; SameSite=Strict; Path=/` });
    }
    if (path === '/api/admin/logout' && req.method === 'POST') {
      const token = req.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith('preview-session='))?.slice(16);
      sessions.delete(token); return send(res, 200, { ok: true }, { 'Set-Cookie': 'preview-session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
    }
    if (path === '/api/admin/forgot-password' && req.method === 'POST') {
      const input = await body(req), email = String(input.email || '').trim().toLowerCase(), account = accounts.find(item => item.username === email);
      let previewCode;
      if (account) { previewCode = String(randomInt(100000, 1000000)); resetCodes.set(email, { code: previewCode, expires: Date.now() + 10 * 60 * 1000 }); }
      return send(res, 200, { ok: true, message: '如果该邮箱是管理员账户，验证码已发送。', ...(previewCode ? { previewCode } : {}) });
    }
    if (path === '/api/admin/verify-reset' && req.method === 'POST') {
      const input = await body(req), email = String(input.email || '').trim().toLowerCase(), code = resetCodes.get(email), account = accounts.find(item => item.username === email);
      if (!account || !code || code.expires < Date.now() || code.code !== String(input.code || '').trim()) return send(res, 400, { error: '验证码错误或已过期' });
      resetCodes.delete(email); account.password = randomBytes(18).toString('base64url');
      return send(res, 200, { temporaryPassword: account.password });
    }
    const account = currentAccount(req);
    if (path.startsWith('/api/admin/') && !account) return send(res, 401, { error: '请先登录后台' });
    if (path === '/api/admin/session') return send(res, 200, { account: { id: account.id, email: account.username, role: account.role } });
    if (path === '/api/admin/records' && req.method === 'GET') { const data = sortedRows(url), page = Math.max(1, Number.parseInt(url.searchParams.get('page'), 10) || 1), pageSize = [20, 50, 100].includes(Number(url.searchParams.get('pageSize'))) ? Number(url.searchParams.get('pageSize')) : 20; return send(res, 200, { records: data.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total: data.length }); }
    if (path === '/api/admin/export' && req.method === 'GET') { res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="records.csv"', 'Cache-Control': 'no-store' }); return res.end(csv(sortedRows(url))); }
    if (path === '/api/admin/records' && req.method === 'POST') { const entry = await body(req), issue = validateEntry(entry); if (issue) return send(res, 400, { error: issue }); rows.push({ id: nextId++, ...cleanEntry(entry), submittedAt: Date.now() }); save(); return send(res, 201, { ok: true }); }
    const record = path.match(/^\/api\/admin\/records\/(\d+)$/);
    if (record && req.method === 'PUT') { const entry = await body(req), issue = validateEntry(entry); if (issue) return send(res, 400, { error: issue }); const row = rows.find(item => item.id === Number(record[1])); if (!row) return send(res, 404, { error: '记录不存在' }); Object.assign(row, cleanEntry(entry)); save(); return send(res, 200, { ok: true }); }
    if (record && req.method === 'DELETE') { const index = rows.findIndex(item => item.id === Number(record[1])); if (index < 0) return send(res, 404, { error: '记录不存在' }); rows.splice(index, 1); save(); return send(res, 200, { ok: true }); }
    if (path === '/api/admin/password' && req.method === 'POST') { const input = await body(req); if (account.password !== input.currentPassword) return send(res, 401, { error: '当前密码错误' }); if (typeof input.newPassword !== 'string' || input.newPassword.length < 12) return send(res, 400, { error: '新密码至少12位' }); account.password = input.newPassword; return send(res, 200, { ok: true }); }
    if (path === '/api/admin/accounts' && req.method === 'GET') { if (account.role !== 'owner') return send(res, 403, { error: '仅站点管理员可管理账户' }); return send(res, 200, { accounts: accounts.map(item => ({ id: item.id, username: item.username, role: item.role })) }); }
    if (path === '/api/admin/accounts' && req.method === 'POST') { if (account.role !== 'owner') return send(res, 403, { error: '仅站点管理员可管理账户' }); const input = await body(req), username = String(input.username || '').trim().toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username) || typeof input.password !== 'string' || input.password.length < 12) return send(res, 400, { error: '请输入有效邮箱，密码至少12位' }); if (accounts.some(item => item.username === username)) return send(res, 409, { error: '账户已存在' }); accounts.push({ id: nextAccountId++, username, password: input.password, role: 'admin' }); return send(res, 201, { ok: true }); }
    const passwordAccount = path.match(/^\/api\/admin\/accounts\/(\d+)\/password$/);
    if (passwordAccount && req.method === 'PUT') { if (account.role !== 'owner') return send(res, 403, { error: '仅站点管理员可管理账户' }); const input = await body(req), target = accounts.find(item => item.id === Number(passwordAccount[1])); if (!target) return send(res, 404, { error: '账户不存在' }); if (typeof input.password !== 'string' || input.password.length < 12) return send(res, 400, { error: '新密码至少12位' }); target.password = input.password; return send(res, 200, { ok: true }); }
    const accountId = path.match(/^\/api\/admin\/accounts\/(\d+)$/);
    if (accountId && req.method === 'DELETE') { if (account.role !== 'owner') return send(res, 403, { error: '仅站点管理员可管理账户' }); const index = accounts.findIndex(item => item.id === Number(accountId[1])); if (index < 0 || accounts[index].role === 'owner') return send(res, 400, { error: '不能删除站点管理员账户' }); const deleted = accounts.splice(index, 1)[0]; for (const [token, id] of sessions) if (id === deleted.id) sessions.delete(token); return send(res, 200, { ok: true }); }
    if (path === '/api/admin/cleanup-logs' && req.method === 'GET') return send(res, 200, { logs: [] });
    return send(res, 404, { error: '预览模式未实现此操作' });
  } catch (error) { return send(res, 500, { error: error.message }); }
});
server.listen(8765, '127.0.0.1', () => console.log('本地预览：http://127.0.0.1:8765 （不连接 Supabase，不发送真实邮件）'));
