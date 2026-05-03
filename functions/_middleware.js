// ============================================================
// functions/_middleware.js
// Se ejecuta en Cloudflare ANTES de servir cualquier archivo.
// Verifica JWT y controla acceso según plan del usuario.
// ============================================================

import { verifyJWT } from './lib/jwt.js';

// ------------------------------------------------------------
// Rutas públicas — pasan sin verificación
// ------------------------------------------------------------
const PUBLIC_PATHS = new Set([
  '/', '/index.html', '/members', '/members/', '/members/index.html',
  '/api/auth/register', '/api/auth/login', '/api/auth/logout',
  '/api/auth/google', '/api/auth/google/callback', '/api/auth/verify-email',
]);

// Extensiones de assets — siempre públicos
const PUBLIC_EXTS = new Set([
  '.png','.jpg','.jpeg','.gif','.webp','.svg',
  '.css','.js','.woff','.woff2','.ttf','.ico','.json',
]);

// ------------------------------------------------------------
// Mapa de rutas → plan mínimo requerido
// Orden importa: se evalúa de más específico a menos
// ------------------------------------------------------------
const ROUTE_PLAN_MAP = [
  // Premium Plus — solo plan 3
  { prefix: '/EduS_',              plan: 'premium', tier: 3 },
  { prefix: '/manual_',            plan: 'premium', tier: 3 },
  { prefix: '/edus-trader-dofa',   plan: 'premium', tier: 3 },

  // Pro — planes 2, 3
  { prefix: '/repositorio-NT8',    plan: 'pro',     tier: 2 },
  { prefix: '/backtesting',        plan: 'pro',     tier: 2 },

  // Basic — planes 1, 2, 3
  { prefix: '/reporte',            plan: 'basic',   tier: 1 },
  { prefix: '/analisis_',          plan: 'basic',   tier: 1 },
  { prefix: '/gameplan',           plan: 'basic',   tier: 1 },
  { prefix: '/cierre-de-mes',      plan: 'basic',   tier: 1 },
  { prefix: '/premercado',         plan: 'basic',   tier: 1 },
  { prefix: '/reporte-',           plan: 'basic',   tier: 1 },
];

// Jerarquía de planes
const PLAN_TIER = { free: 0, basic: 1, pro: 2, premium: 3 };

// ------------------------------------------------------------
// Middleware principal
// ------------------------------------------------------------
export async function onRequest({ request, next, env }) {
  const url  = new URL(request.url);
  const path = url.pathname;

  // 1. Assets públicos
  const ext = path.slice(path.lastIndexOf('.')).toLowerCase();
  if (PUBLIC_EXTS.has(ext)) return next();

  // 2. Rutas públicas exactas
  if (PUBLIC_PATHS.has(path) || PUBLIC_PATHS.has(path + '/')) return next();

  // 3. ¿Esta ruta requiere un plan mínimo?
  const requirement = getRequirement(path);

  // Si no está en el mapa, es pública (blog, etc.)
  if (!requirement) return next();

  // 4. Verificar JWT
  const token  = getCookie(request, 'edus_jwt');
  const claims = await parseJWT(token, env.JWT_SECRET);

  if (!claims) {
    // No autenticado → login
    const loginUrl = `/members/?redirect=${encodeURIComponent(path)}`;
    return Response.redirect(new URL(loginUrl, url.origin).toString(), 302);
  }

  // 5. Verificar sesión en DB (opcional pero seguro — detecta logout forzado)
  if (env.DB && claims.sid) {
    const session = await env.DB.prepare(
      'SELECT id FROM sessions WHERE id = ? AND expires_at > datetime("now")'
    ).bind(claims.sid).first().catch(() => null);

    if (!session) {
      const loginUrl = `/members/?redirect=${encodeURIComponent(path)}&reason=session_expired`;
      return Response.redirect(new URL(loginUrl, url.origin).toString(), 302);
    }
  }

  // 6. Verificar plan
  const userTier = PLAN_TIER[claims.plan] ?? 0;
  if (userTier < requirement.tier) {
    // Plan insuficiente → página de upgrade
    const upgradeUrl = `/members/upgrade/?from=${claims.plan}&need=${requirement.plan}&next=${encodeURIComponent(path)}`;
    return Response.redirect(new URL(upgradeUrl, url.origin).toString(), 302);
  }

  // 7. Todo OK — pasar la petición al archivo estático
  return next();
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
function getRequirement(path) {
  for (const rule of ROUTE_PLAN_MAP) {
    if (path.startsWith(rule.prefix)) return rule;
  }
  return null;
}

function getCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  const match  = header.split(';').map(c => c.trim()).find(c => c.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : null;
}

async function parseJWT(token, secret) {
  if (!token || !secret) return null;
  try {
    return await verifyJWT(token, secret);
  } catch {
    return null;
  }
}
