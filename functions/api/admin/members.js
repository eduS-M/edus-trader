// ============================================================
// functions/api/admin/members.js
// GET /api/admin/members        → listar todos los usuarios
// PUT /api/admin/members        → cambiar status de un usuario
// Solo accesible con rol admin en el JWT.
// ============================================================

import { verifyJWT }                                          from '../../lib/jwt.js';
import { ok, badRequest, unauthorized, notFound,
         serverError, preflight }                             from '../../lib/response.js';

export async function onRequestOptions() { return preflight(); }

async function requireAdmin(request, env) {
  const token = getCookie(request, 'edus_jwt');
  if (!token) return null;
  try {
    const claims = await verifyJWT(token, env.JWT_SECRET);
    return claims?.role === 'admin' ? claims : null;
  } catch { return null; }
}

// ── GET: listar usuarios ─────────────────────────────────────
export async function onRequestGet({ request, env }) {
  if (!await requireAdmin(request, env)) return unauthorized('Solo administradores');

  try {
    const { results } = await env.DB.prepare(`
      SELECT
        u.id, u.email, u.name, u.plan, u.plan_expires_at, u.role,
        u.status, u.email_verified, u.created_at, u.last_login_at,
        s.billing_cycle, s.current_period_end, s.status AS sub_status
      FROM users u
      LEFT JOIN subscriptions s ON s.user_id = u.id
      WHERE u.status != 'deleted'
      ORDER BY u.created_at DESC
      LIMIT 500
    `).all();

    return ok({ members: results });
  } catch (err) {
    console.error('Error listando miembros:', err);
    return serverError();
  }
}

// ── PUT: actualizar status de usuario ────────────────────────
export async function onRequestPut({ request, env }) {
  if (!await requireAdmin(request, env)) return unauthorized('Solo administradores');

  let body;
  try { body = await request.json(); }
  catch { return badRequest('JSON inválido'); }

  const { id, status, plan, role, send_reset_password } = body;
  if (!id) return badRequest('ID de usuario requerido');

  const user = await env.DB.prepare('SELECT id, email, name FROM users WHERE id = ?').bind(id).first();
  if (!user) return notFound('Usuario no encontrado');

  const updates = [];
  const values  = [];

  if (status && ['active','suspended'].includes(status)) {
    updates.push('status = ?');
    values.push(status);
  }
  if (plan && ['free','basic','pro','premium'].includes(plan)) {
    updates.push('plan = ?');
    values.push(plan);
  }
  if (role && ['member','admin'].includes(role)) {
    updates.push('role = ?');
    values.push(role);
  }

  if (send_reset_password) {
    // Generate token and send email
    const { generateId } = await import('../../lib/jwt.js');
    const { sendPasswordResetEmail } = await import('../../lib/emails.js');
    const token = generateId() + generateId();
    await env.DB.prepare(
      "INSERT INTO email_verifications (id, user_id, token, type, expires_at) VALUES (?, ?, ?, 'reset_password', datetime('now', '+1 hour'))"
    ).bind(generateId(), id, token).run();
    
    // Call email API
    const baseUrl = env.APP_URL || new URL(request.url).origin;
    if (env.RESEND_API_KEY) {
      await sendPasswordResetEmail({
        to: user.email,
        name: user.name,
        token: token,
        appUrl: baseUrl,
        apiKey: env.RESEND_API_KEY,
        from: env.EMAIL_FROM || 'EduS Trader <noreply@edustrader.com>'
      }).catch(e => console.error("Error sending reset email:", e));
    } else {
      console.warn("No RESEND_API_KEY configured. Email not sent.");
    }
  }

  if (!updates.length) {
    if (send_reset_password) return ok({ message: 'Correo de recuperación enviado' });
    return badRequest('Nada que actualizar');
  }
  values.push(id);

  try {
    await env.DB.prepare(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...values).run();
    return ok({ message: 'Usuario actualizado' });
  } catch (err) {
    console.error('Error actualizando usuario:', err);
    return serverError();
  }
}

function getCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  const match  = header.split(';').map(c => c.trim()).find(c => c.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : null;
}
