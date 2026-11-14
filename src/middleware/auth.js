const pool = require('../config/db');
const { verifyToken } = require('../auth/helpers');

// Autentica al usuario a partir del token Bearer
async function authenticate(req, res, next) {
    try {
        const header = req.headers.authorization || '';
        const token = header.startsWith('Bearer ') ? header.slice(7) : null;
        if (!token) {
            return res.status(401).json({ error: 'No autenticado' });
        }

        const payload = verifyToken(token);
        const { rows } = await pool.query(
            `SELECT id, email, role, artist_id, client_id, is_active
             FROM users WHERE id = $1`,
            [payload.uid]
        );
        if (!rows.length || !rows[0].is_active) {
            return res.status(401).json({ error: 'Sesión inválida o usuario inactivo' });
        }

        req.user = rows[0];
        req.userToken = payload;
        next();
    } catch (err) {
        if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Sesión expirada o inválida' });
        }
        next(err);
    }
}

// Comprueba que el rol del usuario esté entre los permitidos
function authorize(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'No autenticado' });
        }
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Acceso denegado: rol insuficiente' });
        }
        next();
    };
}

module.exports = { authenticate, authorize };