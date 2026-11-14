/* ============================================================
   KAT TATTOO - Panel de Gestión (admin / artista / cliente)
============================================================ */

const $ = (id) => document.getElementById(id);

let state = {
    token: localStorage.getItem('kat_token') || null,
    user: JSON.parse(localStorage.getItem('kat_user') || 'null'),
};

let toastTimer;
function toast(msg, ok = true) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.toggle('error', !ok);
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 4000);
}

async function api(method, url, body) {
    const headers = {};
    if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
    if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';

    const res = await fetch(url, {
        method,
        headers,
        body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(data.error || `Error ${res.status}`);
    }
    return data;
}

const esc = (str) => String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function subirImagen(file) {
    if (!file) return null;
    const fd = new FormData();
    fd.append('imagen', file);
    const d = await api('POST', '/api/admin/upload', fd);
    return d.url || null;
}

const fmtFecha = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
};

const fmtEstado = (s) => `<span class="badge ${s || 'pending'}">${s || '?'}</span>`;
const fmtRol = (r) => `<span class="badge ${r}">${r}</span>`;

/* ============================================================
   LOGIN / LOGOUT
============================================================ */
$('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('login-email').value.trim();
    const password = $('login-password').value;
    try {
        const data = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        }).then((r) => r.json());
        if (data.error) throw new Error(data.error);

        state = { token: data.token, user: data.user };
        localStorage.setItem('kat_token', data.token);
        localStorage.setItem('kat_user', JSON.stringify(data.user));

        const me = await fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + data.token } }).then((r) => r.json());
        state.me = me;
        entrarAlPanel();
    } catch (err) {
        toast(err.message, false);
    }
});

/* ---- Restablecer contraseña desde el login del panel ---- */
let lgEmail = null;
window.mostrarOlvidoPanel = () => {
    $('login-form').style.display = 'none';
    $('login-forgot-form').style.display = 'block';
    $('login-reset-form').style.display = 'none';
    $('link-volver-panel').style.display = '';
    $('lg-out').textContent = '';
    $('lg-email').value = $('login-email').value || '';
    lgEmail = $('lg-email').value || null;
};
window.volverLoginPanel = () => {
    $('login-form').style.display = 'block';
    $('login-forgot-form').style.display = 'none';
    $('login-reset-form').style.display = 'none';
    $('link-volver-panel').style.display = 'none';
    $('lg-out').textContent = '';
};

$('login-forgot-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    lgEmail = $('lg-email').value.trim();
    $('lg-out').textContent = 'Enviando...';
    try {
        const d = await fetch('/api/auth/forgot-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: lgEmail }),
        }).then((r) => r.json());
        if (d.error) throw new Error(d.error);
        $('login-reset-form').style.display = 'block';
        if (d.reset_code) {
            $('lg-out').textContent = `Tu código es: ${d.reset_code} (válido 15 min)`;
        } else {
            $('lg-out').textContent = 'Revisa tu correo: enviamos el código de seguridad (válido 15 minutos).';
        }
    } catch (err) { $('lg-out').textContent = err.message; }
});

$('login-reset-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        const d = await fetch('/api/auth/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: lgEmail,
                code: $('lg-code').value.trim(),
                new_password: $('lg-pass').value,
            }),
        }).then((r) => r.json());
        if (d.error) throw new Error(d.error);
        toast('Contraseña actualizada. Entra con tu nueva clave.');
        volverLoginPanel();
    } catch (err) { toast(err.message, false); }
});

$('btn-logout').addEventListener('click', () => {
    localStorage.removeItem('kat_token');
    localStorage.removeItem('kat_user');
    state = { token: null, user: null };
    mostrarLogin();
});

function mostrarLogin() {
    $('login-view').style.display = 'flex';
    $('panel-view').style.display = 'none';
}

function salir() {
    localStorage.removeItem('kat_token');
    localStorage.removeItem('kat_user');
    location.reload();
}

async function entrarAlPanel() {
    $('login-view').style.display = 'none';
    $('panel-view').style.display = 'block';

    $('user-rol').textContent = state.user.role;
    const me = await api('GET', '/api/auth/me').catch(() => null);
    state.me = me || state.user;
    $('user-nombre').textContent = me?.name || state.user.email;
    $('btn-logout').textContent = 'Salir';

    armarMenu();
    irA(primerTab());
}

/* ============================================================
   MENÚ POR ROL
============================================================ */
const MENU = {
    admin: [
        ['dashboard', '📊', 'Dashboard'],
        ['clientes', '👥', 'Clientes'],
        ['artistas', '🎨', 'Artistas'],
        ['servicios', '💈', 'Servicios'],
        ['citas', '📅', 'Citas'],
        ['portafolio', '🖼️', 'Portafolio'],
        ['mensajes', '✉️', 'Mensajes'],
        ['referencias', '🤖', 'Referencias IA'],
        ['notificaciones', '🔔', 'Notificaciones'],
        ['auditoria', '🧾', 'Auditoría'],
    ],
    artist: [
        ['mis-citas', '📅', 'Mis Citas'],
        ['notificaciones', '🔔', 'Notificaciones'],
    ],
    client: [
        ['perfil', '👤', 'Mi Perfil'],
        ['mis-referencias', '🤖', 'Referencias IA'],
        ['disponibilidad', '🗓️', 'Disponibilidad'],
        ['notificaciones', '🔔', 'Notificaciones'],
    ],
};

function primerTab() {
    const menu = MENU[state.user.role] || [];
    return menu[0][0];
}

function armarMenu() {
    const nav = $('panel-nav');
    nav.innerHTML = '';
    for (const [id, icono, label] of (MENU[state.user.role] || [])) {
        const b = document.createElement('button');
        b.dataset.tab = id;
        b.innerHTML = `${icono} ${label}`;
        b.addEventListener('click', () => irA(id));
        nav.appendChild(b);
    }
}

function irA(id) {
    document.querySelectorAll('#panel-nav button').forEach((b) => b.classList.toggle('activo', b.dataset.tab === id));
    document.querySelectorAll('.panel-view').forEach((v) => v.classList.remove('activo'));
    const view = $('view-' + id);
    if (view) view.classList.add('activo');

    switch (id) {
        case 'dashboard': renderDashboard(); break;
        case 'clientes': renderClientes(); break;
        case 'artistas': renderArtistas(); break;
        case 'servicios': renderServicios(); break;
        case 'citas': renderCitas(); break;
        case 'mis-citas': renderMisCitas(); break;
        case 'portafolio': renderPortafolio(); break;
        case 'mensajes': renderMensajes(); break;
        case 'referencias': renderReferencias(); break;
        case 'perfil': renderPerfil(); break;
        case 'disponibilidad': renderDisponibilidad(); break;
        case 'mis-referencias': renderMisReferencias(); break;
        case 'notificaciones': renderNotificaciones(); break;
        case 'auditoria': renderAuditoria(); break;
    }
}

/* ============================================================
   DASHBOARD (admin)
============================================================ */
async function renderDashboard() {
    const v = $('view-dashboard');
    try {
        const d = await api('GET', '/api/admin/dashboard');
        v.innerHTML = `
            <div class="stats-grid">
                <div class="stat-card"><div class="num">${d.clientes.n}</div><div class="lab">Clientes</div></div>
                <div class="stat-card"><div class="num">${d.artistas.n}</div><div class="lab">Artistas activos</div></div>
                <div class="stat-card"><div class="num">${d.tatuajes.n}</div><div class="lab">Tatuajes en galería</div></div>
                <div class="stat-card"><div class="num">${d.servicios.n}</div><div class="lab">Servicios</div></div>
                <div class="stat-card"><div class="num">${d.citas_pendientes.n}</div><div class="lab">Citas pendientes</div></div>
                <div class="stat-card"><div class="num">${d.citas_hoy.n}</div><div class="lab">Citas de hoy</div></div>
                <div class="stat-card"><div class="num">${d.mensajes.n}</div><div class="lab">Mensajes sin leer</div></div>
                <div class="stat-card"><div class="num">${d.alertas.n}</div><div class="lab">Notificaciones</div></div>
            </div>
            <div class="panel-card">
                <h2>Última <span>actividad</span></h2>
                <div class="sub">Trazabilidad de las operaciones del sistema</div>
                <div id="resumen-activity"></div>
            </div>`;
        const rep = await api('GET', '/api/admin/activity');
        const top = rep.slice(0, 8);
        $('resumen-activity').innerHTML = top.length ? top.map((a) =>
            `<div style="padding:8px 0; border-bottom:1px solid rgba(141,22,175,0.1); font-size:13px; color:#cfc6d3;">
                <b style="color:#e08cff">${esc(a.action)}</b> · ${esc(a.entity || '')} #${a.entity_id || ''}
                <span style="color:#9c8fa1; float:right">${fmtFecha(a.created_at)}</span>
            </div>`).join('') : '<div style="color:#9c8fa1">Sin actividad aún.</div>';
    } catch (err) {
        v.innerHTML = errCard(err);
    }
}

