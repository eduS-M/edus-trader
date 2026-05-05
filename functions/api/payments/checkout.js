import { verifyJWT, generateId } from '../../lib/jwt.js';
import { ok, badRequest, unauthorized, serverError } from '../../lib/response.js';
import { getPriceInCLP } from '../../lib/pricing.js';

export async function onRequestPost({ request, env }) {
  // 1. Verificar autenticación
  const token = getCookie(request, 'edus_jwt');
  if (!token) return unauthorized('Debes iniciar sesión para suscribirte');

  let user;
  try {
    user = await verifyJWT(token, env.JWT_SECRET);
  } catch {
    return unauthorized('Sesión inválida');
  }

  // 2. Parsear request
  let body;
  try { body = await request.json(); }
  catch { return badRequest('JSON inválido'); }

  const { plan, billing, coupon } = body;
  if (!plan || !billing) return badRequest('Plan y ciclo de facturación son requeridos');

  // 3. Obtener precio base
  let priceCLP = getPriceInCLP(plan, billing);
  if (priceCLP === null) return badRequest('Plan o ciclo no disponible');

  let appliedCoupon = null;

  // 4. Validar cupón si existe
  if (coupon) {
    try {
      const couponCode = coupon.trim().toUpperCase();
      const dbCoupon = await env.DB.prepare(
        'SELECT id, discount_type, discount_value, is_active FROM coupons WHERE code = ?'
      ).bind(couponCode).first();

      if (dbCoupon && dbCoupon.is_active === 1) {
        // En un caso real habría que verificar `max_uses`, `valid_until`, etc.
        appliedCoupon = dbCoupon;
        
        if (dbCoupon.discount_type === 'percent') {
          priceCLP = Math.round(priceCLP * (1 - (dbCoupon.discount_value / 100)));
        } else {
          // Si es un descuento fijo en USD, habría que convertirlo a CLP. 
          // Para simplificar, asumimos que todos son 'percent' por ahora, o hacemos la conversión.
          const discountCLP = Math.round(dbCoupon.discount_value * 950); // USD_TO_CLP
          priceCLP = Math.max(0, priceCLP - discountCLP);
        }
      }
    } catch (err) {
      console.error('Error validando cupón:', err);
    }
  }

  // 5. Si el precio es 0 (Cupón 100%), activar directamente
  if (priceCLP <= 0) {
    try {
      await activatePlanLocal(env.DB, user.sub, plan, billing, appliedCoupon?.id);
      return ok({ 
        url: '/members/portal/', 
        message: '¡Plan activado gratuitamente con cupón!' 
      });
    } catch (err) {
      console.error('Error activando plan gratuito:', err);
      return serverError('No se pudo activar el plan');
    }
  }

  // 6. Generar link de pago en MercadoPago
  // Si el ciclo es "lifetime", es un pago único (Preferences API).
  // Si no, es una suscripción (Preapproval API).
  
  const mpToken = env.MP_ACCESS_TOKEN;
  if (!mpToken) return serverError('Pasarela de pago no configurada');

  try {
    const origin = new URL(request.url).origin;
    const isLifetime = (billing === 'lifetime');

    if (isLifetime) {
      // API de Preferences (Pago Único)
      const preferenceBody = {
        items: [
          {
            title: `Plan ${plan.toUpperCase()} - Pago Único (EduS Trader)`,
            quantity: 1,
            unit_price: priceCLP,
            currency_id: 'CLP'
          }
        ],
        payer: {
          email: user.email
        },
        external_reference: `${user.sub}|${plan}|${billing}`,
        back_urls: {
          success: `${origin}/members/portal/?payment=success`,
          failure: `${origin}/pricing.html?payment=failed`,
          pending: `${origin}/members/portal/?payment=pending`
        },
        auto_return: 'approved'
      };

      const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mpToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(preferenceBody)
      });

      const mpData = await mpRes.json();
      if (!mpRes.ok) throw new Error(mpData.message || 'Error MP Preference');

      return ok({ url: mpData.init_point });

    } else {
      // API de Preapproval (Suscripciones)
      let freq = 1;
      let freqType = 'months';
      
      if (billing === 'annual') { freq = 12; }
      if (billing === 'defined') { freq = 3; } // 3 meses

      const preapprovalBody = {
        reason: `Plan ${plan.toUpperCase()} - ${billing} (EduS Trader)`,
        external_reference: `${user.sub}|${plan}|${billing}`,
        payer_email: user.email,
        auto_recurring: {
          frequency: freq,
          frequency_type: freqType,
          transaction_amount: priceCLP,
          currency_id: 'CLP'
        },
        back_url: `${origin}/members/portal/?payment=success`,
        status: 'pending'
      };

      const mpRes = await fetch('https://api.mercadopago.com/preapproval', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mpToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(preapprovalBody)
      });

      const mpData = await mpRes.json();
      if (!mpRes.ok) {
        console.error('Error MP Preapproval:', mpData);
        throw new Error(mpData.message || 'Error MP Preapproval');
      }

      return ok({ url: mpData.init_point });
    }

  } catch (err) {
    console.error('Error conectando con MercadoPago:', err);
    return serverError('No se pudo generar el link de pago');
  }
}

// Helper para obtener cookie
function getCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  const match  = header.split(';').map(c => c.trim())
    .find(c => c.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : null;
}

// Helper para activar plan directamente (cupones 100%)
async function activatePlanLocal(DB, userId, planId, billingCycle, couponId) {
  const subId = generateId();
  const periodStart = new Date().toISOString();
  
  // Calcular fin del período según ciclo
  let periodEnd = null;
  if (billingCycle !== 'lifetime') {
    const d = new Date();
    if (billingCycle === 'monthly') d.setMonth(d.getMonth() + 1);
    else if (billingCycle === 'annual') d.setFullYear(d.getFullYear() + 1);
    else if (billingCycle === 'defined') d.setMonth(d.getMonth() + 3);
    periodEnd = d.toISOString();
  }

  // Insertar o actualizar subscripción
  await DB.prepare(`
    INSERT INTO subscriptions 
      (id, user_id, plan_id, billing_cycle, status, current_period_start, current_period_end, coupon_id)
    VALUES (?, ?, ?, ?, 'active', ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      plan_id = excluded.plan_id,
      billing_cycle = excluded.billing_cycle,
      status = 'active',
      current_period_start = excluded.current_period_start,
      current_period_end = excluded.current_period_end,
      coupon_id = excluded.coupon_id,
      updated_at = datetime('now')
  `).bind(subId, userId, planId, billingCycle, periodStart, periodEnd, couponId || null).run();

  // Actualizar tabla users
  await DB.prepare(`
    UPDATE users SET plan = ?, plan_expires_at = ?, updated_at = datetime('now') WHERE id = ?
  `).bind(planId, periodEnd, userId).run();

  // Registrar un pago interno de $0 para tener el historial
  const paymentId = generateId();
  await DB.prepare(`
    INSERT INTO payments (
      id, user_id, amount, amount_refunded, currency, status, description,
      plan_id, billing_cycle, is_proration, coupon_id, discount_amount, paid_at
    ) VALUES (?, ?, 0, 0, 'USD', 'paid', ?, ?, ?, 0, ?, 0, datetime('now'))
  `).bind(
    paymentId, userId, 
    `Plan ${planId.toUpperCase()} (100% Descuento)`, 
    planId, billingCycle, couponId || null
  ).run();

  // Incrementar contador de usos del cupón
  if (couponId) {
    await DB.prepare(`
      UPDATE coupons SET uses_count = uses_count + 1 WHERE id = ?
    `).bind(couponId).run();
  }
}
