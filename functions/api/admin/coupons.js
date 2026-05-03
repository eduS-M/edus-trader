// ============================================================
// functions/api/admin/coupons.js
// GET    /api/admin/coupons          → listar todos
// POST   /api/admin/coupons          → crear nuevo cupón
// PUT    /api/admin/coupons          → editar cupón (body: { id, ...fields })
// DELETE /api/admin/coupons?id=XXX   → desactivar cupón
// Solo accesible con rol admin en el JWT.
// ============================================================

import { verifyJWT, generateId }               from '../../lib/jwt.js';
import { ok, created, badRequest, unauthorized,
         forbidden, notFound, serverError, preflight } from '../../lib/response.js';

export async function onRequestOptions() { return preflight(); }

// ── Guard: verifica que el JWT existe y tiene rol admin ──────
async function requireAdmin(request, env) {
  const token = getCookie(request, 'edus_jwt');
  if (!token) return null;
  try {
    const claims = await verifyJWT(token, env.JWT_SECRET);
    if (claims.role !== 'admin') return null;
    return claims;
  } catch { return null; }
}

// ── GET: listar cupones ──────────────────────────────────────
export async function onRequestGet({ request, env }) {
  const admin = await requireAdmin(request, env);
  if (!admin) return unauthorized('Solo administradores');

  try {
    const { results } = await env.DB.prepare(`
      SELECT
        id, code, description,
        discount_type, discount_value,
        max_uses, uses_count, max_uses_per_user,
        applicable_plans, applicable_billing,
        valid_from, valid_until, is_active, created_at
      FROM coupons
      ORDER BY created_at DESC
    `).all();

    return ok({ coupons: results });
  } catch (err) {
    console.error('Error listando cupones:', err);
    return serverError();
  }
}

// ── POST: crear cupón ────────────────────────────────────────
export async function onRequestPost({ request, env }) {
  const admin = await requireAdmin(request, env);
  if (!admin) return unauthorized('Solo administradores');

  let body;
  try { body = await request.json(); }
  catch { return badRequest('JSON inválido'); }

  const errors = validateCoupon(body);
  if (errors.length > 0) return badRequest(errors[0]);

  const {
    code, description,
    discount_type, discount_value,
    max_uses, max_uses_per_user,
    applicable_plans, applicable_billing,
    valid_from, valid_until,
  } = body;

  const codeNorm = code.trim().toUpperCase();

  try {
    // Verificar que el código no exista ya
    const existing = await env.DB.prepare(
      'SELECT id FROM coupons WHERE code = ?'
    ).bind(codeNorm).first();
    if (existing) return badRequest(`El código "${codeNorm}" ya existe`);

    const id = generateId();
    await env.DB.prepare(`
      INSERT INTO coupons (
        id, code, description,
        discount_type, discount_value,
        max_uses, max_uses_per_user,
        applicable_plans, applicable_billing,
        valid_from, valid_until, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).bind(
      id, codeNorm,
      description  || null,
      discount_type, discount_value,
      max_uses     ?? null,
      max_uses_per_user ?? 1,
      applicable_plans   ? JSON.stringify(applicable_plans)   : null,
      applicable_billing ? JSON.stringify(applicable_billing) : null,
      valid_from   || null,
      valid_until  || null,
    ).run();

    return created({ id, code: codeNorm, message: 'Cupón creado correctamente' });

  } catch (err) {
    console.error('Error creando cupón:', err);
    return serverError();
  }
}

// ── PUT: editar cupón ────────────────────────────────────────
export async function onRequestPut({ request, env }) {
  const admin = await requireAdmin(request, env);
  if (!admin) return unauthorized('Solo administradores');

  let body;
  try { body = await request.json(); }
  catch { return badRequest('JSON inválido'); }

  const { id, ...fields } = body;
  if (!id) return badRequest('ID de cupón requerido');

  const coupon = await env.DB.prepare('SELECT id FROM coupons WHERE id = ?').bind(id).first();
  if (!coupon) return notFound('Cupón no encontrado');

  // Construir SET dinámico solo con campos enviados
  const allowed = [
    'description','discount_type','discount_value',
    'max_uses','max_uses_per_user',
    'applicable_plans','applicable_billing',
    'valid_from','valid_until','is_active',
  ];
  const sets   = [];
  const values = [];

  for (const key of allowed) {
    if (key in fields) {
      sets.push(`${key} = ?`);
      let val = fields[key];
      if (['applicable_plans','applicable_billing'].includes(key) && Array.isArray(val))
        val = JSON.stringify(val);
      values.push(val);
    }
  }

  if (sets.length === 0) return badRequest('No hay campos para actualizar');
  values.push(id);

  try {
    await env.DB.prepare(
      `UPDATE coupons SET ${sets.join(', ')} WHERE id = ?`
    ).bind(...values).run();

    return ok({ message: 'Cupón actualizado' });
  } catch (err) {
    console.error('Error actualizando cupón:', err);
    return serverError();
  }
}

// ── DELETE: desactivar cupón (soft delete) ───────────────────
export async function onRequestDelete({ request, env }) {
  const admin = await requireAdmin(request, env);
  if (!admin) return unauthorized('Solo administradores');

  const url = new URL(request.url);
  const id  = url.searchParams.get('id');
  if (!id) return badRequest('ID requerido');

  try {
    const coupon = await env.DB.prepare('SELECT id FROM coupons WHERE id = ?').bind(id).first();
    if (!coupon) return notFound('Cupón no encontrado');

    await env.DB.prepare('UPDATE coupons SET is_active = 0 WHERE id = ?').bind(id).run();
    return ok({ message: 'Cupón desactivado' });
  } catch (err) {
    console.error('Error desactivando cupón:', err);
    return serverError();
  }
}

// ── Validación ───────────────────────────────────────────────
function validateCoupon({ code, discount_type, discount_value }) {
  const errors = [];
  if (!code || code.trim().length < 3)
    errors.push('El código debe tener al menos 3 caracteres');
  if (!['percent','fixed'].includes(discount_type))
    errors.push('Tipo de descuento debe ser "percent" o "fixed"');
  if (!discount_value || discount_value <= 0)
    errors.push('El valor del descuento debe ser mayor a 0');
  if (discount_type === 'percent' && discount_value > 100)
    errors.push('El porcentaje no puede superar 100');
  return errors;
}

function getCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  const match  = header.split(';').map(c => c.trim())
    .find(c => c.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : null;
}
