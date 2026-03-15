/**
 * 共享日历 - 前端逻辑
 * 功能：用户认证、日历渲染、日程管理、热力图、团队视图
 */

// ============ 全局状态 ============
const API_BASE = '';  // 同源代理，无需跨域

let currentUser = null;          // 当前登录用户
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth(); // 0-indexed
let selectedDate = null;         // 当前选中的日期字符串 YYYY-MM-DD
let schedules = [];              // 当前月的所有日程
let allUsers = [];               // 所有用户列表
let heatmapYear = new Date().getFullYear();
let isLoading = false;

// ============ 初始化 ============
document.addEventListener('DOMContentLoaded', () => {
    // 检查本地存储的登录状态
    const savedUser = localStorage.getItem('calendar_user');
    if (savedUser) {
        try {
            currentUser = JSON.parse(savedUser);
            showMainApp();
        } catch (e) {
            localStorage.removeItem('calendar_user');
        }
    }

    // 绑定回车键登录/注册
    document.getElementById('login-password').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleLogin();
    });
    document.getElementById('reg-password').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleRegister();
    });
});


// ============ 认证相关 ============
let selectedAvatarColor = '#6366f1';

function selectColor(el) {
    document.querySelectorAll('.color-option').forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');
    selectedAvatarColor = el.dataset.color;
}

function showRegister() {
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('register-form').classList.remove('hidden');
    document.getElementById('register-form').classList.add('page-transition');
}

function showLogin() {
    document.getElementById('register-form').classList.add('hidden');
    document.getElementById('login-form').classList.remove('hidden');
    document.getElementById('login-form').classList.add('page-transition');
}

async function handleLogin() {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value.trim();

    if (!username || !password) {
        showToast('请输入用户名和密码', 'warning');
        return;
    }

    const btn = document.getElementById('login-btn');
    btn.disabled = true;
    btn.textContent = '登录中...';

    try {
        const resp = await fetch(`${API_BASE}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await resp.json();

        if (data.success) {
            currentUser = data.user;
            localStorage.setItem('calendar_user', JSON.stringify(currentUser));
            showToast('登录成功', 'success');
            showMainApp();
        } else {
            btn.disabled = false;
            btn.textContent = '登录';
            alert(data.message || '登录失败');
        }
    } catch (err) {
        btn.disabled = false;
        btn.textContent = '登录';
        alert('网络错误，请确保后端服务正在运行并且密码正确！');
    } finally {
        btn.disabled = false;
        btn.textContent = '登录';
    }
}

async function handleRegister() {
    const username = document.getElementById('reg-username').value.trim();
    const nickname = document.getElementById('reg-nickname').value.trim();
    const password = document.getElementById('reg-password').value.trim();

    if (!username || !nickname || !password) {
        showToast('请填写完整信息', 'warning');
        return;
    }

    if (password.length < 4) {
        showToast('密码至少4位', 'warning');
        return;
    }

    const btn = document.getElementById('register-btn');
    btn.disabled = true;
    btn.textContent = '注册中...';

    try {
        const resp = await fetch(`${API_BASE}/api/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username,
                nickname,
                password,
                avatar_color: selectedAvatarColor
            })
        });
        const data = await resp.json();

        if (data.success) {
            currentUser = data.user;
            localStorage.setItem('calendar_user', JSON.stringify(currentUser));
            showToast('注册成功！', 'success');
            showMainApp();
        } else {
            btn.disabled = false;
            btn.textContent = '注册';
            alert(data.message || '注册失败，请检查用户名是否已存在。');
        }
    } catch (err) {
        btn.disabled = false;
        btn.textContent = '注册';
        alert('网络错误，无法连接到服务器，请确保黑框程序未关闭！');
    } finally {
        btn.disabled = false;
        btn.textContent = '注册';
    }
}

function handleLogout() {
    currentUser = null;
    localStorage.removeItem('calendar_user');
    document.getElementById('main-app').classList.add('hidden');
    document.getElementById('auth-page').classList.remove('hidden');
    // 清空表单
    document.getElementById('login-username').value = '';
    document.getElementById('login-password').value = '';
    showToast('已退出登录', 'info');
}


// ============ 主界面初始化 ============
function showMainApp() {
    document.getElementById('auth-page').classList.add('hidden');
    document.getElementById('main-app').classList.remove('hidden');

    // 设置顶部用户信息
    const avatar = document.getElementById('header-avatar');
    avatar.style.background = currentUser.avatar_color || '#6366f1';
    avatar.textContent = (currentUser.nickname || currentUser.username || '?').charAt(0);
    document.getElementById('header-nickname').textContent = currentUser.nickname || currentUser.username;

    // 加载日历数据
    loadMonthData();
    loadUsers();

    // 默认选中今天
    const now = new Date();
    selectedDate = formatDate(now);
}