/* ============================================================
   CLIENTES (admin)
============================================================ */
async function renderClientes() {
    const v = $('view-clientes');
    v.innerHTML = `<div class="panel-card"><h2>Clientes <span>registrados</span></h2><div class="sub">Lista de clientes y su número de citas</div><div id="tbl-clientes"></div></div>`;
    try {
        const lista = await api('GET', '/api/admin/clients');
        $('tbl-clientes').innerHTML = tabular(
            ['ID', 'Nombre', 'Email', 'Teléfono', 'Citas', 'Registro'],
            lista.map((c) => [c.id, esc(c.name), esc(c.email || '—'), esc(c.phone || '—'), c.citas_totales, fmtFecha(c.created_at)]),
            lista.length
        );
    } catch (err) { noError(v, err); }
}

/* ============================================================
   ARTISTAS (admin): CRUD + horarios
============================================================ */
async function renderArtistas() {
    const v = $('view-artistas');
    v.innerHTML = `
        <div class="panel-card">
            <h2>Gestión de <span>artistas</span></h2>
            <div class="sub">Registrar, editar, activar/desactivar y consultar cuentas (RF13)</div>
            <button class="btn" onclick="artistForm()">+ Nuevo artista</button>
        </div>
        <div class="panel-card"><div id="tbl-artistas"></div></div>`;
    try {
        const lista = await api('GET', '/api/admin/artists');
        $('tbl-artistas').innerHTML = `
            <table class="tabla">
                <tr><th></th><th>ID</th><th>Nombre</th><th>Especialidad</th><th>Instagram</th><th>Cuenta</th><th>Estado</th><th>Acciones</th></tr>
                ${lista.map((a) => `
                    <tr>
                        <td><img class="img-mini" src="${esc(a.image_url || '/Imagenes/placeholder.png')}" onerror="this.src='/Imagenes/placeholder.png'"></td>
                        <td>${a.id}</td>
                        <td>${esc(a.name)}</td>
                        <td>${esc(a.specialty || '—')}</td>
                        <td>${esc(a.instagram || '—')}</td>
                        <td>${esc(a.user_email || '—')}</td>
                        <td><span class="badge ${a.is_active ? 'completed' : 'cancelled'}">${a.is_active ? 'activo' : 'inactivo'}</span></td>
                        <td><div class="acciones">
                            <button class="btn-s" onclick="artistForm('${a.id}')">Editar</button>
                            <button class="btn-s azul" onclick="horarioForm('${a.id}', '${esc(a.name)}')">Horario</button>
                            <button class="btn-s ${a.is_active ? 'rojo' : 'verde'}" onclick="toggleArtista('${a.id}', ${!a.is_active})">${a.is_active ? 'Desactivar' : 'Activar'}</button>
                        </div></td>
                    </tr>`).join('')}
            </table>`;
        window.artistForm = artistForm;
        window.toggleArtista = toggleArtista;
        window.horarioForm = horarioForm;
    } catch (err) { noError(v, err); }
}

// Formulario crear/editar artista (RF13)
function artistForm(id) {
    const v = $('view-artistas');
    const target = id
        ? v.querySelector('.panel-card:last-of-type')
        : v.querySelector('.panel-card:first-of-type');
    let imagenUrl = null;
    v.insertAdjacentHTML('beforeend', `
        <div class="panel-card" id="artist-form-box">
            <h2>${id ? 'Editar' : 'Nuevo'} <span>artista</span></h2>
            <form class="panel-form" id="artist-form" data-id="${id || ''}">
                <div class="campo"><label>Nombre *</label><input id="ar-nombre" required placeholder="Nombre"></div>
                <div class="campo"><label>Especialidad</label><input id="ar-specialty" placeholder="Estilo, ej: Blackwork"></div>
                <div class="campo"><label>Instagram</label><input id="ar-instagram" placeholder="@artista"></div>
                <div class="campo full"><label>Foto del artista</label>
                    <input type="file" id="ar-img" accept="image/*">
                    <div style="font-size:12px; color:#9c8fa1; margin-top:4px;">${id ? 'Deja vacío para mantener la foto actual' : 'Sube la foto desde tu equipo'}</div>
                    <div class="img-preview">
                        <img id="ar-img-prev" src="/Imagenes/placeholder.png" alt="preview" onerror="this.onerror=null; this.src='/Imagenes/placeholder.png';">
                    </div>
                </div>
                <div class="campo full"><label>Bio</label><textarea id="ar-bio" placeholder="Descripción del artista"></textarea></div>
                ${!id ? `
                <div class="campo"><label>Email de acceso *</label><input id="ar-email" type="email" placeholder="artista@kattattoo.com"></div>
                <div class="campo"><label>Contraseña *</label><input id="ar-pass" type="password" placeholder="Mínimo 6 caracteres"></div>
                <div class="campo full" style="font-size:12px; color:#9c8fa1;">El email debe ser único. Si ya existe una cuenta con ese correo, prueba con otro (o agrega un punto/número como artista2@…).</div>` : ''}
                <div class="campo full"><div id="ar-err" class="form-err" style="display:none;"></div></div>
                <div class="campo full">
                    <button type="submit" class="btn">Guardar</button>
                    <button type="button" class="btn2" onclick="document.getElementById('artist-form-box').remove()">Cancelar</button>
                </div>
            </form>
        </div>`);

    $('ar-img').addEventListener('change', () => {
        const f = $('ar-img').files[0];
        if (f) {
            const rd = new FileReader();
            rd.onload = (ev) => { $('ar-img-prev').src = ev.target.result; };
            rd.readAsDataURL(f);
        }
    });

    if (id) (async () => {
        try {
            const lista = await api('GET', '/api/admin/artists');
            const a = lista.find((x) => x.id == id);
            if (!a) return;
            imagenUrl = a.image_url || null;
            $('ar-nombre').value = a.name || '';
            $('ar-specialty').value = a.specialty || '';
            $('ar-instagram').value = a.instagram || '';
            $('ar-bio').value = a.bio || '';
            $('ar-img-prev').src = a.image_url || '/Imagenes/placeholder.png';
        } catch (_) { }
    })();

    const mostrarErr = (msg) => {
        const box = $('ar-err');
        box.textContent = msg;
        box.style.display = 'block';
        if (/email|correo|cuenta en uso|ya está en uso/i.test(msg)) {
            if ($('ar-email')) $('ar-email').style.borderColor = '#ff6b6b';
        }
    };

    if (id) $('artist-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            await api('PUT', `/api/admin/artists/${id}`, {
                name: $('ar-nombre').value.trim(),
                specialty: $('ar-specialty').value.trim() || null,
                bio: $('ar-bio').value.trim() || null,
                instagram: $('ar-instagram').value.trim() || null,
                image_url: (await subirImagen($('ar-img').files[0])) || imagenUrl,
            });
            toast('Artista actualizado');
            renderArtistas();
        } catch (err) { mostrarErr(err.message); }
    });
    else $('artist-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            await api('POST', '/api/admin/artists', {
                name: $('ar-nombre').value.trim(),
                specialty: $('ar-specialty').value.trim() || null,
                bio: $('ar-bio').value.trim() || null,
                instagram: $('ar-instagram').value.trim() || null,
                image_url: (await subirImagen($('ar-img').files[0])) || imagenUrl,
                email: $('ar-email').value.trim(),
                password: $('ar-pass').value,
            });
            toast('Artista creado');
            renderArtistas();
        } catch (err) { mostrarErr(err.message); }
    });
}

