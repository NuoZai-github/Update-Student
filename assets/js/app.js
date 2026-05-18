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
let classLogs = [];
let selectedStudents = new Set();

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
        await loadClassLogs();
        renderAll();
    } catch (e) {
        console.error('Load error:', e);
        showToast('Failed to load data: ' + e.message, 'error');
    }
}

async function loadMonthlyUpdates() {
    const mk = getMonthKey(currentMonth);
    monthlyUpdates = await supaFetch('monthly_updates', { query: `?month_year=eq.${mk}&select=*` });
    
    // Auto-init if no records found for current month
    if (monthlyUpdates.length === 0 && students.length > 0) {
        await initializeMonth(true);
    }
}

async function loadClassLogs() {
    const y = currentMonth.getFullYear();
    const m = currentMonth.getMonth() + 1;
    const startStr = `${y}-${String(m).padStart(2, '0')}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const endStr = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    classLogs = await supaFetch('class_logs', { query: `?date=gte.${startStr}&date=lte.${endStr}&order=date.desc` }) || [];
}

// ===== Initialize Month =====
async function initializeMonth(silent = false) {
    const mk = getMonthKey(currentMonth);
    const existing = monthlyUpdates.map(u => u.student_id);
    const toCreate = students.filter(s => !existing.includes(s.id));
    if (toCreate.length === 0) {
        if (!silent) showToast('All students already initialized for this month', 'info');
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
    renderWages();
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
    const timeFilterEl = document.getElementById('dashboardTimeFilter');
    const timeFilter = timeFilterEl ? timeFilterEl.value : 'all';

    const updatedIds = monthlyUpdates.filter(u => u.status === 'updated').map(u => u.student_id);
    let pending = students.filter(s => !updatedIds.includes(s.id));
    
    if (timeFilter !== 'all') {
        pending = pending.filter(s => s.class_time === timeFilter);
    }
    
    if (pending.length === 0) {
        if (students.filter(s => !updatedIds.includes(s.id)).length === 0) {
            container.innerHTML = '<p class="empty-state">✅ All students updated! Great job!</p>';
        } else {
            container.innerHTML = '<p class="empty-state">✅ No pending students for this class time.</p>';
        }
        return;
    }
    container.innerHTML = pending.map(s => `
        <div class="pending-item">
            <div class="pending-item-info">
                <span class="pending-item-name">${esc(s.name)}</span>
                <span class="pending-item-course">${esc(s.course_name || 'No course')} | 🕒 ${esc(s.class_time || 'No timeslot')}</span>
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

    // Reset selection if this is a fresh render from filter change
    // (In a more complex app we might keep them, but here it's safer to reset)
    if (selectedStudents.size > 0) {
        selectedStudents.clear();
        document.getElementById('selectAll').checked = false;
    }

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

        const isChecked = selectedStudents.has(r.id);
        
        // Inline milestone dropdown
        const milestoneOptions = milestones.map(m => 
            `<option value="${esc(m.label)}" ${r.current_progress === m.label ? 'selected' : ''}>${esc(m.label)}</option>`
        ).join('');

        return `<tr>
            <td><input type="checkbox" class="student-checkbox" data-id="${r.id}" ${isChecked ? 'checked' : ''}></td>
            <td><strong>${esc(r.name)}</strong></td>
            <td>${esc(r.course_name || '-')}</td>
            <td><span style="font-size: 0.85rem; color: var(--text-secondary); font-weight: 500;">🕒 ${esc(r.class_time || '-')}</span></td>
            <td>
                <select class="inline-edit-select" onchange="quickUpdateMilestone('${r.id}', this.value)">
                    <option value="">Select...</option>
                    ${milestoneOptions}
                </select>
            </td>
            <td>${statusBadge || ''}</td>
            <td>
                <div style="display:flex;gap:6px;">
                    <button class="btn btn-sm btn-info" onclick="copyUpdateMessage('${r.id}')" title="Copy Parent Message">📋</button>
                    ${r.updateStatus !== 'updated' ? `<button class="btn btn-sm btn-success" onclick="setUpdateStatus('${r.id}','updated')">✅</button>` : ''}
                    ${r.updateStatus !== 'pending' ? `<button class="btn btn-sm btn-secondary" onclick="setUpdateStatus('${r.id}','pending')">↩️</button>` : ''}
                </div>
            </td>
        </tr>`;
    }).join('');

    updateBatchUI();
}

