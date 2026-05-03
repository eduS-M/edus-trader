// ============================================================
// functions/api/coupons/validate.js
// POST /api/coupons/validate
// Valida un código de cupón y devuelve el descuento aplicable.
// No consume el cupón — eso ocurre solo al confirmar el pago.
// ============================================================

import { verifyJWT }                          from '../../lib/jwt.js';
import { ok, badRequest, notFound, tooManyRequests, serverError, preflight } from '../../lib/response.js';

export async function onRequestOptions() { return preflight(); }

export async function onRequestPost({ request, env }) {
  // ── 1. Parsear body ──────────────────────────────────────
  let body;
  try { body = await request.json(); }
  catch { return badRequest('JSON inválido'); }

  const { code, plan, billing } = body;

  if (!code || typeof code !== 'string') return badRequest('Código requerido');

  const codeNorm = code.trim().toUpperCase();
  if (codeNorm.length < 3 || codeNorm.length > 24)
    return badRequest('Código inválido');

  // ── 2. Obtener usuario actual (opcional — para validar uso por usuario) ──
  let userId = null;
  try {
    const token = getCookie(request, 'edus_jwt');
    if (token && env.JWT_SECRET) {
      const claims = await verifyJWT(token, env.JWT_SECRET);
      userId = claims?.sub ?? null;
    }
  } catch { /* no autenticado — igual validamos el cupón */ }

  try {
    // ── 3. Buscar cupón en DB ────────────────────────────────
    const coupon = await env.DB.prepare(`
      SELECT
        id, code, description,
        discount_type, discount_value,
        max_uses, uses_count, max_uses_per_user,
        applicable_plans, applicable_billing,
        valid_from, valid_until, is_active
      FROM coupons
      WHERE code = ?
    `).bind(codeNorm).first();

    if (!coupon)           return notFound('Cupón no encontrado');
    if (!coupon.is_active) return notFound('Este cupón ya no está activo');

    // ── 4. Validar fechas ────────────────────────────────────
    const now = new Date();
    if (coupon.valid_from  && new Date(coupon.valid_from)  > now)
      return badRequest('Este cupón aún no está vigente');
    if (coupon.valid_until && new Date(coupon.valid_until) < now)
      return badRequest('Este cupón ha expirado');

    // ── 5. Validar límite global de usos ─────────────────────
    if (coupon.max_uses !== null && coupon.uses_count >= coupon.max_uses)
      return tooManyRequests('Este cupón ha alcanzado su límite de usos');

    // ── 6. Validar límite de uso por usuario ─────────────────
    if (userId && coupon.max_uses_per_user > 0) {
      const userUse = await env.DB.prepare(`
        SELECT id FROM coupon_uses WHERE coupon_id = ? AND user_id = ?
      `).bind(coupon.id, userId).first();

      if (userUse)
        return badRequest('Ya has utilizado este cupón anteriormente');
    }

    // ── 7. Validar plan aplicable (si se envió plan en el body) ──
    if (plan && coupon.applicable_plans) {
      const allowedPlans = JSON.parse(coupon.applicable_plans);
      if (allowedPlans.length > 0 && !allowedPlans.includes(plan))
        return badRequest(`Este cupón no aplica al plan ${plan}`);
    }

    // ── 8. Validar ciclo de facturación aplicable ─────────────
    if (billing && coupon.applicable_billing) {
      const allowedBillings = JSON.parse(coupon.applicable_billing);
      if (allowedBillings.length > 0 && !allowedBillings.includes(billing))
        return badRequest(`Este cupón no aplica al ciclo ${billing}`);
    }

    // ── 9. Todo OK — devolver descuento ──────────────────────
    const label = coupon.discount_type === 'percent'
      ? `${coupon.discount_value}% de descuento`
      : `$${coupon.discount_value} USD de descuento`;

    return ok({
      code:            coupon.code,
      description:     coupon.description,
      discount_type:   coupon.discount_type,   // 'percent' | 'fixed'
      discount_value:  coupon.discount_value,  // número (% o centavos USD)
      label,
      applicable_plans:   coupon.applicable_plans
                            ? JSON.parse(coupon.applicable_plans)
                            : null,
      applicable_billing: coupon.applicable_billing
                            ? JSON.parse(coupon.applicable_billing)
                            : null,
    });

  } catch (err) {
    console.error('Error en validate coupon:', err);
    return serverError();
  }
}

// ── Helper cookie ────────────────────────────────────────────
function getCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  const match  = header.split(';').map(c => c.trim())
    .find(c => c.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : null;
}
