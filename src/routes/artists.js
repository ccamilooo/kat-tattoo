const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// GET /api/artists
router.get('/', async (req, res, next) => {
    try {
        const { rows } = await pool.query(
            `SELECT id, name, specialty, bio, image_url, instagram
             FROM artists WHERE is_active = TRUE ORDER BY id ASC`
        );
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

module.exports = router;