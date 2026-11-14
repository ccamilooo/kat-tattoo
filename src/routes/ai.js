const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const path = require('path');
const fs = require('fs');
const ai = require('../ai/llm');
const { authenticate } = require('../middleware/auth');

const IA_DIR = path.join(__dirname, '..', '..', 'public', 'uploads', 'ia');
fs.mkdirSync(IA_DIR, { recursive: true });

// POST /api/ai/chat - Enviar mensaje al asistente
router.post('/chat', async (req, res, next) => {
    try {
        const { message, session_id } = req.body;
        if (!message || typeof message !== 'string') {
            return res.status(400).json({ error: 'El campo message es obligatorio' });
        }

        const sessionId = session_id || `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        const conv = await ai.getOrCreateConversation(sessionId);
        const history = await ai.getHistory(conv.id);

        await ai.saveMessage(conv.id, 'user', message);
        const reply = await ai.chatWithAssistant(history, message);
        await ai.saveMessage(conv.id, 'assistant', reply);

        res.json({ session_id: sessionId, reply });
    } catch (err) {
        next(err);
    }
});

// POST /api/ai/ideas - Propuestas de diseño desde una idea (sin subir imagen)
// El texto y la visión se generan con Ollama local (Qwen); la imagen con Flux (Pollinations).
router.post('/ideas', authenticate, async (req, res, next) => {
    try {
        const { idea } = req.body;
        if (!idea || typeof idea !== 'string' || !idea.trim()) {
            return res.status(400).json({ error: 'Describe tu idea de tatuaje en el campo idea' });
        }
        const ideaTexto = idea.trim().slice(0, 1000);

        const content = await ai.generateIdeaProposals(ideaTexto);

        let imageUrl = null;
        try {
            const prompt = `Diseña el tatuaje basándote en esta idea del cliente:\n${ideaTexto}\n\nPropuestas:\n${content}`.slice(0, 1500);
            const gen = await ai.generateImage(prompt, null, 'image/jpeg');
            const ext = gen.mimeType === 'image/jpeg' ? 'jpg' : gen.mimeType === 'image/webp' ? 'webp' : 'png';
            const filename = `idea_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
            fs.writeFileSync(path.join(IA_DIR, filename), Buffer.from(gen.base64, 'base64'));
            imageUrl = `/uploads/ia/${filename}`;
        } catch (imgErr) {
            console.warn('Flux falló al diseñar la idea (' + imgErr.message + '); se responde solo con texto.');
        }

        res.status(201).json({ content, imageUrl });
    } catch (err) {
        next(err);
    }
});

// GET /api/ai/history/:sessionId - Historial de una conversación
router.get('/history/:sessionId', async (req, res, next) => {
    try {
        const { rows } = await pool.query(
            `SELECT c.id AS conversation_id, c.title, m.role, m.content, m.created_at
             FROM ai_conversations c
             LEFT JOIN ai_messages m ON m.conversation_id = c.id
             WHERE c.session_id = $1
             ORDER BY m.id ASC`,
            [req.params.sessionId]
        );
        if (!rows.length) {
            return res.json([]);
        }
        res.json({
            conversation_id: rows[0].conversation_id,
            title: rows[0].title,
            messages: rows
                .filter((r) => r.role)
                .map((r) => ({ role: r.role, content: r.content, created_at: r.created_at })),
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;