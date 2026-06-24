// ============================================================
// functions/api/admin/plans.js
// GET /api/admin/plans   → Listar configuración de planes (Modo Lectura)
// ============================================================

import { verifyJWT }                              from '../../lib/jwt.js';
import { ok, unauthorized, serverError, preflight } from '../../lib/response.js';
import { PRICES }                                 from '../../lib/pricing.js';

export async function onRequestOptions() { return preflight(); }

export async function onRequestGet({ request, env }) {
  if (!await requireAdmin(request, env)) return unauthorized('Solo administradores');

  try {
    // Definimos los permisos harcodeados en _middleware.js para mostrarlos en Admin
    const routePermissions = {
      free:    ['/bitacora/ (Game Plan, Post-Mercado, Reportes)'],
      basic:   ['/cursos'],
      pro:     ['/repositorio-NT8', '/EduS_*', '/manual_*', '/HUD_*', '/backtesting', '/EduS_UMC'],
      premium: ['/inversiones']
    };

    const plansData = Object.keys(PRICES).map(plan => {
      const data = PRICES[plan];
      return {
        id: plan,
        tier: plan === 'free' ? 0 : plan === 'basic' ? 1 : plan === 'pro' ? 2 : 3,
        monthly: data.monthly?.usd || 0,
        annual: data.annual?.usd || 0,
        lifetime: data.lifetime?.usd || 0,
        routes: routePermissions[plan]
      };
    });

    return ok({ plans: plansData });
  } catch (err) {
    console.error('Error listando planes:', err);
    return serverError();
  }
}

async function requireAdmin(request, env) {
  const token = getCookie(request, 'edus_jwt');
  if (!token) return null;
  try {
    const c = await verifyJWT(token, env.JWT_SECRET);
    return c?.role === 'admin' ? c : null;
  } catch { return null; }
}

function getCookie(request, name) {
  const h = request.headers.get('Cookie') || '';
  const m = h.split(';').map(c => c.trim()).find(c => c.startsWith(`${name}=`));
  return m ? m.slice(name.length + 1) : null;
}
