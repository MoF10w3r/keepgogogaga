/**
 * 鸽子养殖后台管理系统 - 前端逻辑
 * 纯原生 JavaScript，无任何框架依赖
 */

// ==================== 用户认证 ====================

let authToken = localStorage.getItem('pigeon_token') || '';
let currentUser = '';

function setToken(token) {
    authToken = token;
    if (token) {
        localStorage.setItem('pigeon_token', token);
    } else {
        localStorage.removeItem('pigeon_token');
    }
}

function api(url, options = {}) {
    const defaults = {
        headers: { 'Content-Type': 'application/json' }
    };
    if (authToken) {
        defaults.headers['Authorization'] = 'Bearer ' + authToken;
    }
    const config = Object.assign({}, defaults, options);
    if (config.body && typeof config.body === 'object') {
        config.body = JSON.stringify(config.body);
    }
    return fetch(API_BASE + url, config).then(async r => {
        const json = await r.json();
        // 401 自动跳登录
        if (r.status === 401) {
            setToken('');
            currentUser = '';
            showAuthPage();
        }
        return json;
    });
}

function handleAuth() {
    const isRegister = document.getElementById('authSubmitBtn').textContent === '注 册';
    const username = document.getElementById('authUsername').value.trim();
    const password = document.getElementById('authPassword').value.trim();
    const errEl = document.getElementById('authError');
    errEl.textContent = '';

    if (!username || !password) {
        errEl.textContent = '请填写用户名和密码';
        return;
    }

    if (isRegister) {
        const confirmPw = document.getElementById('authConfirm').value.trim();
        if (password !== confirmPw) {
            errEl.textContent = '两次密码不一致';
            return;
        }
        if (password.length < 4) {
            errEl.textContent = '密码至少4位';
            return;
        }
    }

    const url = isRegister ? '/api/register' : '/api/login';
    const payload = { username, password };

    fetch(API_BASE + url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(r => r.json())
    .then(res => {
        if (res.code === 0) {
            setToken(res.data.token);
            currentUser = res.data.username;
            hideAuthPage();
            showToast(isRegister ? '注册成功！' : '登录成功！', 'success');
            // 如果注册成功，进入仓库页面
            if (isRegister) {
                switchPage('home');
            } else {
                switchPage('warehouse');
            }
        } else {
            errEl.textContent = res.msg || '操作失败';
        }
    })
    .catch(e => {
        errEl.textContent = '网络错误：' + e.message;
    });
}

function toggleAuthMode() {
    const isRegister = document.getElementById('authSubmitBtn').textContent === '注 册';
    const title = document.getElementById('authTitle');
    const btn = document.getElementById('authSubmitBtn');
    const confirmGroup = document.getElementById('confirmGroup');
    const switchText = document.getElementById('switchText');
    const switchLink = document.getElementById('switchLink');
    const errEl = document.getElementById('authError');

    if (isRegister) {
        // 切换到登录
        title.textContent = '用户登录';
        btn.textContent = '登 录';
        confirmGroup.style.display = 'none';
        switchText.textContent = '还没有账号？';
        switchLink.textContent = '立即注册';
    } else {
        // 切换到注册
        title.textContent = '用户注册';
        btn.textContent = '注 册';
        confirmGroup.style.display = '';
        switchText.textContent = '已有账号？';
        switchLink.textContent = '返回登录';
    }
    errEl.textContent = '';
    document.getElementById('authUsername').focus();
}

function showAuthPage() {
    document.getElementById('authOverlay').style.display = 'flex';
}

function hideAuthPage() {
    document.getElementById('authOverlay').style.display = 'none';
    // 显示顶部用户信息
    document.getElementById('topbarUser').textContent = '👤 ' + currentUser;
    document.getElementById('logoutLink').style.display = '';
}

function handleLogout() {
    fetch(API_BASE + '/api/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken }
    }).finally(() => {
        setToken('');
        currentUser = '';
        document.getElementById('topbarUser').textContent = '👤';
        document.getElementById('logoutLink').style.display = 'none';
        showAuthPage();
        switchPage('home');
    });
}

