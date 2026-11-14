const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { hashPassword } = require('../auth/helpers');
const { notify, logActivity } = require('../utils/log');

const PANEL_IMG_DIR = path.join(__dirname, '..', '..', 'public', 'uploads', 'panel');
fs.mkdirSync(PANEL_IMG_DIR, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, PANEL_IMG_DIR),
    filename: (req, file, cb) => {
        const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
        cb(null, `img_${Date.now()}_${Math.random().toString(36).slice(2, 6)}${ext}`);
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

router.use(authenticate, authorize('admin'));

// ============================================================
// RESUMEN PARA DASHBOARD
// ============================================================
router.get('/dashboard', async (req, res, next) => {
    try {
        const q = async (sql) => (await pool.query(sql)).rows[0];
        const r = {
            clientes: await q('SELECT COUNT(*)::int AS n FROM clients'),
            artistas: await q('SELECT COUNT(*)::int AS n FROM artists WHERE is_active = TRUE'),
            tatuajes: await q('SELECT COUNT(*)::int AS n FROM gallery'),
            servicios: await q('SELECT COUNT(*)::int AS n FROM services WHERE is_active = TRUE'),
            citas_pendientes: await q(`SELECT COUNT(*)::int AS n FROM appointments WHERE status = 'pending'`),
            citas_hoy: await q(`SELECT COUNT(*)::int AS n FROM appointments WHERE appointment_date::date = CURRENT_DATE AND status IN ('pending','confirmed')`),
            mensajes: await q(`SELECT COUNT(*)::int AS n FROM messages WHERE is_read = FALSE`),
            alertas: await q(`SELECT COUNT(*)::int AS n FROM notifications WHERE is_read = FALSE`),
        };
        res.json(r);
    } catch (err) {
        next(err);
    }
});

// ============================================================
// GESTIÓN DE ARTISTAS (RF13)
// ============================================================
router.get('/artists', async (req, res, next) => {
    try {
        const { rows } = await pool.query(
            `SELECT a.*, u.id AS user_id, u.email AS user_email, u.is_active AS user_active
             FROM artists a LEFT JOIN users u ON u.artist_id = a.id
             ORDER BY a.id ASC`
        );
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

router.post('/artists', async (req, res, next) => {
    const client = await pool.connect();
    try {
        const { name, specialty, bio, instagram, email, password, image_url } = req.body;
        if (!name) return res.status(400).json({ error: 'El nombre es obligatorio' });

        await client.query('BEGIN');
        const art = await client.query(
            `INSERT INTO artists (name, specialty, bio, instagram, image_url)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [name, specialty || null, bio || null, instagram || null, image_url || null]
        );

        let user = null;
        if (email) {
            if (!password || password.length < 6) {
                throw Object.assign(new Error('Debes asignar una contraseña (mínimo 6 caracteres) para la cuenta del artista'), { status: 400 });
            }
            const dupUser = await client.query(`SELECT id FROM users WHERE email = $1`, [email.toLowerCase()]);
            if (dupUser.rows.length) {
                throw Object.assign(new Error('Ya existe una cuenta con ese email'), { status: 409 });
            }
            const hash = await hashPassword(password);
            const ins = await client.query(
                `INSERT INTO users (email, password_hash, role, artist_id)
                 VALUES ($1, $2, 'artist', $3) RETURNING *`,
                [email.toLowerCase(), hash, art.rows[0].id]
            );
            user = { id: ins.rows[0].id, email: ins.rows[0].email };
        }

        await client.query('COMMIT');
        await logActivity(req.user.id, 'ARTIST_CREATE', 'artist', art.rows[0].id, { name });
        res.status(201).json({ ...art.rows[0], user });
    } catch (err) {
        await client.query('ROLLBACK');
        next(err);
    } finally {
        client.release();
    }
});

router.put('/artists/:id', async (req, res, next) => {
    try {
        const { name, specialty, bio, instagram, is_active, email, password, image_url } = req.body;
        const { rows } = await pool.query(
            `UPDATE artists SET
                name = COALESCE($2, name),
                specialty = COALESCE($3, specialty),
                bio = COALESCE($4, bio),
                instagram = COALESCE($5, instagram),
                is_active = COALESCE($6, is_active),
                image_url = COALESCE($7, image_url)
             WHERE id = $1 RETURNING *`,
            [req.params.id, name, specialty, bio, instagram, typeof is_active === 'boolean' ? is_active : null, image_url ?? null]
        );
        if (!rows.length) return res.status(404).json({ error: 'Artista no encontrado' });

        // Cuenta de acceso (email / contraseña)
        if (email || password) {
            const user = await pool.query(`SELECT id FROM users WHERE artist_id = $1`, [req.params.id]);
            if (user.rows.length) {
                if (email) {
                    const nuevo = email.toLowerCase().trim();
                    const dup = await pool.query(
                        `SELECT id FROM users WHERE email = $1 AND id <> $2`, [nuevo, user.rows[0].id]
                    );
                    if (dup.rows.length) {
                        return res.status(409).json({ error: 'Ese email ya está en uso por otra cuenta' });
                    }
                    await pool.query(`UPDATE users SET email = $2 WHERE id = $1`, [user.rows[0].id, nuevo]);
                }
                if (password) {
                    if (password.length < 6) {
                        return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
                    }
                    const hash = await hashPassword(password);
                    await pool.query(
                        `UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1`,
                        [user.rows[0].id, hash]
                    );
                }
            } else if (email) {
                // Artista sin cuenta vinculada: se la creamos
                const dup = await pool.query(`SELECT id FROM users WHERE email = $1`, [email.toLowerCase().trim()]);
                if (dup.rows.length) {
                    return res.status(409).json({ error: 'Ese email ya está en uso por otra cuenta' });
                }
                const hash = await hashPassword(password || 'Artista123');
                await pool.query(
                    `INSERT INTO users (email, password_hash, role, artist_id) VALUES ($1, $2, 'artist', $3)`,
                    [email.toLowerCase().trim(), hash, req.params.id]
                );
            }
        }

        await logActivity(req.user.id, 'ARTIST_UPDATE', 'artist', req.params.id);
        res.json(rows[0]);
    } catch (err) {
        next(err);
    }
});

router.delete('/artists/:id', async (req, res, next) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM users WHERE artist_id = $1', [req.params.id]);
        const { rowCount } = await client.query('DELETE FROM artists WHERE id = $1', [req.params.id]);
        if (!rowCount) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Artista no encontrado' });
        }
        await client.query('COMMIT');
        await logActivity(req.user.id, 'ARTIST_DELETE', 'artist', req.params.id);
        res.json({ ok: true });
    } catch (err) {
        await client.query('ROLLBACK');
        next(err);
    } finally {
        client.release();
    }
});

// ============================================================
// HORARIOS / DISPONIBILIDAD (RF16)
// ============================================================
router.get('/artists/:id/schedules', async (req, res, next) => {
    try {
        const { rows } = await pool.query(
            `SELECT * FROM artist_schedules WHERE artist_id = $1 ORDER BY day_of_week, start_time`,
            [req.params.id]
        );
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

router.post('/artists/:id/schedules', async (req, res, next) => {
    try {
        const { day_of_week, start_time, end_time } = req.body;
        if (day_of_week === undefined || !start_time || !end_time) {
            return res.status(400).json({ error: 'day_of_week, start_time y end_time son obligatorios' });
        }
        const { rows } = await pool.query(
            `INSERT INTO artist_schedules (artist_id, day_of_week, start_time, end_time)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [req.params.id, day_of_week, start_time, end_time]
        );
        await logActivity(req.user.id, 'SCHEDULE_CREATE', 'schedule', rows[0].id);
        res.status(201).json(rows[0]);
    } catch (err) {
        next(err);
    }
});

router.put('/schedules/:id', async (req, res, next) => {
    try {
        const { day_of_week, start_time, end_time, is_active } = req.body;
        const { rows } = await pool.query(
            `UPDATE artist_schedules SET
                day_of_week = COALESCE($2, day_of_week),
                start_time = COALESCE($3, start_time),
                end_time = COALESCE($4, end_time),
                is_active = COALESCE($5, is_active)
             WHERE id = $1 RETURNING *`,
            [req.params.id, day_of_week, start_time, end_time, typeof is_active === 'boolean' ? is_active : null]
        );
        if (!rows.length) return res.status(404).json({ error: 'Horario no encontrado' });
        await logActivity(req.user.id, 'SCHEDULE_UPDATE', 'schedule', req.params.id);
        res.json(rows[0]);
    } catch (err) {
        next(err);
    }
});

router.delete('/schedules/:id', async (req, res, next) => {
    try {
        const { rowCount } = await pool.query('DELETE FROM artist_schedules WHERE id = $1', [req.params.id]);
        if (!rowCount) return res.status(404).json({ error: 'Horario no encontrado' });
        await logActivity(req.user.id, 'SCHEDULE_DELETE', 'schedule', req.params.id);
        res.json({ ok: true });
    } catch (err) {
        next(err);
    }
});

// ============================================================
// GESTIÓN DE SERVICIOS (RF14)
// ============================================================
router.get('/services', async (req, res, next) => {
    try {
        const { rows } = await pool.query(
            `SELECT s.*, COUNT(ap.id)::int AS citas_uso
             FROM services s
             LEFT JOIN appointments ap ON ap.service_id = s.id
             GROUP BY s.id
             ORDER BY s.display_order ASC, s.id ASC`
        );
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

router.post('/services', async (req, res, next) => {
    try {
        const { name, description, base_price, duration_minutes, image_url, display_order } = req.body;
        if (!name || !String(name).trim()) {
            return res.status(400).json({ error: 'El nombre es obligatorio' });
        }
        const precio = Number(base_price);
        if (Number.isNaN(precio) || precio < 0) {
            return res.status(400).json({ error: 'El precio inicial debe ser un número válido' });
        }
        const { rows } = await pool.query(
            `INSERT INTO services (name, description, base_price, duration_minutes, image_url, display_order)
             VALUES ($1, $2, $3, $4, $5, COALESCE($6, 0)) RETURNING *`,
            [String(name).trim(), description || null, precio, duration_minutes || null, image_url || null, display_order == null ? null : Number(display_order)]
        );
        await logActivity(req.user.id, 'SERVICE_CREATE', 'service', rows[0].id, { name: rows[0].name });
        res.status(201).json(rows[0]);
    } catch (err) {
        next(err);
    }
});

router.put('/services/:id', async (req, res, next) => {
    try {
        const { name, description, base_price, duration_minutes, is_active, image_url, display_order } = req.body;
        let precio = null;
        if (base_price !== undefined) {
            precio = Number(base_price);
            if (Number.isNaN(precio) || precio < 0) {
                return res.status(400).json({ error: 'El precio inicial debe ser un número válido' });
            }
        }
        const { rows } = await pool.query(
            `UPDATE services SET
                name = COALESCE($2, name),
                description = COALESCE($3, description),
                base_price = COALESCE($4, base_price),
                duration_minutes = COALESCE($5, duration_minutes),
                is_active = COALESCE($6, is_active),
                image_url = COALESCE($7, image_url),
                display_order = COALESCE($8, display_order)
             WHERE id = $1 RETURNING *`,
            [req.params.id, name ? String(name).trim() : null, description ?? null, precio, duration_minutes ?? null, typeof is_active === 'boolean' ? is_active : null, image_url ?? null, display_order == null ? null : Number(display_order)]
        );
        if (!rows.length) return res.status(404).json({ error: 'Servicio no encontrado' });
        await logActivity(req.user.id, 'SERVICE_UPDATE', 'service', req.params.id, { name: rows[0].name });
        res.json(rows[0]);
    } catch (err) {
        next(err);
    }
});

router.delete('/services/:id', async (req, res, next) => {
    try {
        const uso = await pool.query(`SELECT 1 FROM appointments WHERE service_id = $1 LIMIT 1`, [req.params.id]);
        if (uso.rows.length) {
            return res.status(409).json({ error: 'Este servicio tiene citas asociadas: desactívalo en lugar de eliminarlo.' });
        }
        const { rowCount } = await pool.query('DELETE FROM services WHERE id = $1', [req.params.id]);
        if (!rowCount) return res.status(404).json({ error: 'Servicio no encontrado' });
        await logActivity(req.user.id, 'SERVICE_DELETE', 'service', req.params.id);
        res.json({ ok: true });
    } catch (err) {
        next(err);
    }
});

// ============================================================
// GESTIÓN DE CITAS (RF17)
// ============================================================
router.get('/appointments', async (req, res, next) => {
    try {
        const { status, date } = req.query;
        let sql = `
            SELECT ap.*, c.name AS client_name, c.email AS client_email, c.phone AS client_phone,
                   s.name AS service_name, ar.name AS artist_name
            FROM appointments ap
            LEFT JOIN clients c ON c.id = ap.client_id
            LEFT JOIN services s ON s.id = ap.service_id
            LEFT JOIN artists ar ON ar.id = ap.artist_id
            WHERE 1=1`;
        const params = [];
        if (status) { params.push(status); sql += ` AND ap.status = $${params.length}`; }
        if (date) { params.push(date); sql += ` AND ap.appointment_date::date = $${params.length}`; }
        sql += ' ORDER BY ap.appointment_date DESC';
        const { rows } = await pool.query(sql, params);
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

// PATCH /api/admin/appointments/:id/status - Confirmar/cancelar/ejecutar (RF10/RF11/RF17)
router.patch('/appointments/:id/status', async (req, res, next) => {
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
        if (!rows.length) return res.status(404).json({ error: 'Cita no encontrada' });

        await logActivity(req.user.id, 'APPOINTMENT_STATUS', 'appointment', req.params.id, { status });

        // Notificar al cliente (RF12)
        const full = await pool.query(
            `SELECT ap.*, c.name AS client_name
             FROM appointments ap LEFT JOIN clients c ON c.id = ap.client_id
             WHERE ap.id = $1`,
            [req.params.id]
        );
        const a = full.rows[0];
        if (a && a.client_id) {
            const clientUser = await pool.query(
                `SELECT id FROM users WHERE client_id = $1`, [a.client_id]
            );
            if (clientUser.rows.length) {
                const labels = { confirmed: 'confirmada', completed: 'completada', cancelled: 'cancelada', pending: 'pendiente' };
                await notify(clientUser.rows[0].id, 'appointment', 'Actualización de tu cita',
                    `Tu cita del ${new Date(a.appointment_date).toLocaleString('es-MX')} fue ${labels[status] || status}.`);
            }
        }
        res.json(rows[0]);
    } catch (err) {
        next(err);
    }
});

// PUT /api/admin/appointments/:id - Modificar / reprogramar cita (RF11)
router.put('/appointments/:id', async (req, res, next) => {
    try {
        const { appointment_date, service_id, artist_id, notes } = req.body;
        const { rows } = await pool.query(
            `UPDATE appointments SET
                appointment_date = COALESCE($2, appointment_date),
                service_id = COALESCE($3, service_id),
                artist_id = COALESCE($4, artist_id),
                notes = COALESCE($5, notes)
             WHERE id = $1 RETURNING *`,
            [req.params.id, appointment_date || null, service_id || null, artist_id || null, notes || null]
        );
        if (!rows.length) return res.status(404).json({ error: 'Cita no encontrada' });
        await logActivity(req.user.id, 'APPOINTMENT_UPDATE', 'appointment', req.params.id);

        // Notificar al cliente de la reprogramación (RF12)
        const full2 = await pool.query(
            `SELECT ap.*, c.name AS client_name
             FROM appointments ap LEFT JOIN clients c ON c.id = ap.client_id
             WHERE ap.id = $1`,
            [req.params.id]
        );
        const a2 = full2.rows[0];
        if (a2 && a2.client_id) {
            const clientUser = await pool.query(
                `SELECT id FROM users WHERE client_id = $1`, [a2.client_id]
            );
            if (clientUser.rows.length) {
                await notify(clientUser.rows[0].id, 'appointment', 'Cita reprogramada',
                    `Tu cita fue reprogramada para el ${new Date(a2.appointment_date).toLocaleString('es-MX')}.`);
            }
        }
        res.json(rows[0]);
    } catch (err) {
        next(err);
    }
});

// ============================================================
// CLIENTES (listado)
// ============================================================
router.get('/clients', async (req, res, next) => {
    try {
        const { rows } = await pool.query(
            `SELECT c.id, c.name, c.email, c.phone, c.created_at,
                    COUNT(ap.id)::int AS citas_totales
             FROM clients c
             LEFT JOIN appointments ap ON ap.client_id = c.id
             GROUP BY c.id ORDER BY c.created_at DESC`
        );
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

// ============================================================
// RESET DE CONTRASEÑA (admin puede restablecer cualquier cuenta)
// ============================================================
router.post('/users/:id/reset-password', async (req, res, next) => {
    try {
        const { new_password } = req.body;
        if (!new_password || new_password.length < 6) {
            return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
        }
        const { rowCount } = await pool.query(
            `UPDATE users SET password_hash = $2, reset_code = NULL, reset_expires = NULL, updated_at = NOW()
             WHERE id = $1`,
            [req.params.id, await hashPassword(new_password)]
        );
        if (!rowCount) return res.status(404).json({ error: 'Usuario no encontrado' });
        await logActivity(req.user.id, 'PASSWORD_RESET_ADMIN', 'user', req.params.id);
        res.json({ ok: true });
    } catch (err) {
        next(err);
    }
});

// ============================================================
// MENSAJES DE CONTACTO
// ============================================================
router.get('/messages', async (req, res, next) => {
    try {
        const { rows } = await pool.query(`SELECT * FROM messages ORDER BY created_at DESC`);
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

router.patch('/messages/:id/read', async (req, res, next) => {
    try {
        const { rows } = await pool.query(
            `UPDATE messages SET is_read = TRUE WHERE id = $1 RETURNING *`,
            [req.params.id]
        );
        res.json(rows[0] || { ok: true });
    } catch (err) {
        next(err);
    }
});

router.delete('/messages/:id', async (req, res, next) => {
    try {
        await pool.query('DELETE FROM messages WHERE id = $1', [req.params.id]);
        await logActivity(req.user.id, 'MESSAGE_DELETE', 'message', req.params.id);
        res.json({ ok: true });
    } catch (err) {
        next(err);
    }
});

// ============================================================
// PORTFOLIO (RF15) - reutiliza galería
// ============================================================
router.get('/portfolio', async (req, res, next) => {
    try {
        const { rows } = await pool.query(
            `SELECT g.*, a.name AS artist_name
             FROM gallery g LEFT JOIN artists a ON a.id = g.artist_id
             ORDER BY g.id DESC`
        );
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

// ============================================================
// AUDITORÍA (RNF10)
// ============================================================
router.get('/activity', async (req, res, next) => {
    try {
        const { rows } = await pool.query(
            `SELECT al.*, u.email AS user_email FROM activity_log al
             LEFT JOIN users u ON u.id = al.user_id
             ORDER BY al.id DESC LIMIT 200`
        );
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

// ============================================================
// REFERENCIAS IA (todas, con cliente)
// ============================================================
router.get('/references-all', async (req, res, next) => {
    try {
        const { rows } = await pool.query(
            `SELECT r.id, r.image_url, r.description, r.analysis, r.created_at,
                    c.name AS cliente, c.email AS cliente_email
             FROM user_references r
             LEFT JOIN clients c ON c.id = r.client_id
             ORDER BY r.id DESC`
        );
        res.json({ rows });
    } catch (err) {
        next(err);
    }
});

// ============================================================
// NOTIFICACIONES ADMIN
// ============================================================
router.get('/notifications', async (req, res, next) => {
    try {
        const { rows } = await pool.query(
            `SELECT * FROM notifications WHERE user_id = $1 ORDER BY id DESC LIMIT 50`,
            [req.user.id]
        );
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

// ============================================================
// SUBIDA DE IMÁGENES (servicios / artistas)
// ============================================================
router.post('/upload', (req, res, next) => {
    upload.single('imagen')(req, res, (err) => {
        if (err) return next(err);
        if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo' });
        res.json({ ok: true, url: '/uploads/panel/' + req.file.filename });
    });
});

module.exports = router;