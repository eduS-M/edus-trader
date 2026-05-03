// ============================================================
// functions/api/admin/stats.js
// GET /api/admin/stats   → KPIs del resumen
// ============================================================
import { verifyJWT }                              from '../../lib/jwt.js';
import { ok, unauthorized, serverError, preflight } from '../../lib/response.js';

export async function onRequestOptions() { return preflight(); }

export async function onRequestGet({ request, env }) {
  if (!await requireAdmin(request, env)) return unauthorized('Solo administradores');

  try {
    const [totalRow, activeRow, revenueRow, expiringRow, distRows] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE status != 'deleted'").first(),
      env.DB.prepare("SELECT COUNT(*) AS n FROM subscriptions WHERE status = 'active'").first(),
      env.DB.prepare(`
        SELECT COALESCE(SUM(amount - amount_refunded), 0) AS total
        FROM payments
        WHERE status = 'paid'
          AND strftime('%Y-%m', paid_at) = strftime('%Y-%m', 'now')
      `).first(),
      env.DB.prepare(`
        SELECT COUNT(*) AS n FROM subscriptions
        WHERE status = 'active'
          AND current_period_end IS NOT NULL
          AND current_period_end <= datetime('now', '+7 days')
          AND current_period_end  > datetime('now')
      `).first(),
      env.DB.prepare(`
        SELECT plan, COUNT(*) AS count
        FROM users WHERE status != 'deleted'
        GROUP BY plan ORDER BY plan
      `).all(),
    ]);

    return ok({
      total_users:       totalRow?.n    ?? 0,
      active_subs:       activeRow?.n   ?? 0,
      revenue_month:     ((revenueRow?.total ?? 0) / 100).toFixed(2),
      expiring_soon:     expiringRow?.n ?? 0,
      plan_distribution: distRows.results ?? [],
    });
  } catch (err) {
    console.error('Error en stats:', err);
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