async function toggleArtista(id, nuevo) {
    try {
        await api('PUT', `/api/admin/artists/${id}`, { is_active: nuevo });
        toast('Estado actualizado');
        renderArtistas();
    } catch (err) { toast(err.message, false); }
}

// Horarios del artista (RF16)
async function horarioForm(artistId, nombre) {
    const v = $('view-artistas');
    let sched = [];
    try { sched = await api('GET', `/api/admin/artists/${artistId}/schedules`); } catch (_) { }
    const dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

    v.insertAdjacentHTML('beforeend', `
        <div class="panel-card" id="sched-box-${artistId}">
            <h2>Horario de <span>${esc(nombre)}</span></h2>
            <div class="sub">Días y horas disponibles para citas (RF16 / RF08)</div>
            <form class="panel-form" id="sched-form">
                <div class="campo"><label>Día</label><select id="sc-dia">${dias.map((d, i) => `<option value="${i}">${d}</option>`).join('')}</select></div>
                <div class="campo"><label>Inicio</label><input type="time" id="sc-inicio" value="11:00" required></div>
                <div class="campo"><label>Fin</label><input type="time" id="sc-fin" value="20:00" required></div>
                <div class="campo" style="display:flex;align-items:flex-end;"><button type="submit" class="btn">Agregar</button></div>
            </form>
            <br>
            <div id="sched-list"></div>
        </div>`);

    const pintar = () => {
        $('sched-list').innerHTML = sched.length ? `
            <table class="tabla"><tr><th>Día</th><th>Inicio</th><th>Fin</th><th>Estado</th><th>Acción</th></tr>
            ${sched.map((s) => `
                <tr>
                    <td>${dias[s.day_of_week]}</td>
                    <td>${s.start_time.slice(0, 5)}</td>
                    <td>${s.end_time.slice(0, 5)}</td>
                    <td><span class="badge ${s.is_active ? 'completed' : 'cancelled'}">${s.is_active ? 'activo' : 'inactivo'}</span></td>
                    <td><div class="acciones">
                        <button class="btn-s ${s.is_active ? 'rojo' : 'verde'}" onclick="toggleSched('${s.id}', ${!s.is_active})">${s.is_active ? 'Desactivar' : 'Activar'}</button>
                        <button class="btn-s rojo" onclick="delSched('${s.id}')">Eliminar</button>
                    </div></td>
                </tr>`).join('')}</table>`
            : '<div style="color:#9c8fa1">Sin horarios registrados.</div>';

        window.toggleSched = toggleSched;
        window.delSched = delSched;
    };
    pintar();

    $('sched-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            await api('POST', `/api/admin/artists/${artistId}/schedules`, {
                day_of_week: Number($('sc-dia').value),
                start_time: $('sc-inicio').value,
                end_time: $('sc-fin').value,
            });
            sched = await api('GET', `/api/admin/artists/${artistId}/schedules`);
            pintar();
            toast('Horario agregado');
        } catch (err) { toast(err.message, false); }
    });
}

async function toggleSched(id, val) {
    try { await api('PUT', `/api/admin/schedules/${id}`, { is_active: val }); toast('Horario actualizado'); } catch (err) { toast(err.message, false); }
}
async function delSched(id) {
    try { await api('DELETE', `/api/admin/schedules/${id}`); toast('Horario eliminado'); } catch (err) { toast(err.message, false); }
}

/* ============================================================
   SERVICIOS (admin): RF14
============================================================ */
const fmtPrecio = (n) => '$' + Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 });

async function renderServicios() {
    const v = $('view-servicios');
    v.innerHTML = `
        <div class="panel-card">
            <h2>Gestión de <span>servicios</span></h2>
            <div class="sub">Crear, editar, activar/desactivar o eliminar servicios del catálogo (RF14)</div>
            <button class="btn" onclick="servicioForm()">+ Nuevo servicio</button>
        </div>
        <div class="panel-card"><div id="tbl-servicios"></div></div>`;
    try {
        const lista = await api('GET', '/api/admin/services');
        $('tbl-servicios').innerHTML = lista.length ? `
            <table class="tabla">
                <tr><th></th><th>ID</th><th>Servicio</th><th>Precio</th><th>Duración</th><th>Orden</th><th>Estado</th><th>Acciones</th></tr>
                ${lista.map((s) => `
                    <tr>
                        <td><img class="img-mini" src="${esc(s.image_url || '/Imagenes/placeholder.png')}" onerror="this.src='/Imagenes/placeholder.png'"></td>
                        <td>${s.id}</td>
                        <td><b style="color:#c96be3">${esc(s.name)}</b><br><small style="color:#9c8fa1">${esc(s.description || '—')}</small></td>
                        <td>${fmtPrecio(s.base_price)}</td>
                        <td>${s.duration_minutes ? s.duration_minutes + ' min' : '—'}</td>
                        <td>${s.display_order || '—'}</td>
                        <td><span class="badge ${s.is_active ? 'completed' : 'cancelled'}">${s.is_active ? 'activo' : 'inactivo'}</span></td>
                        <td><div class="acciones">
                            <button class="btn-s" onclick="servicioForm('${s.id}')">Editar</button>
                            <button class="btn-s ${s.is_active ? 'rojo' : 'verde'}" onclick="toggleServicio('${s.id}', ${!s.is_active})">${s.is_active ? 'Desactivar' : 'Activar'}</button>
                            ${!s.citas_uso ? `<button class="btn-s rojo" onclick="delServicio('${s.id}')">Eliminar</button>` : ''}
                        </div></td>
                    </tr>`).join('')}
            </table>` : '<div style="color:#9c8fa1; padding:20px;">Aún no hay servicios.</div>';
        window.servicioForm = servicioForm;
        window.toggleServicio = toggleServicio;
        window.delServicio = delServicio;
    } catch (err) { noError(v, err); }
}

