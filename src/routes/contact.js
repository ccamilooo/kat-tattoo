const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// POST /api/contact - Enviar mensaje de contacto
router.post('/', async (req, res, next) => {
    try {
        const { name, email, phone, subject, message } = req.body;
        if (!name || !email || !message) {
            return res.status(400).json({ error: 'Nombre, email y mensaje son obligatorios' });
        }
        const { rows } = await pool.query(
            `INSERT INTO messages (name, email, phone, subject, message)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [name, email, phone || null, subject || null, message]
        );
        res.status(201).json({ ok: true, id: rows[0].id });
    } catch (err) {
        next(err);
    }
});

// GET /api/contact - Listar mensajes (admin)
router.get('/', async (req, res, next) => {
    try {
        const { rows } = await pool.query(
            `SELECT * FROM messages ORDER BY created_at DESC`
        );
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

module.exports = router;