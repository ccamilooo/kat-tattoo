const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { generateImage } = require('../ai/llm');

const GALLERY_DIR = path.join(__dirname, '..', '..', 'public', 'uploads', 'gallery');
fs.mkdirSync(GALLERY_DIR, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, GALLERY_DIR),
    filename: (req, file, cb) => {
        const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
        cb(null, `gal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}${ext}`);
    },
});
const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        cb(allowed.includes(file.mimetype) ? null : new Error('Solo se permiten imágenes (jpg, png, webp, gif)'), allowed.includes(file.mimetype));
    },
});

// GET /api/gallery - Listar tatuajes (con filtros opcionales)
router.get('/', async (req, res, next) => {
    try {
        const { category, featured } = req.query;
        let sql = `SELECT g.*, a.name AS artist_name
                   FROM gallery g
                   LEFT JOIN artists a ON a.id = g.artist_id`;
        const conditions = [];
        const params = [];

        if (category) {
            params.push(category);
            conditions.push(`g.category = $${params.length}`);
        }
        if (featured === 'true') {
            conditions.push(`g.is_featured = TRUE`);
        }
        if (conditions.length) {
            sql += ' WHERE ' + conditions.join(' AND ');
        }
        sql += ' ORDER BY g.id ASC';

        const { rows } = await pool.query(sql, params);
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

// GET /api/gallery/:id - Detalle de un tatuaje
router.get('/:id', async (req, res, next) => {
    try {
        const { rows } = await pool.query(
            `SELECT g.*, a.name AS artist_name
             FROM gallery g LEFT JOIN artists a ON a.id = g.artist_id
             WHERE g.id = $1`,
            [req.params.id]
        );
        if (!rows.length) {
            return res.status(404).json({ error: 'Tatuaje no encontrado' });
        }
        res.json(rows[0]);
    } catch (err) {
        next(err);
    }
});

// POST /api/gallery - Crear tatuaje (multipart o JSON)
router.post('/', upload.single('imagen'), async (req, res, next) => {
    try {
        const { title, category, description, image_url, price_from, artist_id, is_featured } = req.body;
        if (!title || !category) {
            return res.status(400).json({ error: 'Título y categoría son obligatorios' });
        }
        const fileUrl = req.file ? `/uploads/gallery/${req.file.filename}` : null;
        const rows = await pool.query(
            `INSERT INTO gallery (title, category, description, image_url, price_from, artist_id, is_featured)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [title, category, description || null, fileUrl || image_url || null, price_from || null, artist_id || null, is_featured === true || is_featured === 'true']
        );
        res.status(201).json(rows.rows[0]);
    } catch (err) {
        next(err);
    }
});

// PUT /api/gallery/:id - Actualizar tatuaje (multipart o JSON)
router.put('/:id', upload.single('imagen'), async (req, res, next) => {
    try {
        const { title, category, description, image_url, price_from, artist_id, is_featured } = req.body;
        const old = await pool.query(`SELECT image_url FROM gallery WHERE id = $1`, [req.params.id]);
        if (!old.rows.length) {
            return res.status(404).json({ error: 'Tatuaje no encontrado' });
        }

        let newImageUrl = image_url;
        if (req.file) {
            newImageUrl = `/uploads/gallery/${req.file.filename}`;
            try {
                fs.unlinkSync(path.join(GALLERY_DIR, path.basename(old.rows[0].image_url)));
            } catch (_) { /* archivo viejo no existe */ }
        }

        const featuredVal = typeof is_featured === 'boolean'
            ? is_featured
            : is_featured === 'true' ? true : is_featured === 'false' ? false : undefined;

        const { rows } = await pool.query(
            `UPDATE gallery SET
                title = COALESCE($2, title),
                category = COALESCE($3, category),
                description = COALESCE($4, description),
                image_url = COALESCE($5, image_url),
                price_from = COALESCE($6, price_from),
                artist_id = CASE WHEN $7 = '__none__' THEN NULL
                                 ELSE COALESCE(NULLIF($7, ''), NULLIF($7, 'null'), artist_id) END,
                is_featured = COALESCE($8, is_featured)
             WHERE id = $1 RETURNING *`,
            [req.params.id, title, category, description, newImageUrl, price_from, artist_id, featuredVal]
        );
        res.json(rows[0]);
    } catch (err) {
        next(err);
    }
});

// POST /api/gallery/design-ia - Generar un diseño IA para el portafolio
router.post('/design-ia', authenticate, authorize('admin', 'artist'), async (req, res, next) => {
    try {
        const { title, description, category } = req.body;
        if (!title) return res.status(400).json({ error: 'El título es obligatorio para diseñar' });

        const prompt = [
            'Diseño de tatuaje profesional para estudio, alta calidad, líneas limpias y sombreado detallado.',
            `Tema: ${title}.`,
            description ? `Detalles y estilo: ${description}.` : '',
            category ? `Categoría general: ${category}.` : '',
            'Muestra solo el tatuaje sobre fondo neutro, sin texto ni marcas de agua.',
        ].filter(Boolean).join(' ');

        const img = await generateImage(prompt);
        const ext = img.mimeType === 'image/jpeg' ? 'jpg' : img.mimeType === 'image/webp' ? 'webp' : 'png';
        const dir = path.join(__dirname, '..', '..', 'public', 'uploads', 'galeria-ia');
        fs.mkdirSync(dir, { recursive: true });
        const filename = `ia_${Date.now()}.${ext}`;
        fs.writeFileSync(path.join(dir, filename), Buffer.from(img.base64, 'base64'));

        res.json({ ok: true, image_url: `/uploads/galeria-ia/${filename}`, text: img.text });
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
});

// DELETE /api/gallery/:id - Eliminar tatuaje
router.delete('/:id', async (req, res, next) => {
    try {
        const old = await pool.query(`SELECT image_url FROM gallery WHERE id = $1`, [req.params.id]);
        const { rowCount } = await pool.query('DELETE FROM gallery WHERE id = $1', [req.params.id]);
        if (!rowCount) {
            return res.status(404).json({ error: 'Tatuaje no encontrado' });
        }
        if (old.rows[0]?.image_url) {
            try { fs.unlinkSync(path.join(GALLERY_DIR, path.basename(old.rows[0].image_url))); } catch (_) { }
        }
        res.json({ ok: true, deleted: req.params.id });
    } catch (err) {
        next(err);
    }
});

module.exports = router;