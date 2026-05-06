// ============================================================
// functions/api/auth/reset-password.js
// POST /api/auth/reset-password
// Valida el token y cambia la clave del usuario
// ============================================================

import { hashPassword } from '../../lib/jwt.js';
import { ok, badRequest, unauthorized, serverError, preflight } from '../../lib/response.js';

export async function onRequestOptions() { return preflight(); }

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); }
  catch { return badRequest('JSON invalido'); }

  const { token, password } = body;
  if (!token || !password) return badRequest('Token y nueva contraseña son obligatorios');

  // Validar contraseña fuerte
  if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return badRequest('La contraseña debe tener al menos 8 caracteres, una mayúscula y un número.');
  }

  try {
    // 1. Buscar token válido
    const record = await env.DB.prepare(`
      SELECT user_id FROM email_verifications 
      WHERE token = ? AND type = 'reset_password' AND expires_at > datetime('now')
    `).bind(token).first();

    if (!record) {
      return unauthorized('El enlace es inválido o ha expirado. Por favor solicita uno nuevo.');
    }

    // 2. Hashear nueva contraseña
    const passwordHash = await hashPassword(password);

    // 3. Actualizar usuario
    await env.DB.prepare(`
      UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?
    `).bind(passwordHash, record.user_id).run();

    // 4. Eliminar token usado
    await env.DB.prepare(`
      DELETE FROM email_verifications WHERE token = ?
    `).bind(token).run();

    return ok({ message: 'Contraseña actualizada correctamente.' });
  } catch (err) {
    console.error('Error en reset-password:', err);
    return serverError('Error interno del servidor');
  }
}
