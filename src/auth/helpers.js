const crypto = require('crypto');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'kat_tattoo_secreto_local';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '12h';

function hashPassword(password) {
    return new Promise((resolve, reject) => {
        const salt = crypto.randomBytes(16).toString('hex');
        crypto.scrypt(password, salt, 64, (err, derived) => {
            if (err) return reject(err);
            resolve(`${salt}:${derived.toString('hex')}`);
        });
    });
}

function verifyPassword(password, stored) {
    return new Promise((resolve, reject) => {
        const [salt, key] = String(stored).split(':');
        if (!salt || !key) return resolve(false);
        crypto.scrypt(password, salt, 64, (err, derived) => {
            if (err) return reject(err);
            const a = Buffer.from(key, 'hex');
            const b = Buffer.from(derived);
            resolve(a.length === b.length && crypto.timingSafeEqual(a, b));
        });
    });
}

function signToken(user) {
    return jwt.sign(
        {
            uid: user.id,
            email: user.email,
            role: user.role,
            artist_id: user.artist_id || null,
            client_id: user.client_id || null,
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES }
    );
}

function verifyToken(token) {
    return jwt.verify(token, JWT_SECRET);
}

module.exports = { hashPassword, verifyPassword, signToken, verifyToken, JWT_SECRET };