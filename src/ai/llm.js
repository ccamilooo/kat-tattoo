const pool = require('../config/db');
require('dotenv').config();

// IA local: el texto y la visión usan Ollama con modelos Qwen (gratis, sin cuota ni claves).
// Las imágenes se generan con Flux (Pollinations). Sin servicios externos de pago.
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:3b';

// Idioma del prompt que se envía al generador de imágenes.
// 'es' (español) por defecto; se puede cambiar a 'en' en el .env.
const IMAGE_PROMPT_LANG = process.env.IMAGE_PROMPT_LANG || 'es';

// Error amable para el usuario final: se muestra tal cual en el frontend,
// en vez del genérico "Error interno del servidor".
function errorIA(mensaje) {
    const error = new Error(mensaje);
    error.status = 502;
    error.exposeMessage = true;
    return error;
}

// Chat de texto con Ollama local (gratis, sin cuota). No acepta imágenes.
async function ollamaChat(contents, systemPrompt, maxOutputTokens = 1024) {
    const messages = [];
    for (const c of contents || []) {
        const partesTexto = (c.parts || [])
            .filter((p) => p.text && !p.inlineData)
            .map((p) => p.text);
        if (!partesTexto.length) continue;
        messages.push({
            role: c.role === 'model' ? 'assistant' : c.role || 'user',
            content: partesTexto.join('\n'),
        });
    }
    if (!messages.length) throw new Error('No hay texto que enviar a Ollama.');

    if (systemPrompt) messages.unshift({ role: 'system', content: systemPrompt });

    let res;
    try {
        res = await fetch(OLLAMA_URL + '/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: OLLAMA_MODEL,
                messages,
                stream: false,
                options: { num_predict: maxOutputTokens },
            }),
            signal: AbortSignal.timeout(240000),
        });
    } catch {
        throw errorIA('La IA local (Ollama) no responde. Abre el programa Ollama y vuelve a intentarlo.');
    }

    if (!res.ok) {
        const t = await res.text().catch(() => '');
        console.error('Ollama HTTP ' + res.status, t.slice(0, 200));
        throw errorIA('La IA local está teniendo problemas justo ahora. Espera unos segundos e inténtalo de nuevo.');
    }

    const data = await res.json().catch(() => ({}));
    const texto = data.message?.content;
    if (!texto || !String(texto).trim()) {
        throw errorIA('La IA local no pudo generar una respuesta. Inténtalo de nuevo.');
    }
    return String(texto).trim();
}

// Punto de entrada de texto 100% local (Ollama).
const ollamaText = ollamaChat;

// Convierte el historial guardado en mensajes para Ollama.
// IMPORTANTE: la última vuelta debe ser "user".
// Une turnos consecutivos del mismo rol en un solo turno.
function buildContents(history, userMessage) {
    const contents = [];
    let lastRole = null;

    const push = (role, text) => {
        if (role === lastRole) {
            contents[contents.length - 1].parts[0].text += '\n' + text;
            return;
        }
        contents.push({ role, parts: [{ text }] });
        lastRole = role;
    };

    for (const m of history || []) {
        push(m.role === 'assistant' ? 'model' : 'user', m.content);
    }
    push('user', userMessage);
    return contents;
}

const CHAT_SYSTEM_PROMPT = `
Eres el asistente virtual oficial de KAT Tattoo Studio, un estudio de tatuajes.
Responde en español, de forma amable, cercana y profesional.
Puedes ayudar con:
- Información general del estudio, servicios y precios aprox.
- Cuidados posteriores (aftercare) de un tatuaje.
- Consejos para elegir diseño, tamaño y ubicación.
- Cómo reservar una cita (indícalo al cliente).
Si te preguntan algo fuera de estos temas, redirige amablemente al tema del estudio.
Sé breve pero útil (máximo 150 palabras por respuesta).
`.trim();

// Llamada con historial (usada por el chat)
async function chatWithAssistant(history, userMessage) {
    const contents = buildContents(history, userMessage);
    return ollamaChat(contents, CHAT_SYSTEM_PROMPT);
}

