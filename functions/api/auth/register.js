// ============================================================
// functions/api/auth/register.js
// POST /api/auth/register
// Crea un nuevo usuario con email + contraseña
// ============================================================

import { generateId, generateToken, hashPassword } from '../../lib/jwt.js';
import { created, badRequest, conflict, serverError, preflight } from '../../lib/response.js';

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
      await sendVerificationEmail({
        to:      emailLower,
        name:    name?.trim(),
        token:   verifyToken,
        appUrl:  env.APP_URL || 'https://edustrader.pages.dev',
        apiKey:  env.RESEND_API_KEY,
      });
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

// ------------------------------------------------------------
// Email de verificación via Resend
// ------------------------------------------------------------
async function sendVerificationEmail({ to, name, token, appUrl, apiKey }) {
  const verifyUrl = `${appUrl}/api/auth/verify-email?token=${token}`;
  const firstName = name?.split(' ')[0] || 'Trader';

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from:    'EduS Trader <noreply@edustrader.pages.dev>',
      to:      [to],
      subject: 'Verifica tu cuenta — EduS Trader',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
          <h2 style="color:#3dd6c0">Bienvenido, ${firstName}</h2>
          <p>Haz clic para verificar tu cuenta en EduS Trader:</p>
          <a href="${verifyUrl}" style="display:inline-block;margin:16px 0;padding:12px 24px;
             background:#3dd6c0;color:#0f172a;border-radius:8px;text-decoration:none;font-weight:700">
            Verificar mi cuenta →
          </a>
          <p style="font-size:12px;color:#64748b">Expira en 24 h. Si no creaste esta cuenta, ignora este email.</p>
        </div>`,
    }),
  });
}