// ===== Quick Milestone Update =====
async function quickUpdateMilestone(studentId, newMilestone) {
    try {
        await supaFetch('students', {
            method: 'PATCH',
            query: `?id=eq.${studentId}`,
            body: { current_progress: newMilestone || null }
        });
        // Update local state to avoid full reload if possible, but loadAll is safer
        const s = students.find(st => st.id === studentId);
        if (s) s.current_progress = newMilestone;
        showToast('Milestone updated!', 'success');
        renderAll();
    } catch (e) {
        showToast('Failed to update milestone: ' + e.message, 'error');
    }
}

// ===== Copy Parent Message =====
function copyUpdateMessage(studentId) {
    const s = students.find(st => st.id === studentId);
    if (!s) return;
    
    const milestone = s.current_progress || 'their current module';
    const course = s.course_name || 'their course';
    const notes = s.special_notes ? `\n\nNotes: ${s.special_notes}` : '';
    
    const message = `Hi Parent! This is a monthly update for ${s.name}. 

${s.name} is currently working on "${milestone}" in the ${course} course. They have been making steady progress and showing great interest! 🌟${notes}

Keep up the great work, ${s.name}!`;

    navigator.clipboard.writeText(message).then(() => {
        showToast('Parent message copied to clipboard!', 'success');
        // Also mark as updated if it's currently pending
        const record = monthlyUpdates.find(u => u.student_id === studentId);
        if (record && record.status === 'pending') {
            setUpdateStatus(studentId, 'updated');
        }
    });
}

// ===== Batch UI =====
function updateBatchUI() {
    const btn = document.getElementById('batchUpdateBtn');
    const count = selectedStudents.size;
    if (count > 0) {
        btn.style.display = 'inline-block';
        btn.textContent = `Mark Selected as Updated (${count})`;
    } else {
        btn.style.display = 'none';
    }
}

async function handleBatchUpdate() {
    if (selectedStudents.size === 0) return;
    const mk = getMonthKey(currentMonth);
    const ids = Array.from(selectedStudents);
    
    try {
        // Find existing records to update and new ones to create
        const existing = monthlyUpdates.filter(u => ids.includes(u.student_id));
        const existingIds = existing.map(u => u.student_id);
        const toCreateIds = ids.filter(id => !existingIds.includes(id));
        
        const promises = [];
        
        // Update existing
        if (existing.length > 0) {
            const queryIds = existing.map(u => u.id).join(',');
            promises.push(supaFetch('monthly_updates', {
                method: 'PATCH',
                query: `?id=in.(${queryIds})`,
                body: { status: 'updated', updated_at: new Date().toISOString() }
            }));
        }
        
        // Create new
        if (toCreateIds.length > 0) {
            const body = toCreateIds.map(sid => ({ student_id: sid, month_year: mk, status: 'updated', updated_at: new Date().toISOString() }));
            promises.push(supaFetch('monthly_updates', { method: 'POST', body }));
        }
        
        await Promise.all(promises);
        showToast(`Successfully updated ${ids.length} students!`, 'success');
        selectedStudents.clear();
        document.getElementById('selectAll').checked = false;
        await loadMonthlyUpdates();
        renderAll();
    } catch (e) {
        showToast('Batch update error: ' + e.message, 'error');
    }
}

