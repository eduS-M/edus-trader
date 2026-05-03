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
        u.id, u.email, u.name, u.plan, u.plan_expires_at,
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

  const { id, status, plan } = body;
  if (!id) return badRequest('ID de usuario requerido');

  const user = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(id).first();
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

  if (!updates.length) return badRequest('Nada que actualizar');
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
