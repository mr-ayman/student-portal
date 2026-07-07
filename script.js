
const API_BASE = 'https://api.yourcollege.edu';

let authToken = null;
let currentUser = null;

async function signup(name, email, password) {
    const res = await fetch(`${API_BASE}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(data.message || 'Could not create account.');
    }
    return data; 
}

async function signin(email, password) {
    const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(data.message || 'Incorrect email or password.');
    }
    return data; 
}


function getJwtTokenCallback(successCallback, failureCallback) {
    fetch(`${API_BASE}/desk/jwt-token`, {
        headers: authToken ? { 'Authorization': `Bearer ${authToken}` } : {}
    })
        .then(res => res.json())
        .then(data => successCallback(data.token))
        .catch(err => failureCallback(err));
}

function loginToZohoDesk() {
    if (window.ZohoDeskAsap) {
        window.ZohoDeskAsapReady(() => {
            ZohoDeskAsap.invoke('login', getJwtTokenCallback);
        });
    }
}

function logoutOfZohoDesk() {
    if (window.ZohoDeskAsap) {
        window.ZohoDeskAsapReady(() => {
            ZohoDeskAsap.invoke('logout');
        });
    }
}


const authScreen = document.getElementById('authScreen');
const appShell = document.getElementById('appShell');
const whoLabel = document.getElementById('whoLabel');
const logoutBtn = document.getElementById('logoutBtn');

document.querySelectorAll('.auth-switch button').forEach(function(btn) {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.auth-switch button').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.auth + 'Form').classList.add('active');
    });
});

function setMsg(el, text, kind) {
    el.textContent = text || '';
    el.className = 'auth-msg' + (kind ? ' ' + kind : '');
}

function onAuthed(data) {
    authToken = data.token || null;
    currentUser = data.user || null;
    const label = (currentUser && (currentUser.name || currentUser.email)) || 'Signed in';
    whoLabel.textContent = label;
    logoutBtn.style.display = 'inline-flex';
    authScreen.style.display = 'none';
    appShell.style.display = 'block';
    initZoho();
    loginToZohoDesk();
}

document.getElementById('signinForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const btn = document.getElementById('signinBtn');
    const msg = document.getElementById('signinMsg');
    const email = document.getElementById('signinEmail').value.trim();
    const password = document.getElementById('signinPassword').value;
    btn.disabled = true;
    setMsg(msg, 'Signing in…');
    try {
        const data = await signin(email, password);
        setMsg(msg, 'Signed in.', 'ok');
        onAuthed(data);
    } catch (err) {
        setMsg(msg, err.message, 'error');
    } finally {
        btn.disabled = false;
    }
});

document.getElementById('signupForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const btn = document.getElementById('signupBtn');
    const msg = document.getElementById('signupMsg');
    const name = document.getElementById('signupName').value.trim();
    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value;
    btn.disabled = true;
    setMsg(msg, 'Creating your account…');
    try {
        const data = await signup(name, email, password);
        setMsg(msg, 'Account created.', 'ok');
        onAuthed(data);
    } catch (err) {
        setMsg(msg, err.message, 'error');
    } finally {
        btn.disabled = false;
    }
});

logoutBtn.addEventListener('click', function() {
    logoutOfZohoDesk();
    authToken = null;
    currentUser = null;
    whoLabel.textContent = 'Not signed in';
    logoutBtn.style.display = 'none';
    appShell.style.display = 'none';
    authScreen.style.display = 'block';
    document.getElementById('signinForm').reset();
    document.getElementById('signupForm').reset();
});


var asapReady = false;

function initZoho() {
    
    if (initZoho._done) return;
    initZoho._done = true;

    window.ZohoDeskAsapReady(function() {
        asapReady = true;
        var el = document.getElementById('kbStatus');
        if (el) el.textContent = 'Ready.';
    });

    document.getElementById('openArticlesBtn').addEventListener('click', function() {
        if (window.ZohoDeskAsap && asapReady) {
            ZohoDeskAsap.invoke('open');
            try {
                ZohoDeskAsap.invoke('routeTo', { page: 'kb.category.list' });
            } catch (e) { /* older ASAP versions may not support routeTo */ }
        } else {
            document.getElementById('kbStatus').textContent = 'Still loading — try again in a moment.';
        }
    });

    document.getElementById('closeArticlesBtn').addEventListener('click', function() {
        if (window.ZohoDeskAsap && asapReady) {
            ZohoDeskAsap.invoke('close');
        }
    });

    document.querySelectorAll('.tab').forEach(function(tab) {
        tab.addEventListener('click', function() {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.panelview').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
        });
    });
}