// ============ 视图切换 ============
function switchView(view) {
    // 隐藏所有视图
    document.getElementById('view-calendar').classList.add('hidden');
    document.getElementById('view-heatmap').classList.add('hidden');
    document.getElementById('view-team').classList.add('hidden');

    // 更新导航状态
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    // 显示目标视图
    const viewEl = document.getElementById(`view-${view}`);
    viewEl.classList.remove('hidden');
    viewEl.classList.add('page-transition');
    document.getElementById(`nav-${view}`).classList.add('active');

    // 特殊处理
    if (view === 'heatmap') {
        renderHeatmap();
    } else if (view === 'team') {
        renderTeamView();
    }
}


// ============ 数据加载 ============
async function loadMonthData() {
    if (isLoading) return;
    isLoading = true;

    try {
        const resp = await fetch(`${API_BASE}/api/schedules?year=${currentYear}&month=${currentMonth + 1}`);
        const data = await resp.json();

        if (data.success) {
            schedules = data.schedules;
        } else {
            schedules = [];
        }
    } catch (err) {
        console.error('加载日程失败:', err);
        schedules = [];
    } finally {
        isLoading = false;
    }

    renderCalendar();

    // 如果有选中的日期，更新详情
    if (selectedDate) {
        renderDayDetail(selectedDate);
    }
}

async function loadUsers() {
    try {
        const resp = await fetch(`${API_BASE}/api/users`);
        const data = await resp.json();
        if (data.success) {
            allUsers = data.users;
        }
    } catch (err) {
        console.error('加载用户列表失败:', err);
    }
}


// ============ 日历渲染 ============
function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    grid.innerHTML = '';

    // 更新月份标题
    const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
    document.getElementById('current-month-label').textContent = `${currentYear}年 ${monthNames[currentMonth]}`;

    // 获取当月第一天和最后一天
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const startWeekday = firstDay.getDay(); // 0=周日

    const today = new Date();
    const todayStr = formatDate(today);

    // 统计每天的日程数量
    const dayCounts = {};
    schedules.forEach(s => {
        const d = s.date;
        if (d) {
            dayCounts[d] = (dayCounts[d] || 0) + 1;
        }
    });

    // 填充空白格子
    for (let i = 0; i < startWeekday; i++) {
        const empty = document.createElement('div');
        empty.className = 'h-11';
        grid.appendChild(empty);
    }

    // 填充日期格子
    for (let d = 1; d <= lastDay.getDate(); d++) {
        const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const count = dayCounts[dateStr] || 0;
        const heatLevel = getHeatLevel(count);
        const isToday = dateStr === todayStr;
        const isSelected = dateStr === selectedDate;

        const cell = document.createElement('div');
        cell.className = `calendar-cell h-11 rounded-[10px] flex flex-col items-center justify-center heat-${heatLevel}`;

        if (isToday) {
            cell.classList.add('ring-2', 'ring-apple-blue', 'ring-offset-1');
        }
        if (isSelected) {
            cell.classList.add('ring-2', 'ring-apple-text', 'ring-offset-1');
        }

        cell.innerHTML = `
            <span class="text-sm font-semibold leading-none">${d}</span>
            ${count > 0 ? `<span class="text-[8px] font-bold mt-0.5 opacity-80">${count}</span>` : ''}
        `;

        cell.onclick = () => {
            selectedDate = dateStr;
            renderCalendar();
            renderDayDetail(dateStr);
        };

        grid.appendChild(cell);
    }
}

function getHeatLevel(count) {
    if (count === 0) return 0;
    if (count === 1) return 1;
    if (count === 2) return 2;
    if (count <= 4) return 3;
    if (count <= 6) return 4;
    return 5;
}


