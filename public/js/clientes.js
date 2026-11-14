/* ============================================================
   KAT TATTOO - Cuenta de cliente (login/registro + Mi Espacio)
============================================================ */

const $c = (id) => document.getElementById(id);

let cuenta = {
    token: localStorage.getItem('kat_token') || null,
    user: JSON.parse(localStorage.getItem('kat_user') || 'null'),
};

function ctoast(msg, ok = true) {
    const el = $c('toast');
    el.textContent = msg;
    el.classList.remove('error');
    if (!ok) el.classList.add('error');
    el.classList.add('show');
    clearTimeout(window.__cToastT);
    window.__cToastT = setTimeout(() => el.classList.remove('show'), 4000);
}

async function capi(method, url, body, form = false) {
    const headers = {};
    if (cuenta.token) headers['Authorization'] = 'Bearer ' + cuenta.token;
    if (body && !form) headers['Content-Type'] = 'application/json';
    const res = await fetch(url, {
        method,
        headers,
        body: form ? body : body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Error del servidor');
    return data;
}

const cesc = (str) => String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cfmtFecha = (d) => d ? new Date(d).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const cbadge = (s) => `<span class="badge ${s}">${s}</span>`;

/* ============================================================
   MODAL LOGIN / REGISTRO
============================================================ */
window.abrirCuenta = () => { $c('cuenta-modal').style.display = 'flex'; };
window.cerrarCuenta = () => { $c('cuenta-modal').style.display = 'none'; };

window.cambiarTab = (tab) => {
    $c('tab-login').classList.toggle('activo', tab === 'login');
    $c('tab-register').classList.toggle('activo', tab === 'register');
    $c('form-login').style.display = tab === 'login' ? 'grid' : 'none';
    $c('form-register').style.display = tab === 'register' ? 'grid' : 'none';
};

function guardarSesion(data) {
    cuenta = { token: data.token, user: data.user };
    localStorage.setItem('kat_token', data.token);
    localStorage.setItem('kat_user', JSON.stringify(data.user));
    cerrarCuenta();
    pintarNavCuenta();
    cargarMiEspacio();
}

function pintarNavCuenta() {
    const log = cuenta.token;
    $c('nav-login').style.display = log ? 'none' : '';
    $c('nav-salir').style.display = log ? '' : 'none';
}

window.salirCuenta = () => {
    localStorage.removeItem('kat_token');
    localStorage.removeItem('kat_user');
    cuenta = { token: null, user: null };
    pintarNavCuenta();
    cargarMiEspacio();
    ctoast('Sesión cerrada');
};

$c('form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        const data = await capi('POST', '/api/auth/login', {
            email: $c('cu-email').value.trim(),
            password: $c('cu-password').value,
        });
        guardarSesion(data);
        ctoast('¡Bienvenido de nuevo!');
    } catch (err) { ctoast(err.message, false); }
});

$c('form-register').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        const data = await capi('POST', '/api/auth/register', {
            name: $c('rg-nombre').value.trim(),
            email: $c('rg-email').value.trim(),
            phone: $c('rg-telefono').value.trim() || null,
            password: $c('rg-password').value,
        });
        guardarSesion(data);
        ctoast('¡Cuenta creada! Bienvenido a KAT Tattoo');
    } catch (err) { ctoast(err.message, false); }
});

/* ---- Restablecer contraseña (olvidé mi clave) ---- */
let resetEmail = null;

window.mostrarOlvido = () => {
    $c('form-login').style.display = 'none';
    $c('form-register').style.display = 'none';
    $c('form-forgot').style.display = 'grid';
    $c('form-reset').style.display = 'none';
    $c('link-volver').style.display = '';
    $c('cuenta-msg').textContent = '';
    $c('fg-email').value = $c('cu-email').value || '';
    resetEmail = $c('fg-email').value || null;
};