// Análisis de una imagen de referencia (RF05).
// 100% local: visión (qwen2.5vl) + redacción con Ollama.
async function analyzeReference(imageBase64, mimeType, description) {
    const task = description
        ? `Analiza esta imagen de referencia para un tatuaje. Información del cliente: ${description}.`
        : 'Analiza esta imagen de referencia para un tatuaje.';

    const system = `
Analiza la imagen de referencia de un tatuaje y responde en español con este formato:
- ELEMENTOS: describe los elementos principales del diseño.
- ESTILO: estilo de tatuaje (blackwork, fine line, realista, tradicional, color, etc.).
- PALETA: colores o tonos sugeridos.
- ZONA SUGERIDA: partes del cuerpo donde se vería mejor.
- TAMAÑO APROX: rango de tamaño recomendado.
- OBSERVACIONES: notas adicionales para el artista.
`.trim();

    return ollamaVisionChat(system, task, imageBase64, 1024);
}

// Generación de propuestas de diseño (RF06).
// Mismo esquema que analyzeReference: visión local (Qwen) con Ollama.
async function generateProposal(imageBase64, mimeType, requirements) {
    const task = requirements
        ? `Genera propuestas de diseño. Requisitos del cliente: ${requirements}`
        : 'Genera propuestas de diseño a partir de esta referencia.';

    const system = `
Actúa como un tatuador profesional del estudio KAT Tattoo Studio.
Genera 2-3 propuestas concretas de tatuaje a partir de la imagen de referencia.
Para cada propuesta da: nombre, descripción, estilo, elementos a modificar/agregar, y costo estimado en COP.
Responde en español con el formato:
PROPUESTA 1
- Nombre: ...
- Descripción: ...
- Estilo: ...
- Cambios respecto a la referencia: ...
- Costo estimado: ...
`.trim();

    return ollamaVisionChat(system, task, imageBase64, 1024);
}

// Propuestas de diseño a partir de UNA IDEA de texto (sin imagen de referencia).
// Usa texto local (Ollama); 100% gratis como el resto.
async function generateIdeaProposals(idea) {
    const system = `
Actúa como un tatuador profesional del estudio KAT Tattoo Studio.
A partir de la idea del cliente, genera 2-3 propuestas concretas y creativas de tatuaje.
Para cada propuesta da: nombre, descripción (qué se tatuaría y cómo), estilo, paleta de colores sugerida, ubicación en el cuerpo y costo estimado en COP.
Responde en español con el formato:
PROPUESTA 1
- Nombre: ...
- Descripción: ...
- Estilo: ...
- Paleta: ...
- Ubicación: ...
- Costo estimado: ...
`.trim();

    const contents = [{
        role: 'user',
        parts: [{ text: `Idea del cliente para un tatuaje: ${idea}` }],
    }];
    return ollamaText(contents, system, 1024);
}

// ============================================================
// GENERACIÓN DE IMÁGENES (Flux vía Pollinations, sin API key)
// ============================================================

// Pollinations: gratis, sin clave. Sus errores (402 "queue full", 500) son
// transitorios por rate-limit/cola en IPs compartidas; se reintenta cambiando
// el seed con esperas progresivas cada vez más largas.
async function pollinationsImage(prompt) {
    const maxIntentos = 6;
    let ultimoError = 'error desconocido';
    let res = null;
    for (let intento = 1; intento <= maxIntentos; intento++) {
        const url =
            'https://image.pollinations.ai/prompt/' + encodeURIComponent(prompt) +
            `?width=1024&height=1024&seed=${Math.floor(Math.random() * 99999)}&model=flux&nologo=true`;
        try {
            res = await fetch(url, { signal: AbortSignal.timeout(120000) });
            if (!res.ok) {
                ultimoError = 'HTTP ' + res.status;
            } else {
                const ctype = res.headers.get('content-type') || '';
                if (!ctype.includes('image')) {
                    ultimoError = 'no devolvió imagen (' + ctype + ')';
                } else {
                    const buf = Buffer.from(await res.arrayBuffer());
                    if (buf.length < 2000) {
                        ultimoError = 'imagen demasiado pequeña (' + buf.length + ' bytes)';
                    } else {
                        return {
                            mimeType: ctype.includes('jpeg') ? 'image/jpeg' : ctype.includes('webp') ? 'image/webp' : 'image/png',
                            base64: buf.toString('base64'),
                            text: null,
                        };
                    }
                }
            }
        } catch (fetchErr) {
            ultimoError = fetchErr.message;
        }
        if (intento < maxIntentos) {
            // 402 = cola llena; hay que esperar más que un simple error 5xx.
            const espera = (res && res.status === 402 ? 5000 : 2500) * intento;
            console.warn(`Pollinations intento ${intento}/${maxIntentos} falló (${ultimoError}). Reintentando en ${Math.round(espera / 1000)}s...`);
            await new Promise((r) => setTimeout(r, espera));
        }
    }
    throw new Error('Pollinations falló tras ' + maxIntentos + ' intentos: ' + ultimoError);
}