// ==================== 全局状态 ====================
const API_BASE = '';  // 同源部署，无需前缀

let state = {
    // 当前页面
    currentPage: 'home',
    // 仓库列表数据
    warehouses: [],
    // 当前选中的仓库
    currentWhId: null,
    currentWhName: '',
    // 排列表数据
    rows: [],
    currentRowId: null,
    currentRowNumber: null,
    // 列列表数据
    columns: [],
    currentColId: null,
    currentColNumber: null,
    // 笼列表数据
    cages: [],

    // 分页状态
    whPage: { page: 1, size: 20 },
    rowPage: { page: 1, size: 20 },
    colPage: { page: 1, size: 20 },
    cagePage: { page: 1, size: 20 },

    // 搜索过滤
    whSearch: '',
    rowSearch: '',
    colSearch: '',
    cageSearch: '',

    // 选中的行（用于批量操作）
    selectedWhIds: new Set(),
    selectedRowIds: new Set(),
    selectedColIds: new Set(),
    selectedCageIds: new Set(),
};

// ==================== 工具函数 ====================

function showToast(msg, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 3000);
}

// ==================== 页面切换 ====================

function switchPage(page, event) {
    if (event) event.preventDefault();
    state.currentPage = page;

    // 更新侧边栏激活状态
    document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.toggle('active', el.dataset.page === page);
    });

    // 显示对应页面
    document.getElementById('pageHome').style.display = page === 'home' ? '' : 'none';
    document.getElementById('pageWarehouse').style.display = page === 'warehouse' ? '' : 'none';

    // 更新面包屑和工具栏
    updateToolbar();

    // 进入仓库页面时加载数据
    if (page === 'warehouse') {
        loadWarehouses();
    }

    // 移动端关闭侧边栏
    document.getElementById('sidebar').classList.remove('open');
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
}

function updateToolbar() {
    const crumb1 = document.getElementById('crumb1');
    const actions = document.getElementById('toolbarActions');

    switch (state.currentPage) {
        case 'home':
            crumb1.textContent = '系统首页';
            crumb1.className = 'crumb active';
            actions.innerHTML = '';
            break;
        case 'warehouse':
            crumb1.textContent = '鸽仓信息列表';
            crumb1.className = 'crumb active';
            actions.innerHTML = `
                <button class="btn btn-primary" onclick="handleAdd()">＋ 添加仓库</button>
                <button class="btn btn-danger" onclick="handleDelete()">－ 删除仓库</button>
                <button class="btn btn-info" onclick="handleManage()">管理排</button>
            `;
            break;
        case 'export':
        case 'process':
            crumb1.textContent = state.currentPage === 'export' ? '导出预放仔名单' : '导出待处理异常名单';
            crumb1.className = 'crumb active';
            actions.innerHTML = '';
            break;
    }
}

// ==================== 仓库 CRUD ====================

async function loadWarehouses() {
    try {
        const res = await api('/api/warehouses');
        if (res.code === 0) {
            state.warehouses = res.data;
            renderWhTable();
        } else {
            showToast(res.msg || '加载失败', 'error');
        }
    } catch (e) {
        showToast('网络错误：' + e.message, 'error');
    }
}

