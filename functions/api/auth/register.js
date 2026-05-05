// ============================================================
// functions/api/auth/register.js
// POST /api/auth/register
// Crea un nuevo usuario con email + contraseña
// ============================================================

import { generateId, generateToken, hashPassword } from '../../lib/jwt.js';
import { created, badRequest, conflict, serverError, preflight } from '../../lib/response.js';
import { sendVerificationEmail } from '../../lib/emails.js';

export async function onRequestOptions() {
  return preflight();
}

export async function onRequestPost({ request, env }) {
  // 1. Parsear body
  let body;
  try { body = await request.json(); }
  catch { return badRequest('El cuerpo de la petición no es JSON válido'); }

  const { email, password, name } = body;

  // 2. Validar campos
  const errors = validateRegister({ email, password });
  if (errors.length > 0) return badRequest(errors[0]);

  const emailLower = email.toLowerCase().trim();

  try {
    // 3. Verificar que el email no exista ya
    const existing = await env.DB.prepare(
      'SELECT id FROM users WHERE email = ?'
    ).bind(emailLower).first();

    if (existing) return conflict('Este email ya está registrado. ¿Quieres iniciar sesión?');

    // 4. Hash de contraseña + crear usuario
    const passwordHash = await hashPassword(password);
    const userId       = generateId();

    await env.DB.prepare(`
      INSERT INTO users (id, email, password_hash, name, plan, status, email_verified)
      VALUES (?, ?, ?, ?, 'free', 'active', 0)
    `).bind(userId, emailLower, passwordHash, name?.trim() || null).run();

    // 5. Token de verificación de email (24 h)
    const verifyToken = generateToken(32);
    const tokenId     = generateId();
    const expiresAt   = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

    await env.DB.prepare(`
      INSERT INTO email_verifications (id, user_id, token, type, expires_at)
      VALUES (?, ?, ?, 'verify_email', ?)
    `).bind(tokenId, userId, verifyToken, expiresAt).run();

    // 6. Enviar email de verificación si RESEND_API_KEY está configurada
    if (env.RESEND_API_KEY) {
      // No bloqueamos el registro si el email falla — el usuario puede reenviar
      sendVerificationEmail({
        to:     emailLower,
        name:   name?.trim(),
        token:  verifyToken,
        appUrl: env.APP_URL || 'https://edustrader.pages.dev',
        apiKey: env.RESEND_API_KEY,
        from:   env.EMAIL_FROM || 'onboarding@resend.dev',
      }).catch(err => console.error('[Email] Error enviando verificación:', err));
    }

    return created({
      message:       'Cuenta creada. Revisa tu email para verificarla.',
      userId,
      emailVerified: false,
    });

  } catch (err) {
    console.error('Error en register:', err);
    return serverError('No se pudo crear la cuenta. Inténtalo de nuevo.');
  }
}

// ------------------------------------------------------------
// Validación
// ------------------------------------------------------------
function validateRegister({ email, password }) {
  const errors = [];
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    errors.push('El email no tiene un formato válido');
  if (!password || password.length < 8)
    errors.push('La contraseña debe tener al menos 8 caracteres');
  else if (!/[A-Z]/.test(password) || !/[0-9]/.test(password))
    errors.push('La contraseña debe incluir al menos una mayúscula y un número');
  return errors;
}
