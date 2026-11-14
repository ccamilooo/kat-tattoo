const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const ai = require('../ai/llm');

// GET /api/recommendations - Recomendar artistas por estilo/disponibilidad (RF07)
// Parámetros: style (ej. "blackwork"), date (opcional para disponibilidad)
router.get('/', async (req, res, next) => {
    try {
        const { style, date } = req.query;

        const { rows: artists } = await pool.query(
            `SELECT id, name, specialty, bio, instagram FROM artists WHERE is_active = TRUE`
        );

        let disponibles = null;
        if (date) {
            const dayOfWeek = new Date(date + 'T12:00:00').getDay();
            const { rows: sched } = await pool.query(
                `SELECT artist_id FROM artist_schedules
                 WHERE day_of_week = $1 AND is_active = TRUE`,
                [dayOfWeek]
            );
            const ids = new Set(sched.map((s) => s.artist_id));
            disponibles = artists.filter((a) => ids.has(a.id)).map((a) => a.id);
        }

        // Reordenar con IA si hay estilo (RF07 IA-Asistencia)
        let orden = artists;
        if (style) {
            try {
                const prompt =
                    `Estos son los artistas de KAT Tattoo Studio (id, name, specialty):\n` +
                    artists.map((a) => `${a.id}: ${a.name} - ${a.specialty || 'general'}`).join('\n') +
                    `\n\nEl cliente busca el estilo: "${style}".` +
                    `\nDevuelve SOLO una lista JSON de ids de los 3 artistas más adecuados ordenados del mejor al peor, ej: [2,1,3]. Sin texto adicional.`;

                const text = await ai.ollamaText(
                    [{ role: 'user', parts: [{ text: prompt }] }],
                    null,
                    256
                );
                const match = text.match(/\[[\d,\s]+\]/);
                if (match) {
                    const ids = JSON.parse(match[0]);
                    orden = ids
                        .map((id) => artists.find((a) => a.id === id))
                        .filter(Boolean)
                        .concat(artists.filter((a) => !ids.includes(a.id)));
                }
            } catch (err) {
                console.error('Recommendation AI fallback:', err.message);
            }
        }

        const result = orden.map((a) => ({
            ...a,
            recomendado: Boolean(style),
            disponible: disponibles ? disponibles.includes(a.id) : null,
        }));

        res.json(result);
    } catch (err) {
        next(err);
    }
});

module.exports = router;