function renderWhTable() {
    const tbody = document.getElementById('whTableBody');
    let data = state.warehouses;

    // 搜索过滤
    if (state.whSearch) {
        const q = state.whSearch.toLowerCase();
        data = data.filter(item =>
            String(item.id).includes(q) ||
            item.name.toLowerCase().includes(q)
        );
    }

    const total = data.length;
    const { page, size } = state.whPage;
    const totalPages = Math.max(1, Math.ceil(total / size));
    const start = (page - 1) * size;
    const paged = data.slice(start, start + size);

    if (paged.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="table-empty">暂无数据</td></tr>`;
    } else {
        tbody.innerHTML = paged.map((item, idx) => `
            <tr data-id="${item.id}" onclick="toggleSelectRow(this, ${item.id}, 'wh')" 
                style="cursor:pointer;">
                <td><input type="checkbox" ${state.selectedWhIds.has(item.id) ? 'checked' : ''} 
                    onclick="event.stopPropagation();toggleCheck(${item.id}, 'wh')"></td>
                <td>${start + idx + 1}</td>
                <td>${item.id}</td>
                <td>${escHtml(item.name)}</td>
                <td>${item.total_rows}</td>
                <td>${item.total_columns}</td>
                <td>${item.total_cages}</td>
                <td class="action-btns">
                    <button class="btn btn-sm btn-primary" onclick="event.stopPropagation();openRowModal(${item.id}, '${escHtml(item.name)}')">排管理</button>
                </td>
            </tr>
        `).join('');
    }

    renderPagination('whPagination', page, totalPages, total, (p) => {
        state.whPage.page = p;
        renderWhTable();
    });
}

function filterTable() {
    state.whSearch = document.getElementById('searchWh').value.trim();
    state.whPage.page = 1;
    renderWhTable();
}

function handleAdd() {
    showInput('添加仓库', '仓库名称：', '', async (name) => {
        if (!name.trim()) { showToast('名称不能为空', 'warning'); return; }
        const res = await api('/api/warehouses', { method: 'POST', body: { name } });
        if (res.code === 0) {
            showToast('添加成功');
            loadWarehouses();
        } else {
            showToast(res.msg || '添加失败', 'error');
        }
    });
}

function handleDelete() {
    if (state.selectedWhIds.size === 0) {
        showToast('请先勾选要删除的仓库', 'warning');
        return;
    }
    showConfirm(
        `确认删除选中的 ${state.selectedWhIds.size} 个仓库？<br><span style="color:#ff4d4f;font-size:13px;">此操作将级联删除所有下属的排、列、笼数据！</span>`,
        async () => {
            let ok = true;
            for (const id of state.selectedWhIds) {
                const res = await api(`/api/warehouses/${id}`, { method: 'DELETE' });
                if (res.code !== 0) { ok = false; showToast(`删除ID=${id}失败`, 'error'); }
            }
            if (ok) {
                showToast('删除成功');
                state.selectedWhIds.clear();
                loadWarehouses();
            }
        }
    );
}

function handleManage() {
    if (state.selectedWhIds.size !== 1) {
        showToast('请先选中一个仓库进行管理', 'warning');
        return;
    }
    const whId = [...state.selectedWhIds][0];
    const wh = state.warehouses.find(w => w.id === whId);
    openRowModal(whId, wh ? wh.name : '');
}

// ==================== 排管理弹窗 ====================

function openRowModal(whId, whName) {
    state.currentWhId = whId;
    state.currentWhName = whName;
    state.selectedRowIds.clear();
    state.rowPage.page = 1;
    state.rowSearch = '';

    document.getElementById('rowModalTitle').textContent = `排管理 — ${whName} (ID:${whId})`;
    document.getElementById('rowModal').style.display = 'flex';

    loadRows();
}

async function loadRows() {
    const res = await api(`/api/warehouses/${state.currentWhId}/rows`);
    if (res.code === 0) {
        state.rows = res.data;
        renderRowTable();
    } else {
        showToast(res.msg || '加载排列表失败', 'error');
    }
}

function renderRowTable() {
    const tbody = document.getElementById('rowTableBody');
    let data = state.rows;

    if (state.rowSearch) {
        const q = state.rowSearch.toLowerCase();
        data = data.filter(item => String(item.row_number).includes(q));
    }

    const total = data.length;
    const { page, size } = state.rowPage;
    const totalPages = Math.max(1, Math.ceil(total / size));
    const start = (page - 1) * size;
    const paged = data.slice(start, start + size);

    if (paged.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="table-empty">暂无数据</td></tr>`;
    } else {
        tbody.innerHTML = paged.map((item, idx) => `
            <tr data-id="${item.id}">
                <td><input type="checkbox" ${state.selectedRowIds.has(item.id) ? 'checked' : ''}
                    onchange="toggleCheck(${item.id}, 'row')"></td>
                <td>${start + idx + 1}</td>
                <td>${item.row_number}</td>
                <td>${item.total_columns}</td>
                <td>${item.cages_per_column}</td>
                <td>${item.total_cages}</td>
                <td class="action-btns">
                    <button class="btn btn-sm btn-success" onclick="openColModal(${item.id}, ${item.row_number})">管理列</button>
                </td>
            </tr>
        `).join('');
    }

    renderPagination('rowPagination', page, totalPages, total, (p) => {
        state.rowPage.page = p;
        renderRowTable();
    });
}

