const pool = require('../config/db');

// Registra una notificación para un usuario (RF12)
async function notify(userId, type, title, message) {
    try {
        if (!userId) return;
        await pool.query(
            `INSERT INTO notifications (user_id, type, title, message) VALUES ($1, $2, $3, $4)`,
            [userId, type, title, message || null]
        );
    } catch (err) {
        console.error('notify error:', err.message);
    }
}

// Auditoría / trazabilidad (RNF10)
async function logActivity(userId, action, entity, entityId, details = null) {
    try {
        await pool.query(
            `INSERT INTO activity_log (user_id, action, entity, entity_id, details)
             VALUES ($1, $2, $3, $4, $5)`,
            [userId || null, action, entity || null, entityId || null, details ? JSON.stringify(details) : null]
        );
    } catch (err) {
        console.error('logActivity error:', err.message);
    }
}

module.exports = { notify, logActivity };