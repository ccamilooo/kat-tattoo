// Script que crea la base de datos, aplica el schema y carga los datos semilla.
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const DB_NAME = process.env.PGDATABASE || 'kat_tattoo';

async function main() {
    // 1. Conectar al servidor (db postgres) para crear la base de datos
    const admin = new Pool({
        host: process.env.PGHOST || '127.0.0.1',
        port: Number(process.env.PGPORT || 5432),
        database: 'postgres',
        user: process.env.PGUSER || 'postgres',
        password: process.env.PGPASSWORD || 'Admin123',
    });

    const { rows } = await admin.query(
        `SELECT 1 FROM pg_database WHERE datname = $1`,
        [DB_NAME]
    );

    if (!rows.length) {
        // El nombre de la base de datos necesita comillas al crearla con mayúsculas/caracteres especiales
        await admin.query(`CREATE DATABASE "${DB_NAME}"`);
        console.log(`Base de datos "${DB_NAME}" creada.`);
    } else {
        console.log(`La base de datos "${DB_NAME}" ya existe.`);
    }
    await admin.end();

    // 2. Conectar a la base de datos creada y aplicar schema + seed
    const db = new Pool({
        host: process.env.PGHOST || '127.0.0.1',
        port: Number(process.env.PGPORT || 5432),
        database: DB_NAME,
        user: process.env.PGUSER || 'postgres',
        password: process.env.PGPASSWORD || 'Admin123',
    });

    // Limpiar schema público para que el setup sea reproducible
    await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');

    const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
    await db.query(schema);
    console.log('Schema aplicado correctamente.');

    const seed = fs.readFileSync(path.join(__dirname, '..', 'db', 'seed.sql'), 'utf8');
    await db.query(seed);
    console.log('Datos semilla cargados.');

    // 2.5 Crear usuarios del sistema (admin + artistas) con contraseñas hasheadas
    const { hashPassword } = require('../src/auth/helpers');

    async function crearUser(email, role, artist_id, client_id, password) {
        const hash = await hashPassword(password);
        await db.query(
            `INSERT INTO users (email, password_hash, role, artist_id, client_id)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (email) DO NOTHING`,
            [email, hash, role, artist_id || null, client_id || null]
        );
        console.log(`  Usuario ${role}: ${email}`);
    }

    const adminEmail = process.env.ADMIN_EMAIL || 'admin@kattattoo.com';
    const adminPass = process.env.ADMIN_PASSWORD || 'Admin123';
    await crearUser(adminEmail, 'admin', null, null, adminPass);

    const artists = await db.query(`SELECT id, name FROM artists ORDER BY id`);
    for (const a of artists.rows) {
        const base = a.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '.');
        const userEmail = (base.replace(/^\.|\.$/g, '') + '@kattattoo.com');
        await crearUser(userEmail, 'artist', a.id, null, 'Artista123');
    }

    // 2.6 Horarios por defecto de los artistas (Lun-Sáb 11:00-20:00)
    await db.query(
        `INSERT INTO artist_schedules (artist_id, day_of_week, start_time, end_time)
         SELECT a.id, d.day, '11:00', '20:00'
         FROM artists a
         CROSS JOIN (SELECT generate_series(1, 6) AS day) d
         ON CONFLICT DO NOTHING`
    );
    console.log('Horarios por defecto creados.');

    // 3. Reporte de tablas
    const tables = await db.query(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public' ORDER BY table_name`
    );
    console.log('Tablas creadas:');
    for (const t of tables.rows) {
        const c = await db.query(`SELECT COUNT(*)::int AS n FROM "${t.table_name}"`);
        console.log(`  - ${t.table_name} (${c.rows[0].n} registros)`);
    }

    await db.end();
    console.log('\nSetup de base de datos completado.');
}

main().catch((err) => {
    console.error('Error durante el setup:', err.message);
    process.exit(1);
});