// ===== Wages / Class Records =====
function renderWages() {
    const tbody = document.getElementById('logsTableBody');
    let totalHours = 0;
    
    if (classLogs.length === 0) {
        tbody.innerHTML = '';
        document.getElementById('logsEmpty').style.display = 'block';
    } else {
        document.getElementById('logsEmpty').style.display = 'none';
        tbody.innerHTML = classLogs.map(log => {
            totalHours += parseFloat(log.hours || 0);
            const student = students.find(s => s.id === log.student_id);
            const studentName = student ? student.name : 'Unknown Student';
            const courseName = student ? (student.course_name || '-') : '-';
            
            return `<tr>
                <td><strong>${esc(log.date)}</strong></td>
                <td>${esc(studentName)}</td>
                <td>${esc(courseName)}</td>
                <td>${esc(log.hours)} hr</td>
                <td>
                    <button class="btn btn-sm btn-danger" onclick="deleteClassLog('${log.id}')">🗑️</button>
                </td>
            </tr>`;
        }).join('');
    }
    
    const rate = parseFloat(document.getElementById('logRate').value || 35);
    const totalWages = totalHours * rate;
    
    document.getElementById('statTotalHours').textContent = totalHours.toFixed(1);
    document.getElementById('statTotalWages').textContent = 'RM ' + totalWages.toFixed(2);
}

function showLogForm() {
    document.getElementById('addLogForm').style.display = 'block';
    if(!document.getElementById('logDate').value) {
        document.getElementById('logDate').value = new Date().toISOString().split('T')[0];
    }
}
function hideLogForm() {
    document.getElementById('addLogForm').style.display = 'none';
    document.getElementById('logStudent').value = '';
    document.getElementById('logHours').value = '';
}

async function saveClassLog() {
    const date = document.getElementById('logDate').value;
    const student_id = document.getElementById('logStudent').value;
    const hours = document.getElementById('logHours').value;
    
    if (!date || !student_id || !hours) {
        showToast('Please fill all fields', 'error');
        return;
    }
    
    try {
        await supaFetch('class_logs', { method: 'POST', body: { date, student_id, hours: parseFloat(hours) } });
        showToast('Class logged successfully!', 'success');
        hideLogForm();
        await loadAll();
    } catch (e) {
        showToast('Error: ' + e.message, 'error');
    }
}

async function quickLogClass(studentId) {
    const date = new Date().toISOString().split('T')[0];
    const hours = 1;
    
    try {
        await supaFetch('class_logs', { method: 'POST', body: { date, student_id: studentId, hours } });
        showToast('Class logged successfully (1 hr)!', 'success');
        await loadAll();
    } catch (e) {
        showToast('Error: ' + e.message, 'error');
    }
}

function deleteClassLog(id) {
    showModal('Delete this class record?', async () => {
        try {
            await supaFetch('class_logs', { method: 'DELETE', query: `?id=eq.${id}` });
            showToast('Record deleted', 'success');
            await loadAll();
        } catch (e) { showToast('Error: ' + e.message, 'error'); }
    });
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
            <div class="student-card-detail">🕒 ${esc(s.class_time || 'No timeslot')}</div>
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
    document.getElementById('studentClassTime').value = '';
    document.getElementById('studentProgress').value = '';
    document.getElementById('studentNotes').value = '';
    document.getElementById('editStudentId').value = '';
}