window.volverLogin = () => {
    $c('form-login').style.display = 'grid';
    $c('form-register').style.display = 'none';
    $c('form-forgot').style.display = 'none';
    $c('form-reset').style.display = 'none';
    $c('link-volver').style.display = 'none';
    $c('cuenta-msg').textContent = '';
};

$c('form-forgot').addEventListener('submit', async (e) => {
    e.preventDefault();
    resetEmail = $c('fg-email').value.trim();
    const msg = $c('cuenta-msg');
    msg.textContent = 'Enviando...';
    msg.className = 'cuenta-msg';
    try {
        const d = await capi('POST', '/api/auth/forgot-password', { email: resetEmail });
        if (d.ok) {
            msg.className = 'cuenta-msg ok';
            msg.textContent = d.reset_code
                ? `Tu código de verificación es: ${d.reset_code} (válido por 15 minutos).`
                : 'Revisa tu correo: enviamos el código de seguridad (válido por 15 minutos).';
            if (d.reset_code) $c('form-reset').style.display = 'grid';
            else $c('form-reset').style.display = 'grid';
        }
    } catch (err) {
        msg.className = 'cuenta-msg err';
        msg.textContent = err.message;
    }
});

$c('form-reset').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        await capi('POST', '/api/auth/reset-password', {
            email: resetEmail,
            code: $c('rs-code').value.trim(),
            new_password: $c('rs-pass').value,
        });
        ctoast('Contraseña actualizada. Entra con tu nueva clave.');
        volverLogin();
    } catch (err) { ctoast(err.message, false); }
});

