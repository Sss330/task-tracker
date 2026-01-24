// ===== state =====
let currentUser = null;
let tasks = [];
let currentTaskId = null;
let autosaveTimer = null;

// ===== elements =====
const el = {
    authArea: document.getElementById('authArea'),
    globalAlert: document.getElementById('globalAlert'),

    guestArea: document.getElementById('guestArea'),
    appArea: document.getElementById('appArea'),

    newTaskTitle: document.getElementById('newTaskTitle'),
    addTaskBtn: document.getElementById('addTaskBtn'),

    todoList: document.getElementById('todoList'),
    doneList: document.getElementById('doneList'),

    authModal: document.getElementById('authModal'),
    authModalTitle: document.getElementById('authModalTitle'),
    authCloseBtn: document.getElementById('authCloseBtn'),
    authAlert: document.getElementById('authAlert'),
    loginForm: document.getElementById('loginForm'),
    registerForm: document.getElementById('registerForm'),
    switchToLogin: document.getElementById('switchToLogin'),
    switchToRegister: document.getElementById('switchToRegister'),

    taskModal: document.getElementById('taskModal'),
    taskCloseBtn: document.getElementById('taskCloseBtn'),
    taskAlert: document.getElementById('taskAlert'),
    taskTitleInput: document.getElementById('taskTitleInput'),
    taskDescInput: document.getElementById('taskDescInput'),
    deleteTaskBtn: document.getElementById('deleteTaskBtn'),
};

