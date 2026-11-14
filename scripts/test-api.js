// Prueba integral de la API (require: servidor corriendo)
const BASE = 'http://localhost:3000';
const fs = require('fs');
const path = require('path');

async function api(method, url, body, token) {
    const headers = {};
    if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const res = await fetch(BASE + url, {
        method,
        headers,
        body: body && !(body instanceof FormData) ? JSON.stringify(body) : body,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${method} ${url} -> ${res.status}: ${JSON.stringify(data)}`);
    return data;
}

async function main() {
    console.log('\n=== 1. LOGIN ADMIN ===');
    const admin = await api('POST', '/api/auth/login', { email: 'admin@kattattoo.com', password: 'Admin123' });
    console.log('Rol:', admin.user.role);

    console.log('\n=== 2. DASHBOARD ADMIN ===');
    const dash = await api('GET', '/api/admin/dashboard', null, admin.token);
    console.log(JSON.stringify(dash));

    console.log('\n=== 3. ARTISTAS (admin) ===');
    const artistas = await api('GET', '/api/admin/artists', null, admin.token);
    console.log(artistas.map(a => `${a.id}: ${a.name} (${a.specialty}) user=${a.user_email || 'sin cuenta'}`));

    console.log('\n=== 4. HORARIOS ARTISTA 1 ===');
    const sched = await api('GET', '/api/admin/artists/1/schedules', null, admin.token);
    console.log('reglas:', sched.length);

    console.log('\n=== 5. CITAS (admin) ===');
    const citas = await api('GET', '/api/admin/appointments', null, admin.token);
    console.log('citas:', citas.length);

    console.log('\n=== 6. LOGIN ARTISTA ===');
    const artist = await api('POST', '/api/auth/login', { email: 'nataly.arguello@kattattoo.com', password: 'Artista123' });
    console.log('Rol:', artist.user.role, 'artist_id:', artist.user.artist_id);
    const misCitas = await api('GET', '/api/artist/appointments', null, artist.token);
    console.log('mis citas:', misCitas.length);

    console.log('\n=== 7. REGISTRO CLIENTE NUEVO ===');
    const email = `cliente${Date.now()}@test.com`;
    const reg = await api('POST', '/api/auth/register', { name: 'Cliente Test', email, password: 'Cliente123' });
    console.log('Rol:', reg.user.role, 'client_id:', reg.user.client_id);

    console.log('\n=== 8. DISPONIBILIDAD (mañana) ===');
    const manana = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const avail = await api('GET', `/api/availability?date=${manana}`, null, admin.token);
    console.log('slot disponibilidad:', avail.length, '->', avail[0] ? `${avail[0].artist_name} ${avail[0].start_time}-${avail[0].end_time}` : 'sin slots');

    console.log('\n=== 9. RECOMENDACIÓN IA (estilo blackwork) ===');
    try {
        const rec = await api('GET', `/api/recommendations?style=blackwork&date=${manana}`, null, admin.token);
        console.log(rec.map(r => `${r.name} (${r.specialty}) recomendado=${r.recomendado} disp=${r.disponible}`).join(' | '));
    } catch (e) { console.log('REC:', e.message); }

    console.log('\n=== 10. SUBIR REFERENCIA (cliente) ===');
    const tmp = path.join(require('os').tmpdir(), 'ref_test.png');
    fs.writeFileSync(tmp, Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
    );
    const form = new FormData();
    form.append('imagen', new Blob([fs.readFileSync(tmp)], { type: 'image/png' }), 'ref_test.png');
    form.append('description', 'Una serpiente y una rosa para mi antebrazo');
    const ref = await api('POST', '/api/references', form, reg.token);
    console.log('Referencia id:', ref.id, 'url:', ref.image_url);

    console.log('\n=== 11. ANALIZAR REFERENCIA CON IA ===');
    try {
        const analisis = await api('POST', `/api/references/${ref.id}/analyze`, {}, reg.token);
        console.log('Análisis (primeros 120):', analisis.analysis.slice(0, 120));
    } catch (e) { console.log('ANALISIS:', e.message); }

    console.log('\n=== 12. GENERAR PROPUESTAS CON IA ===');
    try {
        const prop = await api('POST', `/api/references/${ref.id}/proposals`, { requirements: 'negro y gris, estilo realista' }, reg.token);
        console.log('Propuesta (primeros 120):', prop.content.slice(0, 120));
    } catch (e) { console.log('PROPUESTA:', e.message); }

    console.log('\n=== EXITO TOTAL ===');
}

main().catch((e) => { console.error('\nFALLO:', e.message); process.exit(1); });