// ============ 日期详情 ============
function renderDayDetail(dateStr) {
    const panel = document.getElementById('selected-day-panel');
    panel.classList.remove('hidden');

    // 解析日期
    const [year, month, day] = dateStr.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

    document.getElementById('selected-date-title').textContent = `${month}月${day}日`;
    document.getElementById('selected-date-weekday').textContent = `${year}年 · ${weekdays[dateObj.getDay()]}`;

    // 筛选当天日程
    const daySchedules = schedules.filter(s => s.date === dateStr);
    const listEl = document.getElementById('schedule-list');
    const emptyEl = document.getElementById('schedule-empty');

    if (daySchedules.length === 0) {
        listEl.innerHTML = '';
        emptyEl.classList.remove('hidden');
        return;
    }

    emptyEl.classList.add('hidden');
    listEl.innerHTML = daySchedules.map((s, index) => {
        const isOwn = s.user_id === currentUser.id;
        const avatarColor = s.avatar_color || '#6366f1';
        const initial = (s.nickname || '?').charAt(0);

        return `
            <div class="schedule-item flex items-start gap-3 px-5 py-3.5" style="animation-delay: ${index * 0.05}s">
                <div class="avatar avatar-sm mt-0.5" style="background: ${avatarColor}">${initial}</div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-0.5">
                        <span class="text-xs font-semibold text-apple-text">${escapeHtml(s.nickname || '未知')}</span>
                        ${isOwn ? '<span class="text-[9px] bg-apple-blue/10 text-apple-blue px-1.5 py-0.5 rounded-full font-semibold">我</span>' : ''}
                    </div>
                    <p class="text-sm text-apple-text/80 leading-relaxed break-words">${escapeHtml(s.content)}</p>
                </div>
                ${isOwn ? `
                    <button onclick="deleteSchedule('${s.id}')" class="text-apple-secondary hover:text-apple-red transition-colors flex-shrink-0 mt-1">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                        </svg>
                    </button>
                ` : ''}
            </div>
        `;
    }).join('');
}


// ============ 日程操作 ============
function showAddScheduleModal() {
    if (!selectedDate) {
        showToast('请先选择一个日期', 'warning');
        return;
    }

    const [year, month, day] = selectedDate.split('-').map(Number);
    document.getElementById('modal-date-label').textContent = `${year}年${month}月${day}日`;
    document.getElementById('schedule-input').value = '';
    document.getElementById('add-schedule-modal').classList.remove('hidden');

    setTimeout(() => {
        document.getElementById('schedule-input').focus();
    }, 300);
}

function closeAddScheduleModal() {
    document.getElementById('add-schedule-modal').classList.add('hidden');
}

async function handleAddSchedule() {
    const content = document.getElementById('schedule-input').value.trim();
    if (!content) {
        showToast('请输入工作内容', 'warning');
        return;
    }

    const btn = document.getElementById('add-schedule-btn');
    btn.disabled = true;
    btn.textContent = '添加中...';

    try {
        const resp = await fetch(`${API_BASE}/api/schedules`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                date: selectedDate,
                content: content,
                user_id: currentUser.id,
                nickname: currentUser.nickname || currentUser.username,
                avatar_color: currentUser.avatar_color || '#6366f1'
            })
        });
        const data = await resp.json();

        if (data.success) {
            showToast('添加成功', 'success');
            closeAddScheduleModal();
            // 重新加载数据
            await loadMonthData();
        } else {
            showToast(data.message || '添加失败', 'error');
        }
    } catch (err) {
        showToast('网络错误', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = '添加';
    }
}

async function deleteSchedule(recordId) {
    if (!confirm('确定删除这条安排吗？')) return;

    try {
        const resp = await fetch(`${API_BASE}/api/schedules/${recordId}`, {
            method: 'DELETE'
        });
        const data = await resp.json();

        if (data.success) {
            showToast('已删除', 'success');
            await loadMonthData();
        } else {
            showToast(data.message || '删除失败', 'error');
        }
    } catch (err) {
        showToast('网络错误', 'error');
    }
}


// ============ 月份导航 ============
function prevMonth() {
    currentMonth--;
    if (currentMonth < 0) {
        currentMonth = 11;
        currentYear--;
    }
    selectedDate = null;
    document.getElementById('selected-day-panel').classList.add('hidden');
    loadMonthData();
}

function nextMonth() {
    currentMonth++;
    if (currentMonth > 11) {
        currentMonth = 0;
        currentYear++;
    }
    selectedDate = null;
    document.getElementById('selected-day-panel').classList.add('hidden');
    loadMonthData();
}

function goToToday() {
    const now = new Date();
    currentYear = now.getFullYear();
    currentMonth = now.getMonth();
    selectedDate = formatDate(now);
    loadMonthData();
}


