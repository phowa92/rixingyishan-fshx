const page = document.body.dataset.page;
const $ = (id) => document.getElementById(id);

// The OS preference remains observable when the page applies its minimum size.
const textSizeProbe = document.createElement('span');
textSizeProbe.className = 'system-text-size-probe';
textSizeProbe.style.width = 'calc(100px * env(preferred-text-scale, 1))';
textSizeProbe.setAttribute('aria-hidden', 'true');
document.body.append(textSizeProbe);
const updateTextSizeFloor = () => {
  document.documentElement.toggleAttribute('data-text-size-floor', textSizeProbe.getBoundingClientRect().width < 100);
};
new ResizeObserver(updateTextSizeFloor).observe(textSizeProbe);
updateTextSizeFloor();

// Older iOS engines expose Dynamic Type through their system text styles.
if (/iPhone|iPad|iPod/.test(navigator.userAgent) && CSS.supports('font', '-apple-system-body')) {
  const probe = document.createElement('span');
  probe.className = 'system-text-size-probe';
  probe.setAttribute('aria-hidden', 'true');
  document.body.append(probe);

  const updateTextSize = () => {
    const root = document.documentElement;
    root.style.removeProperty('font-size');
    const nativeSize = parseFloat(getComputedStyle(root).fontSize);
    const systemSize = parseFloat(getComputedStyle(probe).fontSize);
    const desiredSize = Math.max(16, systemSize * 16 / 17);
    if (desiredSize > nativeSize + 0.1) root.style.fontSize = `${desiredSize}px`;
  };
  new ResizeObserver(updateTextSize).observe(probe);
  window.addEventListener('pageshow', updateTextSize);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) updateTextSize();
  });
  updateTextSize();
}

