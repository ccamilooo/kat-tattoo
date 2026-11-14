const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('../config/db');
const { authenticate } = require('../middleware/auth');
const ai = require('../ai/llm');
const { logActivity } = require('../utils/log');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'public', 'uploads', 'refs');
const IA_DIR = path.join(__dirname, '..', '..', 'public', 'uploads', 'ia');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(IA_DIR, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
        const uid = req.user.id;
        const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
        cb(null, `ref_${uid}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}${ext}`);
    },
});
const upload = multer({
    storage,
    limits: { fileSize: 8 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp'];
        cb(allowed.includes(file.mimetype) ? null : new Error('Solo se permiten imágenes (jpg, png, webp, gif, bmp)'), allowed.includes(file.mimetype));
    },
});

// POST /api/references - Subir referencia (RF04)
router.post('/', authenticate, upload.single('imagen'), async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Falta el archivo de imagen' });
        }
        const { description } = req.body;
        const imageUrl = `/uploads/refs/${req.file.filename}`;

        const { rows } = await pool.query(
            `INSERT INTO user_references (user_id, image_url, description) VALUES ($1, $2, $3) RETURNING *`,
            [req.user.id, imageUrl, description || null]
        );

        await logActivity(req.user.id, 'REFERENCE_UPLOAD', 'reference', rows[0].id);
        res.status(201).json(rows[0]);
    } catch (err) {
        next(err);
    }
});

