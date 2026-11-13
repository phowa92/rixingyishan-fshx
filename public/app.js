const page = document.body.dataset.page;
const $ = (id) => document.getElementById(id);
const GROUPS = {
  departed: { label: '往生者', minors: { deceased: '亡者', infants: '堕胎婴灵', animals: '旁生' }, prayer: '将今日放生功德回向给以下亡者、堕胎婴灵及旁生，愿其业障消除、蒙佛光摄受往生西方极乐世界。' },
  patients: { label: '病患', minors: {}, prayer: '将今日放生功德回向给以下病患，愿其早日康复，平安健康；若手术者，手术顺利。' },
  blessings: { label: '祈福', minors: {}, prayer: '将今日放生功德回向给以下众生，愿其具足一切顺缘，合家身体健康，家庭和睦，事业兴旺，学业有成，福慧增长，善缘成熟，愿望实现，早证菩提。' }
};
async function api(path, options = {}) { const response = await fetch(path, { credentials: 'same-origin', ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } }); const data = await response.json(); if (!response.ok) throw new Error(data.error || '请求失败'); return data; }
function el(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
function showError(id, message) { const target = $(id); target.textContent = message; target.classList.toggle('hidden', !message); }
function formatTime(epoch) { return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(epoch); }

if (page === 'complete') { const group = new URLSearchParams(location.search).get('group'); if (GROUPS[group]) $('view-submitted').href = `/records?group=${group}`; }

if (page === 'submit') {
  const names = $('name-rows');
  const groupSelect = $('group-select');
  const minorSelect = $('minor-select');
  function addRow() {
    const wrap = el('div', 'name-row');
    const input = el('input');
    input.type = 'text'; input.maxLength = 60;
    input.placeholder = `请输入第 ${names.children.length + 1} 位姓名`;
    input.setAttribute('aria-label', input.placeholder);
    if (!names.children.length) input.id = 'first-name';
    wrap.append(input);
    if (names.children.length) {
      const remove = el('button', '', '−');
      remove.type = 'button'; remove.setAttribute('aria-label', '删除这位姓名');
      remove.onclick = () => { wrap.remove(); refreshRows(); };
      wrap.append(remove);
    }
    const add = el('button', '', '＋');
    add.type = 'button'; add.setAttribute('aria-label', '继续添加一位姓名'); add.onclick = addRow;
    wrap.append(add); names.append(wrap); input.focus();
  }
  function refreshRows() {
    [...names.querySelectorAll('input')].forEach((input, i) => {
      input.placeholder = `请输入第 ${i + 1} 位姓名`;
      input.setAttribute('aria-label', input.placeholder);
    });
  }
  function updateGroup() {
    const group = groupSelect.value;
    minorSelect.replaceChildren();
    if (group === 'departed') {
      minorSelect.disabled = false;
      minorSelect.add(new Option('请选择子类目', ''));
      for (const [key, label] of Object.entries(GROUPS.departed.minors)) minorSelect.add(new Option(label, key));
    } else {
      minorSelect.disabled = true;
      minorSelect.add(new Option('无需选择', ''));
    }
    const preview = $('prayer-preview');
    preview.classList.toggle('hidden', !group);
    if (group) preview.replaceChildren(el('span', '', GROUPS[group].prayer));
    showError('form-error', '');
  }
  groupSelect.onchange = updateGroup;
  updateGroup(); addRow();
  $('submit-button').onclick = async () => {
    showError('form-error', '');
    const group = groupSelect.value;
    const minor = group === 'departed' ? minorSelect.value : '';
    if (!group) return showError('form-error', '请选择回向类目');
    if (group === 'departed' && !minor) return showError('form-error', '请选择往生者子类目');
    const values = [...names.querySelectorAll('input')].map(input => input.value.trim().replace(/\s+/g, ' '));
    if (values.some(name => !name)) return showError('form-error', '请填写所有姓名，或删除空白姓名行');
    const button = $('submit-button'); button.disabled = true; button.firstChild.textContent = '提交中… ';
    try {
      await api('/api/records', { method: 'POST', body: JSON.stringify({ entries: values.map(name => ({ group, minor, name })) }) });
      location.assign(`/complete?group=${group}`);
    } catch (error) {
      showError('form-error', error.message); button.disabled = false; button.firstChild.textContent = '确认提交 ';
    }
  };
}

if (page === 'records') {
  let active = new URLSearchParams(location.search).get('group'); if (!GROUPS[active]) active='departed'; let data;
  function render() { if (!data) return; const tabs=$('record-tabs'); tabs.replaceChildren(...Object.entries(GROUPS).map(([key,value])=>{ const tab=el('button','record-tab'); tab.type='button'; tab.setAttribute('role','tab'); tab.setAttribute('aria-selected',String(active===key)); tab.append(document.createTextNode(value.label),el('strong','',`(${data.groups[key]?.count||0})`)); tab.onclick=()=>{active=key;history.replaceState(null,'',`/records?group=${key}`);render();}; return tab; })); $('record-prayer').textContent=GROUPS[active].prayer; const content=$('record-content'); content.replaceChildren(); const group=data.groups[active]||{count:0,items:[],minors:{}}; const blocks=active==='departed'?Object.entries(GROUPS.departed.minors).map(([key,label])=>({label,items:group.minors[key]||[]})):[{label:GROUPS[active].label,items:group.items||[]}]; for(const block of blocks){const section=el('section',active==='departed'?'record-block child-category':'record-block'); if(active==='departed'){const title=el('h2','',block.label); title.append(el('span','',`(${block.items.length})`)); section.append(title);} section.append(el('p',block.items.length?'record-names':'record-empty',block.items.length?block.items.join('、'):'暂无名单'));content.append(section);} $('record-updated').textContent=`数据更新于 ${formatTime(data.asOf)} · 每日北京时间凌晨更新`; }
  api('/api/records').then(result=>{data=result;render();}).catch(error=>{ $('record-content').replaceChildren(el('p','record-empty',`名单加载失败：${error.message}`)); });
}

if (page === 'admin') {
  let account = null, rows = [], editingId = null, pageNumber = 1, total = 0, loadToken = 0;
  const pageSize = 20, dialog = $('edit-dialog');
  function toggleLogin(logged) {
    $('login-panel').classList.toggle('hidden', logged);
    $('admin-content').classList.toggle('hidden', !logged);
    $('logout').classList.toggle('hidden', !logged);
  }
  function filterQuery() {
    return `q=${encodeURIComponent($('search-name').value)}&group=${encodeURIComponent($('filter-group').value)}`;
  }
  async function loadRows() {
    const token = ++loadToken;
    const result = await api(`/api/admin/records?${filterQuery()}&page=${pageNumber}&pageSize=${pageSize}`);
    if (token !== loadToken) return;
    rows = result.records; total = result.total;
    if (!rows.length && total > 0 && pageNumber > 1) { pageNumber--; return loadRows(); }
    $('admin-rows').replaceChildren(...rows.map(record => {
      const tr = el('tr');
      tr.append(el('td', '', record.name),
        el('td', '', record.group === 'departed' ? `${GROUPS.departed.label} · ${GROUPS.departed.minors[record.minor]}` : GROUPS[record.group]?.label || record.group),
        el('td', '', formatTime(record.submittedAt)));
      const actions = el('td');
      const edit = el('button', '', '编辑'); edit.onclick = () => openEdit(record);
      const remove = el('button', 'danger', '删除');
      remove.onclick = async () => {
        if (!confirm(`确定删除「${record.name}」这一次填写记录吗？`)) return;
        try { await api(`/api/admin/records/${record.id}`, { method: 'DELETE' }); await loadRows(); }
        catch (error) { alert(error.message); }
      };
      actions.append(edit, remove); tr.append(actions); return tr;
    }));
    if (!rows.length) { const tr = el('tr'), td = el('td', '', '暂无记录'); td.colSpan = 4; tr.append(td); $('admin-rows').append(tr); }
    const pages = Math.max(1, Math.ceil(total / pageSize));
    $('page-status').textContent = `共 ${total} 条实际填写 · 第 ${pageNumber} / ${pages} 页`;
    $('page-prev').disabled = pageNumber <= 1;
    $('page-next').disabled = pageNumber >= pages;
  }
  async function loadAccounts() {
    if (account?.role !== 'owner') return;
    $('account-card').classList.remove('hidden');
    const list = (await api('/api/admin/accounts')).accounts;
    $('account-list').replaceChildren(...list.map(item => {
      const line = el('div', 'account-line');
      line.append(el('span', '', `${item.username} · ${item.role === 'owner' ? '站点管理员' : '管理员'}`));
      if (item.id !== account.id) {
        const actions = el('div', 'account-actions');
        const password = document.createElement('input');
        password.type = 'password'; password.autocomplete = 'new-password'; password.placeholder = '新密码（至少12位）';
        password.setAttribute('aria-label', `修改 ${item.username} 的密码`);
        const change = el('button', '', '修改密码');
        change.onclick = async () => {
          if (password.value.length < 12) return alert('新密码至少12位');
          try { await api(`/api/admin/accounts/${item.id}/password`, { method: 'PUT', body: JSON.stringify({ password: password.value }) }); password.value = ''; alert('密码已修改'); }
          catch (error) { alert(error.message); }
        };
        actions.append(password, change);
        if (item.role !== 'owner') {
          const remove = el('button', 'danger', '删除');
          remove.onclick = async () => {
            if (!confirm(`确定删除账户「${item.username}」吗？`)) return;
            try { await api(`/api/admin/accounts/${item.id}`, { method: 'DELETE' }); await loadAccounts(); }
            catch (error) { alert(error.message); }
          };
          actions.append(remove);
        }
        line.append(actions);
      }
      return line;
    }));
  }
  async function loadLogs() {
    const logs = (await api('/api/admin/cleanup-logs')).logs;
    $('cleanup-logs').replaceChildren(...logs.slice(0, 12).map(log => el('p', 'form-help', `${formatTime(log.run_at)} · 清理 ${log.deleted_count} 条`)));
    if (!logs.length) $('cleanup-logs').textContent = '暂无清理日志';
  }
  function openEdit(record) {
    editingId = record?.id || null;
    $('edit-heading').textContent = record ? '编辑名单' : '新增名单';
    $('edit-name').value = record?.name || '';
    $('edit-group').value = record?.group || 'departed';
    $('edit-minor').value = record?.minor || 'deceased';
    $('edit-minor-wrap').classList.toggle('hidden', $('edit-group').value !== 'departed');
    showError('edit-error', ''); dialog.showModal();
  }
  $('edit-group').onchange = () => $('edit-minor-wrap').classList.toggle('hidden', $('edit-group').value !== 'departed');
  $('edit-cancel').onclick = () => dialog.close();
  $('new-record').onclick = () => openEdit(null);
  $('edit-save').onclick = async () => {
    const entry = { name: $('edit-name').value, group: $('edit-group').value, minor: $('edit-group').value === 'departed' ? $('edit-minor').value : '' };
    try { await api(editingId ? `/api/admin/records/${editingId}` : '/api/admin/records', { method: editingId ? 'PUT' : 'POST', body: JSON.stringify(entry) }); dialog.close(); await loadRows(); }
    catch (error) { showError('edit-error', error.message); }
  };
  $('login-button').onclick = async () => {
    showError('login-error', '');
    try {
      await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ username: $('login-name').value, password: $('login-password').value }) });
      const result = await api('/api/admin/session'); account = result.account; toggleLogin(true);
      await Promise.all([loadRows(), loadAccounts(), loadLogs()]);
    } catch (error) { showError('login-error', error.message); }
  };
  $('login-password').onkeydown = event => { if (event.key === 'Enter') $('login-button').click(); };
  $('logout').onclick = async () => { await api('/api/admin/logout', { method: 'POST' }); account = null; toggleLogin(false); };
  $('search-name').oninput = () => { pageNumber = 1; loadRows().catch(error => alert(error.message)); };
  $('filter-group').onchange = () => { pageNumber = 1; loadRows().catch(error => alert(error.message)); };
  $('page-prev').onclick = () => { if (pageNumber > 1) { pageNumber--; loadRows().catch(error => alert(error.message)); } };
  $('page-next').onclick = () => { if (pageNumber * pageSize < total) { pageNumber++; loadRows().catch(error => alert(error.message)); } };
  $('export-csv').onclick = async () => {
    const button = $('export-csv'); button.disabled = true;
    try {
      const response = await fetch(`/api/admin/export?${filterQuery()}`, { credentials: 'same-origin' });
      if (!response.ok) throw new Error((await response.json()).error || '下载失败');
      const url = URL.createObjectURL(await response.blob()), link = document.createElement('a');
      link.href = url; link.download = `回向名单-${new Date().toISOString().slice(0, 10)}.csv`; document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { alert(error.message); }
    finally { button.disabled = false; }
  };
  $('add-account').onclick = async () => {
    try {
      await api('/api/admin/accounts', { method: 'POST', body: JSON.stringify({ username: $('account-name').value, password: $('account-password').value }) });
      $('account-name').value = ''; $('account-password').value = ''; await loadAccounts();
    } catch (error) { alert(error.message); }
  };
  $('change-password').onclick = async () => {
    const message = $('password-message'); message.textContent = '';
    try {
      await api('/api/admin/password', { method: 'POST', body: JSON.stringify({ currentPassword: $('current-password').value, newPassword: $('new-password').value }) });
      $('current-password').value = ''; $('new-password').value = ''; message.textContent = '密码已修改。';
    } catch (error) { message.textContent = error.message; }
  };
  $('forgot-toggle').onclick = () => { $('forgot-panel').classList.toggle('hidden'); $('reset-email').value ||= $('login-name').value; };
  $('send-reset').onclick = async () => {
    $('reset-message').textContent = '';
    try {
      const result = await api('/api/admin/forgot-password', { method: 'POST', body: JSON.stringify({ email: $('reset-email').value }) });
      $('reset-message').textContent = result.message || '请检查邮箱。';
      if (result.previewPassword) $('reset-message').textContent += ` 本地预览临时密码：${result.previewPassword}（不会发送邮件）`;
    } catch (error) { $('reset-message').textContent = error.message; }
  };
  api('/api/admin/session').then(async result => {
    account = result.account; toggleLogin(true);
    await Promise.all([loadRows(), loadAccounts(), loadLogs()]);
  }).catch(() => toggleLogin(false));
}