function servicioForm(id) {
    const v = $('view-servicios');
    if ($('serv-form-box')) { $('serv-form-box').remove(); return; }
    const serv = { name: '', description: '', base_price: '', duration_minutes: '', image_url: '', display_order: '' };
    (async () => {
        if (id) {
            try {
                const lista = await api('GET', '/api/admin/services');
                const s = lista.find((x) => x.id == id);
                if (s) Object.assign(serv, s);
            } catch (_) { }
        }
        v.insertAdjacentHTML('beforeend', `
            <div class="panel-card" id="serv-form-box">
                <h2>${id ? 'Editar' : 'Nuevo'} <span>servicio</span></h2>
                <form class="panel-form" id="serv-form">
                    <div class="campo"><label>Nombre *</label><input id="se-nombre" required placeholder="Ej: Tatuaje pequeño"></div>
                    <div class="campo full"><label>Descripción</label><textarea id="se-desc" placeholder="Qué incluye el servicio"></textarea></div>
                    <div class="campo"><label>Precio inicial *</label><input id="se-precio" type="number" min="0" step="0.01" required placeholder="90.00"></div>
                    <div class="campo"><label>Duración (min)</label><input id="se-min" type="number" min="0" placeholder="90"></div>
                    <div class="campo"><label>Orden</label><input id="se-orden" type="number" min="0" placeholder="1"></div>
                    <div class="campo full"><label>Imagen del servicio</label>
                        <input type="file" id="se-img" accept="image/*">
                        <div style="font-size:12px; color:#9c8fa1; margin-top:4px;">${id ? 'Deja vacío para mantener la imagen actual' : 'Sube la foto desde tu equipo'}</div>
                        <div class="img-preview">
                            <img id="se-img-prev" src="/Imagenes/placeholder.png" alt="preview" onerror="this.onerror=null; this.src='/Imagenes/placeholder.png';">
                        </div>
                    </div>
                    <div class="campo full"><div id="se-err" class="form-err" style="display:none;"></div></div>
                    <div class="campo full">
                        <button type="submit" class="btn">Guardar</button>
                        <button type="button" class="btn2" onclick="document.getElementById('serv-form-box').remove()">Cancelar</button>
                    </div>
                </form>
            </div>`);
        $('se-img').addEventListener('change', () => {
            const f = $('se-img').files[0];
            if (f) {
                const rd = new FileReader();
                rd.onload = (ev) => { $('se-img-prev').src = ev.target.result; };
                rd.readAsDataURL(f);
            }
        });
        $('se-nombre').value = serv.name;
        $('se-desc').value = serv.description || '';
        $('se-precio').value = serv.base_price;
        $('se-min').value = serv.duration_minutes || '';
        $('se-orden').value = serv.display_order || '';
        $('se-img-prev').src = serv.image_url || '/Imagenes/placeholder.png';
        const mostrarErr = (msg) => { $('se-err').textContent = msg; $('se-err').style.display = 'block'; };
        $('serv-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
                const body = {
                    name: $('se-nombre').value.trim(),
                    description: $('se-desc').value.trim() || null,
                    base_price: Number($('se-precio').value),
                    duration_minutes: $('se-min').value ? Number($('se-min').value) : null,
                    image_url: (await subirImagen($('se-img').files[0])) || serv.image_url || null,
                    display_order: $('se-orden').value ? Number($('se-orden').value) : 0,
                };
                if (id) { await api('PUT', `/api/admin/services/${id}`, body); toast('Servicio actualizado'); }
                else { await api('POST', '/api/admin/services', body); toast('Servicio creado'); }
                renderServicios();
            } catch (err) { mostrarErr(err.message); }
        });
    })();
}

async function toggleServicio(id, nuevo) {
    try {
        await api('PUT', `/api/admin/services/${id}`, { is_active: nuevo });
        toast('Estado actualizado');
        renderServicios();
    } catch (err) { toast(err.message, false); }
}

async function delServicio(id) {
    if (!confirm('¿Eliminar este servicio?')) return;
    try {
        await api('DELETE', `/api/admin/services/${id}`);
        toast('Servicio eliminado');
        renderServicios();
    } catch (err) { toast(err.message, false); }
}

/* ============================================================
   CITAS (admin): RF17
============================================================ */
async function renderCitas() {
    const v = $('view-citas');
    v.innerHTML = `
        <div class="panel-card">
            <h2>Gestión de <span>citas</span></h2>
            <div class="sub">Consultar, modificar, confirmar y cancelar citas (RF17)</div>
            <div class="filtros">
                <select id="filtro-citas" onchange="cargarCitas()">
                    <option value="">Todas</option>
                    <option value="pending">Pendientes</option>
                    <option value="confirmed">Confirmadas</option>
                    <option value="completed">Completadas</option>
                    <option value="cancelled">Canceladas</option>
                </select>
                <input type="date" id="filtro-fecha" onchange="cargarCitas()">
            </div>
            <div id="tbl-citas"></div>
        </div>`;
    window.cargarCitas = cargarCitas;
    cargarCitas();
}

async function cargarCitas() {
    const qs = [];
    const st = $('filtro-citas').value;
    const fe = $('filtro-fecha').value;
    if (st) qs.push('status=' + st);
    if (fe) qs.push('date=' + fe);
    try {
        const lista = await api('GET', '/api/admin/appointments' + (qs.length ? '?' + qs.join('&') : ''));
        $('tbl-citas').innerHTML = lista.length ? `
            <table class="tabla">
                <tr><th>ID</th><th>Cliente</th><th>Servicio</th><th>Artista</th><th>Fecha</th><th>Estado</th><th>Acciones</th></tr>
                ${lista.map((c) => `
                    <tr>
                        <td>${c.id}</td>
                        <td>${esc(c.client_name || '—')}</td>
                        <td>${esc(c.service_name || '—')}</td>
                        <td>${esc(c.artist_name || '—')}</td>
                        <td>${fmtFecha(c.appointment_date)}</td>
                        <td>${fmtEstado(c.status)}</td>
                        <td><div class="acciones">
                            ${c.status === 'pending' ? `<button class="btn-s verde" onclick="citaStatus('${c.id}','confirmed')">Confirmar</button>` : ''}
                            ${c.status === 'confirmed' ? `<button class="btn-s verde" onclick="citaStatus('${c.id}','completed')">Completar</button>` : ''}
                            ${['pending','confirmed'].includes(c.status) ? `<button class="btn-s rojo" onclick="citaStatus('${c.id}','cancelled')">Cancelar</button>` : ''}
                            <button class="btn-s azul" onclick="citaEditar('${c.id}')">Reprogramar</button>
                            <button class="btn-s" onclick="verNotas('${c.id}')">Notas</button>
                        </div></td>
                    </tr>`).join('')}
            </table>` : '<div style="color:#9c8fa1; padding:20px;">No hay citas.</div>';
        window.citaStatus = citaStatus;
        window.citaEditar = citaEditar;
        window.verNotas = verNotas;
    } catch (err) { noError($('tbl-citas'), err); }
}

async function citaStatus(id, status) {
    try {
        await api('PATCH', `/api/admin/appointments/${id}/status`, { status });
        toast('Cita actualizada');
        cargarCitas();
    } catch (err) { toast(err.message, false); }
}