async function saveStudent() {
    const id = document.getElementById('editStudentId').value;
    const name = document.getElementById('studentName').value.trim();
    const course_name = document.getElementById('studentCourse').value;
    const class_time = document.getElementById('studentClassTime').value.trim();
    const current_progress = document.getElementById('studentProgress').value;
    const special_notes = document.getElementById('studentNotes').value.trim();
    if (!name) { showToast('Please enter a student name', 'error'); return; }
    try {
        const body = { name, course_name: course_name || null, class_time: class_time || null, current_progress: current_progress || null, special_notes: special_notes || null };
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
    document.getElementById('studentClassTime').value = s.class_time || '';
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
    tcf.value = savedTcf || 'all';

    // Dashboard time filter
    const dtf = document.getElementById('dashboardTimeFilter');
    if (dtf) {
        const savedDtf = dtf.value;
        const uniqueTimes = [...new Set(students.map(s => s.class_time).filter(Boolean))].sort();
        dtf.innerHTML = '<option value="all">All Class Times</option>' + uniqueTimes.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
        dtf.value = savedDtf || 'all';
    }

    // Log Class student filter
    const lcf = document.getElementById('logStudent');
    const savedLcf = lcf.value;
    lcf.innerHTML = '<option value="">Select student...</option>' + students.map(s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
    lcf.value = savedLcf;
}

// ===== Navigation =====
function navigateTo(page) {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));
    document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === `page-${page}`));
    const titles = { dashboard: ['Dashboard', 'Monthly update overview'], tracker: ['Update Tracker', 'Track which students have been updated'], students: ['Students', 'Manage student information'], wages: ['Class Records', 'Track class hours and calculate wages'], manage: ['Manage Data', 'Courses & milestones'] };
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