function filterRowTable() {
    state.rowSearch = document.getElementById('searchRow').value.trim();
    state.rowPage.page = 1;
    renderRowTable();
}

function handleAddRow() {
    showInput('添加排', '排编号：', '1', async (num) => {
        const rowNumber = parseInt(num);
        if (isNaN(rowNumber)) { showToast('请输入有效数字', 'warning'); return; }
        const res = await api(`/api/warehouses/${state.currentWhId}/rows`, {
            method: 'POST',
            body: { row_number: rowNumber }
        });
        if (res.code === 0) {
            showToast('添加成功');
            loadRows();
        } else {
            showToast(res.msg || '添加失败', 'error');
        }
    });
}

function handleDeleteRow() {
    if (state.selectedRowIds.size === 0) {
        showToast('请先勾选要删除的排', 'warning');
        return;
    }
    showConfirm(
        `确认删除选中的 ${state.selectedRowIds.size} 个排？<br><span style="color:#ff4d4f;font-size:13px;">将同时删除其下所有列和笼！</span>`,
        async () => {
            for (const id of state.selectedRowIds) {
                await api(`/api/warehouses/${state.currentWhId}/rows/${id}`, { method: 'DELETE' });
            }
            showToast('删除成功');
            state.selectedRowIds.clear();
            loadRows();
        }
    );
}

function handleManageColumns() {
    if (state.selectedRowIds.size !== 1) {
        showToast('请先选中一个排', 'warning');
        return;
    }
    const rowId = [...state.selectedRowIds][0];
    const row = state.rows.find(r => r.id === rowId);
    openColModal(rowId, row ? row.row_number : 0);
}

// ==================== 列管理弹窗 ====================

function openColModal(rowId, rowNumber) {
    state.currentRowId = rowId;
    state.currentRowNumber = rowNumber;
    state.selectedColIds.clear();
    state.colPage.page = 1;
    state.colSearch = '';

    document.getElementById('colModalTitle').textContent =
        `列管理 — ${state.currentWhName} > 第${rowNumber}排`;
    document.getElementById('colModal').style.display = 'flex';

    loadColumns();
}

async function loadColumns() {
    const res = await api(`/api/warehouses/${state.currentWhId}/rows/${state.currentRowId}/columns`);
    if (res.code === 0) {
        state.columns = res.data;
        renderColTable();
    } else {
        showToast(res.msg || '加载列列表失败', 'error');
    }
}

