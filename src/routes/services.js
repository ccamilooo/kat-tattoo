const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// GET /api/services
router.get('/', async (req, res, next) => {
    try {
        const { rows } = await pool.query(
            `SELECT id, name, description, base_price, duration_minutes, image_url
             FROM services WHERE is_active = TRUE ORDER BY display_order ASC, id ASC`
        );
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

// POST /api/services
router.post('/', async (req, res, next) => {
    try {
        const { name, description, base_price, duration_minutes } = req.body;
        const { rows } = await pool.query(
            `INSERT INTO services (name, description, base_price, duration_minutes)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [name, description || null, base_price, duration_minutes || null]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        next(err);
    }
});

module.exports = router;