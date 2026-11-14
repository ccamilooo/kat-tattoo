/* ============================================================
   KAT TATTOO - Script principal (galería, servicios, citas, contacto)
============================================================ */

const $ = (id) => document.getElementById(id);

const esc = (str) => String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- TOAST ----------
let toastTimer;
function toast(msg, ok = true) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.remove('error');
    if (!ok) el.classList.add('error');
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 4000);
}

// ---------- NAV ----------
const links = document.querySelectorAll('nav ul a');
links.forEach((link) => {
    link.addEventListener('click', function () {
        links.forEach((item) => item.classList.remove('active'));
        this.classList.add('active');
    });
});

// Actualizar "active" según sección visible
window.addEventListener('scroll', () => {
    const secciones = ['inicio', 'galeria', 'servicios', 'nosotros', 'citas', 'contacto'];
    let actual = secciones[0];
    for (const id of secciones) {
        const sec = document.getElementById(id);
        if (sec && window.scrollY >= sec.offsetTop - 140) actual = id;
    }
    links.forEach((link) => {
        link.classList.toggle('active', link.getAttribute('href') === '#' + actual);
    });
});

// ---------- GALERÍA ----------
async function cargarGaleria(categoria) {
    const grid = $('galeria-grid');
    try {
        const url = categoria ? `/api/gallery?category=${encodeURIComponent(categoria)}` : '/api/gallery';
        const res = await fetch(url);
        if (!res.ok) throw new Error(await res.text());
        const items = await res.json();
        grid.innerHTML = '';

        if (!items.length) {
            grid.innerHTML = '<div class="galeria-item" style="grid-column:1/-1"><p style="color:#cfc6d3; text-align:center; padding:40px 20px;">Aún no hay tatuajes publicados.</p></div>';
            return;
        }

        items.forEach((item, i) => {
            const base = i % 3 === 0 ? 'tattoo-grande' : i % 3 === 1 ? '' : 'tattoo-alto';
            const div = document.createElement('div');
            div.className = `galeria-item ${base}`;

            const img = document.createElement('img');
            img.src = item.image_url || '/Imagenes/placeholder.png';
            img.alt = item.title;
            img.loading = 'lazy';

            const overlay = document.createElement('div');
            overlay.className = 'overlay';
            overlay.innerHTML = `<span>${item.category}</span><h3>${item.title}</h3>`;

            div.append(img, overlay);
            grid.appendChild(div);
        });
    } catch (err) {
        grid.innerHTML = '<div class="galeria-item" style="grid-column:1/-1"><p style="color:#d64545; text-align:center; padding:40px 20px;">Error al cargar la galería: ' + err.message + '</p></div>';
    }
}

// ---------- SERVICIOS ----------
async function cargarServicios() {
    const grid = $('servicios-grid');
    const selectServicios = $('cita-servicio');
    try {
        const res = await fetch('/api/services');
        if (!res.ok) throw new Error(await res.text());
        const servicios = await res.json();

        grid.innerHTML = '';
        selectServicios.innerHTML = '<option value="">Selecciona un servicio...</option>';

        if (!servicios.length) {
            grid.innerHTML = '<p style="color:#cfc6d3; grid-column:1/-1; text-align:center;">Aún no hay servicios publicados.</p>';
            return;
        }

        servicios.forEach((s, i) => {
            const num = String(i + 1).padStart(2, '0');
            const card = document.createElement('div');
            card.className = 'servicio-card';
            card.innerHTML = `
                <div class="servicio-imagen">
                    <img src="${esc(s.image_url || '/Imagenes/placeholder.png')}"
                         alt="${esc(s.name)}"
                         loading="lazy"
                         onerror="this.onerror=null; this.src='/Imagenes/placeholder.png';">
                </div>
                <div class="servicio-contenido">
                    <span class="servicio-numero">${num}</span>
                    <h3>${esc(s.name)}</h3>
                    <p>${esc(s.description || '')}</p>
                    <div class="servicio-precio">$${Number(s.base_price || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 })} <small>COP</small></div>
                </div>
            `;
            grid.appendChild(card);

            const opt = document.createElement('option');
            opt.value = s.id;
            opt.textContent = s.name;
            selectServicios.appendChild(opt);
        });
    } catch (err) {
        grid.innerHTML = '<p style="color:#d64545; grid-column:1/-1; text-align:center;">Error al cargar servicios: ' + err.message + '</p>';
    }
}

