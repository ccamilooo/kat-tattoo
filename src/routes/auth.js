const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { hashPassword, verifyPassword, signToken } = require('../auth/helpers');
const { authenticate } = require('../middleware/auth');
const { logActivity } = require('../utils/log');
const { enviarCodigoReset, correoConfigurado } = require('../email');

// POST /api/auth/register - Registro de cliente (RF01)
router.post('/register', async (req, res, next) => {
    const client = await pool.connect();
    try {
        const { name, email, phone, password } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Nombre, email y contraseña son obligatorios' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
        }

        const exists = await client.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
        if (exists.rows.length) {
            return res.status(409).json({ error: 'Ya existe una cuenta con ese email' });
        }

        const passwordHash = await hashPassword(password);

        await client.query('BEGIN');

        const c = await client.query(
            `INSERT INTO clients (name, email, phone) VALUES ($1, $2, $3) RETURNING *`,
            [name.trim(), email.toLowerCase().trim(), phone || null]
        );

        const u = await client.query(
            `INSERT INTO users (email, password_hash, role, client_id) VALUES ($1, $2, 'client', $3) RETURNING *`,
            [email.toLowerCase().trim(), passwordHash, c.rows[0].id]
        );

        await client.query('COMMIT');

        await logActivity(u.rows[0].id, 'REGISTER', 'user', u.rows[0].id, { email: email.toLowerCase().trim() });

        res.status(201).json({ token: signToken(u.rows[0]), user: publicUser(u.rows[0]) });
    } catch (err) {
        await client.query('ROLLBACK');
        next(err);
    } finally {
        client.release();
    }
});

// POST /api/auth/login - Inicio de sesión (RF02)
router.post('/login', async (req, res, next) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email y contraseña son obligatorios' });
        }

        const { rows } = await pool.query(
            `SELECT * FROM users WHERE email = $1`,
            [email.toLowerCase().trim()]
        );

        if (!rows.length) {
            return res.status(401).json({ error: 'Credenciales incorrectas' });
        }

        const ok = await verifyPassword(password, rows[0].password_hash);
        if (!ok) {
            return res.status(401).json({ error: 'Credenciales incorrectas' });
        }
        if (!rows[0].is_active) {
            return res.status(403).json({ error: 'Cuenta desactivada' });
        }

        await logActivity(rows[0].id, 'LOGIN', 'user', rows[0].id);

        res.json({ token: signToken(rows[0]), user: publicUser(rows[0]) });
    } catch (err) {
        next(err);
    }
});

// GET /api/auth/me - Perfil actual (RF03)
router.get('/me', authenticate, async (req, res, next) => {
    try {
        const { rows } = await pool.query(
            `SELECT u.id, u.email, u.role, u.artist_id, u.client_id, u.is_active,
                    c.name, c.phone,
                    a.name AS artist_name, a.specialty
             FROM users u
             LEFT JOIN clients c ON c.id = u.client_id
             LEFT JOIN artists a ON a.id = u.artist_id
             WHERE u.id = $1`,
            [req.user.id]
        );
        res.json(rows[0] || null);
    } catch (err) {
        next(err);
    }
});