function renderColTable() {
    const tbody = document.getElementById('colTableBody');
    let data = state.columns;

    if (state.colSearch) {
        const q = state.colSearch.toLowerCase();
        data = data.filter(item => String(item.col_number).includes(q));
    }

    const total = data.length;
    const { page, size } = state.colPage;
    const totalPages = Math.max(1, Math.ceil(total / size));
    const start = (page - 1) * size;
    const paged = data.slice(start, start + size);

    if (paged.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="table-empty">暂无数据</td></tr>`;
    } else {
        tbody.innerHTML = paged.map((item, idx) => `
            <tr data-id="${item.id}">
                <td><input type="checkbox" ${state.selectedColIds.has(item.id) ? 'checked' : ''}
                    onchange="toggleCheck(${item.id}, 'col')"></td>
                <td>${start + idx + 1}</td>
                <td>${item.col_number}</td>
                <td>${item.total_cages}</td>
                <td class="action-btns">
                    <button class="btn btn-sm btn-success" onclick="openCageModal(${item.id}, ${item.col_number})">管理笼</button>
                </td>
            </tr>
        `).join('');
    }

    renderPagination('colPagination', page, totalPages, total, (p) => {
        state.colPage.page = p;
        renderColTable();
    });
}

function filterColTable() {
    state.colSearch = document.getElementById('searchCol').value.trim();
    state.colPage.page = 1;
    renderColTable();
}

function handleAddCol() {
    showInput('添加列', '列编号：', '1', async (num) => {
        const colNumber = parseInt(num);
        if (isNaN(colNumber)) { showToast('请输入有效数字', 'warning'); return; }
        const res = await api(
            `/api/warehouses/${state.currentWhId}/rows/${state.currentRowId}/columns`,
            { method: 'POST', body: { col_number: colNumber } }
        );
        if (res.code === 0) {
            showToast('添加成功');
            loadColumns();
        } else {
            showToast(res.msg || '添加失败', 'error');
        }
    });
}

function handleDeleteCol() {
    if (state.selectedColIds.size === 0) {
        showToast('请先勾选要删除的列', 'warning');
        return;
    }
    showConfirm(
        `确认删除选中的 ${state.selectedColIds.size} 个列？<br><span style="color:#ff4d4f;font-size:13px;">将同时删除其下所有笼！</span>`,
        async () => {
            for (const id of state.selectedColIds) {
                await api(
                    `/api/warehouses/${state.currentWhId}/rows/${state.currentRowId}/columns/${id}`,
                    { method: 'DELETE' }
                );
            }
            showToast('删除成功');
            state.selectedColIds.clear();
            loadColumns();
        }
    );
}

function handleManageCages() {
    if (state.selectedColIds.size !== 1) {
        showToast('请先选中一个列', 'warning');
        return;
    }
    const colId = [...state.selectedColIds][0];
    const col = state.columns.find(c => c.id === colId);
    openCageModal(colId, col ? col.col_number : 0);
}

// ==================== 笼管理弹窗 ====================

function openCageModal(colId, colNumber) {
    state.currentColId = colId;
    state.currentColNumber = colNumber;
    state.selectedCageIds.clear();
    state.cagePage.page = 1;
    state.cageSearch = '';

    document.getElementById('cageModalTitle').textContent =
        `笼管理 — ${state.currentWhName} > 第${state.currentRowNumber}排 > 第${colNumber}列`;
    document.getElementById('cageModal').style.display = 'flex';

    loadCages();
}

async function loadCages() {
    const res = await api(
        `/api/warehouses/${state.currentWhId}/rows/${state.currentRowId}/columns/${state.currentColId}/cages`
    );
    if (res.code === 0) {
        state.cages = res.data;
        renderCageTable();
    } else {
        showToast(res.msg || '加载笼列表失败', 'error');
    }
}

function renderCageTable() {
    const tbody = document.getElementById('cageTableBody');
    let data = state.cages;

    if (state.cageSearch) {
        const q = state.cageSearch.toLowerCase();
        data = data.filter(item => String(item.cage_number).includes(q));
    }

    const total = data.length;
    const { page, size } = state.cagePage;
    const totalPages = Math.max(1, Math.ceil(total / size));
    const start = (page - 1) * size;
    const paged = data.slice(start, start + size);

    if (paged.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="table-empty">暂无数据</td></td></tr>`;
    } else {
        tbody.innerHTML = paged.map((item, idx) => `
            <tr data-id="${item.id}">
                <td><input type="checkbox" ${state.selectedCageIds.has(item.id) ? 'checked' : ''}
                    onchange="toggleCheck(${item.id}, 'cage')"></td>
                <td>${start + idx + 1}</td>
                <td>${item.cage_number}</td>
                <td>${item.id}</td>
                <td class="action-btns">
                    <button class="btn btn-sm btn-danger" onclick="deleteSingleCage(${item.id})">删除</button>
                </td>
            </tr>
        `).join('');
    }

    renderPagination('cagePagination', page, totalPages, total, (p) => {
        state.cagePage.page = p;
        renderCageTable();
    });
}

