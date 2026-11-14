/* Prueba integral del flujo de cliente (RF01-RF06, RF08) */
const BASE = 'http://localhost:3000';
const email = `cliente_test_${Date.now()}@correo.com`;

async function j(method, url, body, token, isForm) {
    const headers = {};
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (body && !isForm) headers['Content-Type'] = 'application/json';
    const res = await fetch(BASE + url, { method, headers, body: body ? (isForm ? body : JSON.stringify(body)) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${url} -> ${res.status}: ${data.error || 'error'}`);
    return data;
}

(async () => {
    try {
        // Registro
        const reg = await j('POST', '/api/auth/register', { name: 'Cliente Prueba', email, phone: '+52 1 55 0000 0000', password: 'Prueba123' });
        console.log('OK registro, token len', reg.token.length);
        const tok = reg.token;

        // /me
        const me = await j('GET', '/api/auth/me', null, tok);
        console.log('OK /me:', me.name, me.role, 'client_id=', me.client_id);

        // Login de nuevo
        const log = await j('POST', '/api/auth/login', { email, password: 'Prueba123' });
        console.log('OK login');

        // Subir referencia (multipart)
        const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
        const fd = new FormData();
        fd.append('imagen', new Blob([png], { type: 'image/png' }), 'ref.png');
        fd.append('description', 'Serpiente con rosas, tinta negra y roja');
        const ref = await j('POST', '/api/references', fd, tok, true);
        console.log('OK referencia subida, id', ref.id, ref.image_url);

        // Mis referencias
        const misRefs = await j('GET', '/api/references', null, tok);
        console.log('OK mis referencias:', misRefs.length);

        // Análisis IA (usar timeout largo; Ollama local)
        const t0 = Date.now();
        const anal = await Promise.race([
            j('POST', `/api/references/${ref.id}/analyze`, {}, tok),
            new Promise((_, rej) => setTimeout(() => rej(new Error('timeout 90s')), 90000)),
        ]);
        console.log(`OK análisis IA (${Math.round((Date.now() - t0) / 1000)}s):`, anal.analysis.slice(0, 90).replace(/\n/g, ' '));

        // Propuestas IA
        const t1 = Date.now();
        const prop = await Promise.race([
            j('POST', `/api/references/${ref.id}/proposals`, { requirements: 'estilo geométrico' }, tok),
            new Promise((_, rej) => setTimeout(() => rej(new Error('timeout 90s')), 90000)),
        ]);
        console.log(`OK propuestas IA (${Math.round((Date.now() - t1) / 1000)}s):`, prop.content.slice(0, 90).replace(/\n/g, ' '));

        // Mis citas (vacío pero 200)
        const citas = await j('GET', '/api/appointments/client', null, tok);
        console.log('OK mis citas:', citas.length);

        // Disponibilidad
        const disp = await j('GET', '/api/availability?date=2026-09-16', null, tok);
        console.log('OK disponibilidad:', disp.length, 'franjas');

        // Notificaciones (registro genera notify?)
        const notifs = await j('GET', '/api/notifications', null, tok);
        console.log('OK notificaciones cliente:', notifs.length);

        console.log('\nFLUJO CLIENTE COMPLETO: EXITO');
    } catch (err) {
        console.error('\nFALLO:', err.message);
        process.exit(1);
    }
})();