// GET /api/references - Mis referencias
router.get('/', authenticate, async (req, res, next) => {
    try {
        const { rows } = await pool.query(
            `SELECT * FROM user_references WHERE user_id = $1 ORDER BY id DESC`,
            [req.user.id]
        );
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

// DELETE /api/references/:id - Eliminar referencia
router.delete('/:id', authenticate, async (req, res, next) => {
    try {
        const owns = await pool.query(
            `SELECT id FROM user_references WHERE id = $1 AND user_id = $2`,
            [req.params.id, req.user.id]
        );
        if (!owns.rows.length) {
            return res.status(404).json({ error: 'Referencia no encontrada' });
        }

        const props = await pool.query(
            `SELECT image_url FROM design_proposals WHERE reference_id = $1`,
            [req.params.id]
        );
        for (const p of props.rows) {
            if (p.image_url) {
                try { fs.unlinkSync(path.join(IA_DIR, path.basename(p.image_url))); } catch (_) { /* noop */ }
            }
        }
        await pool.query(`DELETE FROM design_proposals WHERE reference_id = $1`, [req.params.id]);

        const del = await pool.query(
            `DELETE FROM user_references WHERE id = $1 AND user_id = $2 RETURNING *`,
            [req.params.id, req.user.id]
        );
        try { fs.unlinkSync(path.join(UPLOAD_DIR, path.basename(del.rows[0].image_url))); } catch (_) { /* noop */ }
        await logActivity(req.user.id, 'REFERENCE_DELETE', 'reference', req.params.id);
        res.json({ ok: true });
    } catch (err) {
        next(err);
    }
});

// POST /api/references/:id/analyze - Análisis con IA (RF05)
router.post('/:id/analyze', authenticate, async (req, res, next) => {
    try {
        const { rows } = await pool.query(
            `SELECT * FROM user_references WHERE id = $1 AND (user_id = $2 OR $3 = 'admin' OR $3 = 'artist')`,
            [req.params.id, req.user.id, req.user.role]
        );
        if (!rows.length) {
            return res.status(404).json({ error: 'Referencia no encontrada' });
        }

        const ref = rows[0];
        const filePath = path.join(UPLOAD_DIR, path.basename(ref.image_url));
        const finalMime = mimeFromExt(filePath) || 'image/jpeg';
        const base64 = fs.readFileSync(filePath).toString('base64');

        const analysis = await ai.analyzeReference(base64, finalMime, ref.description);

        await pool.query(`UPDATE user_references SET analysis = $2 WHERE id = $1`, [ref.id, analysis]);
        await logActivity(req.user.id, 'REFERENCE_ANALYZE', 'reference', ref.id);
        res.json({ id: ref.id, analysis });
    } catch (err) {
        next(err);
    }
});

// POST /api/references/:id/proposals - Generar propuestas de diseño (RF06)
router.post('/:id/proposals', authenticate, async (req, res, next) => {
    try {
        const { requirements } = req.body;
        const { rows } = await pool.query(
            `SELECT * FROM user_references WHERE id = $1 AND (user_id = $2 OR $3 = 'admin' OR $3 = 'artist')`,
            [req.params.id, req.user.id, req.user.role]
        );
        if (!rows.length) {
            return res.status(404).json({ error: 'Referencia no encontrada' });
        }

        const ref = rows[0];
        const filePath = path.join(UPLOAD_DIR, path.basename(ref.image_url));
        const base64 = fs.readFileSync(filePath).toString('base64');
        const finalMime = mimeFromExt(filePath) || 'image/jpeg';

        const content = await ai.generateProposal(base64, finalMime, requirements || ref.description);

        let imageUrl = null;
        try {
            const promptBase = requirements ? `Requisitos adicionales del cliente: ${requirements}.` : '';
            const prompt = `Diseña el tatuaje basándote en la siguiente propuesta:\n${content}\n${promptBase}`.slice(0, 1500);
            const gen = await ai.generateImage(prompt, base64, finalMime);
            const ext = gen.mimeType === 'image/jpeg' ? 'jpg' : gen.mimeType === 'image/webp' ? 'webp' : 'png';
            const filename = `propuesta_${ref.id}_${Date.now()}.${ext}`;
            fs.writeFileSync(path.join(IA_DIR, filename), Buffer.from(gen.base64, 'base64'));
            imageUrl = `/uploads/ia/${filename}`;
        } catch (imgErr) {
            /* el diseño es opcional; si la generación falla se mantiene solo el texto */
        }

        const ins = await pool.query(
            `INSERT INTO design_proposals (reference_id, content, image_url) VALUES ($1, $2, $3) RETURNING *`,
            [ref.id, content, imageUrl]
        );

        await logActivity(req.user.id, 'PROPOSAL_GENERATE', 'proposal', ins.rows[0].id);
        res.status(201).json(ins.rows[0]);
    } catch (err) {
        next(err);
    }
});

// POST /api/references/:id/generate-image - Diseñar imagen con IA (Flux)
router.post('/:id/generate-image', authenticate, async (req, res, next) => {
    try {
        const { requirements } = req.body;
        const { rows } = await pool.query(
            `SELECT * FROM user_references WHERE id = $1 AND (user_id = $2 OR $3 = 'admin' OR $3 = 'artist')`,
            [req.params.id, req.user.id, req.user.role]
        );
        if (!rows.length) {
            return res.status(404).json({ error: 'Referencia no encontrada' });
        }

        const ref = rows[0];
        const filePath = path.join(UPLOAD_DIR, path.basename(ref.image_url));
        const finalMime = mimeFromExt(filePath) || 'image/jpeg';
        const base64 = fs.readFileSync(filePath).toString('base64');

        const promptBase = requirements
            ? `Requisitos adicionales del cliente: ${requirements}.`
            : '';
        const prompt = `Eres el tatuador del estudio KAT Tattoo Studio. Basándote en esta imagen de referencia${ref.description ? ` y en esta descripción del cliente: "${ref.description}"` : ''}, diseña un tatuaje profesional y bien definido, en estilo tatuaje real (líneas limpias, sombreado). Genera UNA sola imagen del diseño. ${promptBase}`;

        const gen = await ai.generateImage(prompt, base64, finalMime);

        const ext = gen.mimeType === 'image/jpeg' ? 'jpg' : gen.mimeType === 'image/webp' ? 'webp' : 'png';
        const filename = `diseno_${ref.id}_${Date.now()}.${ext}`;
        const outPath = path.join(IA_DIR, filename);
        fs.writeFileSync(outPath, Buffer.from(gen.base64, 'base64'));
        const imageUrl = `/uploads/ia/${filename}`;

        const ins = await pool.query(
            `INSERT INTO design_proposals (reference_id, content, image_url) VALUES ($1, $2, $3) RETURNING *`,
            [ref.id, gen.text || requirements || prompt, imageUrl]
        );

        await logActivity(req.user.id, 'PROPOSAL_IMAGE', 'proposal', ins.rows[0].id);
        res.status(201).json(ins.rows[0]);
    } catch (err) {
        next(err);
    }
});

// GET /api/references/:id/proposals - Propuestas de una referencia
router.get('/:id/proposals', authenticate, async (req, res, next) => {
    try {
        const refs = await pool.query(
            `SELECT id FROM user_references WHERE id = $1 AND (user_id = $2 OR $3 = 'admin' OR $3 = 'artist')`,
            [req.params.id, req.user.id, req.user.role]
        );
        if (!refs.rows.length) {
            return res.status(404).json({ error: 'Referencia no encontrada' });
        }
        const { rows } = await pool.query(
            `SELECT * FROM design_proposals WHERE reference_id = $1 ORDER BY id DESC`,
            [req.params.id]
        );
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

function mimeFromExt(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const map = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.bmp': 'image/bmp' };
    return map[ext] || null;
}

module.exports = router;