// ===== helpers =====
function escapeHtml(s) {
    return String(s ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function showAlert(node, msg) {
    node.textContent = msg;
    node.classList.remove('hidden');
}
function hideAlert(node) {
    node.textContent = '';
    node.classList.add('hidden');
}

function openModal(node) {
    node.classList.remove('hidden');
    node.classList.add('flex');
}
function closeModal(node) {
    node.classList.add('hidden');
    node.classList.remove('flex');
}

// ===== auth UI =====
function renderAuthArea() {
    if (!currentUser) {
        el.authArea.innerHTML = `
      <button id="btnRegister" class="rounded-xl bg-slate-900 px-3 py-2 text-sm ring-1 ring-slate-700 hover:bg-slate-800">Register</button>
      <button id="btnLogin" class="rounded-xl bg-sky-500 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-sky-400">Login</button>
    `;
        document.getElementById('btnLogin').onclick = () => openAuth('login');
        document.getElementById('btnRegister').onclick = () => openAuth('register');

        el.guestArea.classList.remove('hidden');
        el.appArea.classList.add('hidden');
    } else {
        el.authArea.innerHTML = `
      <span class="text-sm text-slate-400">Вы вошли как</span>
      <span class="text-sm font-semibold">${escapeHtml(currentUser.email ?? currentUser.login ?? 'user')}</span>
      <button id="btnLogout" class="rounded-xl bg-slate-900 px-3 py-2 text-sm ring-1 ring-slate-700 hover:bg-slate-800">Logout</button>
    `;
        document.getElementById('btnLogout').onclick = logout;

        el.guestArea.classList.add('hidden');
        el.appArea.classList.remove('hidden');
    }
}

function openAuth(mode) {
    hideAlert(el.authAlert);
    el.authModalTitle.textContent = mode === 'login' ? 'Вход' : 'Регистрация';

    el.loginForm.classList.toggle('hidden', mode !== 'login');
    el.registerForm.classList.toggle('hidden', mode !== 'register');

    openModal(el.authModal);
}

async function logout() {
    hideAlert(el.globalAlert);
    try {
        await api.logout();
    } catch (e) {
        // даже если logout упал, пробуем обновить UI
    }
    await boot();
}

// ===== tasks rendering =====
function taskItemHtml(t) {
    return `
    <li
      class="rounded-xl bg-slate-950 px-4 py-3 ring-1 ring-slate-800 hover:bg-slate-900 cursor-pointer select-none"
      data-id="${escapeHtml(t.id)}"
      data-done="${t.done ? '1' : '0'}"
      draggable="true"
    >
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="font-semibold truncate">${escapeHtml(t.title)}</div>
          <div class="mt-1 text-sm text-slate-400 truncate">${escapeHtml((t.description || 'Без описания'))}</div>
        </div>
        <span class="shrink-0 rounded-full px-2 py-1 text-xs ring-1 ${t.done ? 'bg-emerald-500/15 text-emerald-200 ring-emerald-500/30' : 'bg-sky-500/15 text-sky-200 ring-sky-500/30'}">
          ${t.done ? 'Done' : 'Todo'}
        </span>
      </div>
    </li>
  `;
}


function renderTasks() {
    const todo = tasks.filter(t => !t.done);
    const done = tasks.filter(t => t.done);

    el.todoList.innerHTML = todo.length
        ? `<div class="space-y-2">${todo.map(taskItemHtml).join('')}</div>`
        : `<div class="p-3 text-slate-400">Пока нет задач</div>`;

    el.doneList.innerHTML = done.length
        ? `<div class="space-y-2">${done.map(taskItemHtml).join('')}</div>`
        : `<div class="p-3 text-slate-400">Нет выполненных задач</div>`;

    [...document.querySelectorAll('[data-id]')].forEach(node => {
        node.addEventListener('click', () => openTask(node.getAttribute('data-id')));
    }
    );
    wireDragAndDrop();
}

// ===== create task =====
async function createTask() {
    hideAlert(el.globalAlert);
    const title = el.newTaskTitle.value.trim();
    if (!title) return;

    el.addTaskBtn.disabled = true;
    try {
        const created = await api.createTask({ title, description: '' });
        tasks.unshift(created);
        el.newTaskTitle.value = '';
        renderTasks();
    } catch (e) {
        showAlert(el.globalAlert, e.message || 'Ошибка создания задачи');
    } finally {
        el.addTaskBtn.disabled = false;
        el.newTaskTitle.focus();
    }
}

// ===== task modal + autosave =====
function openTask(id) {
    hideAlert(el.taskAlert);
    currentTaskId = id;

    const t = tasks.find(x => String(x.id) === String(id));
    if (!t) return;

    el.taskTitleInput.value = t.title || '';
    el.taskDescInput.value = t.description || '';
    openModal(el.taskModal);
}

function scheduleAutosave() {
    if (!currentTaskId) return;
    if (autosaveTimer) clearTimeout(autosaveTimer);

    autosaveTimer = setTimeout(async () => {
        const t = tasks.find(x => String(x.id) === String(currentTaskId));
        if (!t) return;

        const payload = {
            title: el.taskTitleInput.value.trim(),
            description: el.taskDescInput.value,
        };

        t.title = payload.title;
        t.description = payload.description;
        renderTasks();


        try {
            const updated = await api.updateTask(currentTaskId, payload);
            Object.assign(t, updated || {});
            renderTasks();
            hideAlert(el.taskAlert);
        } catch (e) {
            showAlert(el.taskAlert, e.message || 'Ошибка сохранения');
        }
    }, 400); // debounce
}

async function deleteCurrentTask() {
    if (!currentTaskId) return;
    hideAlert(el.taskAlert);

    try {
        await api.deleteTask(currentTaskId);
        tasks = tasks.filter(t => String(t.id) !== String(currentTaskId));
        closeModal(el.taskModal);
        currentTaskId = null;
        renderTasks();
    } catch (e) {
        showAlert(el.taskAlert, e.message || 'Ошибка удаления');
    }
}

// ===== boot =====
async function boot() {
    hideAlert(el.globalAlert);
    currentUser = null;
    tasks = [];
    currentTaskId = null;

    try {
        currentUser = await api.me(); // 200 => user
        renderAuthArea();

        tasks = await api.listTasks();
        renderTasks();
    } catch (e) {
        // 401 => guest
        if (e.status === 401) {
            currentUser = null;
            renderAuthArea();
            return;
        }
        showAlert(el.globalAlert, e.message || 'Ошибка загрузки');
        renderAuthArea();
    }
}

// ===== events =====
el.addTaskBtn.addEventListener('click', createTask);
el.newTaskTitle.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') createTask();
});

