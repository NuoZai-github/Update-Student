// ===== Auth Check =====
const USER_ID = localStorage.getItem('cbk_user_id');
if (!USER_ID) {
    window.location.href = 'login.html';
}

// ===== Supabase Config =====
const SUPABASE_URL = 'https://elcizzczflunmjuyfhvq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsY2l6emN6Zmx1bm1qdXlmaHZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NTA0MjgsImV4cCI6MjA5MTQyNjQyOH0.GpzoX8xkmMtFFur6HyZMhwvRrheHDn4gYCT1bo5QZ40';
const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' };

// ===== State =====
let currentMonth = new Date();
let students = [];
let courses = [];
let milestones = [];
let monthlyUpdates = [];

// ===== Helpers =====
function getMonthKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
function formatMonth(date) {
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// ===== Supabase API =====
async function supaFetch(table, opts = {}) {
    const { method = 'GET', body, query = '' } = opts;
    
    let fQuery = query;
    if (fQuery.includes('?')) fQuery += `&user_id=eq.${USER_ID}`;
    else fQuery = `?user_id=eq.${USER_ID}`;

    let fBody = body;
    if (body) {
        if (Array.isArray(body)) fBody = body.map(b => ({ ...b, user_id: USER_ID }));
        else fBody = { ...body, user_id: USER_ID };
    }

    const url = `${SUPABASE_URL}/rest/v1/${table}${fQuery}`;
    const options = { method, headers: { ...headers } };
    if (fBody) options.body = JSON.stringify(fBody);
    if (method === 'DELETE' || method === 'PATCH') options.headers['Prefer'] = 'return=representation';
    const res = await fetch(url, options);
    if (!res.ok) { const err = await res.text(); throw new Error(err); }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
}

// ===== Data Loading =====
async function loadAll() {
    try {
        [students, courses, milestones] = await Promise.all([
            supaFetch('students', { query: '?order=name.asc' }),
            supaFetch('courses', { query: '?order=name.asc' }),
            supaFetch('progress_milestones', { query: '?order=label.asc' }),
        ]);
        await loadMonthlyUpdates();
        renderAll();
    } catch (e) {
        console.error('Load error:', e);
        showToast('Failed to load data: ' + e.message, 'error');
    }
}

async function loadMonthlyUpdates() {
    const mk = getMonthKey(currentMonth);
    monthlyUpdates = await supaFetch('monthly_updates', { query: `?month_year=eq.${mk}&select=*` });
}

// ===== Initialize Month =====
async function initializeMonth() {
    const mk = getMonthKey(currentMonth);
    const existing = monthlyUpdates.map(u => u.student_id);
    const toCreate = students.filter(s => !existing.includes(s.id));
    if (toCreate.length === 0) {
        showToast('All students already initialized for this month', 'info');
        return;
    }
    try {
        const body = toCreate.map(s => ({ student_id: s.id, month_year: mk, status: 'pending' }));
        await supaFetch('monthly_updates', { method: 'POST', body });
        showToast(`Initialized ${toCreate.length} students for ${formatMonth(currentMonth)}`, 'success');
        await loadMonthlyUpdates();
        renderAll();
    } catch (e) {
        showToast('Error initializing month: ' + e.message, 'error');
    }
}

// ===== Update Status =====
async function setUpdateStatus(studentId, newStatus) {
    const mk = getMonthKey(currentMonth);
    const record = monthlyUpdates.find(u => u.student_id === studentId);
    if (record) {
        await supaFetch('monthly_updates', {
            method: 'PATCH',
            query: `?id=eq.${record.id}`,
            body: { status: newStatus, updated_at: new Date().toISOString() }
        });
    } else {
        await supaFetch('monthly_updates', {
            method: 'POST',
            body: { student_id: studentId, month_year: mk, status: newStatus, updated_at: new Date().toISOString() }
        });
    }
    await loadMonthlyUpdates();
    renderAll();
    const statusLabels = { pending: 'Pending', updated: 'Updated' };
    showToast(`Status changed to "${statusLabels[newStatus]}"`, 'success');
}

// ===== Render All =====
function renderAll() {
    renderMonthDisplay();
    renderStats();
    renderProgressBar();
    renderPendingList();
    renderTracker();
    renderStudents();
    renderManageData();
    populateDropdowns();
}

// ===== Month Display =====
function renderMonthDisplay() {
    document.getElementById('monthDisplay').textContent = formatMonth(currentMonth);
    document.getElementById('currentMonthBadge').textContent = `📅 ${formatMonth(currentMonth)}`;
}

// ===== Stats =====
function renderStats() {
    const total = students.length;
    const updated = monthlyUpdates.filter(u => u.status === 'updated').length;
    const pending = total - updated;
    document.getElementById('statTotal').textContent = total;
    document.getElementById('statUpdated').textContent = updated;
    document.getElementById('statPending').textContent = Math.max(0, pending);
}

// ===== Progress Bar =====
function renderProgressBar() {
    const total = students.length;
    if (total === 0) {
        document.getElementById('progressBar').style.width = '0%';
        document.getElementById('progressPercentage').textContent = '0%';
        document.getElementById('progressHint').textContent = 'Add students to get started';
        return;
    }
    const done = monthlyUpdates.filter(u => u.status === 'updated').length;
    const pct = Math.round((done / total) * 100);
    document.getElementById('progressBar').style.width = pct + '%';
    document.getElementById('progressPercentage').textContent = pct + '%';
    if (pct === 100) document.getElementById('progressHint').textContent = '🎉 All students updated this month!';
    else if (pct >= 50) document.getElementById('progressHint').textContent = `Almost there! ${total - done} students remaining.`;
    else if (pct > 0) document.getElementById('progressHint').textContent = `${done} of ${total} students updated. Keep going!`;
    else document.getElementById('progressHint').textContent = 'Click "Update Tracker" to start marking students.';
}

// ===== Pending List =====
function renderPendingList() {
    const container = document.getElementById('pendingList');
    const updatedIds = monthlyUpdates.filter(u => u.status === 'updated').map(u => u.student_id);
    const pending = students.filter(s => !updatedIds.includes(s.id));
    if (pending.length === 0) {
        container.innerHTML = '<p class="empty-state">✅ All students updated! Great job!</p>';
        return;
    }
    container.innerHTML = pending.map(s => `
        <div class="pending-item">
            <div class="pending-item-info">
                <span class="pending-item-name">${esc(s.name)}</span>
                <span class="pending-item-course">${esc(s.course_name || 'No course')}</span>
            </div>
            <button class="btn btn-sm btn-success" onclick="setUpdateStatus('${s.id}','updated')">✅ Mark Updated</button>
        </div>
    `).join('');
}

// ===== Tracker =====
function renderTracker() {
    const tbody = document.getElementById('trackerTableBody');
    const courseFilter = document.getElementById('trackerCourseFilter').value;
    const statusFilter = document.getElementById('trackerStatusFilter').value;

    let filtered = [...students];
    if (courseFilter !== 'all') filtered = filtered.filter(s => s.course_name === courseFilter);

    if (filtered.length === 0) {
        tbody.innerHTML = '';
        document.getElementById('trackerEmpty').style.display = 'block';
        return;
    }
    document.getElementById('trackerEmpty').style.display = 'none';

    // Build rows with status
    const rows = filtered.map(s => {
        const record = monthlyUpdates.find(u => u.student_id === s.id);
        const status = record ? record.status : 'pending';
        return { ...s, updateStatus: status, record };
    });

    const finalRows = statusFilter === 'all' ? rows : rows.filter(r => r.updateStatus === statusFilter);

    tbody.innerHTML = finalRows.map(r => {
        const statusBadge = {
            pending: '<span class="status-badge status-pending">⏳ Pending</span>',
            updated: '<span class="status-badge status-updated">✅ Updated</span>'
        }[r.updateStatus];

        return `<tr>
            <td><strong>${esc(r.name)}</strong></td>
            <td>${esc(r.course_name || '-')}</td>
            <td>${esc(r.current_progress || '-')}</td>
            <td>${statusBadge || ''}</td>
            <td>
                <div style="display:flex;gap:6px;">
                    ${r.updateStatus !== 'updated' ? `<button class="btn btn-sm btn-success" onclick="setUpdateStatus('${r.id}','updated')">✅</button>` : ''}
                    ${r.updateStatus !== 'pending' ? `<button class="btn btn-sm btn-secondary" onclick="setUpdateStatus('${r.id}','pending')">↩️</button>` : ''}
                </div>
            </td>
        </tr>`;
    }).join('');
}

// ===== Students Page =====
function renderStudents() {
    const grid = document.getElementById('studentsGrid');
    if (students.length === 0) {
        grid.innerHTML = '<p class="empty-state">No students yet. Click "Add Student" to start!</p>';
        return;
    }
    grid.innerHTML = students.map(s => `
        <div class="student-card">
            <div class="student-card-header">
                <span class="student-card-name">${esc(s.name)}</span>
                <div class="student-card-actions">
                    <button class="btn btn-sm btn-secondary" onclick="editStudent('${s.id}')">✏️</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteStudent('${s.id}','${esc(s.name)}')">🗑️</button>
                </div>
            </div>
            <div class="student-card-detail">📘 ${esc(s.course_name || 'No course')}</div>
            <div class="student-card-detail">📊 ${esc(s.current_progress || 'Not set')}</div>
            ${s.special_notes ? `<div class="student-card-detail">📝 ${esc(s.special_notes)}</div>` : ''}
        </div>
    `).join('');
}

// ===== Add / Edit Student =====
function showStudentForm(edit = false) {
    document.getElementById('addStudentForm').style.display = 'block';
    document.getElementById('studentFormTitle').textContent = edit ? 'Edit Student' : 'Add New Student';
}
function hideStudentForm() {
    document.getElementById('addStudentForm').style.display = 'none';
    document.getElementById('studentName').value = '';
    document.getElementById('studentCourse').value = '';
    document.getElementById('studentProgress').value = '';
    document.getElementById('studentNotes').value = '';
    document.getElementById('editStudentId').value = '';
}

async function saveStudent() {
    const id = document.getElementById('editStudentId').value;
    const name = document.getElementById('studentName').value.trim();
    const course_name = document.getElementById('studentCourse').value;
    const current_progress = document.getElementById('studentProgress').value;
    const special_notes = document.getElementById('studentNotes').value.trim();
    if (!name) { showToast('Please enter a student name', 'error'); return; }
    try {
        const body = { name, course_name: course_name || null, current_progress: current_progress || null, special_notes: special_notes || null };
        if (id) {
            await supaFetch('students', { method: 'PATCH', query: `?id=eq.${id}`, body });
            showToast('Student updated!', 'success');
        } else {
            await supaFetch('students', { method: 'POST', body });
            showToast('Student added!', 'success');
        }
        hideStudentForm();
        await loadAll();
    } catch (e) {
        showToast('Error: ' + e.message, 'error');
    }
}

function editStudent(id) {
    const s = students.find(st => st.id === id);
    if (!s) return;
    document.getElementById('editStudentId').value = id;
    document.getElementById('studentName').value = s.name;
    document.getElementById('studentCourse').value = s.course_name || '';
    document.getElementById('studentProgress').value = s.current_progress || '';
    document.getElementById('studentNotes').value = s.special_notes || '';
    showStudentForm(true);
    navigateTo('students');
}

function deleteStudent(id, name) {
    showModal(`Are you sure you want to delete <strong>${name}</strong>? This will also delete all their monthly update records.`, async () => {
        try {
            await supaFetch('students', { method: 'DELETE', query: `?id=eq.${id}` });
            showToast('Student deleted', 'success');
            await loadAll();
        } catch (e) {
            showToast('Error: ' + e.message, 'error');
        }
    });
}

// ===== Manage Data =====
function renderManageData() {
    // Courses
    const cl = document.getElementById('manageCoursesList');
    cl.innerHTML = courses.length === 0 ? '<p class="empty-state">No courses</p>' :
        courses.map(c => `<div class="manage-item"><span class="manage-item-name">${esc(c.name)}</span><button class="btn btn-sm btn-danger" onclick="deleteCourse('${c.id}')">🗑️</button></div>`).join('');

    // Milestones
    const ml = document.getElementById('manageMilestonesList');
    ml.innerHTML = milestones.length === 0 ? '<p class="empty-state">No milestones</p>' :
        milestones.map(m => `<div class="manage-item"><span class="manage-item-name">${esc(m.label)}</span><button class="btn btn-sm btn-danger" onclick="deleteMilestone('${m.id}')">🗑️</button></div>`).join('');
}

async function addCourse() {
    const name = document.getElementById('newCourseName').value.trim();
    if (!name) return;
    try {
        await supaFetch('courses', { method: 'POST', body: { name } });
        document.getElementById('newCourseName').value = '';
        showToast('Course added!', 'success');
        await loadAll();
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
}
async function deleteCourse(id) {
    showModal('Delete this course?', async () => {
        try { await supaFetch('courses', { method: 'DELETE', query: `?id=eq.${id}` }); showToast('Deleted', 'success'); await loadAll(); }
        catch (e) { showToast('Error: ' + e.message, 'error'); }
    });
}
async function addMilestone() {
    const label = document.getElementById('newMilestoneName').value.trim();
    if (!label) return;
    try {
        await supaFetch('progress_milestones', { method: 'POST', body: { label } });
        document.getElementById('newMilestoneName').value = '';
        showToast('Milestone added!', 'success');
        await loadAll();
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
}
async function deleteMilestone(id) {
    showModal('Delete this milestone?', async () => {
        try { await supaFetch('progress_milestones', { method: 'DELETE', query: `?id=eq.${id}` }); showToast('Deleted', 'success'); await loadAll(); }
        catch (e) { showToast('Error: ' + e.message, 'error'); }
    });
}

// ===== Dropdowns =====
function populateDropdowns() {
    // Student form dropdowns
    const courseSelect = document.getElementById('studentCourse');
    const saved = courseSelect.value;
    courseSelect.innerHTML = '<option value="">Select course...</option>' + courses.map(c => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('');
    courseSelect.value = saved;

    const progressSelect = document.getElementById('studentProgress');
    const savedP = progressSelect.value;
    progressSelect.innerHTML = '<option value="">Select progress...</option>' + milestones.map(m => `<option value="${esc(m.label)}">${esc(m.label)}</option>`).join('');
    progressSelect.value = savedP;

    // Tracker course filter
    const tcf = document.getElementById('trackerCourseFilter');
    const savedTcf = tcf.value;
    const uniqueCourses = [...new Set(students.map(s => s.course_name).filter(Boolean))];
    tcf.innerHTML = '<option value="all">All Courses</option>' + uniqueCourses.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    tcf.value = savedTcf;
}

// ===== Navigation =====
function navigateTo(page) {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));
    document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === `page-${page}`));
    const titles = { dashboard: ['Dashboard', 'Monthly update overview'], tracker: ['Update Tracker', 'Track which students have been updated'], students: ['Students', 'Manage student information'], manage: ['Manage Data', 'Courses & milestones'] };
    const [t, s] = titles[page] || ['', ''];
    document.getElementById('pageTitle').textContent = t;
    document.getElementById('pageSubtitle').textContent = s;
    // Close mobile sidebar
    document.getElementById('sidebar').classList.remove('open');
}

