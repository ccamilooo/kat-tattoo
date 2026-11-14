// ============================================================
//  ENVÍO DE CORREO
//  Proveedor principal: Resend (API key). Respaldo: SMTP básico.
// ============================================================
const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '465', 10);
const SMTP_SECURE = process.env.SMTP_SECURE !== 'false';
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

const RESEND_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.MAIL_FROM || 'onboarding@resend.dev';
const FROM_NAME = process.env.MAIL_FROM_NAME || 'KAT Tattoo Studio';

const correoConfigurado = Boolean(RESEND_KEY || (SMTP_HOST && SMTP_USER && SMTP_PASS));

let transporter = null;
if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_SECURE,
        auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
}

async function enviarCorreo(to, subject, html) {
    if (!correoConfigurado) {
        const err = new Error('Correo no configurado: falta RESEND_API_KEY o SMTP_* en .env');
        err.code = 'EMAIL_NOT_CONFIGURED';
        throw err;
    }

    if (RESEND_KEY) {
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + RESEND_KEY,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: `"${FROM_NAME}" <${FROM}>`,
                to: [to],
                subject,
                html,
            }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            const err = new Error(data.message || `Resend HTTP ${res.status}`);
            err.code = 'RESEND_ERROR';
            throw err;
        }
        return true;
    }

    await transporter.sendMail({
        from: `"${FROM_NAME}" <${SMTP_USER}>`,
        to,
        subject,
        html,
    });
    return true;
}

async function enviarCodigoReset(to, code) {
    const html = `
        <div style="font-family:Montserrat,Arial,sans-serif; background:#0a050f; color:#e3d6e6; padding:32px; border-radius:14px; max-width:520px; margin:0 auto;">
            <div style="text-align:center; margin-bottom:20px;">
                <span style="font-size:36px;">🔐</span>
                <h2 style="color:#c96be3; margin:8px 0 0;">KAT Tattoo Studio</h2>
            </div>
            <p>Hola,</p>
            <p>Recibimos una solicitud para restablecer tu contraseña. Usa este código de seguridad:</p>
            <div style="text-align:center; margin:24px 0;">
                <span style="font-size:30px; font-weight:700; letter-spacing:8px; color:#fff; background:#6D0387; padding:12px 20px; border-radius:12px;">${code}</span>
            </div>
            <p style="color:#9c8fa1; font-size:13px;">El código es válido por <b>15 minutos</b>. Si no solicitaste este cambio, ignora este correo.</p>
            <p style="color:#9c8fa1; font-size:12px; margin-top:24px;">Este es un mensaje automático, no respondas a este correo.</p>
        </div>`;
    return enviarCorreo(to, 'Tu código para restablecer la contraseña · KAT Tattoo', html);
}

module.exports = { enviarCodigoReset, enviarCorreo, correoConfigurado };