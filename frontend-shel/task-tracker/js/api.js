const API_BASE = 'http://localhost:8080';

const DEMO_MODE = true; // <-- поставь true, чтобы всё работало без бека


const endpoints = {
    me: () => `${API_BASE}/api/users/me`,
    register: () => `${API_BASE}/api/auth/register`,
    login: () => `${API_BASE}/api/auth/login`,
    logout: () => `${API_BASE}/api/auth/logout`,

    tasks: () => `${API_BASE}/api/tasks`,
    task: (id) => `${API_BASE}/api/tasks/${id}`,
};

async function request(url, { method = 'GET', body, headers } = {}) {
    const res = await fetch(url, {
        method,
        headers: {
            ...(body ? { 'Content-Type': 'application/json' } : {}),
            ...(headers || {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        credentials: 'include', // важно для cookie-сессии
    });

    // fetch НЕ кидает ошибку на 4xx/5xx — делаем сами
    if (!res.ok) {
        let message = `HTTP ${res.status}`;
        try {
            const data = await res.json();
            // ожидаем что backend может вернуть {message:"..."} или {error:"..."}
            message = data.message || data.error || message;
        } catch (_) {
            // ignore
        }
        const err = new Error(message);
        err.status = res.status;
        throw err;
    }

    // 204 No Content
    if (res.status === 204) return null;

    // если backend не всегда JSON — можно расширить, но для REST обычно JSON
    return res.json();
}

const api = {
    me: () => request(endpoints.me()),
    register: (payload) => request(endpoints.register(), { method: 'POST', body: payload }),
    login: (payload) => request(endpoints.login(), { method: 'POST', body: payload }),
    logout: () => request(endpoints.logout(), { method: 'POST' }),

    listTasks: () => request(endpoints.tasks()),
    createTask: (payload) => request(endpoints.tasks(), { method: 'POST', body: payload }),
    updateTask: (id, payload) => request(endpoints.task(id), { method: 'PUT', body: payload }),
    deleteTask: (id) => request(endpoints.task(id), { method: 'DELETE' }),
};
function demoDelay(ms = 150) {
    return new Promise(r => setTimeout(r, ms));
}

function loadDemoTasks() {
    try {
        return JSON.parse(localStorage.getItem('demo_tasks') || '[]');
    } catch {
        return [];
    }
}
function saveDemoTasks(items) {
    localStorage.setItem('demo_tasks', JSON.stringify(items));
}

function uuid() {
    return crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
}

// Оборачиваем api, чтобы в DEMO_MODE не ходить в сеть
if (DEMO_MODE) {
    const demoUser = { email: 'demo@local' };
    let demoTasks = loadDemoTasks();

    api.me = async () => { await demoDelay(); return demoUser; };
    api.login = async () => { await demoDelay(); return null; };
    api.register = async () => { await demoDelay(); return null; };
    api.logout = async () => { await demoDelay(); return null; };

    api.listTasks = async () => { await demoDelay(); return demoTasks; };

    api.createTask = async ({ title, description }) => {
        await demoDelay();
        const t = { id: uuid(), title, description: description || '', done: false };
        demoTasks = [t, ...demoTasks];
        saveDemoTasks(demoTasks);
        return t;
    };

    api.updateTask = async (id, payload) => {
        await demoDelay();
        demoTasks = demoTasks.map(t => String(t.id) === String(id) ? { ...t, ...payload } : t);
        saveDemoTasks(demoTasks);
        return demoTasks.find(t => String(t.id) === String(id));
    };

    api.deleteTask = async (id) => {
        await demoDelay();
        demoTasks = demoTasks.filter(t => String(t.id) !== String(id));
        saveDemoTasks(demoTasks);
        return null;
    };
}
