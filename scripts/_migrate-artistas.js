// Migración in-place: reemplaza los artistas ficticios por el equipo real de KAT Tattoo.
// Conserva IDs ART-000x para no romper citas/horarios/usuarios/galería existentes.
require('dotenv').config();
const { Pool } = require('pg');
const { hashPassword } = require('../src/auth/helpers');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const IMG = '/Imagenes/Artistas';

const equipo = {
    'ART-0001': {
        name: 'Nataly Arguello',
        specialty: 'Artista Plástica & Tatuadora',
        image_url: `${IMG}/nataly.jpg`,
        instagram: null,
        bio: 'Tatuadora con 10 años de trayectoria y artista plástica con 5 años de experiencia, es cofundadora y propietaria de Kat Tattoo junto a Pedro García. Especializada en Neotradicional, Fine Line, Full Color y Blackwork, su propuesta integra la sensibilidad de las artes plásticas para crear diseños 100% originales creados desde cero. Su enfoque se caracteriza por una sólida lectura del cuerpo, logrando piezas únicas de alta expresividad y trazo preciso que fluyen orgánicamente con la anatomía y el movimiento de cada persona.',
        email: 'nataly.arguello@kattattoo.com',
    },
    'ART-0002': {
        name: 'Pedro García',
        specialty: 'Artista Plástico & Tatuador',
        image_url: `${IMG}/pedro.jpg`,
        instagram: null,
        bio: 'Artista plástico con más de 12 años de trayectoria en la pintura en gran formato (óleo y acrílico) y 6 años de experiencia como tatuador profesional. Cofundador y propietario del estudio Kat Tattoo junto a Nataly Arguello. Especializado en Surrealismo en las modalidades de Full Color y Black & Grey. Su propuesta se distingue por la creación de diseños de autor 100% personalizados desde cero, caracterizados por el dinamismo, la profundidad visual y una integración precisa con la anatomía y el movimiento natural del cuerpo.',
        email: 'pedro.garcia@kattattoo.com',
    },
    'ART-0003': {
        name: 'Elsy Arias',
        specialty: 'Body Piercer Profesional',
        image_url: `${IMG}/elsy.jpg`,
        instagram: null,
        bio: 'Perforadora corporal profesional con 8 años de experiencia y formación constante en seminarios especializados. Su trabajo combina una estricta aplicación de normas de bioseguridad y asepsia con una dedicada asesoría anatómica personalizada, guiando a cada persona hacia las perforaciones que mejor se adaptan a su cuerpo para garantizar procesos seguros, excelente cicatrización y total armonía estética.',
        email: 'elsy.arias@kattattoo.com',
    },
};

const sharlot = {
    name: 'Sharlot Ramírez',
    specialty: 'Studio Manager & Atención al Cliente',
    image_url: `${IMG}/sharlot.jpg`,
    instagram: null,
    bio: 'Encargada de la coordinación de citas, la logística y la atención al cliente en Kat Tattoo. Su trabajo garantiza una agenda organizada, una atención cálida y personalizada desde el primer contacto, y un espacio siempre impecable para que la experiencia de cada cliente sea perfecta de principio a fin.',
    email: 'sharlot.ramirez@kattattoo.com',
};

const PASSWORD_ARTISTA = 'Artista123';

async function userForArtist(artistId, email) {
    const { rows } = await pool.query('SELECT id FROM users WHERE artist_id = $1', [artistId]);
    if (rows.length) {
        await pool.query('UPDATE users SET email = $2 WHERE id = $1', [rows[0].id, email]);
        return `actualizado -> ${email}`;
    }
    const hash = await hashPassword(PASSWORD_ARTISTA);
    await pool.query(
        `INSERT INTO users (email, password_hash, role, artist_id) VALUES ($1, $2, 'artist', $3)`,
        [email, hash, artistId]
    );
    return `creado -> ${email}`;
}