/* ============================================================
   MI ESPACIO
============================================================ */
async function cargarMiEspacio() {
    const bloque = $c('mi-espacio-bloque');
    pintarNavCuenta();

    if (!cuenta.token) {
        bloque.innerHTML = `
            <div class="form-card" style="text-align:center; padding:40px 20px;">
                <p style="color:#cfc6d3;">Inicia sesión para ver tu espacio de cliente.</p>
                <button class="btn" onclick="abrirCuenta()">Iniciar Sesión</button>
            </div>`;
        return;
    }

    try {
        const me = await capi('GET', '/api/auth/me');
        bloque.innerHTML = `
            <div class="mi-espacio-grid">

                <div class="form-card">
                    <h3 class="mi-titulo">Mi Perfil</h3>
                    <form id="cpe-form" class="form-grid">
                        <div class="campo"><label>Nombre</label><input id="cpe-nombre" value="${cesc(me.name || '')}"></div>
                        <div class="campo"><label>Teléfono</label><input id="cpe-phone" value="${cesc(me.phone || '')}"></div>
                        <div class="campo full"><label>Email</label><input type="email" id="cpe-email" value="${cesc(me.email)}"></div>
                        <div class="campo full"><label>Nueva contraseña (opcional)</label><input type="password" id="cpe-pass" placeholder="Mínimo 6 caracteres"></div>
                        <div class="campo full"><button type="submit" class="btn btn-block">Guardar perfil</button></div>
                    </form>
                </div>

                <div class="form-card">
                    <h3 class="mi-titulo">Mis Citas</h3>
                    <div id="cpe-citas" style="color:#9c8fa1">Cargando...</div>
                </div>

                <div class="form-card">
                    <h3 class="mi-titulo">Disponibilidad</h3>
                    <div class="cpe-disp-row">
                        <span class="cpe-disp-icon">📅</span>
                        <input type="date" id="cpe-disp-fecha">
                        <button class="btn btn-consulta" onclick="consultarDisp()">Consultar</button>
                    </div>
                    <div class="cpe-disp-chips">
                        <button class="btn-s" onclick="setDispFecha(0)">Hoy</button>
                        <button class="btn-s azul" onclick="setDispFecha(1)">+1 día</button>
                        <button class="btn-s azul" onclick="setDispFecha(7)">+7 días</button>
                    </div>
                    <div id="cpe-disp" style="margin-top:14px;"></div>
                </div>

                <div class="form-card">
                    <h3 class="mi-titulo">Mis Notificaciones</h3>
                    <div id="cpe-notifs" style="color:#9c8fa1">Cargando...</div>
                </div>

                <div class="form-card">
                    <h3 class="mi-titulo">Referencias con IA</h3>
                    <div class="campo full">
                        <label>Descripción de tu idea</label>
                        <textarea id="cpe-ref-desc" placeholder="Ej: una serpiente enroscada con rosas en el antebrazo"></textarea>
                    </div>
                    <div class="campo full" style="margin-top:6px;">
                        <button class="btn btn-block verde" onclick="ideasSinImagen()">💡 Propuestas solo con tu idea (sin subir imagen)</button>
                    </div>
                    <div id="cpe-ideas-out" style="margin-top:12px;"></div>
                    <div class="cpe-dropzone" id="cpe-drop" role="button" tabindex="0" title="Adjuntar imagen">
                        <input type="file" id="cpe-ref-file" accept="image/*" hidden>
                        <div class="cpe-drop-icon">🖼️</div>
                        <div class="cpe-drop-text">Arrastra tu imagen aquí<br><small>o haz clic para elegirla de tu equipo</small></div>
                        <div class="cpe-drop-file" id="cpe-ref-fname" hidden></div>
                    </div>
                    <img id="cpe-ref-prev" class="cpe-ref-prev" alt="vista previa" hidden>
                    <div class="campo full" style="margin-top:10px;">
                        <button class="btn btn-block" id="cpe-enviar-ref" onclick="subirReferencia()">⬆️ Subir imagen</button>
                    </div>
                    <div id="cpe-refs" style="margin-top:16px;" class="cpe-refs"></div>
                </div>

            </div>`;

        $c('cpe-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
                await capi('PUT', '/api/auth/profile', {
                    name: $c('cpe-nombre').value.trim() || null,
                    phone: $c('cpe-phone').value.trim() || null,
                    email: $c('cpe-email').value.trim() || null,
                    password: $c('cpe-pass').value || null,
                });
                ctoast('Perfil actualizado');
                cargarMiEspacio();
            } catch (err) { ctoast(err.message, false); }
        });

        const drop = $c('cpe-drop');
        const fileIn = $c('cpe-ref-file');
        drop.addEventListener('click', () => fileIn.click());
        drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileIn.click(); } });
        ['dragover', 'dragenter'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('drag'); }));
        ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('drag'); }));
        drop.addEventListener('drop', (e) => {
            const f = e.dataTransfer.files[0];
            if (f && f.type.startsWith('image/')) {
                fileIn.files = e.dataTransfer.files;
                fileIn.dispatchEvent(new Event('change'));
            } else if (f) { ctoast('Solo se permiten imágenes', false); }
        });
        fileIn.addEventListener('change', () => {
            const f = fileIn.files[0];
            $c('cpe-ref-fname').textContent = f ? f.name : '';
            $c('cpe-ref-fname').hidden = !f;
            $c('cpe-enviar-ref').textContent = f ? '⬆️ Subir "' + f.name + '"' : '⬆️ Subir imagen';
            drop.classList.toggle('has-file', !!f);
            if (f) {
                const rd = new FileReader();
                rd.onload = (ev) => { const pv = $c('cpe-ref-prev'); pv.src = ev.target.result; pv.hidden = false; };
                rd.readAsDataURL(f);
            } else { $c('cpe-ref-prev').hidden = true; }
        });

        const citas = await capi('GET', '/api/appointments/client');
        $c('cpe-citas').innerHTML = citas.length ? citas.map((c) => `
            <div style="padding:10px 12px; border:1px solid rgba(141,22,175,0.2); border-radius:10px; margin-bottom:8px; background:rgba(10,3,14,0.5);">
                <div style="display:flex; justify-content:space-between; gap:8px;">
                    <b style="color:#c96be3">${cfmtFecha(c.appointment_date)}</b>
                    ${cbadge(c.status)}
                </div>
                <div style="color:#cfc6d3; font-size:13px; margin-top:4px;">
                    ${cesc(c.service_name || 'Servicio a definir')} · ${cesc(c.artist_name || 'Cualquier artista')}
                </div>
            </div>`).join('') : '<div style="color:#9c8fa1">Aún no tienes citas.</div>';

        cargarNotifs('cpe-notifs');
        consultarDisp(true);
        cargarReferenciasCliente();
    } catch (err) {
        if (err.message.includes('401') || err.message.toLowerCase().includes('token')) {
            salirCuenta();
        }
        bloque.innerHTML = `<div class="form-card"><div style="color:#d64545">${cesc(err.message)}</div></div>`;
    }
}