const siteHeader = document.querySelector('.site-header');
if (siteHeader && page === 'records') {
  new ResizeObserver(() => {
    document.documentElement.style.setProperty('--site-header-height', `${siteHeader.offsetHeight}px`);
  }).observe(siteHeader);
}
const GROUPS = {
  departed: { label: '往生者', minors: { deceased: '亡者', infants: '堕胎婴灵', animals: '旁生' }, prayer: '将今日放生功德回向给以下亡者、堕胎婴灵及旁生，愿其业障消除、蒙佛光摄受往生西方极乐世界。' },
  patients: { label: '病患', minors: {}, prayer: '将今日放生功德回向给以下病患，愿其早日康复，平安健康；若手术者，手术顺利。' },
  blessings: { label: '祈福', minors: { personal: '个人/家庭', organization: '公司/机构' }, prayer: '将今日放生功德回向给以下众生，愿其具足一切顺缘，合家身体健康，家庭和睦，事业兴旺，学业有成，福慧增长，善缘成熟，愿望实现，早证菩提。' }
};
async function api(path, options = {}) { const response = await fetch(path, { credentials: 'same-origin', ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } }); const data = await response.json(); if (!response.ok) throw new Error(data.error || '请求失败'); return data; }
function el(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
function showError(id, message) { const target = $(id); target.textContent = message; target.classList.toggle('hidden', !message); }
function formatTime(epoch) { return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(epoch); }
function nameLimit(minor) { return minor === 'infants' ? 11 : minor === 'organization' ? 15 : 5; }
function limitInput(input) {
  const characters = Array.from(input.value);
  if (characters.length > input.maxLength) input.value = characters.slice(0, input.maxLength).join('');
}

if (page === 'complete') { const group = new URLSearchParams(location.search).get('group'); if (GROUPS[group]) $('view-submitted').href = `/records?group=${group}`; }

if (page === 'submit') {
  const names = $('name-rows');
  const groupSelect = $('group-select');
  const minorSelect = $('minor-select');
  function updateMinor() {
    $('minor-tip').classList.toggle('hidden', groupSelect.value !== 'departed' || minorSelect.value !== 'infants');
    const limit = nameLimit(minorSelect.value);
    $('name-limit').textContent = `一次一名，最多${limit}个字符，点击＋可添加`;
    let shortened = false;
    names.querySelectorAll('input').forEach(input => {
      input.maxLength = limit;
      if (Array.from(input.value).length > limit) { limitInput(input); shortened = true; }
    });
    if (shortened) showError('form-error', '已按当前子类目的字数上限截短姓名，请核对');
  }
  function addRow() {
    const wrap = el('div', 'name-row');
    const input = el('input');
    input.type = 'text'; input.maxLength = nameLimit(minorSelect.value);
    input.addEventListener('input', event => { if (!event.isComposing) limitInput(input); });
    input.addEventListener('compositionend', () => limitInput(input));
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
    if (GROUPS[group] && Object.keys(GROUPS[group].minors).length) {
      minorSelect.disabled = false;
      minorSelect.add(new Option('请选择子类目', ''));
      for (const [key, label] of Object.entries(GROUPS[group].minors)) minorSelect.add(new Option(label, key));
    } else {
      minorSelect.disabled = true;
      minorSelect.add(new Option('无需选择', ''));
    }
    const preview = $('prayer-preview');
    preview.classList.toggle('hidden', !group);
    if (group) preview.replaceChildren(el('span', '', GROUPS[group].prayer));
    showError('form-error', '');
    updateMinor();
  }
  groupSelect.onchange = updateGroup;
  minorSelect.onchange = updateMinor;
  updateGroup(); addRow();
  $('submit-button').onclick = async () => {
    showError('form-error', '');
    const group = groupSelect.value;
    const minor = group === 'patients' ? '' : minorSelect.value;
    if (!group) return showError('form-error', '请选择回向类目');
    if (group !== 'patients' && !minor) return showError('form-error', `请选择${GROUPS[group].label}子类目`);
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
  function render() { if (!data) return; const tabs=$('record-tabs'); tabs.replaceChildren(...Object.entries(GROUPS).map(([key,value])=>{ const tab=el('button','record-tab'); tab.type='button'; tab.setAttribute('role','tab'); tab.setAttribute('aria-selected',String(active===key)); tab.append(document.createTextNode(value.label),el('strong','',`(${data.groups[key]?.count||0})`)); tab.onclick=()=>{active=key;history.replaceState(null,'',`/records?group=${key}`);render();}; return tab; })); $('record-prayer').textContent=GROUPS[active].prayer; const content=$('record-content'); content.replaceChildren(); const group=data.groups[active]||{count:0,items:[],minors:{}}; const hasMinors=active!=='patients'; const blocks=hasMinors?Object.entries(GROUPS[active].minors).map(([key,label])=>({label,items:group.minors[key]||[]})):[{label:GROUPS[active].label,items:group.items||[]}]; for(const block of blocks){const section=el('section',hasMinors?'record-block child-category':'record-block'); if(hasMinors){const title=el('h2','',block.label); title.append(el('span','',`(${block.items.length})`)); section.append(title);} section.append(el('p',block.items.length?'record-names':'record-empty',block.items.length?block.items.join('、'):'暂无名单'));content.append(section);} $('record-updated').textContent=`数据更新于 ${formatTime(data.asOf)} · 每日北京时间凌晨更新`; }
  api('/api/records').then(result=>{data=result;render();}).catch(error=>{ $('record-content').replaceChildren(el('p','record-empty',`名单加载失败：${error.message}`)); });
}

if (page === 'admin') {
  let account = null, rows = [], editingId = null, pageNumber = 1, total = 0, loadToken = 0;
  const selectedIds = new Set();
  const pageSize = 20, dialog = $('edit-dialog');
  function updateSelection() {
    const selectPage = $('select-page');
    selectPage.disabled = !rows.length;
    selectPage.checked = rows.length > 0 && rows.every(row => selectedIds.has(row.id));
    selectPage.indeterminate = rows.some(row => selectedIds.has(row.id)) && !selectPage.checked;
    $('delete-selected').disabled = !selectedIds.size;
    $('delete-selected').textContent = `删除选中（${selectedIds.size}）`;
  }
  function toggleLogin(logged) {
    $('login-panel').classList.toggle('hidden', logged);
    $('admin-content').classList.toggle('hidden', !logged);
    $('logout').classList.toggle('hidden', !logged);
  }
  function filterQuery() {
    return `q=${encodeURIComponent($('search-name').value)}&group=${encodeURIComponent($('filter-group').value)}&from=${encodeURIComponent($('select-from').value)}&to=${encodeURIComponent($('select-to').value)}`;
  }
  async function loadRows() {
    const token = ++loadToken;
    const result = await api(`/api/admin/records?${filterQuery()}&page=${pageNumber}&pageSize=${pageSize}`);
    if (token !== loadToken) return;
    rows = result.records; total = result.total;
    if (!rows.length && total > 0 && pageNumber > 1) { pageNumber--; return loadRows(); }
    $('admin-rows').replaceChildren(...rows.map(record => {
      const tr = el('tr');
      const selectCell = el('td', 'select-cell');
      const checkbox = el('input'); checkbox.type = 'checkbox'; checkbox.setAttribute('aria-label', `选择${record.name}`);
      checkbox.checked = selectedIds.has(record.id);
      checkbox.onchange = () => { if (checkbox.checked) selectedIds.add(record.id); else selectedIds.delete(record.id); updateSelection(); };
      selectCell.append(checkbox);
      const nameCell = el('td', 'name-cell');
      const name = el('span', 'record-name', record.name);
      const actions = el('span', 'record-actions');
      const edit = el('button', '', '编辑'); edit.onclick = () => openEdit(record);
      actions.append(edit); nameCell.append(name, actions);
      const minor = record.group === 'blessings' && !record.minor ? 'personal' : record.minor;
      const category = GROUPS[record.group]?.minors[minor];
      tr.append(selectCell, nameCell, el('td', 'category-cell', category ? `${GROUPS[record.group].label} · ${category}` : GROUPS[record.group]?.label || record.group), el('td', 'submitted-cell', formatTime(record.submittedAt)));
      return tr;
    }));
    if (!rows.length) { const tr = el('tr'), td = el('td', '', '暂无记录'); td.colSpan = 4; tr.append(td); $('admin-rows').append(tr); }
    updateSelection();
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const dates = $('select-from').value || $('select-to').value;
    $('page-status').textContent = `${dates ? '所选日期 · ' : ''}共 ${total} 条实际填写 · 第 ${pageNumber} / ${pages} 页`;
    $('page-prev').disabled = pageNumber <= 1;
    $('page-next').disabled = pageNumber >= pages;
  }
  $('select-page').onchange = event => {
    for (const row of rows) { if (event.target.checked) selectedIds.add(row.id); else selectedIds.delete(row.id); }
    $('admin-rows').querySelectorAll('input[type="checkbox"]').forEach(box => { box.checked = event.target.checked; });
    updateSelection();
  };
  async function selectMatchingRows() {
    const from = $('select-from').value;
    const to = $('select-to').value;
    if (!from && !to) return alert('请先选择开始日期或结束日期');
    if (from && to && from > to) return alert('结束日期不能早于开始日期');
    const button = $('select-dates');
    button.disabled = true;
    try {
      const result = await api(`/api/admin/record-ids?${filterQuery()}`);
      for (const record of result.records) selectedIds.add(record.id);
      $('admin-rows').querySelectorAll('input[type="checkbox"]').forEach((box, index) => { box.checked = selectedIds.has(rows[index].id); });
      updateSelection();
    } catch (error) { alert(error.message); }
    finally { button.disabled = false; }
  }
  $('select-dates').onclick = selectMatchingRows;
  $('clear-selection').onclick = () => { selectedIds.clear(); $('admin-rows').querySelectorAll('input[type="checkbox"]').forEach(box => { box.checked = false; }); updateSelection(); };
  $('delete-selected').onclick = async () => {
    const ids = [...selectedIds];
    if (!ids.length || !confirm(`确定删除选中的 ${ids.length} 条实际填写记录吗？`)) return;
    const button = $('delete-selected'); button.disabled = true;
    try {
      for (let offset = 0; offset < ids.length; offset += 100) {
        const batch = ids.slice(offset, offset + 100);
        await api('/api/admin/records/batch-delete', { method: 'POST', body: JSON.stringify({ ids: batch }) });
        batch.forEach(id => selectedIds.delete(id));
      }
      await loadRows();
    }
    catch (error) { alert(error.message); await loadRows().catch(loadError => alert(loadError.message)); }
  };
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
        password.type = 'password'; password.minLength = 6; password.autocomplete = 'new-password'; password.placeholder = '新密码（至少6位）';
        password.setAttribute('aria-label', `修改 ${item.username} 的密码`);
        const change = el('button', '', '修改密码');
        change.onclick = async () => {
          if (password.value.length < 6) return alert('新密码至少6位');
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
    updateEditMinors();
    $('edit-minor').value = record?.minor || (record?.group === 'blessings' ? 'personal' : 'deceased');
    showError('edit-error', ''); dialog.showModal();
  }
  function updateEditMinors() {
    const group = $('edit-group').value;
    $('edit-minor-wrap').classList.toggle('hidden', group === 'patients');
    $('edit-minor').replaceChildren(...Object.entries(GROUPS[group].minors).map(([value,label]) => new Option(label,value)));
  }
  $('edit-group').onchange = updateEditMinors;
  $('edit-name').addEventListener('input', event => { if (!event.isComposing) limitInput(event.target); });
  $('edit-name').addEventListener('compositionend', event => limitInput(event.target));
  $('edit-cancel').onclick = () => dialog.close();
  $('new-record').onclick = () => openEdit(null);
  $('edit-save').onclick = async () => {
    const entry = { name: $('edit-name').value, group: $('edit-group').value, minor: $('edit-group').value === 'patients' ? '' : $('edit-minor').value };
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
  $('search-name').oninput = () => { selectedIds.clear(); pageNumber = 1; loadRows().catch(error => alert(error.message)); };
  $('filter-group').onchange = () => { selectedIds.clear(); pageNumber = 1; loadRows().catch(error => alert(error.message)); };
  for (const id of ['select-from', 'select-to']) {
    $(id).onchange = () => {
      if ($('select-from').value && $('select-to').value && $('select-from').value > $('select-to').value) return alert('结束日期不能早于开始日期');
      selectedIds.clear(); pageNumber = 1; loadRows().catch(error => alert(error.message));
    };
  }
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
  $('forgot-toggle').onclick = () => {
    $('reset-email').value = '';
    $('reset-message').textContent = '';
    $('forgot-panel').classList.toggle('hidden');
  };
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
