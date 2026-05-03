// ============================================================
// functions/api/auth/logout.js
// POST /api/auth/logout
// Invalida la sesión en DB y borra la cookie JWT
// ============================================================

import { ok, serverError, preflight, clearSessionCookie } from '../../lib/response.js';
import { verifyJWT } from '../../lib/jwt.js';

export async function onRequestOptions() { return preflight(); }

export async function onRequestPost({ request, env }) {
  try {
    // Leer el JWT de la cookie para obtener el session ID
    const cookieHeader = request.headers.get('Cookie') || '';
    const token = getCookie(cookieHeader, 'edus_jwt');

    if (token && env.JWT_SECRET) {
      try {
        const claims = await verifyJWT(token, env.JWT_SECRET);
        if (claims.sid) {
          // Eliminar sesión de la DB
          await env.DB.prepare('DELETE FROM sessions WHERE id = ?')
            .bind(claims.sid).run();
        }
      } catch {
        // JWT inválido o expirado — no importa, igual limpiamos la cookie
      }
    }

    return ok(
      { message: 'Sesión cerrada' },
      { 'Set-Cookie': clearSessionCookie() }
    );

  } catch (err) {
    console.error('Error en logout:', err);
    return serverError();
  }
}

function getCookie(header, name) {
  const match = header.split(';').map(c => c.trim())
    .find(c => c.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : null;
}