async function cargarNotifs(id) {
    try {
        const lista = await capi('GET', '/api/notifications');
        const el = $c(id);
        el.innerHTML = (lista && lista.length) ? lista.slice(0, 5).map((n) => `
            <div style="padding:10px 12px; border:1px solid rgba(141,22,175,0.2); border-radius:10px; margin-bottom:8px; background:${n.is_read ? 'rgba(10,3,14,0.4)' : 'rgba(109,3,135,0.16)'}; opacity:${n.is_read ? '.6' : '1'}; cursor:pointer"
                 onclick="marcarNotif('${n.id}', this)">
                <b style="color:#c96be3; display:block; font-size:11px;">${cesc(n.title)}</b>
                <div style="color:#cfc6d3; font-size:12px;">${cesc(n.message || '')}</div>
            </div>`).join('') : '<div style="color:#9c8fa1">Sin notificaciones.</div>';
    } catch (err) { $c(id).innerHTML = `<div style="color:#9c8fa1">—</div>`; }
}

window.marcarNotif = async (id, el) => {
    try { await capi('PATCH', `/api/notifications/${id}/read`); el.style.opacity = '.55'; } catch (_) { }
};

function fisoLocal(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

window.setDispFecha = (offsetDias) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDias);
    $c('cpe-disp-fecha').value = fisoLocal(d);
    consultarDisp();
};

window.consultarDisp = async (silencioso) => {
    const fecha = $c('cpe-disp-fecha').value || fisoLocal(new Date());
    if (!silencioso && !$c('cpe-disp-fecha').value) $c('cpe-disp-fecha').value = fecha;
    try {
        const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        const lista = await capi('GET', '/api/availability?date=' + fecha);
        const el = $c('cpe-disp');
        el.innerHTML = `<div class="ref-seccion-title">📅 ${dias[new Date(fecha + 'T12:00:00').getDay()]} · ${fecha.slice(8, 10)}/${fecha.slice(5, 7)}/${fecha.slice(0, 4)}</div>` +
            (lista.length ? lista.map((s, i) => `
                <div class="disp-tarjeta ${s.available ? 'libre' : 'ocupada'}">
                    <div class="disp-t-grupo">
                        <div class="disp-t-art">${cesc(s.artist_name)}</div>
                        <div class="disp-t-hora">🕒 ${s.start_time.slice(0, 5)} – ${s.end_time.slice(0, 5)}</div>
                    </div>
                    ${s.available
                        ? `<button class="btn-s verde" data-slot="${i}">Reservar</button>`
                        : '<span class="badge cancelled">Ocupado</span>'}
                </div>`).join('') : '<div class="disp-vacio">Sin horarios ese día. Sábados y domingos el estudio está cerrado.</div>');
        const slots = lista.map((s) => ({ iso: fecha, start: s.start_time.slice(0, 5), artistId: s.artist_id, artista: s.artist_name }));
        el.querySelectorAll('[data-slot]').forEach((b) => {
            b.addEventListener('click', () => reservarSlot(slots[Number(b.dataset.slot)]));
        });
    } catch (err) { $c('cpe-disp').innerHTML = `<div style="color:#d64545">${cesc(err.message)}</div>`; }
};