// ===== Student Sync Feature =====
function showSyncModal() {
    document.getElementById('syncModalOverlay').style.display = 'flex';
    const body = document.getElementById('syncModalBody');
    body.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 40px 0;">
            <div class="sync-spinner"></div>
            <p style="font-weight: 500; color: var(--text-secondary);">Connecting to Google Sheets Attendance System...</p>
        </div>
    `;
    document.getElementById('syncModalFooter').style.display = 'none';
    
    // Fetch data
    fetch('https://script.google.com/macros/s/AKfycbwvXLG3ru42tvp2Se-AS5E0ltkeTmeoAa0LoEPTHBBD76iMDhR92kKwg4jAvvZVoolU/exec?action=getStudents')
        .then(res => {
            if (!res.ok) throw new Error('Network response was not ok');
            return res.text();
        })
        .then(text => {
            // Determine if the response is HTML or JSON
            if (text.trim().startsWith('<') || text.includes('doctype') || text.includes('DOCTYPE')) {
                // It is HTML, meaning they need to update their doGet() function
                renderSyncInstructions();
            } else {
                // It is JSON, parse and match
                try {
                    const sheetStudents = JSON.parse(text);
                    if (Array.isArray(sheetStudents)) {
                        processSyncData(sheetStudents);
                    } else {
                        throw new Error('Response is not a valid JSON array');
                    }
                } catch (e) {
                    renderSyncInstructions();
                }
            }
        })
        .catch(err => {
            console.error('Sync fetch error:', err);
            renderSyncInstructions(); // Fallback to instructions if fetch fails or is CORS blocked
        });
}

function hideSyncModal() {
    document.getElementById('syncModalOverlay').style.display = 'none';
}

function renderSyncInstructions() {
    const body = document.getElementById('syncModalBody');
    body.innerHTML = `
        <div class="sync-instruction-card" style="padding: 16px;">
            <p style="margin-bottom: 12px; font-weight: 700; color: var(--primary); font-size: 1rem; display: flex; align-items: center; gap: 8px;">
                📋 Semi-Automatic Sync (Paste Data)
            </p>
            <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 12px; line-height: 1.5;">
                Since you don't have permission to modify the Google Sheet's code, we can sync by pasting the data directly!
            </p>
            <ol style="font-size: 0.85rem; color: var(--text-secondary); margin-left: 20px; margin-bottom: 16px; display: flex; flex-direction: column; gap: 6px; line-height: 1.5;">
                <li>Open the <a href="https://script.google.com/macros/s/AKfycbwvXLG3ru42tvp2Se-AS5E0ltkeTmeoAa0LoEPTHBBD76iMDhR92kKwg4jAvvZVoolU/exec" target="_blank" style="color: var(--primary); font-weight: bold; text-decoration: underline;">Google Attendance Webpage</a>.</li>
                <li>Press <strong>Ctrl + A</strong> (or Cmd + A) to highlight everything, then <strong>Ctrl + C</strong> to copy.</li>
                <li>Click inside the box below and press <strong>Ctrl + V</strong> to paste, then click Analyze.</li>
            </ol>
            <textarea id="syncPasteArea" style="width: 100%; height: 140px; padding: 12px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--bg-card); color: var(--text-primary); font-family: monospace; font-size: 0.85rem; resize: vertical; margin-bottom: 16px;" placeholder="Paste the copied attendance data here..."></textarea>
            
            <div style="display: flex; justify-content: flex-end; gap: 12px;">
                <button class="btn btn-primary" id="analyzePasteBtn" style="padding: 8px 16px;">🔍 Analyze Data</button>
            </div>
        </div>
    `;
    document.getElementById('syncModalFooter').style.display = 'none';

    document.getElementById('analyzePasteBtn').addEventListener('click', () => {
        const text = document.getElementById('syncPasteArea').value;
        const sheetStudents = parsePastedStudents(text);
        if (sheetStudents.length === 0) {
            showToast('No valid students found. Please make sure you copied the table correctly.', 'error');
            return;
        }
        processSyncData(sheetStudents);
    });
}

function parsePastedStudents(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const parsed = [];
    const seen = new Set();
    const currentUser = (localStorage.getItem('cbk_username') || '').toLowerCase().trim();
    
    // Strategy 1: Multi-line block format (e.g. copied from div-based table)
    // Format: Line 1 = Name, Line 2 = Course\tNumber\tTimeslot\tMentor...
    for (let i = 1; i < lines.length; i++) {
        if (lines[i].includes('\t')) {
            const prevLine = lines[i-1];
            // If the previous line has no tabs, is not purely numbers, and is not a known junk line
            if (!prevLine.includes('\t') && prevLine.toLowerCase() !== 'attend' && isNaN(prevLine)) {
                const name = prevLine.trim();
                const cols = lines[i].split('\t');
                const course = cols[0].trim();
                const class_time = cols.length > 2 ? cols[2].trim() : '';
                const mentor = cols.length > 3 ? cols[3].trim().toLowerCase() : '';
                
                // CRITICAL: Only include students where the mentor matches the logged-in user
                if (mentor && currentUser && !mentor.includes(currentUser) && !currentUser.includes(mentor)) {
                    continue;
                }
                
                if (name.length > 1 && !name.toLowerCase().includes('report abuse') && !name.toLowerCase().includes('learn more') && !name.toLowerCase().includes('attendance tracker')) {
                    const key = name.toLowerCase();
                    if (!seen.has(key)) {
                        seen.add(key);
                        parsed.push({ name, course, class_time });
                    }
                }
            }
        }
    }
    
    // If Strategy 1 succeeded, it means the pasted data perfectly matches the block format
    if (parsed.length > 0) {
        return parsed;
    }
    
    // Strategy 2: Tab-separated standard table format
    const hasTabs = lines.some(line => line.includes('\t'));
    if (hasTabs) {
        let nameCol = 0, courseCol = 1, mentorCol = -1, timeCol = -1; 
        const headerIdx = lines.findIndex(l => l.toLowerCase().includes('name') || l.toLowerCase().includes('student'));
        
        if (headerIdx !== -1) {
            const cols = lines[headerIdx].toLowerCase().split('\t');
            const nIdx = cols.findIndex(c => c.includes('name') || c.includes('student'));
            const cIdx = cols.findIndex(c => c.includes('course') || c.includes('class') || c.includes('level') || c.includes('subject'));
            const mIdx = cols.findIndex(c => c.includes('mentor') || c.includes('teacher') || c.includes('tutor'));
            const tIdx = cols.findIndex(c => c.includes('time') || c.includes('slot') || c.includes('schedule') || c.includes('day'));
            if (nIdx !== -1) nameCol = nIdx;
            if (cIdx !== -1) courseCol = cIdx;
            if (mIdx !== -1) mentorCol = mIdx;
            if (tIdx !== -1) timeCol = tIdx;
        }

        for (let i = 0; i < lines.length; i++) {
            if (i === headerIdx) continue;
            const cols = lines[i].split('\t');
            if (cols.length >= 2) {
                const name = cols[nameCol] ? cols[nameCol].trim() : '';
                const course = cols[courseCol] ? cols[courseCol].trim() : '';
                const class_time = (timeCol !== -1 && cols[timeCol]) ? cols[timeCol].trim() : '';
                const mentor = (mentorCol !== -1 && cols[mentorCol]) ? cols[mentorCol].trim().toLowerCase() : '';
                
                if (mentor && currentUser && !mentor.includes(currentUser) && !currentUser.includes(mentor)) {
                    continue;
                }
                
                if (name && name.length > 1 && isNaN(name) && !name.toLowerCase().includes('report abuse') && !name.toLowerCase().includes('learn more')) {
                    const key = name.toLowerCase();
                    if (!seen.has(key)) {
                        seen.add(key);
                        parsed.push({ name, course, class_time });
                    }
                }
            }
        }
    } else {
        // Strategy 3: Space-separated or unstructured lines (No mentor check possible here)
        for (const line of lines) {
            const lLow = line.toLowerCase();
            if (lLow.includes('report abuse') || lLow.includes('learn more') || lLow.includes('attendance tracker') || lLow.includes('created by a google')) {
                continue;
            }
            
            const parts = line.split(/\s{2,}|\t/); 
            let name = '', course = '';
            
            if (parts.length >= 2) {
                name = parts[0].trim();
                course = parts[1].trim();
            } else {
                name = line.trim();
            }
            
            if (name && name.length > 1 && isNaN(name)) {
                const key = name.toLowerCase();
                if (!seen.has(key)) {
                    seen.add(key);
                    parsed.push({ name, course, class_time: '' });
                }
            }
        }
    }
    
    return parsed;
}

let pendingSyncActions = { additions: [], updates: [], deletions: [] };

function processSyncData(sheetStudents) {
    const body = document.getElementById('syncModalBody');
    
    // Normalize lists
    const currentStudentsMap = new Map();
    students.forEach(s => {
        currentStudentsMap.set(s.name.trim().toLowerCase(), s);
    });

    const sheetStudentsMap = new Map();
    const sheetUnique = [];
    sheetStudents.forEach(s => {
        if (!s.name) return;
        const key = s.name.trim().toLowerCase();
        if (!sheetStudentsMap.has(key)) {
            sheetStudentsMap.set(key, s);
            sheetUnique.push(s);
        }
    });

    // 1. Additions
    const additions = [];
    sheetUnique.forEach(s => {
        const key = s.name.trim().toLowerCase();
        if (!currentStudentsMap.has(key)) {
            additions.push({
                name: s.name.trim(),
                course_name: s.course ? s.course.trim() : null,
                class_time: s.class_time ? s.class_time.trim() : null
            });
        }
    });

    // 2. Updates
    const updates = [];
    sheetUnique.forEach(s => {
        const key = s.name.trim().toLowerCase();
        if (currentStudentsMap.has(key)) {
            const existing = currentStudentsMap.get(key);
            const sheetCourse = s.course ? s.course.trim() : '';
            const dbCourse = existing.course_name ? existing.course_name.trim() : '';
            
            const sheetTime = s.class_time ? s.class_time.trim() : '';
            const dbTime = existing.class_time ? existing.class_time.trim() : '';
            
            if (sheetCourse !== dbCourse || (sheetTime && sheetTime !== dbTime)) {
                updates.push({
                    id: existing.id,
                    name: existing.name,
                    oldCourse: dbCourse || 'No course',
                    newCourse: sheetCourse || null,
                    oldTime: dbTime || 'No timeslot',
                    newTime: sheetTime || null
                });
            }
        }
    });

    // 3. Deletions (REMOVED)
    // We explicitly avoid deleting students not in the current paste, 
    // because the paste might just be for one specific class!
    
    pendingSyncActions = { additions, updates, deletions: [] };

    if (additions.length === 0 && updates.length === 0) {
        body.innerHTML = `
            <div style="text-align: center; padding: 40px 0;">
                <span style="font-size: 3rem; display: block; margin-bottom: 16px;">✨</span>
                <h4 style="font-size: 1.1rem; font-weight: 700; color: var(--text-primary); margin-bottom: 8px;">Already Perfect!</h4>
                <p style="font-size: 0.85rem; color: var(--text-secondary);">Your student list is already perfectly in sync with the Google Sheets Attendance System.</p>
            </div>
        `;
        document.getElementById('syncModalFooter').style.display = 'none';
        return;
    }

    let html = `
        <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 16px;">
            We compared your database with the Google Sheets Attendance System. Select the changes you want to apply:
        </p>
    `;

    // Render Additions Section
    if (additions.length > 0) {
        html += `
            <div class="sync-section-title">
                <span>➕</span> New Students Found (${additions.length})
            </div>
            <div class="sync-list">
                ${additions.map((item, idx) => `
                    <div class="sync-item">
                        <div class="sync-item-left">
                            <input type="checkbox" class="sync-item-checkbox" data-type="add" data-index="${idx}" checked>
                            <div class="sync-item-info">
                                <span class="sync-item-name">${esc(item.name)}</span>
                                <span class="sync-item-details">Course: <strong>${esc(item.course_name || 'None')}</strong> | Time: <strong>${esc(item.class_time || 'None')}</strong></span>
                            </div>
                        </div>
                        <span class="sync-badge sync-badge-add">+ Add</span>
                    </div>
                `).join('')}
            </div>
        `;
    }

    // Render Updates Section
    if (updates.length > 0) {
        html += `
            <div class="sync-section-title" style="margin-top: 24px;">
                <span>✏️</span> Student Updates (${updates.length})
            </div>
            <div class="sync-list">
                ${updates.map((item, idx) => {
                    let detailsHTML = '';
                    if (item.oldCourse !== (item.newCourse || '')) {
                        detailsHTML += `Course: <span style="text-decoration: line-through; color: var(--text-muted);">${esc(item.oldCourse)}</span> ➔ <strong>${esc(item.newCourse || 'None')}</strong><br>`;
                    }
                    if (item.oldTime !== (item.newTime || '') && item.newTime) {
                        detailsHTML += `Time: <span style="text-decoration: line-through; color: var(--text-muted);">${esc(item.oldTime)}</span> ➔ <strong>${esc(item.newTime)}</strong>`;
                    }
                    return `
                        <div class="sync-item">
                            <div class="sync-item-left">
                                <input type="checkbox" class="sync-item-checkbox" data-type="update" data-index="${idx}" checked>
                                <div class="sync-item-info">
                                    <span class="sync-item-name">${esc(item.name)}</span>
                                    <span class="sync-item-details" style="display:block; margin-top:4px;">${detailsHTML}</span>
                                </div>
                            </div>
                            <span class="sync-badge sync-badge-update">Update</span>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    body.innerHTML = html;
    
    // Show the confirm buttons
    document.getElementById('syncModalFooter').style.display = 'flex';
    document.getElementById('syncModalConfirm').disabled = false;
    document.getElementById('syncModalConfirm').textContent = 'Sync Selected Changes';
}

async function executeSync() {
    const confirmBtn = document.getElementById('syncModalConfirm');
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = `<div class="sync-spinner" style="width: 16px; height: 16px; border-width: 2px; display: inline-block; vertical-align: middle; margin-right: 8px; animation: spin 1s linear infinite;"></div> Syncing...`;

    // Read checkboxes
    const checkboxes = document.querySelectorAll('.sync-item-checkbox');
    const checkedAdditions = [];
    const checkedUpdates = [];

    checkboxes.forEach(cb => {
        if (!cb.checked) return;
        const type = cb.dataset.type;
        const idx = parseInt(cb.dataset.index);

        if (type === 'add') checkedAdditions.push(pendingSyncActions.additions[idx]);
        else if (type === 'update') checkedUpdates.push(pendingSyncActions.updates[idx]);
    });

    if (checkedAdditions.length === 0 && checkedUpdates.length === 0) {
        showToast('No changes selected to sync.', 'info');
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Sync Selected Changes';
        return;
    }

    try {
        // 1. Create any missing courses in the `courses` table first
        const newCourses = [...new Set(checkedAdditions.map(a => a.course_name).filter(Boolean))];
        const existingCourseNames = courses.map(c => c.name.trim().toLowerCase());
        
        const coursesToCreate = newCourses.filter(name => !existingCourseNames.includes(name.trim().toLowerCase()));
        
        for (const courseName of coursesToCreate) {
            await supaFetch('courses', { method: 'POST', body: { name: courseName } });
        }

        // 2. Perform additions
        for (const item of checkedAdditions) {
            await supaFetch('students', {
                method: 'POST',
                body: {
                    name: item.name,
                    course_name: item.course_name,
                    class_time: item.class_time
                }
            });
        }

        // 3. Perform updates
        for (const item of checkedUpdates) {
            const bodyObj = {};
            if (item.newCourse) bodyObj.course_name = item.newCourse;
            if (item.newTime) bodyObj.class_time = item.newTime;
            
            if (Object.keys(bodyObj).length > 0) {
                await supaFetch('students', {
                    method: 'PATCH',
                    query: `?id=eq.${item.id}`,
                    body: bodyObj
                });
            }
        }

        showToast(`Successfully synchronized! Added ${checkedAdditions.length}, Updated ${checkedUpdates.length} students.`, 'success');
        hideSyncModal();
        await loadAll();
    } catch (e) {
        console.error('Execute sync error:', e);
        showToast('Sync failed: ' + e.message, 'error');
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Sync Selected Changes';
    }
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

    // Wages
    document.getElementById('addLogBtn').addEventListener('click', showLogForm);
    document.getElementById('cancelLogBtn').addEventListener('click', hideLogForm);
    document.getElementById('saveLogBtn').addEventListener('click', saveClassLog);
    document.getElementById('logRate').addEventListener('input', renderWages);

    // Sync Students Button & Modal Listeners
    document.getElementById('syncStudentsBtn').addEventListener('click', showSyncModal);
    document.getElementById('syncModalClose').addEventListener('click', hideSyncModal);
    document.getElementById('syncModalCancel').addEventListener('click', hideSyncModal);
    document.getElementById('syncModalConfirm').addEventListener('click', executeSync);
    document.getElementById('syncModalOverlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) hideSyncModal(); });

    // Manage data
    document.getElementById('addCourseBtn').addEventListener('click', addCourse);
    document.getElementById('addMilestoneBtn').addEventListener('click', addMilestone);

    // Batch and Select All
    document.getElementById('selectAll').addEventListener('change', (e) => {
        const checked = e.target.checked;
        const visibleCheckboxes = document.querySelectorAll('.student-checkbox');
        visibleCheckboxes.forEach(cb => {
            cb.checked = checked;
            const id = cb.dataset.id;
            if (checked) selectedStudents.add(id);
            else selectedStudents.delete(id);
        });
        updateBatchUI();
    });

    document.getElementById('trackerTableBody').addEventListener('click', (e) => {
        if (e.target.classList.contains('student-checkbox')) {
            const id = e.target.dataset.id;
            if (e.target.checked) selectedStudents.add(id);
            else {
                selectedStudents.delete(id);
                document.getElementById('selectAll').checked = false;
            }
            updateBatchUI();
        }
    });

    document.getElementById('batchUpdateBtn').addEventListener('click', handleBatchUpdate);

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