async function citaEditar(id) {
    let cita = null, artistas = [], servicios = [];
    try {
        const lista = await api('GET', '/api/admin/appointments');
        cita = lista.find((c) => c.id == id);
    } catch (err) { toast(err.message, false); return; }
    if (!cita) { toast('Cita no encontrada', false); return; }
    try { artistas = await api('GET', '/api/admin/artists'); } catch (_) { }
    try { servicios = await api('GET', '/api/admin/services'); } catch (_) { }

    const viejo = document.querySelector('.notas-overlay');
    if (viejo) viejo.remove();

    const actual = new Date(cita.appointment_date);
    const local = new Date(actual.getTime() - actual.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

    const ov = document.createElement('div');
    ov.className = 'notas-overlay';
    ov.innerHTML = `
        <div class="notas-modal">
            <div class="notas-head">
                <div>
                    <h3>Reprogramar cita #${esc(cita.id)}</h3>
                    <div class="notas-sub">Modifica la fecha/hora, el artista, el servicio o agrega notas (RF11)</div>
                </div>
                <button class="notas-cerrar" title="Cerrar">✕</button>
            </div>
            <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:16px;">
                <span class="badge confirmed">${esc(cita.client_name || '—')}</span>
                <span class="badge">${esc(cita.service_name || '—')}</span>
                <span class="badge">${esc(cita.artist_name || 'Sin artista')}</span>
                <span class="badge">${fmtFecha(cita.appointment_date)}</span>
            </div>
            <form class="panel-form" id="repro-form">
                <div class="campo"><label>Nueva fecha y hora *</label>
                    <input type="datetime-local" id="rp-fecha" value="${local}" required></div>
                <div class="campo"><label>Artista</label>
                    <select id="rp-artista">
                        <option value="">Sin asignar</option>
                        ${artistas.map((a) => `<option value="${esc(a.id)}" ${a.id == cita.artist_id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}
                    </select></div>
                <div class="campo"><label>Servicio</label>
                    <select id="rp-servicio">
                        <option value="">Sin servicio</option>
                        ${servicios.map((s) => `<option value="${esc(s.id)}" ${s.id == cita.service_id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
                    </select></div>
                <div class="campo full"><label>Notas</label>
                    <textarea id="rp-notas" placeholder="Observaciones de la reprogramación">${esc(cita.notes || '')}</textarea></div>
                <div class="campo full">
                    <button type="submit" class="btn">Guardar reprogramación</button>
                    <button type="button" class="btn2" onclick="document.querySelector('.notas-overlay').remove()">Cancelar</button>
                </div>
            </form>
        </div>`;
    ov.querySelector('.notas-cerrar').onclick = () => ov.remove();
    ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);

    document.getElementById('repro-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const body = {};
        if (document.getElementById('rp-fecha').value) body.appointment_date = document.getElementById('rp-fecha').value;
        body.artist_id = document.getElementById('rp-artista').value || null;
        body.service_id = document.getElementById('rp-servicio').value || null;
        const notas = document.getElementById('rp-notas').value.trim();
        if (notas) body.notes = notas;
        try {
            await api('PUT', `/api/admin/appointments/${id}`, body);
            toast('Cita reprogramada (RF11)');
            ov.remove();
            cargarCitas();
        } catch (err) { toast(err.message, false); }
    });
}

async function verNotas(id) {
    try {
        const notas = await api('GET', `/api/artist/appointments/${id}/notes`);
        const lista = await api('GET', '/api/admin/appointments');
        const cita = lista.find((c) => c.id == id);
        mostrarNotas({
            titulo: `Cita #${id}`,
            subtitulo: [cita?.client_name, cita?.service_name].filter(Boolean).join(' · '),
            notas,
        });
    } catch (err) { toast(err.message, false); }
}

function pctClass(p) {
    if (p == null) return '';
    return p >= 100 ? 'done' : p >= 50 ? 'mitad' : 'inicio';
}

function mostrarNotas({ titulo, subtitulo, notas }) {
    const viejo = document.querySelector('.notas-overlay');
    if (viejo) viejo.remove();
    const ov = document.createElement('div');
    ov.className = 'notas-overlay';
    ov.innerHTML = `
        <div class="notas-modal">
            <div class="notas-head">
                <div>
                    <h3>${esc(titulo)}</h3>
                    <div class="notas-sub">${esc(subtitulo || '')}</div>
                </div>
                <button class="notas-cerrar" title="Cerrar">✕</button>
            </div>
            <div class="notas-lista">
                ${notas.length ? notas.map((n) => `
                    <div class="nota-card">
                        <div class="nota-top">
                            <span class="nota-fecha">${fmtFecha(n.created_at)}</span>
                            <span class="nota-pct ${pctClass(n.progress_pct)}">${n.progress_pct ?? '—'}%</span>
                        </div>
                        ${n.progress_pct != null ? `<div class="pct-track"><div class="pct-fill" style="width:${Math.min(100, Math.max(0, n.progress_pct))}%"></div></div>` : ''}
                        <div class="nota-texto">${esc(n.notes || '—')}</div>
                    </div>`).join('')
                : '<div class="notas-vacio">Aún no hay notas de sesión.</div>'}
            </div>
        </div>`;
    ov.querySelector('.notas-cerrar').onclick = () => ov.remove();
    ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);
}

/* ============================================================
   MIS CITAS (artista): RF18 / RF19
============================================================ */
async function renderMisCitas() {
    const v = $('view-mis-citas');
    v.innerHTML = `
        <div class="panel-card">
            <h2>Mis <span>citas</span></h2>
            <div class="sub">Citas asignadas, aceptar/rechazar (RF18, RF19) y registrar avances (RF20)</div>
            <div id="tbl-mis-citas"></div>
        </div>`;
    try {
        const lista = await api('GET', '/api/artist/appointments');
        $('tbl-mis-citas').innerHTML = lista.length ? `
            <table class="tabla">
                <tr><th>ID</th><th>Cliente</th><th>Servicio</th><th>Fecha</th><th>Estado</th><th>Acciones</th></tr>
                ${lista.map((c) => `
                    <tr>
                        <td>${c.id}</td>
                        <td>${esc(c.client_name || '—')} <br><small style="color:#9c8fa1">${esc(c.client_email || '')} ${esc(c.client_phone || '')}</small></td>
                        <td>${esc(c.service_name || '—')}</td>
                        <td>${fmtFecha(c.appointment_date)}</td>
                        <td>${fmtEstado(c.status)}</td>
                        <td><div class="acciones">
                            ${c.status === 'pending' ? `<button class="btn-s verde" onclick="miCitaStatus('${c.id}','confirmed')">Aceptar</button>
                             <button class="btn-s rojo" onclick="miCitaStatus('${c.id}','cancelled')">Rechazar</button>` : ''}
                            ${['pending','confirmed','completed'].includes(c.status) ? `<button class="btn-s azul" onclick="notaForm('${c.id}')">Avance</button>` : ''}
                            <button class="btn-s" onclick="miNotas('${c.id}')">Ver notas</button>
                        </div></td>
                    </tr>`).join('')}
            </table>` : '<div style="color:#9c8fa1; padding:20px;">No tienes citas asignadas.</div>';
        window.miCitaStatus = miCitaStatus;
        window.notaForm = notaForm;
        window.miNotas = miNotas;
    } catch (err) { noError(v, err); }
}

async function miCitaStatus(id, status) {
    try {
        await api('PATCH', `/api/artist/appointments/${id}/status`, { status });
        toast('Cita ' + status);
        renderMisCitas();
    } catch (err) { toast(err.message, false); }
}

function notaForm(id) {
    const box = $('view-mis-citas');
    if ($('nota-box' + id)) { $('nota-box' + id).remove(); return; }
    box.insertAdjacentHTML('beforeend', `
        <div class="panel-card" id="nota-box${id}">
            <h2>Avance de sesión <span>#${id}</span></h2>
            <div class="sub">Observaciones/avances de la sesión de tatuaje (RF20)</div>
            <div class="panel-form">
                <div class="campo full"><label>Notas</label><textarea id="nt-texto" placeholder="Detalle de la sesión..."></textarea></div>
                <div class="campo"><label>Progreso</label>
                    <div style="display:flex;align-items:center;gap:12px;">
                        <input type="range" id="nt-pct" min="0" max="100" value="50" style="flex:1;accent-color:#c96be3;" oninput="$('nt-pct-ver').textContent=this.value+'%';">
                        <span id="nt-pct-ver" class="nota-pct-live" style="margin:0;">50%</span>
                    </div>
                </div>
                <div class="campo" style="display:flex;align-items:flex-end;"><button class="btn" onclick="guardarNota('${id}')">Guardar</button></div>
            </div>
        </div>`);
    window.guardarNota = async (nid) => {
        try {
            await api('POST', `/api/artist/appointments/${nid}/notes`, {
                notes: $('nt-texto').value.trim(),
                progress_pct: Number($('nt-pct').value),
            });
            toast('Avance registrado');
            renderMisCitas();
        } catch (err) { toast(err.message, false); }
    };
}

async function miNotas(id) {
    try {
        const notas = await api('GET', `/api/artist/appointments/${id}/notes`);
        const lista = await api('GET', '/api/artist/appointments');
        const cita = lista.find((c) => c.id == id);
        mostrarNotas({
            titulo: `Cita #${id}`,
            subtitulo: [cita?.client_name, cita?.service_name].filter(Boolean).join(' · '),
            notas,
        });
    } catch (err) { toast(err.message, false); }
}

/* ============================================================
   PORTAFOLIO (admin, RF15)
============================================================ */
async function renderPortafolio() {
    const v = $('view-portafolio');
    v.innerHTML = `
        <div class="panel-card">
            <h2>Portafolio / <span>galería</span></h2>
            <div class="sub">Agregar, editar, modificar o eliminar trabajos del catálogo (RF15)</div>
            <button class="btn" onclick="portafolioForm()">＋ Agregar trabajo</button>
        </div>
        <div class="panel-card"><div id="tbl-portafolio"></div></div>`;
    window.portafolioForm = portafolioForm;
    cargarTablaPortafolio();
}