function filterCageTable() {
    state.cageSearch = document.getElementById('searchCage').value.trim();
    state.cagePage.page = 1;
    renderCageTable();
}

function handleAddCage() {
    showInput('添加笼', '笼编号：', '1', async (num) => {
        const cageNumber = parseInt(num);
        if (isNaN(cageNumber)) { showToast('请输入有效数字', 'warning'); return; }
        const res = await api(
            `/api/warehouses/${state.currentWhId}/rows/${state.currentRowId}/columns/${state.currentColId}/cages`,
            { method: 'POST', body: { cage_number: cageNumber } }
        );
        if (res.code === 0) {
            showToast('添加成功');
            loadCages();
        } else {
            showToast(res.msg || '添加失败', 'error');
        }
    });
}

function handleDeleteCage() {
    if (state.selectedCageIds.size === 0) {
        showToast('请先勾选要删除的笼', 'warning');
        return;
    }
    showConfirm(`确认删除选中的 ${state.selectedCageIds.size} 个笼？`, async () => {
        for (const id of state.selectedCageIds) {
            await api(
                `/api/warehouses/${state.currentWhId}/rows/${state.currentRowId}/columns/${state.currentColId}/cages/${id}`,
                { method: 'DELETE' }
            );
        }
        showToast('删除成功');
        state.selectedCageIds.clear();
        loadCages();
    });
}

async function deleteSingleCage(cageId) {
    showConfirm('确认删除该笼？', async () => {
        const res = await api(
            `/api/warehouses/${state.currentWhId}/rows/${state.currentRowId}/columns/${state.currentColId}/cages/${cageId}`,
            { method: 'DELETE' }
        );
        if (res.code === 0) {
            showToast('删除成功');
            loadCages();
        } else {
            showToast(res.msg || '删除失败', 'error');
        }
    });
}

// ==================== 弹窗控制 ====================

function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}

// 点击遮罩层关闭弹窗
document.addEventListener('click', function(e) {
    if (e.target.classList.contains('modal-overlay')) {
        e.target.style.display = 'none';
    }
});

function showConfirm(htmlMsg, onOk) {
    const modal = document.getElementById('confirmModal');
    document.getElementById('confirmBody').innerHTML = htmlMsg;
    const okBtn = document.getElementById('confirmOkBtn');
    // 移除旧事件监听器
    const newBtn = okBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(newBtn, okBtn);
    newBtn.addEventListener('click', async () => {
        closeModal('confirmModal');
        await onOk();
    });
    modal.style.display = 'flex';
}

function showInput(title, label, defaultValue, onOk) {
    const modal = document.getElementById('inputModal');
    document.getElementById('inputTitle').textContent = title;
    document.getElementById('inputLabel').textContent = label;
    const field = document.getElementById('inputField');
    field.value = defaultValue;
    const okBtn = document.getElementById('inputOkBtn');
    const newBtn = okBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(newBtn, okBtn);
    newBtn.addEventListener('click', async () => {
        const val = field.value.trim();
        if (!val) return;
        closeModal('inputModal');
        await onOk(val);
    });
    modal.style.display = 'flex';
    // 聚焦输入框并绑定回车
    setTimeout(() => { field.focus(); field.select(); }, 100);
    field.onkeydown = (e) => {
        if (e.key === 'Enter') newBtn.click();
    };
}

// ==================== 选择逻辑 ====================

