// ============================================================
// functions/lib/response.js
// Helpers para respuestas HTTP consistentes en todos los endpoints
// ============================================================

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

/** 200 OK con JSON */
export function ok(data = {}, extra = {}) {
  return json({ ok: true, ...data }, 200, extra);
}

/** 201 Created con JSON */
export function created(data = {}) {
  return json({ ok: true, ...data }, 201);
}

/** 400 Bad Request */
export function badRequest(message = 'Petición incorrecta') {
  return json({ ok: false, error: message }, 400);
}

/** 401 Unauthorized */
export function unauthorized(message = 'No autenticado') {
  return json({ ok: false, error: message }, 401);
}

/** 403 Forbidden — autenticado pero sin permisos */
export function forbidden(message = 'Acceso denegado', redirectTo = null) {
  const body = { ok: false, error: message };
  if (redirectTo) body.redirectTo = redirectTo;
  return json(body, 403);
}

/** 404 Not Found */
export function notFound(message = 'No encontrado') {
  return json({ ok: false, error: message }, 404);
}

/** 409 Conflict — ej. email ya registrado */
export function conflict(message = 'Ya existe') {
  return json({ ok: false, error: message }, 409);
}

/** 429 Too Many Requests */
export function tooManyRequests(message = 'Demasiados intentos. Espera un momento.') {
  return json({ ok: false, error: message }, 429);
}

/** 500 Internal Server Error */
export function serverError(message = 'Error interno del servidor') {
  return json({ ok: false, error: message }, 500);
}

/** Redirect 302 con cookie opcional */
export function redirect(location, cookieHeader = null) {
  const headers = { Location: location };
  if (cookieHeader) headers['Set-Cookie'] = cookieHeader;
  return new Response(null, { status: 302, headers });
}

/** Construye la cookie de sesión JWT */
export function buildSessionCookie(token, maxAgeSecs = 86400) {
  return [
    `edus_jwt=${token}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${maxAgeSecs}`,
  ].join('; ');
}

/** Elimina la cookie de sesión */
export function clearSessionCookie() {
  return [
    'edus_jwt=',
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  ].join('; ');
}

/** Preflight CORS */
export function preflight() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

// ------------------------------------------------------------
// Interno
// ------------------------------------------------------------
function json(body, status, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}