async function cargarTablaPortafolio() {
    const v = $('view-portafolio');
    try {
        const lista = await api('GET', '/api/admin/portfolio');
        $('tbl-portafolio').innerHTML = `
            <table class="tabla">
                <tr><th></th><th>Título</th><th>Categoría</th><th>Artista</th><th>Precio</th><th>Destacado</th><th>Acciones</th></tr>
                ${lista.map((g) => `
                    <tr>
                        <td><img class="img-mini" src="${esc(g.image_url)}" onerror="this.style.opacity=.2"></td>
                        <td>${esc(g.title)}</td>
                        <td>${esc(g.category)}</td>
                        <td>${esc(g.artist_name || '—')}</td>
                        <td>$${g.price_from || '-'}</td>
                        <td>${g.is_featured ? '<span class="badge confirmed">Sí</span>' : '<span style="color:#6d6272">No</span>'}</td>
                        <td><div class="acciones">
                            <button class="btn-s azul" onclick="portafolioForm('${g.id}')">Editar</button>
                            <button class="btn-s rojo" onclick="delPortafolio('${g.id}')">Eliminar</button>
                        </div></td>
                    </tr>`).join('')}
            </table>`;
        window.delPortafolio = delPortafolio;
    } catch (err) { noError(v, err); }
}

