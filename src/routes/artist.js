const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { notify, logActivity } = require('../utils/log');

router.use(authenticate, authorize('artist', 'admin'));

// GET /api/artist/appointments - Citas asignadas al artista (RF18)
router.get('/appointments', async (req, res, next) => {
    try {
        const { status } = req.query;
        let artistId = req.user.artist_id;
        if (req.user.role === 'admin' && req.query.artist_id) {
            artistId = req.query.artist_id;
        }
        if (!artistId) {
            return res.status(400).json({ error: 'El artista no tiene cuenta vinculada' });
        }

        let sql = `
            SELECT ap.*, c.name AS client_name, c.email AS client_email, c.phone AS client_phone,
                   s.name AS service_name, ar.name AS artist_name
            FROM appointments ap
            LEFT JOIN clients c ON c.id = ap.client_id
            LEFT JOIN services s ON s.id = ap.service_id
            LEFT JOIN artists ar ON ar.id = ap.artist_id
            WHERE ap.artist_id = $1`;
        const params = [artistId];
        if (status) { params.push(status); sql += ` AND ap.status = $${params.length}`; }
        sql += ' ORDER BY ap.appointment_date DESC';
        const { rows } = await pool.query(sql, params);
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

// PATCH /api/artist/appointments/:id/status - Aceptar o rechazar cita (RF19)
router.patch('/appointments/:id/status', async (req, res, next) => {
    try {
        const { status } = req.body;
        const valid = ['confirmed', 'cancelled'];
        if (!valid.includes(status)) {
            return res.status(400).json({ error: 'Solo puede confirmar (confirmed) o rechazar (cancelled)' });
        }

        const { rows } = await pool.query(
            `SELECT * FROM appointments WHERE id = $1 AND artist_id = $2`,
            [req.params.id, req.user.artist_id]
        );
        if (!rows.length) {
            return res.status(404).json({ error: 'Cita no encontrada o no asignada a ti' });
        }

        const upd = await pool.query(
            `UPDATE appointments SET status = $2 WHERE id = $1 RETURNING *`,
            [req.params.id, status]
        );

        await logActivity(req.user.id, 'ARTIST_APPOINTMENT_STATUS', 'appointment', req.params.id, { status });

        // notificar al cliente
        const a = upd.rows[0];
        if (a.client_id) {
            const cu = await pool.query(`SELECT id FROM users WHERE client_id = $1`, [a.client_id]);
            if (cu.rows.length) {
                await notify(cu.rows[0].id, 'appointment',
                    status === 'confirmed' ? 'Cita confirmada por el artista' : 'Cita rechazada',
                    `Tu cita del ${new Date(a.appointment_date).toLocaleString('es-MX')} fue ${status === 'confirmed' ? 'confirmada' : 'rechazada'}.`);
            }
        }
        res.json(upd.rows[0]);
    } catch (err) {
        next(err);
    }
});

// POST /api/artist/appointments/:id/notes - Registrar avance de sesión (RF20)
router.post('/appointments/:id/notes', async (req, res, next) => {
    try {
        const { notes, progress_pct } = req.body;
        if (!notes) return res.status(400).json({ error: 'El campo notes es obligatorio' });

        const { rows } = await pool.query(
            `SELECT * FROM appointments WHERE id = $1 AND artist_id = $2`,
            [req.params.id, req.user.artist_id]
        );
        if (!rows.length) {
            return res.status(404).json({ error: 'Cita no encontrada o no asignada a ti' });
        }

        const ins = await pool.query(
            `INSERT INTO session_notes (appointment_id, artist_id, notes, progress_pct)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [req.params.id, req.user.artist_id, notes, progress_pct || null]
        );

        await logActivity(req.user.id, 'SESSION_NOTE', 'appointment', req.params.id);

        // Marcar cita completada si el avance es 100%
        if (progress_pct >= 100) {
            await pool.query(`UPDATE appointments SET status = 'completed' WHERE id = $1`, [req.params.id]);
        }
        res.status(201).json(ins.rows[0]);
    } catch (err) {
        next(err);
    }
});

// GET /api/artist/appointments/:id/notes - Notas de una cita
router.get('/appointments/:id/notes', async (req, res, next) => {
    try {
        const { rows } = await pool.query(
            `SELECT sn.*, a.name AS artist_name FROM session_notes sn
             LEFT JOIN artists a ON a.id = sn.artist_id
             WHERE sn.appointment_id = $1 ORDER BY sn.id ASC`,
            [req.params.id]
        );
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

module.exports = router;