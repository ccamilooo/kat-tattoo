const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authenticate } = require('../middleware/auth');

// GET /api/notifications - Mis notificaciones (RF12)
router.get('/', authenticate, async (req, res, next) => {
    try {
        const { rows } = await pool.query(
            `SELECT * FROM notifications WHERE user_id = $1 ORDER BY id DESC LIMIT 100`,
            [req.user.id]
        );
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

// PATCH /api/notifications/:id/read - Marcar leída
router.patch('/:id/read', authenticate, async (req, res, next) => {
    try {
        const { rows } = await pool.query(
            `UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2 RETURNING *`,
            [req.params.id, req.user.id]
        );
        res.json(rows[0] || { ok: true });
    } catch (err) {
        next(err);
    }
});

// PATCH /api/notifications/read-all - Marcar todas leídas
router.patch('/read-all', authenticate, async (req, res, next) => {
    try {
        await pool.query(
            `UPDATE notifications SET is_read = TRUE WHERE user_id = $1`,
            [req.user.id]
        );
        res.json({ ok: true });
    } catch (err) {
        next(err);
    }
});

// GET /api/notifications/unread-count - Contador no leídas
router.get('/unread-count', authenticate, async (req, res, next) => {
    try {
        const { rows } = await pool.query(
            `SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND is_read = FALSE`,
            [req.user.id]
        );
        res.json(rows[0]);
    } catch (err) {
        next(err);
    }
});

module.exports = router;