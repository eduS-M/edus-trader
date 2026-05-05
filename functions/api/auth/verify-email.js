// ============================================================
// functions/api/auth/verify-email.js
// GET /api/auth/verify-email?token=XXX
// Activa el email del usuario, redirige al portal
// y envia email de confirmacion.
// ============================================================

import { redirect, badRequest, serverError }          from '../../lib/response.js';
import { sendEmailVerifiedConfirmation }               from '../../lib/emails.js';

export async function onRequestGet({ request, env }) {
  const url   = new URL(request.url);
  const token = url.searchParams.get('token');

  if (!token) return badRequest('Token inválido');

  try {
    // 1. Buscar el token en DB
    const record = await env.DB.prepare(`
      SELECT ev.id, ev.user_id, ev.expires_at, ev.used_at,
             u.email, u.name
      FROM   email_verifications ev
      JOIN   users u ON u.id = ev.user_id
      WHERE  ev.token = ? AND ev.type = 'verify_email'
    `).bind(token).first();

    if (!record)          return redirect('/members/?error=invalid_token');
    if (record.used_at)   return redirect('/members/?error=token_already_used');
    if (new Date(record.expires_at) < new Date())
                          return redirect('/members/?error=token_expired');

    // 2. Marcar email como verificado
    await env.DB.prepare(
      'UPDATE users SET email_verified = 1 WHERE id = ?'
    ).bind(record.user_id).run();

    // 3. Marcar token como usado
    await env.DB.prepare(
      `UPDATE email_verifications SET used_at = datetime('now') WHERE id = ?`
    ).bind(record.id).run();

    // 4. Enviar email de confirmacion (no bloqueante)
    if (env.RESEND_API_KEY) {
      sendEmailVerifiedConfirmation({
        to:     record.email,
        name:   record.name,
        appUrl: env.APP_URL || 'https://edustrader.pages.dev',
        apiKey: env.RESEND_API_KEY,
        from:   env.EMAIL_FROM || 'onboarding@resend.dev',
      }).catch(err => console.error('[Email] Error confirmacion verificacion:', err));
    }

    // 5. Redirigir al login con mensaje de exito
    return redirect('/members/?verified=1');

  } catch (err) {
    console.error('[verify-email] Error:', err);
    return serverError();
  }
}
