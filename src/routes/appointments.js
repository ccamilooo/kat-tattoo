const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authenticate } = require('../middleware/auth');

// POST /api/appointments - Reservar cita (público)
router.post('/', async (req, res, next) => {
    const client = await pool.connect();
    try {
        const { name, email, phone, service_id, artist_id, appointment_date, notes } = req.body;

        if (!name || !appointment_date) {
            return res.status(400).json({ error: 'El nombre y la fecha de la cita son obligatorios' });
        }

        await client.query('BEGIN');

        // Upsert clientes por email
        let clientRow;
        if (email) {
            const upsert = await client.query(
                `INSERT INTO clients (name, email, phone) VALUES ($1, $2, $3)
                 ON CONFLICT DO NOTHING
                 RETURNING id`,
                [name, email, phone || null]
            );
            if (upsert.rows.length) {
                clientRow = upsert.rows[0];
            } else {
                const existing = await client.query(
                    `SELECT id FROM clients WHERE email = $1`,
                    [email]
                );
                clientRow = existing.rows[0];
                await client.query(
                    `UPDATE clients SET name = $1, phone = COALESCE($2, phone) WHERE id = $3`,
                    [name, phone || null, clientRow.id]
                );
            }
        } else {
            const inserted = await client.query(
                `INSERT INTO clients (name, phone) VALUES ($1, $2) RETURNING id`,
                [name, phone || null]
            );
            clientRow = inserted.rows[0];
        }

        const insert = await client.query(
            `INSERT INTO appointments (client_id, service_id, artist_id, appointment_date, notes)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [clientRow.id, service_id || null, artist_id || null, appointment_date, notes || null]
        );

        await client.query('COMMIT');
        res.status(201).json(insert.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        next(err);
    } finally {
        client.release();
    }
});

// GET /api/appointments/client - Mis citas (cliente autenticado)
router.get('/client', authenticate, async (req, res, next) => {
    try {
        if (!req.user.client_id) {
            return res.status(403).json({ error: 'No tienes un perfil de cliente' });
        }
        const { status } = req.query;
        let sql = `SELECT ap.id, ap.appointment_date, ap.notes, ap.status, ap.created_at,
                          s.name AS service_name, ar.name AS artist_name
                   FROM appointments ap
                   LEFT JOIN services s ON s.id = ap.service_id
                   LEFT JOIN artists ar ON ar.id = ap.artist_id
                   WHERE ap.client_id = $1`;
        const params = [req.user.client_id];
        if (status) { params.push(status); sql += ` AND ap.status = $2`; }
        sql += ' ORDER BY ap.appointment_date DESC';
        const { rows } = await pool.query(sql, params);
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

// GET /api/appointments - Listar citas
router.get('/', async (req, res, next) => {
    try {
        const { status } = req.query;
        let sql = `SELECT ap.*, c.name AS client_name, c.email AS client_email, c.phone AS client_phone,
                          s.name AS service_name, ar.name AS artist_name
                   FROM appointments ap
                   LEFT JOIN clients c ON c.id = ap.client_id
                   LEFT JOIN services s ON s.id = ap.service_id
                   LEFT JOIN artists ar ON ar.id = ap.artist_id`;
        const params = [];
        if (status) {
            params.push(status);
            sql += ` WHERE ap.status = $1`;
        }
        sql += ' ORDER BY ap.appointment_date DESC';
        const { rows } = await pool.query(sql, params);
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

// PATCH /api/appointments/:id/status - Cambiar estado
router.patch('/:id/status', async (req, res, next) => {
    try {
        const { status } = req.body;
        const valid = ['pending', 'confirmed', 'completed', 'cancelled'];
        if (!valid.includes(status)) {
            return res.status(400).json({ error: 'Estado inválido' });
        }
        const { rows } = await pool.query(
            `UPDATE appointments SET status = $2 WHERE id = $1 RETURNING *`,
            [req.params.id, status]
        );
        if (!rows.length) {
            return res.status(404).json({ error: 'Cita no encontrada' });
        }
        res.json(rows[0]);
    } catch (err) {
        next(err);
    }
});

module.exports = router;