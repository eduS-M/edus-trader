import { ok, serverError, badRequest } from '../../lib/response.js';
import { generateId } from '../../lib/jwt.js';

export async function onRequestPost({ request, env }) {
  // 1. Obtener token
  const mpToken = env.MP_ACCESS_TOKEN;
  if (!mpToken) return serverError('Pasarela de pago no configurada');

  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest('JSON inválido');
  }

  // 2. Extraer tipo de evento y el ID
  // MercadoPago Webhooks envía `type` y `data.id`
  const type = body.type;
  const dataId = body.data?.id;

  if (!type || !dataId) {
    // Podría ser IPN, chequear query params
    const url = new URL(request.url);
    const topic = url.searchParams.get('topic');
    const id = url.searchParams.get('id');
    
    if (topic === 'payment' && id) {
      await processPayment(env, id, mpToken);
    }
    
    return ok({ message: 'Recibido' });
  }

  if (type === 'payment') {
    await processPayment(env, dataId, mpToken);
  }

  return ok({ message: 'Webhook procesado' });
}

async function processPayment(env, paymentId, mpToken) {
  try {
    // 1. Fetch de la información del pago de forma segura a la API de MP
    const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { 'Authorization': `Bearer ${mpToken}` }
    });
    
    if (!res.ok) {
      console.error('No se pudo obtener el pago desde MP:', paymentId);
      return;
    }
    
    const payment = await res.json();
    const status = payment.status;
    const externalReference = payment.external_reference;

    // Solo procesamos pagos aprobados
    if (status !== 'approved') return;
    
    if (!externalReference) return;

    // 2. Parsear el external_reference (ej: "user_id|pro|monthly")
    const parts = externalReference.split('|');
    if (parts.length < 3) return;

    const userId = parts[0];
    const planId = parts[1];
    const billingCycle = parts[2];

    // Evitar procesar el mismo pago dos veces (idempotencia)
    const existing = await env.DB.prepare('SELECT id FROM payments WHERE gateway_payment_id = ?').bind(paymentId.toString()).first();
    if (existing) return; // Ya lo procesamos

    // 3. Calcular fechas de suscripción
    const periodStart = new Date().toISOString();
    let periodEnd = null;
    
    if (billingCycle !== 'lifetime') {
      const d = new Date();
      if (billingCycle === 'monthly') d.setMonth(d.getMonth() + 1);
      else if (billingCycle === 'annual') d.setFullYear(d.getFullYear() + 1);
      else if (billingCycle === 'defined') d.setMonth(d.getMonth() + 3);
      periodEnd = d.toISOString();
    }

    // 4. Actualizar base de datos
    // A) Insertar el pago
    const internalPaymentId = generateId();
    await env.DB.prepare(`
      INSERT INTO payments (
        id, user_id, amount, currency, status, description, 
        plan_id, billing_cycle, gateway, gateway_payment_id, paid_at
      ) VALUES (?, ?, ?, ?, 'paid', ?, ?, ?, 'mercadopago', ?, ?)
    `).bind(
      internalPaymentId, userId, payment.transaction_amount, payment.currency_id,
      payment.description, planId, billingCycle, paymentId.toString(), payment.date_approved
    ).run();

    // B) Actualizar o insertar la suscripción
    const subId = generateId();
    await env.DB.prepare(`
      INSERT INTO subscriptions 
        (id, user_id, plan_id, billing_cycle, status, current_period_start, current_period_end)
      VALUES (?, ?, ?, ?, 'active', ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        plan_id = excluded.plan_id,
        billing_cycle = excluded.billing_cycle,
        status = 'active',
        current_period_start = excluded.current_period_start,
        current_period_end = excluded.current_period_end,
        updated_at = datetime('now')
    `).bind(subId, userId, planId, billingCycle, periodStart, periodEnd).run();

    // C) Actualizar el plan del usuario
    await env.DB.prepare(`
      UPDATE users SET plan = ?, plan_expires_at = ?, updated_at = datetime('now') WHERE id = ?
    `).bind(planId, periodEnd, userId).run();

    // D) Cancelar preapprovals viejas en MercadoPago
    if (billingCycle !== 'lifetime') {
      await cancelOldPreapprovals(env, userId, externalReference, mpToken);
    }

  } catch (err) {
    console.error('Error procesando webhook de MercadoPago:', err);
  }
}

async function cancelOldPreapprovals(env, userId, externalReference, mpToken) {
  try {
    const user = await env.DB.prepare('SELECT email FROM users WHERE id = ?').bind(userId).first();
    if (!user) return;

    const res = await fetch(`https://api.mercadopago.com/preapproval/search?payer_email=${user.email}&status=authorized`, {
      headers: { 'Authorization': `Bearer ${mpToken}` }
    });
    if (!res.ok) return;
    
    const data = await res.json();
    const preapprovals = data.results || [];

    // Sort descending by date_created (newest first)
    preapprovals.sort((a, b) => new Date(b.date_created).getTime() - new Date(a.date_created).getTime());

    let keptOne = false;
    for (const pre of preapprovals) {
      if (!keptOne && pre.external_reference === externalReference) {
        keptOne = true;
        // Guardar el ID de la suscripción activa
        await env.DB.prepare('UPDATE subscriptions SET gateway_sub_id = ?, gateway = ? WHERE user_id = ?')
          .bind(pre.id, 'mercadopago', userId).run();
      } else {
        // Cancelar las demás
        await fetch(`https://api.mercadopago.com/preapproval/${pre.id}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${mpToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ status: 'cancelled' })
        });
      }
    }
  } catch (err) {
    console.error('Error cancelando preapprovals viejas:', err);
  }
}