window.ideasSinImagen = async () => {
    const idea = $c('cpe-ref-desc').value.trim();
    const out = $c('cpe-ideas-out');
    if (!idea) { ctoast('Escribe tu idea primero', false); $c('cpe-ref-desc').focus(); return; }
    out.innerHTML = '<div style="color:#e08cff">Generando propuestas con la IA (sin imagen), puede tardar ~1 min...</div>';
    try {
        const d = await capi('POST', '/api/ai/ideas', { idea });
        out.innerHTML = '';
        renderPropuestas(out, d.content);
        if (d.imageUrl) {
            out.insertAdjacentHTML('beforeend',
                `<div class="ref-seccion-title">🎨 Diseño de la propuesta</div>
                 <figure class="prop-diseno gran" style="margin:0;">
                    <img src="${cesc(d.imageUrl)}" alt="Diseño de la propuesta" onclick="window.open('${cesc(d.imageUrl)}','_blank')" style="width:100%; max-width:340px; height:auto; cursor:pointer; border-radius:12px; border:1px solid rgba(201,107,227,0.4);">
                    <figcaption>Ver diseño completo</figcaption>
                 </figure>`);
        }
        ctoast('Propuestas generadas');
    } catch (err) {
        out.innerHTML = `<div style="color:#d64545">${cesc(err.message)}</div>`;
        ctoast(err.message, false);
    }
};

window.subirReferencia = async () => {
    const file = $c('cpe-ref-file').files[0];
    if (!file) { ctoast('Selecciona una imagen', false); return; }
    const fd = new FormData();
    fd.append('imagen', file);
    fd.append('description', $c('cpe-ref-desc').value.trim() || '');
    try {
        await capi('POST', '/api/references', fd, true);
        ctoast('Referencia subida');
        cargarReferenciasCliente();
        $c('cpe-ref-file').value = '';
        $c('cpe-ref-desc').value = '';
        $c('cpe-ref-prev').hidden = true;
        $c('cpe-ref-fname').hidden = true;
        $c('cpe-drop').classList.remove('has-file');
        $c('cpe-enviar-ref').textContent = '⬆️ Subir imagen';
    } catch (err) { ctoast(err.message, false); }
};

async function cargarReferenciasCliente() {
    const caja = $c('cpe-refs');
    try {
        const lista = await capi('GET', '/api/references');
        caja.innerHTML = lista.length ? lista.map((r) => `
            <div style="padding:12px; border:1px solid rgba(141,22,175,0.2); border-radius:10px; margin-bottom:12px; background:rgba(10,3,14,0.5);">
                <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:flex-start;">
                    <img src="${cesc(r.image_url)}" style="width:56px; height:56px; object-fit:cover; border-radius:8px; border:1px solid rgba(141,22,175,0.3);">
                    <div style="flex:1; min-width:200px;">
                        <div style="color:#9c8fa1; font-size:12px;">${cesc(r.description || 'Sin descripción')} · ${cfmtFecha(r.created_at)}</div>
                        <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:8px;">
                            <button class="btn-s ref-ia" data-id="${r.id}" data-tipo="analyze">🔍 Analizar (IA)</button>
                            <button class="btn-s azul ref-ia" data-id="${r.id}" data-tipo="proposals">💡 Propuestas (IA)</button>
                            <button class="btn-s verde ref-ia" data-id="${r.id}" data-tipo="design">🎨 Diseño (IA)</button>
                            <button class="btn-s rojo" onclick="borrarRef('${r.id}')">Eliminar</button>
                        </div>
                        <div id="cpe-ref-out-${r.id}" style="margin-top:8px;">${r.analysis ? `<div class="ia-analisis">${cesc(r.analysis)}</div>` : ''}</div>
                        <div id="cpe-ref-props-${r.id}" style="margin-top:8px; display:flex; gap:10px; flex-wrap:wrap;"></div>
                    </div>
                </div>
            </div>`).join('') : '<div style="color:#9c8fa1">Aún no has subido referencias. Sube una imagen y la IA la analizará para diseñar tu tatuaje (RF05/RF06).</div>';

        caja.querySelectorAll('.ref-ia').forEach((b) => {
            b.addEventListener('click', () => refIaAction(b.dataset.id, b.dataset.tipo));
        });
        lista.forEach((r) => cargarPropsCliente(r.id));
    } catch (err) {
        caja.innerHTML = `<div style="color:#d64545">${cesc(err.message)}</div>`;
    }
}

