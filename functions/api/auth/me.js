// ============================================================
// functions/api/auth/me.js
// GET /api/auth/me
// Devuelve los datos del usuario autenticado desde el JWT
// ============================================================

import { verifyJWT }                    from '../../lib/jwt.js';
import { ok, unauthorized, preflight }  from '../../lib/response.js';

export async function onRequestOptions() { return preflight(); }

export async function onRequestGet({ request, env }) {
  const token = getCookie(request, 'edus_jwt');
  if (!token) return unauthorized('No autenticado');

  try {
    const claims = await verifyJWT(token, env.JWT_SECRET);
    return ok({
      userId: claims.sub,
      email:  claims.email,
      name:   claims.name,
      plan:   claims.plan,
      role:   claims.role || 'member',
    });
  } catch {
    return unauthorized('Sesion invalida');
  }
}

function getCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  const match  = header.split(';').map(c => c.trim()).find(c => c.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : null;
}