// Los generadores texto→imagen (Pollinations) NO ven la imagen de
// referencia: solo leen el texto. Un prompt con basura de formateo
// ("PROPUESTA 1 - Nombre: ...") produce imágenes deformes. Este limpiador
// extrae lo esencial y lo compacta a un párrafo corto y claro.
function cleanImagePrompt(prompt) {
    return String(prompt || '')
        .replace(/\r/g, ' ')
        .split('\n')
        .map((l) => l.replace(/^[-*•]\s*(Nombre|Descripci[oó]n|Estilo|Cambios|Costo|costo)[^:]*:/i, ''))
        .map((l) => l.replace(/\s{2,}/g, ' ').trim())
        .filter(Boolean)
        .join(' ')
        .replace(/PROPUESTA\s*\d+/gi, '')
        .slice(0, 700);
}

// Lista de modelos de visión locales (Ollama) por orden de preferencia.
// qwen2.5vl:3b es el elegido por el usuario; moondream es más ligero.
// Se puede forzar uno con OLLAMA_VISION_MODEL en el .env.
// Devuelve null si ninguno está disponible.
async function ollamaVisionModel() {
    const preferido = process.env.OLLAMA_VISION_MODEL;
    const candidatos = preferido
        ? [preferido]
        : ['qwen2.5vl', 'moondream', 'llava', 'llama3.2-vision', 'gemma3'];
    try {
        const res = await fetch(OLLAMA_URL + '/api/tags', { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return null;
        const data = await res.json().catch(() => ({}));
        const names = (data.models || []).map((m) => m.name);
        for (const candidato of candidatos) {
            const match = names.find((n) => n === candidato || n.startsWith(candidato + ':'));
            if (match && (await ollamaHasVision(match))) return match;
        }
        return null;
    } catch {
        return null;
    }
}

// Confirma que un modelo Ollama realmente ve imágenes ("vision").
async function ollamaHasVision(model) {
    try {
        const res = await fetch(OLLAMA_URL + '/api/show', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model }),
            signal: AbortSignal.timeout(8000),
        });
        const data = await res.json().catch(() => ({}));
        return !!(data.capabilities || []).includes('vision');
    } catch {
        return true;
    }
}

// Tarea completa de visión + texto en local (gratis): qwen2.5vl describe y
// razona sobre la imagen. Devuelve un error amable si no hay visión.
async function ollamaVisionChat(systemPrompt, userText, imageBase64, maxOutputTokens = 1024) {
    const vision = await ollamaVisionModel();
    if (!vision) {
        throw errorIA('No hay modelo de IA de visión instalado. Instala qwen2.5vl:3b en Ollama.');
    }
    let res;
    try {
        res = await fetch(OLLAMA_URL + '/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: vision,
                stream: false,
                options: { temperature: 0.4, num_predict: maxOutputTokens },
                messages: [{
                    role: 'user',
                    content: (systemPrompt + '\n\n' + userText).trim(),
                    images: [imageBase64],
                }],
            }),
            signal: AbortSignal.timeout(300000),
        });
    } catch {
        throw errorIA('La IA de visión local no responde. Verifica que Ollama esté abierto y vuelve a intentarlo.');
    }
    if (!res.ok) {
        throw errorIA('La IA de visión local falló (HTTP ' + res.status + '). Espera un momento e inténtalo de nuevo.');
    }
    const data = await res.json().catch(() => ({}));
    const texto = data.message?.content;
    if (!texto || !String(texto).trim()) {
        throw errorIA('La IA de visión no pudo analizar la imagen. Inténtalo de nuevo.');
    }
    return String(texto).trim();
}