// ===== Month Navigation =====
function changeMonth(delta) {
    currentMonth.setMonth(currentMonth.getMonth() + delta);
    loadMonthlyUpdates().then(() => renderAll());
}

// ===== Toast =====
function showToast(msg, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = msg;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(40px)'; setTimeout(() => toast.remove(), 300); }, 3000);
}

// ===== Modal =====
let modalCallback = null;
function showModal(message, onConfirm) {
    document.getElementById('modalOverlay').style.display = 'flex';
    document.getElementById('modalBody').innerHTML = message;
    modalCallback = onConfirm;
}
function hideModal() {
    document.getElementById('modalOverlay').style.display = 'none';
    modalCallback = null;
}

// ===== Escape HTML =====
function esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ===== Event Listeners =====
document.addEventListener('DOMContentLoaded', () => {
    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => navigateTo(item.dataset.page));
    });

    // Month navigation
    document.getElementById('prevMonth').addEventListener('click', () => changeMonth(-1));
    document.getElementById('nextMonth').addEventListener('click', () => changeMonth(1));

    // Mobile menu
    document.getElementById('menuToggle').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('open');
    });

    // Quick actions
    document.getElementById('actionGoTracker').addEventListener('click', () => navigateTo('tracker'));
    document.getElementById('actionGoStudents').addEventListener('click', () => navigateTo('students'));

    // Tracker
    document.getElementById('initMonthBtn').addEventListener('click', initializeMonth);
    document.getElementById('trackerCourseFilter').addEventListener('change', renderTracker);
    document.getElementById('trackerStatusFilter').addEventListener('change', renderTracker);

    // Students
    document.getElementById('addStudentBtn').addEventListener('click', () => { hideStudentForm(); showStudentForm(false); });
    document.getElementById('cancelStudentBtn').addEventListener('click', hideStudentForm);
    document.getElementById('saveStudentBtn').addEventListener('click', saveStudent);

    // Manage data
    document.getElementById('addCourseBtn').addEventListener('click', addCourse);
    document.getElementById('addMilestoneBtn').addEventListener('click', addMilestone);

    // Modal
    document.getElementById('modalClose').addEventListener('click', hideModal);
    document.getElementById('modalCancel').addEventListener('click', hideModal);
    document.getElementById('modalConfirm').addEventListener('click', () => { if (modalCallback) modalCallback(); hideModal(); });
    document.getElementById('modalOverlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) hideModal(); });

    // Logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('cbk_user_id');
            localStorage.removeItem('cbk_username');
            window.location.href = 'login.html';
        });
        document.getElementById('pageTitle').textContent += ` - Welcome ${localStorage.getItem('cbk_username') || ''}`;
    }

    // Load data
    loadAll();
});