// ============ 热力图 ============
async function renderHeatmap() {
    document.getElementById('heatmap-year-label').textContent = `${heatmapYear}年`;
    const container = document.getElementById('heatmap-container');
    container.innerHTML = '<div class="text-center py-10 text-apple-secondary text-sm">加载中...</div>';

    // 加载全年数据（按季度分批）
    let yearSchedules = [];

    try {
        const promises = [];
        for (let m = 1; m <= 12; m++) {
            promises.push(
                fetch(`${API_BASE}/api/schedules?year=${heatmapYear}&month=${m}`)
                    .then(r => r.json())
            );
        }
        const results = await Promise.all(promises);
        results.forEach(r => {
            if (r.success) {
                yearSchedules = yearSchedules.concat(r.schedules);
            }
        });
    } catch (err) {
        container.innerHTML = '<div class="text-center py-10 text-apple-red text-sm">加载失败</div>';
        return;
    }

    // 统计每天数量
    const dayCounts = {};
    yearSchedules.forEach(s => {
        if (s.date) {
            dayCounts[s.date] = (dayCounts[s.date] || 0) + 1;
        }
    });

    // 按月份渲染
    const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
    container.innerHTML = '';

    for (let m = 0; m < 12; m++) {
        const monthDiv = document.createElement('div');
        monthDiv.className = 'bg-white rounded-apple-lg shadow-apple p-4';

        const firstDay = new Date(heatmapYear, m, 1);
        const lastDay = new Date(heatmapYear, m + 1, 0);
        const startWeekday = firstDay.getDay();

        let cellsHtml = '';

        // 空白补位
        for (let i = 0; i < startWeekday; i++) {
            cellsHtml += '<div class="mini-cell"></div>';
        }

        // 日期格子
        for (let d = 1; d <= lastDay.getDate(); d++) {
            const dateStr = `${heatmapYear}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const count = dayCounts[dateStr] || 0;
            const level = getHeatLevel(count);
            const title = count > 0 ? `${dateStr}: ${count}项安排` : dateStr;

            cellsHtml += `<div class="mini-cell heat-${level} ${level === 0 ? 'border border-apple-lightborder/50' : ''}" 
                title="${title}" 
                onclick="jumpToDate('${dateStr}')"></div>`;
        }

        monthDiv.innerHTML = `
            <div class="text-xs font-semibold text-apple-secondary mb-2">${monthNames[m]}</div>
            <div class="grid grid-cols-7 gap-[3px]">
                ${cellsHtml}
            </div>
        `;

        container.appendChild(monthDiv);
    }
}

function prevHeatmapYear() {
    heatmapYear--;
    renderHeatmap();
}

function nextHeatmapYear() {
    heatmapYear++;
    renderHeatmap();
}

function jumpToDate(dateStr) {
    const [y, m] = dateStr.split('-').map(Number);
    currentYear = y;
    currentMonth = m - 1;
    selectedDate = dateStr;
    switchView('calendar');
    loadMonthData();
}


// ============ 团队视图 ============
function renderTeamView() {
    const container = document.getElementById('team-list');

    if (allUsers.length === 0) {
        container.innerHTML = `
            <div class="text-center py-10">
                <p class="text-sm text-apple-secondary">暂无团队成员</p>
            </div>
        `;
        return;
    }

    container.innerHTML = allUsers.map(user => {
        const initial = (user.nickname || user.username || '?').charAt(0);
        const color = user.avatar_color || '#6366f1';
        const isMe = user.id === currentUser?.id;

        return `
            <div class="bg-white rounded-apple-lg shadow-apple px-5 py-4 flex items-center gap-4 schedule-item">
                <div class="avatar" style="background: ${color}">${initial}</div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                        <span class="text-sm font-semibold text-apple-text truncate">${escapeHtml(user.nickname || user.username)}</span>
                        ${isMe ? '<span class="text-[9px] bg-apple-blue/10 text-apple-blue px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0">我</span>' : ''}
                    </div>
                    <span class="text-xs text-apple-secondary">@${escapeHtml(user.username)}</span>
                </div>
                ${isMe ? '<div class="w-2 h-2 rounded-full bg-apple-green pulse-dot flex-shrink-0"></div>' : ''}
            </div>
        `;
    }).join('');
}


// ============ 工具函数 ============
function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}


// ============ Toast 通知 ============
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');

    const icons = {
        success: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>`,
        error: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>`,
        warning: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"/></svg>`,
        info: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`
    };

    const colors = {
        success: 'bg-apple-green text-white',
        error: 'bg-apple-red text-white',
        warning: 'bg-apple-orange text-white',
        info: 'bg-gray-800 text-white'
    };

    const toast = document.createElement('div');
    toast.className = `toast ${colors[type]} px-4 py-2.5 rounded-full shadow-apple-lg flex items-center gap-2 text-sm font-medium pointer-events-auto`;
    toast.innerHTML = `${icons[type]}<span>${message}</span>`;

    container.appendChild(toast);

    // 自动消失
    setTimeout(() => {
        toast.classList.add('toast-out');
        setTimeout(() => toast.remove(), 250);
    }, 2500);
}