window.portafolioForm = portafolioForm;
async function portafolioForm(id) {
    const v = $('view-portafolio');
    let item = null;
    let artistas = [];
    if (id) {
        try { item = (await api('GET', '/api/gallery/' + id)); } catch (_) { }
        try { artistas = await api('GET', '/api/admin/artists'); } catch (_) { }
    } else {
        try { artistas = await api('GET', '/api/admin/artists'); } catch (_) { }
    }
    let pendingIa = item?.image_url || null;

    v.insertAdjacentHTML('beforeend', `
        <div class="panel-card" id="pf-box">
            <h2>${id ? 'Editar trabajo #' + id : 'Nuevo <span>trabajo</span>'}</h2>
            <form class="panel-form" id="pf-form">
                <div class="campo"><label>Título *</label><input id="pf-title" required value="${esc(item?.title || '')}" placeholder="Ej: Flor de loto"></div>
                <div class="campo"><label>Categoría *</label>
                    <input id="pf-category" list="pf-cats" required value="${esc(item?.category || '')}" placeholder="Blackwork, Realismo...">
                    <datalist id="pf-cats">
                        <option>Tradicional</option><option>Blackwork</option><option>Fine Line</option>
                        <option>Realismo</option><option>Color</option><option>Geométrico</option><option>Lettering</option>
                    </datalist>
                </div>
                <div class="campo"><label>Precio desde ($)</label><input type="number" id="pf-price" min="0" value="${item?.price_from ?? ''}" placeholder="1500"></div>
                <div class="campo"><label>Artista</label>
                    <select id="pf-artist">
                        <option value="">Sin asignar</option>
                        ${artistas.map((a) => `<option value="${a.id}" ${item && item.artist_id == a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}
                    </select>
                </div>
                <div class="campo full"><label>Descripción</label><textarea id="pf-desc" placeholder="Detalles del trabajo">${esc(item?.description || '')}</textarea></div>
                <div class="campo full">
                    <label>Diseño / Imagen</label>
                    <div style="display:flex; align-items:center; gap:16px; flex-wrap:wrap;">
                        <img id="pf-preview" src="${esc(item?.image_url || '')}" alt="preview" style="width:130px; height:130px; object-fit:cover; border-radius:10px; border:1px solid rgba(141,22,175,.4); ${item?.image_url ? '' : 'display:none'}">
                        <div style="flex:1; min-width:200px;">
                            <input type="file" id="pf-img" accept="image/*">
                            <div style="font-size:12px; color:#9c8fa1; margin-top:4px;">${id ? 'Deja vacío para mantener el diseño actual' : 'Sube una imagen desde tu equipo'}</div>
                            <div class="acciones" style="margin-top:8px;">
                                <button type="button" class="btn-s verde" onclick="disenarPortafolio()">🎨 Diseñar (IA)</button>
                            </div>
                            <div id="pf-ia-out" style="font-size:13px; color:#9c8fa1; margin-top:6px;"></div>
                        </div>
                    </div>
                </div>
                <div class="campo full" style="display:flex; align-items:center; gap:10px; color:#e3d6e6;">
                    <input type="checkbox" id="pf-featured" style="width:18px;" ${item?.is_featured ? 'checked' : ''}> Destacado en la galería principal
                </div>
                <div class="campo full">
                    <button type="submit" class="btn">Guardar</button>
                    <button type="button" class="btn2" onclick="document.getElementById('pf-box').remove()">Cancelar</button>
                </div>
            </form>
        </div>`);

    $('pf-img').addEventListener('change', () => {
        const f = $('pf-img').files[0];
        if (f) {
            pendingIa = null;
            const rd = new FileReader();
            rd.onload = (ev) => { $('pf-preview').src = ev.target.result; $('pf-preview').style.display = ''; };
            rd.readAsDataURL(f);
        }
    });

    window.disenarPortafolio = disenarPortafolio;
async function disenarPortafolio() {
    const out = $('pf-ia-out');
    const btn = document.querySelector('#pf-ia-btn');
    const title = $('pf-title').value.trim();
    if (!title) {
        out.style.color = '#ff6b6b';
        out.textContent = 'Escribe primero el título del trabajo';
        return;
    }
    out.style.color = '#e08cff';
    out.textContent = 'Generando diseño con IA... puede tardar 1-2 minutos.';
    try {
        const d = await api('POST', '/api/gallery/design-ia', {
            title,
            description: $('pf-desc').value.trim() || null,
            category: $('pf-category').value.trim() || null,
        });
        pendingIa = d.image_url;
        if (d.text) out.textContent = 'Diseño generado: ' + d.text;
        else out.textContent = 'Diseño generado. Guarda el trabajo para publicarlo.';
        out.style.color = '#7dffa1';
        $('pf-preview').src = d.image_url;
        $('pf-preview').style.display = '';
        $('pf-img').value = '';
    } catch (err) {
        out.style.color = '#ff6b6b';
        out.textContent = err.message;
    }
}

$('pf-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData();
        fd.append('title', $('pf-title').value.trim());
        fd.append('category', $('pf-category').value.trim());
        fd.append('price_from', $('pf-price').value || '');
        const av = $('pf-artist').value;
        fd.append('artist_id', av === '' ? (id ? '__none__' : null) : av);
        fd.append('description', $('pf-desc').value.trim());
        fd.append('is_featured', $('pf-featured').checked ? 'true' : 'false');
        const file = $('pf-img').files[0];
        if (file) fd.append('imagen', file);
        else if (pendingIa) fd.append('image_url', pendingIa);
        if (!id && !file && !pendingIa) {
            toast('Sube una imagen o genera un diseño con 🎨 Diseñar (IA)', false);
            return;
        }
        try {
            if (id) {
                await api('PUT', `/api/gallery/${id}`, fd);
                toast('Trabajo actualizado');
            } else {
                await api('POST', '/api/gallery', fd);
                toast('Trabajo agregado');
            }
            document.getElementById('pf-box').remove();
            cargarTablaPortafolio();
        } catch (err) { toast(err.message, false); }
    });
}

async function delPortafolio(id) {
    if (!confirm('¿Eliminar este trabajo de la galería?')) return;
    try {
        await api('DELETE', `/api/gallery/${id}`);
        toast('Eliminado');
        cargarTablaPortafolio();
    } catch (err) { toast(err.message, false); }
}

/* ============================================================
   MENSAJES (admin)
============================================================ */
async function renderMensajes() {
    const v = $('view-mensajes');
    v.innerHTML = `<div class="panel-card"><h2>Mensajes de <span>contacto</span></h2><div id="tbl-mensajes"></div></div>`;
    try {
        const lista = await api('GET', '/api/admin/messages');
        $('tbl-mensajes').innerHTML = lista.length ? `
            <table class="tabla">
                <tr><th>Fecha</th><th>Nombre</th><th>Email</th><th>Asunto</th><th>Mensaje</th><th>Acciones</th></tr>
                ${lista.map((m) => `
                    <tr style="${m.is_read ? 'opacity:.55' : ''}">
                        <td>${fmtFecha(m.created_at)}</td>
                        <td>${esc(m.name)}</td>
                        <td>${esc(m.email)}</td>
                        <td>${esc(m.subject || '—')}</td>
                        <td style="max-width:260px">${esc(m.message)}</td>
                        <td><div class="acciones">
                            ${!m.is_read ? `<button class="btn-s" onclick="msgRead('${m.id}')">Marcar leído</button>` : ''}
                            <button class="btn-s rojo" onclick="msgDel('${m.id}')">Eliminar</button>
                        </div></td>
                    </tr>`).join('')}
            </table>` : '<div style="color:#9c8fa1; padding:20px;">Sin mensajes.</div>';
        window.msgRead = async (id) => { await api('PATCH', `/api/admin/messages/${id}/read`); renderMensajes(); };
        window.msgDel = async (id) => { if (confirm('¿Eliminar mensaje?')) { await api('DELETE', `/api/admin/messages/${id}`); renderMensajes(); } };
    } catch (err) { noError(v, err); }
}

/* ============================================================
   REFERENCIAS IA (admin)
============================================================ */
async function renderReferencias() {
    const v = $('view-referencias');
    v.innerHTML = `<div class="panel-card"><h2>Referencias e <span>IA</span></h2><div class="sub">Todas las referencias subidas por clientes y su análisis</div><div id="tbl-refs"></div></div>`;
    try {
        const { rows } = await poolRefsTodos();
        $('tbl-refs').innerHTML = rows.length ? rows.map((r) => `
            <div class="panel-card" style="margin-bottom:12px">
                <div style="display:flex; gap:16px; align-items:flex-start; flex-wrap:wrap">
                    <img class="mini-ref" src="${esc(r.image_url)}" onerror="this.style.opacity=.2">
                    <div style="flex:1; min-width:250px">
                        <div><b style="color:#c96be3">Cliente:</b> ${esc(r.cliente || '—')} <span style="color:#9c8fa1">· ${fmtFecha(r.created_at)}</span></div>
                        <div style="color:#9c8fa1; font-size:13px">${esc(r.description || 'Sin descripción')}</div>
                        ${r.analysis ? `<div class="ia-analisis">${esc(r.analysis)}</div>` : ''}
                        <div class="acciones" style="margin-top:10px">
                            <button class="btn-s verde" onclick="disenoAdmin('${r.id}')">🎨 Diseñar (IA)</button>
                        </div>
                        <div id="props-${r.id}" style="margin-top:8px; display:flex; gap:10px; flex-wrap:wrap;"></div>
                    </div>
                </div>
            </div>`).join('') : '<div style="color:#9c8fa1; padding:20px;">No hay referencias.</div>';

        window.disenoAdmin = async (id) => {
            const caja = $('props-' + id);
            caja.innerHTML = '<div style="color:#e08cff">Generando diseño con IA, esto puede tardar 1-2 minutos...</div>';
            try {
                const d = await api('POST', `/api/references/${id}/generate-image`, {});
                caja.innerHTML = `<img src="${esc(d.image_url)}" style="max-width:100%; border-radius:10px; border:1px solid rgba(141,22,175,0.4);">`;
                cargarProps(id);
                toast('Diseño generado');
            } catch (err) { caja.innerHTML = `<div style="color:#ff6b6b">${esc(err.message)}</div>`; }
        };
        rows.forEach((r) => cargarProps(r.id));
    } catch (err) { noError(v, err); }
}

async function poolRefsTodos() {
    // sólo refs con su cliente: consulta SQL directo no disponible por rol, pero el admin es dueño de ver
    const res = await fetch('/api/admin/references-all', { headers: { Authorization: 'Bearer ' + state.token } });
    return res.json();
}

/* ============================================================
   MI PERFIL (cliente, RF03)
============================================================ */
async function renderPerfil() {
    const v = $('view-perfil');
    const me = await api('GET', '/api/auth/me');
    v.innerHTML = `
        <div class="panel-card">
            <h2>Mi <span>perfil</span></h2>
            <div class="sub">Consulta y actualiza tus datos (RF03)</div>
            <form class="panel-form" id="pf-form">
                <div class="campo"><label>Nombre</label><input id="pf-nombre" value="${esc(me.name || '')}"></div>
                <div class="campo"><label>Teléfono</label><input id="pf-phone" value="${esc(me.phone || '')}"></div>
                <div class="campo"><label>Email</label><input type="email" id="pf-email" value="${esc(me.email)}"></div>
                <div class="campo"><label>Nueva contraseña (opcional)</label><input type="password" id="pf-pass" placeholder="Mínimo 6 caracteres"></div>
                <div class="campo full"><button type="submit" class="btn">Guardar cambios</button></div>
            </form>
        </div>`;
    $('pf-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            await api('PUT', '/api/auth/profile', {
                name: $('pf-nombre').value.trim() || null,
                phone: $('pf-phone').value.trim() || null,
                email: $('pf-email').value.trim() || null,
                password: $('pf-pass').value || null,
            });
            toast('Perfil actualizado');
            renderPerfil();
        } catch (err) { toast(err.message, false); }
    });
}

/* ============================================================
   DISPONIBILIDAD (cliente, RF08)
============================================================ */
async function renderDisponibilidad() {
    const v = $('view-disponibilidad');
    v.innerHTML = `
        <div class="panel-card">
            <h2>Consulta de <span>disponibilidad</span></h2>
            <div class="sub">Verifica la agenda de los artistas por fecha (RF08)</div>
            <input type="date" id="disp-fecha">
            <button class="btn" onclick="cargarDisp()">Consultar</button>
            <div id="disp-result" style="margin-top:16px"></div>
        </div>`;
    window.cargarDisp = async () => {
        const fecha = $('disp-fecha').value;
        if (!fecha) { toast('Selecciona una fecha', false); return; }
        try {
            const lista = await api('GET', '/api/availability?date=' + fecha);
            const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
            $('disp-result').innerHTML = `<div style="color:#e08cff; margin-bottom:10px"><b>${dias[new Date(fecha + 'T12:00:00').getDay()]} · ${fecha}</b></div>` +
                (lista.length ? lista.map((s) => `
                    <div style="display:flex; justify-content:space-between; padding:10px 14px; border:1px solid rgba(141,22,175,0.2); border-radius:10px; margin-bottom:8px; background:rgba(10,3,14,0.6)">
                        <span><b style="color:#c96be3">${esc(s.artist_name)}</b> <small style="color:#9c8fa1">${esc(s.specialty || '')}</small></span>
                        <span><small>${s.start_time.slice(0,5)} - ${s.end_time.slice(0,5)}</small> ${s.available ? '<span class="badge completed">Disponible</span>' : '<span class="badge cancelled">Ocupado</span>'}</span>
                    </div>`).join('')
                : '<div style="color:#9c8fa1">No hay horarios para ese día.</div>');
        } catch (err) { toast(err.message, false); }
    };
}

/* ============================================================
   MIS REFERENCIAS (cliente): RF04 / RF05 / RF06
============================================================ */
async function renderMisReferencias() {
    const v = $('view-mis-referencias');
    v.innerHTML = `
        <div class="panel-card">
            <h2>Mis <span>referencias</span></h2>
            <div class="sub">Carga imágenes de referencia y genera análisis/propuestas con IA (RF04-RF06)</div>
            <form id="ref-form">
                <div class="panel-form">
                    <div class="campo full"><label>Descripción de tu idea</label><textarea id="ref-desc" placeholder="Ej: una serpiente enroscada con rosas en el antebrazo"></textarea></div>
                    <div class="campo full"><input type="file" id="ref-file" accept="image/*" required></div>
                    <div class="campo full"><button type="submit" class="btn">Subir imagen</button></div>
                </div>
            </form>
        </div>
        <div id="ref-list"></div>`;

    $('ref-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const file = $('ref-file').files[0];
        if (!file) { toast('Selecciona una imagen', false); return; }
        const fd = new FormData();
        fd.append('imagen', file);
        fd.append('description', $('ref-desc').value.trim() || '');
        try {
            await api('POST', '/api/references', fd);
            toast('Referencia subida');
            renderMisReferencias();
        } catch (err) { toast(err.message, false); }
    });
    cargarMisRefs();
}

async function cargarMisRefs() {
    try {
        const lista = await api('GET', '/api/references');
        $('ref-list').innerHTML = lista.length ? lista.map((r) => `
            <div class="panel-card" style="margin-bottom:14px">
                <div style="display:flex; gap:16px; flex-wrap:wrap; align-items:flex-start">
                    <img class="mini-ref" src="${esc(r.image_url)}">
                    <div style="flex:1; min-width:250px">
                        <div style="color:#9c8fa1; font-size:13px">${esc(r.description || 'Sin descripción')} · ${fmtFecha(r.created_at)}</div>
                        <div class="acciones" style="margin-top:10px">
                            <button class="btn-s" id="btn-analyze-${r.id}">🔍 Analizar con IA (RF05)</button>
                            <button class="btn-s azul" id="btn-prop-${r.id}">💡 Propuestas (RF06)</button>
                            <button class="btn-s verde" id="btn-img-${r.id}">🎨 Diseñar (IA)</button>
                            <button class="btn-s rojo" onclick="delRef('${r.id}')">Eliminar</button>
                        </div>
                        <div id="out-${r.id}" style="margin-top:10px">${r.analysis ? `<div class="ia-analisis">${esc(r.analysis)}</div>` : ''}</div>
                        <div id="props-${r.id}" style="margin-top:8px; display:flex; gap:10px; flex-wrap:wrap;"></div>
                    </div>
                </div>
            </div>`).join('') : '<div style="color:#9c8fa1">Aún no has subido referencias.</div>';

        for (const r of lista) {
            let busy = false;
            $('btn-analyze-' + r.id).addEventListener('click', async () => {
                if (busy) return; busy = true;
                $('out-' + r.id).innerHTML = '<div style="color:#e08cff">Analizando imagen con IA...</div>';
                try {
                    const d = await api('POST', `/api/references/${r.id}/analyze`, {});
                    $('out-' + r.id).innerHTML = `<div class="ia-analisis">${esc(d.analysis)}</div>`;
                    toast('Análisis generado');
                } catch (err) { $('out-' + r.id).innerHTML = `<div style="color:#ff6b6b">${esc(err.message)}</div>`; }
                busy = false;
            });
            $('btn-prop-' + r.id).addEventListener('click', async () => {
                if (busy) return; busy = true;
                $('out-' + r.id).innerHTML = '<div style="color:#e08cff">Generando propuestas de diseño...</div>';
                try {
                    const req = window.prompt('Requisitos adicionales para las propuestas:', '');
                    const d = await api('POST', `/api/references/${r.id}/proposals`, { requirements: req || null });
                    $('out-' + r.id).innerHTML = `<div class="ia-analisis">${esc(d.content)}</div>`;
                    toast('Propuestas generadas');
                } catch (err) { $('out-' + r.id).innerHTML = `<div style="color:#ff6b6b">${esc(err.message)}</div>`; }
                busy = false;
            });
            $('btn-img-' + r.id).addEventListener('click', async () => {
                if (busy) return; busy = true;
                $('out-' + r.id).innerHTML = '<div style="color:#e08cff">Generando diseño con IA, esto puede tardar 1-2 minutos...</div>';
                try {
                    const d = await api('POST', `/api/references/${r.id}/generate-image`, {});
                    $('out-' + r.id).innerHTML =
                        `<img src="${esc(d.image_url)}" style="max-width:100%; border-radius:10px; border:1px solid rgba(141,22,175,0.4); margin-top:8px;">`;
                    cargarProps(r.id);
                    toast('Diseño generado');
                } catch (err) { $('out-' + r.id).innerHTML = `<div style="color:#ff6b6b">${esc(err.message)}</div>`; }
                busy = false;
            });
            cargarProps(r.id);
        }
        window.delRef = async (id) => {
            if (!confirm('¿Eliminar referencia?')) return;
            try { await api('DELETE', `/api/references/${id}`); toast('Eliminada'); cargarMisRefs(); }
            catch (err) { toast(err.message, false); }
        };
    } catch (err) {
        $('ref-list').innerHTML = `<div style="color:#ff6b6b">${esc(err.message)}</div>`;
    }
}

async function cargarProps(id) {
    try {
        const lista = await api('GET', `/api/references/${id}/proposals`);
        const caja = $('props-' + id);
        if (caja) {
            caja.innerHTML = lista.filter((p) => p.image_url).map((p) =>
                `<img src="${esc(p.image_url)}" title="${esc(p.content || 'Diseño')}" style="width:110px; height:110px; object-fit:cover; border-radius:8px; border:1px solid rgba(141,22,175,0.4);">`).join('');
        }
    } catch (_) { /* sin propuestas */ }
}

/* ============================================================
   NOTIFICACIONES (RF12)
============================================================ */
async function renderNotificaciones() {
    const v = $('view-notificaciones');
    v.innerHTML = `<div class="panel-card"><h2>Mis <span>notificaciones</span></h2><div id="tbl-notifs"></div></div>`;
    try {
        const lista = await api('GET', '/api/notifications');
        $('tbl-notifs').innerHTML = (lista.length ? lista : []).length ? lista.map((n) => `
            <div onclick="notifRead('${n.id}')" style="cursor:pointer; padding:12px 14px; border:1px solid rgba(141,22,175,0.2); border-radius:10px; margin-bottom:8px; background:${n.is_read ? 'rgba(10,3,14,0.4)' : 'rgba(109,3,135,0.15)'}; opacity:${n.is_read ? '.6' : '1'}">
                <div style="display:flex; justify-content:space-between">
                    <b style="color:#c96be3">${esc(n.title)}</b>
                    <small style="color:#9c8fa1">${fmtFecha(n.created_at)}</small>
                </div>
                <div style="color:#cfc6d3; font-size:13px; margin-top:4px">${esc(n.message || '')}</div>
            </div>`).join('') : '<div style="color:#9c8fa1; padding:20px;">Sin notificaciones.</div>';
        window.notifRead = async (id) => { await api('PATCH', `/api/notifications/${id}/read`); renderNotificaciones(); };
    } catch (err) { noError(v, err); }
}

/* ============================================================
   AUDITORÍA (admin, RNF10)
============================================================ */
async function renderAuditoria() {
    const v = $('view-auditoria');
    v.innerHTML = `<div class="panel-card"><h2>Registro de <span>auditoría</span></h2><div class="sub">Historial de modificaciones en solicitudes, diseños, citas y usuarios (RNF10)</div><div id="tbl-audit"></div></div>`;
    try {
        const lista = await api('GET', '/api/admin/activity');
        $('tbl-audit').innerHTML = lista.length ? `
            <table class="tabla">
                <tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Entidad</th><th>ID</th></tr>
                ${lista.map((a) => `
                    <tr><td>${fmtFecha(a.created_at)}</td><td>${esc(a.user_email || '—')}</td><td><b style="color:#e08cff">${esc(a.action)}</b></td><td>${esc(a.entity || '—')}</td><td>${a.entity_id || '—'}</td></tr>`).join('')}
            </table>` : '<div style="color:#9c8fa1; padding:20px;">Sin actividad.</div>';
    } catch (err) { noError(v, err); }
}

/* ============================================================
   HELPERS
============================================================ */
function tabular(headers, rows, total) {
    if (!rows.length) return '<div style="color:#9c8fa1; padding:20px;">Sin datos.</div>';
    return `<table class="tabla"><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr>
        ${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</table>`;
}

function errCard(err) {
    return `<div class="panel-card"><div style="color:#ff6b6b">${esc(err.message)}</div></div>`;
}

function noError(v, err) {
    v.insertAdjacentHTML('beforeend', `<div style="color:#ff6b6b; padding:12px">${esc(err.message)}</div>`);
}

/* ---------- Inicio ---------- */
document.addEventListener('DOMContentLoaded', async () => {
    if (state.token && state.user) {
        try {
            const me = await api('GET', '/api/auth/me');
            state.me = me;
            state.user = me || state.user;
            entrarAlPanel();
            return;
        } catch (_) {
            salir();
        }
    }
    mostrarLogin();
});