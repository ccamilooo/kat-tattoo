require('dotenv').config();
const { Pool } = require('pg');
const p = new Pool({ connectionString: process.env.DATABASE_URL });
(async () => {
    await p.query(`ALTER TABLE services ADD COLUMN IF NOT EXISTS image_url VARCHAR(255), ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0`);

    const nuevos = [
        ['Blackwork', 'Diseños realizados principalmente con tinta negra, caracterizados por contrastes marcados, líneas definidas y composiciones de gran impacto visual.', 200, 180, '/Imagenes/servicios/black.png', 1],
        ['Color', 'Tatuajes llenos de color y personalidad, utilizando diferentes tonalidades para crear composiciones llamativas y llenas de vida.', 250, 240, '/Imagenes/servicios/color.png', 2],
        ['Minimalista', 'Diseños realizados con líneas finas y delicadas, ideales para composiciones minimalistas que requieren precisión y atención al detalle.', 150, 120, '/Imagenes/servicios/minimalista.png', 3],
        ['Piercing', 'Servicios de piercing enfocados en la expresión personal y estética, realizados con cuidado y atención durante cada procedimiento.', 80, 30, '/Imagenes/servicios/piercing.png', 4],
        ['Pinturas', 'Obras realizadas por los artistas de KAT Tattoo Studio, donde exploran diferentes técnicas y estilos para expresar su creatividad más allá del tatuaje.', 180, 90, '/Imagenes/servicios/pintura.png', 5],
    ];
    for (const [name, desc, price, dur, img, ord] of nuevos) {
        const ex = await p.query('SELECT id FROM services WHERE lower(name) = lower($1)', [name]);
        if (ex.rows.length) {
            await p.query(`UPDATE services SET description=$2, base_price=$3, duration_minutes=$4, image_url=$5, display_order=$6, is_active=TRUE WHERE id=$1`, [ex.rows[0].id, desc, price, dur, img, ord]);
        } else {
            await p.query(`INSERT INTO services (name, description, base_price, duration_minutes, image_url, display_order) VALUES ($1,$2,$3,$4,$5,$6)`, [name, desc, price, dur, img, ord]);
        }
    }
    await p.query(`UPDATE services SET is_active = FALSE WHERE lower(name) IN ('diseño personalizado','tatuaje pequeño','tatuaje mediano','tatuaje grande','reservación de cita')`);

    const fotos = {
        1: '/Imagenes/Artistas/Artista especializado en blackwork.png',
        2: '/Imagenes/Artistas/Artista especializado en fine line.png',
        3: '/Imagenes/Artistas/Especialista en piercing 2.png',
    };
    for (const [id, img] of Object.entries(fotos)) {
        await p.query(`UPDATE artists SET image_url = $2 WHERE id = $1`, [Number(id), img]);
    }

    const s = await p.query('SELECT id, name, base_price, image_url, display_order, is_active FROM services ORDER BY display_order, id');
    console.log(JSON.stringify(s.rows, null, 1));
    const a = await p.query('SELECT id, name, image_url FROM artists ORDER BY id');
    console.log('artistas:', JSON.stringify(a.rows));
    await p.end();
})().catch((e) => { console.error('ERR', e); process.exit(1); });