// Describe la imagen de referencia con un modelo de visión local (gratis).
// Devuelve la descripción en el idioma configurado (IMAGE_PROMPT_LANG).
async function ollamaDescribeImage(imageBase64) {
    const vision = await ollamaVisionModel();
    if (!vision) return null;
    const en = IMAGE_PROMPT_LANG === 'en';
    const res = await fetch(OLLAMA_URL + '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: vision,
            stream: false,
            options: { temperature: 0.2, num_predict: 300 },
            messages: [{
                role: 'user',
                content: en
                    ? 'Describe in English, in detail, what is in this image: the main subject, its style, colors, composition and any small details. This description will be used as a prompt for an AI that will create a tattoo design inspired by it.'
                    : 'Describe en español, con detalle, qué hay en esta imagen: el elemento principal, su estilo, colores, composición y cualquier detalle pequeño. La usaré como prompt para una IA que creará un diseño de tatuaje inspirado en ella.',
                images: [imageBase64],
            }],
        }),
        signal: AbortSignal.timeout(300000),
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    const texto = data.message?.content;
    return texto && String(texto).trim() ? String(texto).trim().slice(0, 400) : null;
}

// Generación de imágenes con Flux (Pollinations, gratis, sin clave).
// Si hay imagen de referencia y hay un modelo de visión local, se genera una
// descripción de la foto y se combina con el prompt del usuario, para que el
// diseño resultante SÍ corresponda a lo que el cliente quiere.
async function generateImage(prompt, imageBase64, mimeType) {
    let promptLimpio = cleanImagePrompt(prompt);
    const en = IMAGE_PROMPT_LANG === 'en';
    if (imageBase64 && typeof imageBase64 === 'string' && imageBase64.length > 100) {
        try {
            const descripcion = await ollamaDescribeImage(imageBase64);
            if (descripcion) {
                promptLimpio = en
                    ? `Professional tattoo design inspired by this reference image: ${descripcion}. Desired design: ${promptLimpio}. Tattoo on skin, clean lines, detailed shading, plain neutral background, no text, no watermark.`
                    : `Diseño de tatuaje profesional inspirado en esta imagen de referencia: ${descripcion}. Diseño deseado: ${promptLimpio}. Tatuaje sobre la piel, líneas limpias, sombreado detallado, fondo neutro, sin texto, sin marca de agua.`;
            }
        } catch (visErr) {
            console.warn('Visión local no disponible (' + visErr.message + '); se usa el prompt tal cual.');
        }
    }
    try {
        return await pollinationsImage(promptLimpio);
    } catch (pollErr) {
        console.error('Flux (Pollinations) falló:', pollErr.message);
        const error = new Error(
            'El generador de imágenes Flux no respondió. Inténtalo en unos segundos; si el problema persiste, revisa tu conexión a Internet.'
        );
        error.status = 502;
        throw error;
    }
}

module.exports = {
    ollamaText,
    chatWithAssistant,
    analyzeReference,
    generateProposal,
    generateIdeaProposals,
    generateImage,
    getOrCreateConversation: async (sessionId) => {
        const { rows } = await pool.query(
            `INSERT INTO ai_conversations (session_id)
             VALUES ($1)
             ON CONFLICT (session_id) DO UPDATE SET updated_at = NOW()
             RETURNING *`,
            [sessionId]
        );
        return rows[0];
    },
    getHistory: async (conversationId, limit = 12) => {
        const { rows } = await pool.query(
            `SELECT role, content FROM ai_messages
             WHERE conversation_id = $1
             ORDER BY id DESC LIMIT $2`,
            [conversationId, limit]
        );
        return rows.reverse();
    },
    saveMessage: async (conversationId, role, content) => {
        await pool.query(
            `INSERT INTO ai_messages (conversation_id, role, content) VALUES ($1, $2, $3)`,
            [conversationId, role, content]
        );
        await pool.query(
            `UPDATE ai_conversations SET updated_at = NOW() WHERE id = $1`,
            [conversationId]
        );
    },
};
