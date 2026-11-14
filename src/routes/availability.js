const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// GET /api/availability - Consulta disponibilidad (RF08)
// Parámetros: artist_id (opcional), date (YYYY-MM-DD, obligatorio)
router.get('/', async (req, res, next) => {
    try {
        const { artist_id, date } = req.query;
        if (!date) {
            return res.status(400).json({ error: 'El parámetro date (YYYY-MM-DD) es obligatorio' });
        }

        const dayOfWeek = new Date(date + 'T12:00:00').getDay();

        let sql = `
            SELECT s.artist_id, a.name AS artist_name, a.specialty,
                   s.start_time, s.end_time
            FROM artist_schedules s
            JOIN artists a ON a.id = s.artist_id
            WHERE s.day_of_week = $1 AND s.is_active = TRUE`;
        const params = [dayOfWeek];

        if (artist_id) {
            params.push(artist_id);
            sql += ` AND s.artist_id = $${params.length}`;
        }
        sql += ` ORDER BY s.artist_id, s.start_time`;

        const { rows: schedules } = await pool.query(sql, params);

        if (!schedules.length) {
            return res.json([]);
        }

        // Obtener citas existentes ese día
        const { rows: booked } = await pool.query(
            `SELECT artist_id, appointment_date FROM appointments
             WHERE appointment_date::date = $1
               AND status IN ('pending','confirmed')
               AND artist_id IS NOT NULL`,
            [date]
        );

        const bookedSlots = new Set();
        for (const b of booked) {
            const h = new Date(b.appointment_date).getHours();
            const m = String(new Date(b.appointment_date).getMinutes()).padStart(2, '0');
            bookedSlots.add(`${b.artist_id}_${h}:${m}`);
        }

        const result = schedules.map((s) => ({
            artist_id: s.artist_id,
            artist_name: s.artist_name,
            specialty: s.specialty,
            start_time: s.start_time,
            end_time: s.end_time,
            available: !bookedSlots.has(`${s.artist_id}_${s.start_time.slice(0, 5)}`),
        }));

        res.json(result);
    } catch (err) {
        next(err);
    }
});

module.exports = router;