// ---------- ARTISTAS (grid nosotros + select) ----------
async function cargarArtistasGrid() {
    const grid = $('artistas-grid');
    if (!grid) return;
    try {
        const res = await fetch('/api/artists');
        if (!res.ok) throw new Error(await res.text());
        const artistas = await res.json();
        grid.innerHTML = '';
        if (!artistas.length) {
            grid.innerHTML = '<p style="color:#cfc6d3; grid-column:1/-1; text-align:center;">Pronto presentaremos a nuestro equipo.</p>';
            return;
        }
        artistas.forEach((a) => {
            const card = document.createElement('div');
            card.className = 'artista-card';
            card.innerHTML = `
                <div class="artista-imagen">
                    <img src="${esc(a.image_url || '/Imagenes/placeholder.png')}"
                         alt="${esc(a.name)}"
                         loading="lazy"
                         onerror="this.onerror=null; this.src='/Imagenes/placeholder.png';">
                </div>
                <div class="artista-info">
                    <span>${esc(a.specialty || 'ARTISTA')}</span>
                    <h3>${esc(a.name)}</h3>
                    <p>${esc(a.bio || '')}</p>
                </div>
            `;
            grid.appendChild(card);
        });
    } catch (err) {
        grid.innerHTML = '<p style="color:#d64545; grid-column:1/-1; text-align:center;">Error al cargar artistas.</p>';
    }
}

async function cargarArtistas() {
    const select = $('cita-artista');
    try {
        const res = await fetch('/api/artists');
        if (!res.ok) throw new Error(await res.text());
        const artistas = await res.json();
        artistas.forEach((a) => {
            const opt = document.createElement('option');
            opt.value = a.id;
            opt.textContent = a.name + (a.specialty ? ' — ' + a.specialty : '');
            select.appendChild(opt);
        });
    } catch (err) {
        console.error('Artistas:', err.message);
    }
}

// ---------- RESERVAR CITA ----------
$('form-cita').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('btn-cita');
    btn.disabled = true;

    const fecha = new Date($('cita-fecha').value);
    if (isNaN(fecha)) {
        toast('Selecciona una fecha y hora válidas.', false);
        btn.disabled = false;
        return;
    }
    if (fecha < new Date()) {
        toast('La fecha debe ser en el futuro.', false);
        btn.disabled = false;
        return;
    }

    const payload = {
        name: $('cita-nombre').value.trim(),
        email: $('cita-email').value.trim() || null,
        phone: $('cita-telefono').value.trim() || null,
        service_id: $('cita-servicio').value || null,
        artist_id: $('cita-artista').value || null,
        appointment_date: $('cita-fecha').value,
        notes: $('cita-notas').value.trim() || null,
    };

    try {
        const res = await fetch('/api/appointments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al reservar');
        toast('¡Cita solicitada con éxito! Te contactaremos para confirmar.');
        e.target.reset();
        const fechaVal = new Date();
        fechaVal.setDate(fechaVal.getDate() + 1);
    } catch (err) {
        toast(err.message, false);
    } finally {
        btn.disabled = false;
    }
});

// ---------- CONTACTO ----------
$('form-contacto').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('btn-contacto');
    btn.disabled = true;

    const payload = {
        name: $('con-nombre').value.trim(),
        email: $('con-email').value.trim(),
        phone: $('con-telefono').value.trim() || null,
        subject: $('con-asunto').value.trim() || null,
        message: $('con-mensaje').value.trim(),
    };

    try {
        const res = await fetch('/api/contact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al enviar');
        toast('¡Mensaje enviado! Te responderemos pronto.');
        e.target.reset();
    } catch (err) {
        toast(err.message, false);
    } finally {
        btn.disabled = false;
    }
});

// ---------- INIT ----------
document.addEventListener('DOMContentLoaded', () => {
    cargarGaleria();
    cargarServicios();
    cargarArtistas();
    cargarArtistasGrid();
});