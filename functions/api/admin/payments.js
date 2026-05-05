// ============================================================
// functions/api/admin/payments.js
// GET /api/admin/payments   → Listar historial de pagos
// ============================================================

import { verifyJWT }                              from '../../lib/jwt.js';
import { ok, unauthorized, serverError, preflight } from '../../lib/response.js';

export async function onRequestOptions() { return preflight(); }

export async function onRequestGet({ request, env }) {
  if (!await requireAdmin(request, env)) return unauthorized('Solo administradores');

  try {
    const { results } = await env.DB.prepare(`
      SELECT 
        p.id, p.amount, p.amount_refunded, p.currency, p.status, 
        p.description, p.plan_id, p.billing_cycle, p.paid_at,
        u.email, u.name
      FROM payments p
      JOIN users u ON u.id = p.user_id
      ORDER BY p.paid_at DESC
      LIMIT 500
    `).all();

    return ok({ payments: results });
  } catch (err) {
    console.error('Error listando pagos:', err);
    return serverError();
  }
}

async function requireAdmin(request, env) {
  const token = getCookie(request, 'edus_jwt');
  if (!token) return null;
  try {
    const c = await verifyJWT(token, env.JWT_SECRET);
    return c?.role === 'admin' ? c : null;
  } catch { return null; }
}

function getCookie(request, name) {
  const h = request.headers.get('Cookie') || '';
  const m = h.split(';').map(c => c.trim()).find(c => c.startsWith(`${name}=`));
  return m ? m.slice(name.length + 1) : null;
}