function pedirRequisitos() {
    return new Promise((resolve) => {
        let ov = $c('cpe-req-overlay');
        if (!ov) {
            ov = document.createElement('div');
            ov.id = 'cpe-req-overlay';
            ov.className = 'cpe-req-overlay';
            ov.innerHTML = `
                <div class="cpe-req-box" role="dialog" aria-modal="true">
                    <div class="cpe-req-titulo">🎨 Propuestas de diseño con IA</div>
                    <p class="cpe-req-note">Cuéntale a la IA qué quieres: se generarán varias propuestas escritas <b>y un diseño de imagen</b> de tu tatuaje.</p>
                    <label class="cpe-req-label" for="cpe-req-inp">Requisitos adicionales (opcional)</label>
                    <textarea id="cpe-req-inp" rows="3" placeholder="Ej: estilo minimalista, colores negro y gris, tamaño pequeño..."></textarea>
                    <div class="cpe-req-btns">
                        <button class="btn" id="cpe-req-cancel">Cancelar</button>
                        <button class="btn" id="cpe-req-ok">Generar</button>
                    </div>
                </div>`;
            document.body.appendChild(ov);
        }
        ov.style.display = 'flex';
        const inp = $c('cpe-req-inp');
        inp.value = '';
        const cerrar = (val) => { ov.style.display = 'none'; resolve(val); };
        const ok = () => cerrar(inp.value.trim());
        const cancel = () => cerrar(null);
        ov.onclick = (e) => { if (e.target === ov) cancel(); };
        $c('cpe-req-ok').onclick = ok;
        $c('cpe-req-cancel').onclick = cancel;
        setTimeout(() => inp.focus(), 50);
    });
}

async function refIaAction(id, tipo) {
    const out = $c('cpe-ref-out-' + id);
    out.innerHTML = '<div style="color:#e08cff">Procesando con IA, esto puede tardar unos segundos...</div>';
    try {
        if (tipo === 'design') {
            out.innerHTML = '<div style="color:#e08cff">Generando diseño con IA, esto puede tardar 1-2 minutos...</div>';
            const d = await capi('POST', `/api/references/${id}/generate-image`, {});
            out.innerHTML = `<img src="${cesc(d.image_url)}" style="max-width:100%; border-radius:10px; border:1px solid rgba(141,22,175,0.4); margin-top:8px;">`;
            cargarPropsCliente(id);
            ctoast('Diseño generado');
            return;
        }
        const req = tipo === 'proposals' ? await pedirRequisitos() : undefined;
        if (tipo === 'proposals' && req === null) { out.innerHTML = ''; return; }
        const d = await capi('POST', `/api/references/${id}/${tipo}`, tipo === 'proposals' ? { requirements: req || null } : {});
        const texto = tipo === 'analyze' ? d.analysis : d.content;
        if (tipo === 'analyze') {
            out.innerHTML = `<div class="ia-analisis">${cesc(texto)}</div>`;
        } else {
            renderPropuestas(out, texto);
            if (d && d.image_url) {
                out.insertAdjacentHTML('beforeend',
                    `<div class="ref-seccion-title">🎨 Diseño de la propuesta</div>
                     <figure class="prop-diseno gran" style="margin:0;">
                        <img src="${cesc(d.image_url)}" alt="Diseño de la propuesta" onclick="window.open('${d.image_url}','_blank')" style="width:100%; max-width:340px; height:auto; cursor:pointer; border-radius:12px; border:1px solid rgba(201,107,227,0.4);">
                        <figcaption>Ver diseño completo</figcaption>
                     </figure>`);
            }
        }
        cargarPropsCliente(id);
        ctoast(tipo === 'analyze' ? 'Análisis generado' : 'Propuestas generadas');
    } catch (err) {
        out.innerHTML = `<div style="color:#d64545">${cesc(err.message)}</div>`;
    }
}

