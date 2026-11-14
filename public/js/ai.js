/* ============================================================
   KAT TATTOO - Asistente IA (widget flotante + página completa)
   Se conecta al backend /api/ai/chat (IA local de Ollama)
============================================================ */

const boton = document.getElementById('ia-widget-boton');
const widget = document.getElementById('ia-widget');
const msgsEl = document.getElementById('ia-msgs');
const inputEl = document.getElementById('ia-input');
const enviarBtn = document.getElementById('ia-enviar');
const sugerenciasEl = document.getElementById('ia-sugerencias');

// ---- Widget flotante (solo en index) ----
if (boton && widget) {
    boton.addEventListener('click', () => {
        widget.classList.toggle('abierto');
        if (widget.classList.contains('abierto')) inputEl.focus();
    });
}

// ---- Utilidades ----
function addMsg(role, text) {
    const div = document.createElement('div');
    div.className = 'mensaje ' + role;
    div.textContent = text;
    msgsEl.appendChild(div);
    msgsEl.scrollTop = msgsEl.scrollHeight;
    return div;
}

function addTyping() {
    const div = document.createElement('div');
    div.className = 'mensaje assistant typing';
    div.innerHTML = '<span class="typing-dots"><span></span><span></span><span></span></span>';
    msgsEl.appendChild(div);
    msgsEl.scrollTop = msgsEl.scrollHeight;
    return div;
}

let sessionId = sessionStorage.getItem('kat_session') ||
    ('sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8));
sessionStorage.setItem('kat_session', sessionId);

// ---- Envío ----
async function enviarMensaje(texto) {
    const msg = (texto || '').trim();
    if (!msg) return;

    addMsg('user', msg);
    inputEl.value = '';
    enviarBtn.disabled = true;

    const typing = addTyping();

    try {
        const res = await fetch('/api/ai/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: msg, session_id: sessionId }),
        });
        const data = await res.json();
        typing.remove();

        if (!res.ok) {
            addMsg('assistant', '⚠️ ' + (data.error || 'Error al conectar con el asistente.'));
            return;
        }
        addMsg('assistant', data.reply);
    } catch (err) {
        typing.remove();
        addMsg('assistant', '⚠️ No se pudo conectar con el servidor. Intenta de nuevo.');
    } finally {
        enviarBtn.disabled = false;
    }
}

if (enviarBtn) {
    enviarBtn.addEventListener('click', () => enviarMensaje(inputEl.value));
}

if (inputEl) {
    inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') enviarMensaje(inputEl.value);
    });
}

// ---- Sugerencias ----
if (sugerenciasEl) {
    sugerenciasEl.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON' && e.target.dataset.text) {
            enviarMensaje(e.target.dataset.text);
        }
    });
}