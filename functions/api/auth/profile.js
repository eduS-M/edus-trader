// ============================================================
// functions/api/auth/profile.js
// GET /api/auth/profile   → Obtiene los datos del perfil y sus pagos
// PUT /api/auth/profile   → Actualiza datos opcionales
// ============================================================

import { verifyJWT }                              from '../../lib/jwt.js';
import { ok, badRequest, unauthorized, serverError, preflight } from '../../lib/response.js';

export async function onRequestOptions() { return preflight(); }

export async function onRequestGet({ request, env }) {
  const token = getCookie(request, 'edus_jwt');
  if (!token) return unauthorized('No autenticado');

  let user;
  try {
    user = await verifyJWT(token, env.JWT_SECRET);
  } catch { return unauthorized('Sesion invalida'); }

  try {
    const profileData = await env.DB.prepare(
      'SELECT email, name, avatar_url, phone, country, address, tax_id, plan, plan_expires_at, created_at FROM users WHERE id = ?'
    ).bind(user.sub).first();

    if (!profileData) return unauthorized('Usuario no encontrado');

    const { results: payments } = await env.DB.prepare(
      "SELECT id, amount, currency, status, description, paid_at, gateway_invoice_url FROM payments WHERE user_id = ? ORDER BY paid_at DESC"
    ).bind(user.sub).all();

    return ok({ profile: profileData, payments });
  } catch (err) {
    console.error('Error obteniendo perfil:', err);
    return serverError();
  }
}

export async function onRequestPut({ request, env }) {
  const token = getCookie(request, 'edus_jwt');
  if (!token) return unauthorized('No autenticado');

  let user;
  try {
    user = await verifyJWT(token, env.JWT_SECRET);
  } catch { return unauthorized('Sesion invalida'); }

  let body;
  try { body = await request.json(); }
  catch { return badRequest('JSON invalido'); }

  const { name, phone, country, address, tax_id } = body;

  try {
    await env.DB.prepare(
      'UPDATE users SET name = ?, phone = ?, country = ?, address = ?, tax_id = ?, updated_at = datetime("now") WHERE id = ?'
    ).bind(name || null, phone || null, country || null, address || null, tax_id || null, user.sub).run();

    return ok({ message: 'Perfil actualizado' });
  } catch (err) {
    console.error('Error actualizando perfil:', err);
    return serverError();
  }
}

function getCookie(request, name) {
  const h = request.headers.get('Cookie') || '';
  const m = h.split(';').map(c => c.trim()).find(c => c.startsWith(`${name}=`));
  return m ? m.slice(name.length + 1) : null;
}