function renderPropuestas(el, texto) {
    const bloques = texto.split(/^\s*PROPUESTA\s*\d+/gim).map((s) => s.trim()).filter(Boolean);
    if (bloques.length < 1) { el.innerHTML = `<div class="ia-analisis">${cesc(texto)}</div>`; return; }
    el.innerHTML = `<div class="ref-seccion-title">💡 Propuestas de diseño</div><div class="prop-grid">${bloques.map((b) => propCard(b)).join('')}</div>`;
}

function propCard(block) {
    const L = block.split('\n').map((s) => s.trim()).filter(Boolean);
    const leer = (k) => {
        const f = L.find((l) => l.replace(/^[-•*]/i, '').trim().toLowerCase().startsWith(k.toLowerCase()));
        if (!f) return '';
        return f.replace(/^[-•*]/i, '').split(/:\s*(.+)/s).slice(1).join(':').trim();
    };
    const nombre = leer('Nombre') || 'Propuesta';
    const desc = leer('Descripción');
    const estilo = leer('Estilo');
    const cambios = leer('Cambios');
    const costo = leer('Costo');
    return `<div class="prop-card">
        <div class="prop-num">Propuesta</div>
        <div class="prop-nombre">${cesc(nombre)}</div>
        ${estilo ? `<div class="prop-chip chip-estilo">🎨 ${cesc(estilo)}</div>` : ''}
        ${costo ? `<div class="prop-chip chip-costo">💰 ${cesc(costo)}</div>` : ''}
        ${desc ? `<p class="prop-desc">${cesc(desc)}</p>` : ''}
        ${cambios ? `<div class="prop-cambios">✏️ ${cesc(cambios)}</div>` : ''}
    </div>`;
}

async function cargarPropsCliente(id) {
    try {
        const lista = await capi('GET', `/api/references/${id}/proposals`);
        const caja = $c('cpe-ref-props-' + id);
        if (caja) {
            const disenos = lista.filter((p) => p.image_url);
            caja.innerHTML =
                (disenos.length ? `<div class="ref-seccion-title">🎨 Diseños generados</div><div class="prop-diseno-grid">${disenos.map((p) =>
                    `<figure class="prop-diseno"><img src="${cesc(p.image_url)}" alt="Diseño IA" onclick="window.open('${p.image_url}','_blank')"><figcaption>Ver diseño</figcaption></figure>`).join('')}</div>` : '') +
                `<div id="cpe-ref-disp-${id}" class="disp-mini"></div>`;
            cargarDisponibilidadMini(id);
        }
    } catch (_) { }
}

