// ============================================================
// functions/lib/auth.js
// Middleware de autenticación para Cloudflare Pages Functions
// Depende de jwt.js para verificar tokens
// ============================================================

import { verifyJWT } from './jwt.js';
import { unauthorized } from './response.js';

/**
 * Verifica que el request tenga un JWT válido y que el usuario
 * tenga al menos uno de los roles requeridos.
 *
 * @param {Object} context - El objeto context de Cloudflare Pages
 * @param {string[]} [requiredRoles] - Roles permitidos (ej: ['admin'], ['basic','pro','premium'])
 * @returns {Promise<{error: false, claims: Object}|{error: true, response: Response}>}
 */
export async function requireAuth(context, requiredRoles = null) {
  const { request, env } = context;
  const token = getCookie(request, 'edus_jwt');

  if (!token) {
    return { error: true, response: unauthorized('No autenticado') };
  }

  let claims;
  try {
    claims = await verifyJWT(token, env.JWT_SECRET);
  } catch {
    return { error: true, response: unauthorized('Token inválido o expirado') };
  }

  // Verificar sesión activa en DB si está disponible
  if (env.DB && claims.sid) {
    const session = await env.DB.prepare(`
      SELECT s.id, u.plan, u.role
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.id = ? AND s.expires_at > datetime('now')
    `).bind(claims.sid).first().catch(() => null);

    if (!session) {
      return { error: true, response: unauthorized('Sesión expirada') };
    }
    claims.plan = session.plan;
    claims.role = session.role;
  }

  // Verificar roles si se especificaron
  if (requiredRoles && requiredRoles.length > 0) {
    const userRole = claims.role || claims.plan || 'free';
    const hasRole = requiredRoles.some(r => r === userRole);
    if (!hasRole) {
      return { error: true, response: unauthorized('Acceso no autorizado para este rol') };
    }
  }

  return { error: false, claims };
}

function getCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  const match = header.split(';').map(c => c.trim()).find(c => c.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : null;
}