// PUT /api/auth/profile - Actualizar perfil (RF03)
router.put('/profile', authenticate, async (req, res, next) => {
    try {
        const { name, phone, email, password } = req.body;
        const { client_id } = req.user;

        if (client_id) {
            await pool.query(
                `UPDATE clients SET name = COALESCE($2, name), phone = COALESCE($3, phone) WHERE id = $1`,
                [client_id, name || null, phone || null]
            );
        }

        if (email && email.toLowerCase().trim() !== req.user.email) {
            const nuevo = email.toLowerCase().trim();
            const dup = await pool.query(`SELECT id FROM users WHERE email = $1 AND id <> $2`, [nuevo, req.user.id]);
            if (dup.rows.length) {
                return res.status(409).json({ error: 'Ese email ya está en uso por otra cuenta' });
            }
            await pool.query(`UPDATE users SET email = $2 WHERE id = $1`, [req.user.id, nuevo]);
            if (client_id) {
                await pool.query(`UPDATE clients SET email = $2 WHERE id = $1`, [client_id, nuevo]);
            }
        }

        if (password) {
            if (password.length < 6) {
                return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
            }
            const passwordHash = await hashPassword(password);
            await pool.query(
                `UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1`,
                [req.user.id, passwordHash]
            );
        }

        await logActivity(req.user.id, 'PROFILE_UPDATE', 'user', req.user.id);

        const me = await pool.query(`SELECT * FROM users WHERE id = $1`, [req.user.id]);
        res.json({ ok: true, user: publicUser(me.rows[0]) });
    } catch (err) {
        next(err);
    }
});

// POST /api/auth/forgot-password - Solicitar restablecimiento de contraseña
router.post('/forgot-password', async (req, res, next) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ error: 'El email es obligatorio' });
        }

        const { rows } = await pool.query(`SELECT id, email, is_active FROM users WHERE email = $1`, [email.toLowerCase().trim()]);
        if (!rows.length) {
            // No revelamos si el email existe
            return res.json({ ok: true });
        }
        if (!rows[0].is_active) {
            return res.status(403).json({ error: 'Cuenta desactivada' });
        }

        const code = Math.floor(100000 + Math.random() * 900000).toString();
        await pool.query(
            `UPDATE users SET reset_code = $2, reset_expires = NOW() + INTERVAL '15 minutes' WHERE id = $1`,
            [rows[0].id, code]
        );

        await logActivity(rows[0].id, 'PASSWORD_RESET_REQUEST', 'user', rows[0].id);

        let warning = null;
        if (correoConfigurado) {
            try {
                await enviarCodigoReset(rows[0].email, code);
            } catch (e) {
                console.error('Error enviando correo de reset:', e.message);
                warning = 'No se pudo enviar el correo: ' + e.message;
            }
        }

        const respuesta = { ok: true };
        // Si el correo no está configurado o falló el envío, el código se muestra en pantalla (modo dev/prueba)
        if (!correoConfigurado || warning) respuesta.reset_code = code;
        if (warning) respuesta.warning = warning;
        res.json(respuesta);
    } catch (err) {
        next(err);
    }
});

// POST /api/auth/reset-password - Confirmar restablecimiento con código
router.post('/reset-password', async (req, res, next) => {
    try {
        const { email, code, new_password } = req.body;
        if (!email || !code || !new_password) {
            return res.status(400).json({ error: 'Email, código y nueva contraseña son obligatorios' });
        }
        if (new_password.length < 6) {
            return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
        }

        const { rows } = await pool.query(
            `SELECT id, reset_code, reset_expires FROM users WHERE email = $1`,
            [email.toLowerCase().trim()]
        );
        if (!rows.length) {
            return res.status(404).json({ error: 'No se encontró una cuenta con ese email' });
        }

        const u = rows[0];
        if (!u.reset_code || u.reset_code !== String(code).trim()) {
            return res.status(400).json({ error: 'El código es incorrecto' });
        }
        if (!u.reset_expires || new Date(u.reset_expires) < new Date()) {
            return res.status(400).json({ error: 'El código ha expirado. Solicita uno nuevo.' });
        }

        const passwordHash = await hashPassword(new_password);
        await pool.query(
            `UPDATE users SET password_hash = $2, reset_code = NULL, reset_expires = NULL, updated_at = NOW() WHERE id = $1`,
            [u.id, passwordHash]
        );

        await logActivity(u.id, 'PASSWORD_RESET', 'user', u.id);
        res.json({ ok: true });
    } catch (err) {
        next(err);
    }
});

function publicUser(u) {
    return {
        id: u.id,
        email: u.email,
        role: u.role,
        artist_id: u.artist_id,
        client_id: u.client_id,
    };
}

module.exports = router;