// ============================================================
// functions/api/payments/cancel.js
// POST /api/payments/cancel   → Cancela suscripción activa en MercadoPago
// ============================================================

import { verifyJWT }                              from '../../lib/jwt.js';
import { ok, badRequest, unauthorized, serverError, preflight } from '../../lib/response.js';

export async function onRequestOptions() { return preflight(); }

export async function onRequestPost({ request, env }) {
  const token = getCookie(request, 'edus_jwt');
  if (!token) return unauthorized('No autenticado');

  let user;
  try {
    user = await verifyJWT(token, env.JWT_SECRET);
  } catch { return unauthorized('Sesion invalida'); }

  try {
    // 1. Buscar subscripción activa pagada (no 100% descuento si no tiene MP)
    const sub = await env.DB.prepare(`
      SELECT id, gateway_subscription_id, plan_id 
      FROM subscriptions 
      WHERE user_id = ? AND status = 'active' AND gateway_subscription_id IS NOT NULL
    `).bind(user.sub).first();

    if (!sub) {
      return badRequest('No tienes una suscripción activa cancelable en MercadoPago');
    }

    // 2. Cancelar en MercadoPago Preapproval API
    const mpToken = env.MP_ACCESS_TOKEN;
    if (mpToken && sub.gateway_subscription_id) {
      const mpRes = await fetch(`https://api.mercadopago.com/preapproval/${sub.gateway_subscription_id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${mpToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: 'cancelled' })
      });

      if (!mpRes.ok) {
        const errData = await mpRes.json();
        console.error('Error cancelando en MP:', errData);
        // Si ya estaba cancelado en MP, continuamos para actualizar nuestra BD
        if (errData.status !== 404 && errData.status !== 400) {
           return serverError('Error al procesar cancelación con la pasarela de pago');
        }
      }
    }

    // 3. Actualizar BD
    await env.DB.prepare(`
      UPDATE subscriptions SET status = 'canceled', updated_at = datetime('now') WHERE id = ?
    `).bind(sub.id).run();

    // Nota: NO actualizamos plan_expires_at de `users`. El usuario retiene el acceso hasta el fin de ciclo.

    return ok({ message: 'Suscripción cancelada exitosamente' });
  } catch (err) {
    console.error('Error en cancelacion:', err);
    return serverError('Error interno');
  }
}

function getCookie(request, name) {
  const h = request.headers.get('Cookie') || '';
  const m = h.split(';').map(c => c.trim()).find(c => c.startsWith(`${name}=`));
  return m ? m.slice(name.length + 1) : null;
}