(async () => {
    await pool.query('BEGIN');

    // 1. Artistas existentes (se conservan los IDs)
    for (const [id, a] of Object.entries(equipo)) {
        await pool.query(
            `UPDATE artists SET name=$2, specialty=$3, bio=$4, image_url=$5, instagram=$6, is_active=TRUE WHERE id=$1`,
            [id, a.name, a.specialty, a.bio, a.image_url, a.instagram]
        );
        console.log(`Artista ${id} -> ${a.name}`);
    }

    // 2. Nuevo artista: Sharlot (el trigger genera su id)
    let sharlotId;
    const existe = await pool.query('SELECT id FROM artists WHERE name = $1', [sharlot.name]);
    if (existe.rows.length) {
        sharlotId = existe.rows[0].id;
        await pool.query(
            `UPDATE artists SET specialty=$2, bio=$3, image_url=$4, is_active=TRUE WHERE id=$1`,
            [sharlotId, sharlot.specialty, sharlot.bio, sharlot.image_url]
        );
    } else {
        const ins = await pool.query(
            `INSERT INTO artists (name, specialty, bio, image_url, instagram) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
            [sharlot.name, sharlot.specialty, sharlot.bio, sharlot.image_url, sharlot.instagram]
        );
        sharlotId = ins.rows[0].id;
    }
    console.log(`Artista ${sharlotId} -> ${sharlot.name}`);

    // 3. Horarios (Lun-Sáb 11:00-20:00) para todos los artistas
    await pool.query(
        `INSERT INTO artist_schedules (artist_id, day_of_week, start_time, end_time)
         SELECT a.id, d.day, '11:00', '20:00'
         FROM artists a
         CROSS JOIN (SELECT generate_series(1, 6) AS day) d
         ON CONFLICT DO NOTHING`
    );
    console.log('Horarios verificados.');

    // 4. Usuarios de login de cada artista
    for (const [id, a] of Object.entries(equipo)) {
        console.log(`  ${id}: ${await userForArtist(id, a.email)}`);
    }
    console.log(`  ${sharlotId}: ${await userForArtist(sharlotId, sharlot.email)}`);

    // 5. Galería: restaurar las piezas que falten del set de referencia
    const piezas = [
        ['Geisha', 'Blackwork', 'Blackwork tradicional japonés.', '/Imagenes/tattoo1.jpg', 300.00, 'ART-0001', true],
        ['Estilo Anime', 'Anime', 'Diseño en parejas inspirado en anime.', '/Imagenes/tattoo2.jpg', 250.00, 'ART-0001', false],
    ];
    for (const [title, cat, desc, img, price, artist, feat] of piezas) {
        const ex = await pool.query('SELECT id FROM gallery WHERE title = $1 AND image_url = $2', [title, img]);
        if (!ex.rows.length) {
            await pool.query(
                `INSERT INTO gallery (title, category, description, image_url, price_from, artist_id, is_featured)
                 VALUES ($1,$2,$3,$4,$5,$6,$7)`,
                [title, cat, desc, img, price, artist, feat]
            );
            console.log(`Galería: añadido "${title}"`);
        }
    }

    // 6. Reasignar cada tatuaje al tatuador correspondiente (Nataly o Pedro)
    const asignaciones = {
        'Geisha': 'ART-0001',
        'Estilo Anime': 'ART-0001',
        'Pez Koi': 'ART-0001',
        'Diseño delicado': 'ART-0001',
        'Flor minimalista': 'ART-0001',
        'Lagarto realista': 'ART-0002',
        'Calavera': 'ART-0002',
        'Diseño en parejas': 'ART-0002',
        'Mujer': 'ART-0002',
    };
    for (const [title, artist] of Object.entries(asignaciones)) {
        await pool.query('UPDATE gallery SET artist_id = $2 WHERE title = $1', [title, artist]);
    }
    console.log('Galería reasignada a los tatuadores.');

    await pool.query('COMMIT');

    // Reporte final
    const a = await pool.query('SELECT id, name, specialty, image_url FROM artists ORDER BY id');
    console.log('\n=== ARTISTAS ===');
    a.rows.forEach((r) => console.log(JSON.stringify(r)));
    const u = await pool.query(`SELECT id, email, role, artist_id FROM users WHERE role='artist' ORDER BY id`);
    console.log('=== USUARIOS ARTISTAS ===');
    u.rows.forEach((r) => console.log(JSON.stringify(r)));
    const g = await pool.query('SELECT title, category, image_url, artist_id FROM gallery ORDER BY id');
    console.log('=== GALERÍA ===');
    g.rows.forEach((r) => console.log(JSON.stringify(r)));

    await pool.end();
    console.log('\nMigración completada.');
})().catch(async (e) => {
    console.error('ERROR:', e.message);
    try { await pool.query('ROLLBACK'); } catch { /* noop */ }
    process.exit(1);
});