async function cargarDisponibilidadMini(id) {
    const caja = $c('cpe-ref-disp-' + id);
    if (!caja) return;
    try {
        const slots = [];
        for (let i = 1; i <= 14 && slots.length < 4; i++) {
            const d = new Date(Date.now() + i * 86400000);
            const iso = d.toISOString().slice(0, 10);
            const arr = await capi('GET', '/api/availability?date=' + iso);
            for (const s of arr) {
                if (s.available) {
                    slots.push({ iso, label: d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'short' }), artist: s.artist_name, start: s.start_time.slice(0, 5), end: s.end_time.slice(0, 5), artistId: s.artist_id });
                    if (slots.length >= 4) break;
                }
            }
        }
        if (!slots.length) {
            caja.innerHTML = '<div class="disp-vacio">📅 No hay fechas disponibles esta quincena.</div>';
            return;
        }
        caja.innerHTML = `<div class="ref-seccion-title">📅 Fechas disponibles para agendar</div>` +
            slots.map((s) => `
            <div class="disp-slot">
                <div>
                    <div class="disp-fecha">${cesc(s.label)}</div>
                    <div class="disp-artista">${cesc(s.artist)} · ${s.start}–${s.end}</div>
                </div>
                <button class="btn-s verde">Reservar</button>
            </div>`).join('');
        caja.querySelectorAll('.disp-slot').forEach((el, i) => {
            el.querySelector('button').addEventListener('click', () => reservarSlot(slots[i]));
        });
    } catch (_) { caja.innerHTML = ''; }
}

function reservarSlot(slot) {
    const f = document.getElementById('cita-fecha');
    const a = document.getElementById('cita-artista');
    if (a && slot.artistId && Array.from(a.options).some((o) => o.value === slot.artistId)) {
        a.value = slot.artistId;
    }
    if (f) {
        f.value = slot.iso + 'T' + slot.start;
        const destino = (a && slot.artistId) ? a : f;
        destino.scrollIntoView({ behavior: 'smooth', block: 'center' });
        f.style.outline = '2px solid #e08cff';
        f.style.outlineOffset = '2px';
        setTimeout(() => { f.style.outline = ''; f.style.outlineOffset = ''; }, 2500);
        ctoast('Fecha' + (slot.artistId ? ' y artista' : '') + ' prellenados en tu solicitud de cita');
    } else {
        ctoast('No se encontró el formulario de cita', false);
    }
}

function pedirConfirmar(mensaje, botonOk = 'Eliminar') {
    return new Promise((resolve) => {
        let ov = $c('cpe-confirm-overlay');
        if (!ov) {
            ov = document.createElement('div');
            ov.id = 'cpe-confirm-overlay';
            ov.className = 'cpe-req-overlay';
            ov.innerHTML = `
                <div class="cpe-req-box" role="dialog" aria-modal="true">
                    <div class="cpe-req-titulo">⚠️ Confirmar</div>
                    <p class="cpe-req-note" id="cpe-confirm-msg"></p>
                    <div class="cpe-req-btns">
                        <button class="btn" id="cpe-confirm-cancel">Cancelar</button>
                        <button class="btn rojo-solid" id="cpe-confirm-ok">${botonOk}</button>
                    </div>
                </div>`;
            document.body.appendChild(ov);
        } else {
            $c('cpe-confirm-ok').textContent = botonOk;
        }
        $c('cpe-confirm-msg').textContent = mensaje;
        ov.style.display = 'flex';
        const cerrar = (val) => { ov.style.display = 'none'; resolve(val); };
        ov.onclick = (e) => { if (e.target === ov) cerrar(false); };
        $c('cpe-confirm-ok').onclick = () => cerrar(true);
        $c('cpe-confirm-cancel').onclick = () => cerrar(false);
    });
}

window.borrarRef = async (id) => {
    const ok = await pedirConfirmar('¿Eliminar esta referencia? Esta acción no se puede deshacer.');
    if (!ok) return;
    try { await capi('DELETE', `/api/references/${id}`); ctoast('Referencia eliminada'); cargarReferenciasCliente(); }
    catch (err) { ctoast(err.message, false); }
};

/* Prellenar formulario de cita si hay sesión */
window.addEventListener('load', async () => {
    if (cuenta.token) {
        try {
            const me = await capi('GET', '/api/auth/me');
            if (me) {
                $c('cita-nombre').value = me.name || '';
                $c('cita-email').value = me.email || '';
                $c('cita-telefono').value = me.phone || '';
            }
        } catch (_) { }
    }
});

document.addEventListener('DOMContentLoaded', () => {
    pintarNavCuenta();
    cargarMiEspacio();
});