el.authCloseBtn.onclick = () => closeModal(el.authModal);
el.taskCloseBtn.onclick = () => closeModal(el.taskModal);

// переключалки модалки
el.switchToLogin.onclick = (e) => { e.preventDefault(); openAuth('login'); };
el.switchToRegister.onclick = (e) => { e.preventDefault(); openAuth('register'); };

// submit login/register (перехватываем стандартный submit)
el.loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert(el.authAlert);

    const form = new FormData(el.loginForm);
    const payload = { email: form.get('email'), password: form.get('password') };

    try {
        await api.login(payload);
        closeModal(el.authModal);
        await boot();
    } catch (err) {
        showAlert(el.authAlert, err.message || 'Ошибка авторизации');
    }
});

el.registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert(el.authAlert);

    const form = new FormData(el.registerForm);
    const email = form.get('email');
    const password = form.get('password');
    const repeatPassword = form.get('repeatPassword');

    if (password !== repeatPassword) {
        showAlert(el.authAlert, 'Пароли не совпадают');
        return;
    }

    try {
        await api.register({ email, password, repeatPassword });
        // часто после регистрации делают auto-login, но можно просто открыть login
        openAuth('login');
        showAlert(el.authAlert, 'Регистрация успешна. Теперь войдите.');
    } catch (err) {
        showAlert(el.authAlert, err.message || 'Ошибка регистрации');
    }
});

// autosave events
el.taskTitleInput.addEventListener('input', scheduleAutosave);
el.taskDescInput.addEventListener('input', scheduleAutosave);

el.deleteTaskBtn.addEventListener('click', deleteCurrentTask);
function wireDragAndDrop() {
    // draggable items
    const items = [...document.querySelectorAll('[data-id][draggable="true"]')];

    items.forEach((node) => {
        node.addEventListener('dragstart', (e) => {
            node.classList.add('opacity-60');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', node.getAttribute('data-id'));
            e.dataTransfer.setData('application/x-task-done', node.getAttribute('data-done') || '0');
        });

        node.addEventListener('dragend', () => {
            node.classList.remove('opacity-60');
            clearDropHighlights();
        });
    });

    // drop zones: todoList / doneList (UL)
    makeDropZone(el.todoList, false);
    makeDropZone(el.doneList, true);
}

function makeDropZone(zoneEl, targetDone) {
    // разрешаем drop
    zoneEl.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        highlightDropZone(zoneEl, true);
    });

    zoneEl.addEventListener('dragleave', () => {
        highlightDropZone(zoneEl, false);
    });

    zoneEl.addEventListener('drop', async (e) => {
        e.preventDefault();
        highlightDropZone(zoneEl, false);

        const id = e.dataTransfer.getData('text/plain');
        if (!id) return;

        const t = tasks.find(x => String(x.id) === String(id));
        if (!t) return;

        // если уже там же — ничего
        if (!!t.done === !!targetDone) return;

        // оптимистично
        t.done = targetDone;
        renderTasks();

        try {
            const updated = await api.updateTask(id, { done: targetDone });
            Object.assign(t, updated || {});
            renderTasks();
        } catch (err) {
            // откат
            t.done = !targetDone;
            renderTasks();
            showAlert(el.globalAlert, err.message || 'Ошибка перемещения задачи');
        }
    });
}

function highlightDropZone(zoneEl, on) {
    // добавим рамку/фон прямо на UL
    zoneEl.classList.toggle('ring-2', on);
    zoneEl.classList.toggle('ring-sky-500', on);
    zoneEl.classList.toggle('rounded-xl', on);
    zoneEl.classList.toggle('bg-slate-900/40', on);
}

function clearDropHighlights() {
    highlightDropZone(el.todoList, false);
    highlightDropZone(el.doneList, false);
}

// старт
boot();
