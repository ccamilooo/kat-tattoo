/* Prueba de generación de imágenes IA (Flux) */
const BASE = 'http://localhost:3000';
const email = `img_test_${Date.now()}@correo.com`;

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
        const reg = await j('POST', '/api/auth/register', { name: 'Prueba Imagen', email, password: 'Prueba123' });
        console.log('registro ok, token len', reg.token.length);

        const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
        const fd = new FormData();
        fd.append('imagen', new Blob([png], { type: 'image/png' }), 'ref.png');
        fd.append('description', 'Calavera con rosas en estilo blackwork, antebrazo');
        const ref = await j('POST', '/api/references', fd, reg.token, true);
        console.log('referencia subida, id', ref.id);

        const t0 = Date.now();
        console.log('generando imagen con Flux (Pollinations)...');
        const d = await Promise.race([
            j('POST', `/api/references/${ref.id}/generate-image`, {}, reg.token),
            new Promise((_, rej) => setTimeout(() => rej(new Error('timeout 200s')), 200000)),
        ]);
        console.log(`imagen generada en ${Math.round((Date.now() - t0) / 1000)}s ->`, d.image_url);

        const url = BASE + d.image_url;
        const img = await fetch(url);
        console.log('imagen servida:', img.status, img.headers.get('content-type'), img.headers.get('content-length'), 'bytes');

        const props = await j('GET', `/api/references/${ref.id}/proposals`, null, reg.token);
        console.log('propuestas guardadas:', props.length, '| con imagen:', props.filter((p) => p.image_url).length);

        console.log('\nGENERACION DE IMAGEN: EXITO');
    } catch (err) {
        console.error('\nFALLO:', err.message);
        process.exit(1);
    }
})();