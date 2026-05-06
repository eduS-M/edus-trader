// ============================================================
// functions/api/auth/forgot-password.js
// POST /api/auth/forgot-password
// Genera token y envía correo de recuperación si el email existe
// ============================================================

import { generateId, generateToken } from '../../lib/jwt.js';
import { ok, badRequest, serverError, preflight } from '../../lib/response.js';
import { sendPasswordResetEmail } from '../../lib/emails.js';

export async function onRequestOptions() { return preflight(); }

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); }
  catch { return badRequest('JSON invalido'); }

  const { email } = body;
  if (!email) return badRequest('Email es obligatorio');

  const emailLower = email.toLowerCase().trim();

  try {
    const user = await env.DB.prepare(
      'SELECT id, name, google_id FROM users WHERE email = ? AND status != "deleted"'
    ).bind(emailLower).first();

    // Por seguridad, siempre devolvemos "ok" aunque el correo no exista
    // para evitar "user enumeration attacks".
    if (!user) return ok({ message: 'Si el correo existe, recibirás instrucciones.' });

    // Si el usuario se registró con Google y no tiene password, no puede resetear.
    // (Opcional: enviar un correo diciendo "Inicia sesión con Google")
    if (user.google_id) {
      return ok({ message: 'Si el correo existe, recibirás instrucciones.' });
    }

    // 1. Invalidar tokens anteriores de este usuario
    await env.DB.prepare(
      'DELETE FROM email_verifications WHERE user_id = ? AND type = "reset_password"'
    ).bind(user.id).run();

    // 2. Crear nuevo token
    const token = generateToken(32);
    const tokenId = generateId();
    // Válido por 2 horas
    const expiresAt = new Date(Date.now() + 2 * 3600 * 1000).toISOString();

    await env.DB.prepare(`
      INSERT INTO email_verifications (id, user_id, token, type, expires_at)
      VALUES (?, ?, ?, 'reset_password', ?)
    `).bind(tokenId, user.id, token, expiresAt).run();

    // 3. Enviar email
    if (env.RESEND_API_KEY) {
      await sendPasswordResetEmail({
        to: emailLower,
        name: user.name,
        token,
        appUrl: env.APP_URL || 'https://edustrader.pages.dev',
        apiKey: env.RESEND_API_KEY,
        from: env.EMAIL_FROM || 'onboarding@resend.dev'
      }).catch(err => console.error('[Email] Error enviando reset password:', err));
    }

    return ok({ message: 'Si el correo existe, recibirás instrucciones.' });
  } catch (err) {
    console.error('Error en forgot-password:', err);
    return serverError('Error interno del servidor');
  }
}