function toggleSelectRow(tr, id, type) {
    const setMap = {
        wh: state.selectedWhIds,
        row: state.selectedRowIds,
        col: state.selectedColIds,
        cage: state.selectedCageIds
    };
    const s = setMap[type];
    if (s.has(id)) {
        s.delete(id);
        tr.classList.remove('selected');
    } else {
        s.add(id);
        tr.classList.add('selected');
    }
    // 更新复选框状态
    const cb = tr.querySelector('input[type="checkbox"]');
    if (cb) cb.checked = s.has(id);
}

function toggleCheck(id, type) {
    const setMap = {
        wh: state.selectedWhIds,
        row: state.selectedRowIds,
        col: state.selectedColIds,
        cage: state.selectedCageIds
    };
    const s = setMap[type];
    if (s.has(id)) s.delete(id); else s.add(id);
}

// ==================== 分页组件 ====================

function renderPagination(containerId, currentPage, totalPages, totalItems, onPageChange) {
    const container = document.getElementById(containerId);
    if (totalPages <= 1 && totalItems <= 20) {
        container.innerHTML = `<span class="page-info">共 ${totalItems} 条</span>`;
        return;
    }

    let html = `<span class="page-info">共 ${totalItems} 条 &nbsp; ${state.whPage.size}条/页</span>`;

    // 上一页
    html += `<button ${currentPage <= 1 ? 'disabled' : ''} 
        onclick="${currentPage > 1 ? `(${onPageChange.toString()})(${currentPage - 1})` : ''}">&lt;</button>`;

    // 页码
    const maxVisible = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);
    if (endPage - startPage < maxVisible - 1) {
        startPage = Math.max(1, endPage - maxVisible + 1);
    }

    if (startPage > 1) {
        html += `<button onclick="(${onPageChange.toString()})(1)">1</button>`;
        if (startPage > 2) html += `<span>...</span>`;
    }
    for (let i = startPage; i <= endPage; i++) {
        html += `<button ${i === currentPage ? 'disabled' : ''} 
            style="${i === currentPage ? 'font-weight:bold;color:var(--primary-color);border-color:var(--primary-color);' : ''}"
            onclick="(${onPageChange.toString()})(i)">${i}</button>`;
    }
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) html += `<span>...</span>`;
        html += `<button onclick="(${onPageChange.toString()})(${totalPages})">${totalPages}</button>`;
    }

    // 下一页
    html += `<button ${currentPage >= totalPages ? 'disabled' : ''} 
        onclick="${currentPage < totalPages ? `(${onPageChange.toString()})(${currentPage + 1})` : ''}">&gt;</button>`;

    // 跳转
    html += `<span style="margin-left:12px;">前往</span>
        <input type="text" class="page-jump" id="jump${containerId}" value="${currentPage}" 
        onkeydown="if(event.key==='Enter'){const v=parseInt(this.value);if(v>=1&&v<=${totalPages}){(${onPageChange.toString()})(v)}}">
        <span>页</span>`;

    container.innerHTML = html;
}

// ==================== 工具函数 ====================

function escHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ==================== 初始化 ====================

document.addEventListener('DOMContentLoaded', function() {
    // 检查登录状态
    showAuthPage();
    if (authToken) {
        fetch(API_BASE + '/api/session', {
            headers: { 'Authorization': 'Bearer ' + authToken }
        })
        .then(r => r.json())
        .then(res => {
            if (res.code === 0 && res.data) {
                currentUser = res.data.username;
                hideAuthPage();
                switchPage('warehouse');
            } else {
                setToken('');
                showAuthPage();
            }
        })
        .catch(() => {
            showAuthPage();
        });
    }

    // 登录框回车提交
    document.getElementById('authPassword').addEventListener('keydown', function(e) {
        if (e.key === 'Enter') handleAuth();
    });
    document.getElementById('authConfirm').addEventListener('keydown', function(e) {
        if (e.key === 'Enter') handleAuth();
    });

    // ESC 关闭弹窗
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            ['rowModal', 'colModal', 'cageModal', 'confirmModal', 'inputModal'].forEach(id => {
                const el = document.getElementById(id);
                if (el.style.display !== 'none') el.style.display = 'none';
            });
        }
    });
});
