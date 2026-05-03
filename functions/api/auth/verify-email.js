// ============================================================
// functions/api/auth/verify-email.js
// GET /api/auth/verify-email?token=XXX
// Activa el email del usuario y redirige al portal
// ============================================================

import { redirect, badRequest, serverError } from '../../lib/response.js';

export async function onRequestGet({ request, env }) {
  const url   = new URL(request.url);
  const token = url.searchParams.get('token');

  if (!token) return badRequest('Token inválido');

  try {
    // 1. Buscar el token en DB
    const record = await env.DB.prepare(`
      SELECT id, user_id, expires_at, used_at
      FROM email_verifications
      WHERE token = ? AND type = 'verify_email'
    `).bind(token).first();

    if (!record)           return redirect('/members/?error=invalid_token');
    if (record.used_at)    return redirect('/members/?error=token_already_used');
    if (new Date(record.expires_at) < new Date())
                           return redirect('/members/?error=token_expired');

    // 2. Marcar email como verificado
    await env.DB.prepare(`
      UPDATE users SET email_verified = 1 WHERE id = ?
    `).bind(record.user_id).run();

    // 3. Marcar token como usado
    await env.DB.prepare(`
      UPDATE email_verifications SET used_at = datetime('now') WHERE id = ?
    `).bind(record.id).run();

    return redirect('/members/?verified=1');

  } catch (err) {
    console.error('Error en verify-email:', err);
    return serverError();
  }
}
