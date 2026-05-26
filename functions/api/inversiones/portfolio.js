/**
 * EduSTrader — API: Portfolio
 * GET  /api/inversiones/portfolio  → Lista posiciones activas con P&L
 * POST /api/inversiones/portfolio  → Agregar/actualizar posición
 * DELETE /api/inversiones/portfolio?ticker=XXX → Cerrar posición
 */

import { requireAuth } from '../../lib/auth.js';

export async function onRequestGet(context) {
  const { env } = context;

  // Auth: solo el admin puede ver el portafolio
  const auth = await requireAuth(context, ['admin']);
  if (auth.error) return auth.response;

  try {
    const { results } = await env.DB.prepare(`
      SELECT 
        p.id,
        p.ticker,
        t.name,
        t.sector,
        t.instrument_type,
        p.quantity,
        p.avg_price,
        p.currency,
        p.first_buy_date,
        p.status,
        t.last_price,
        t.price_change_pct,
        t.week_52_high,
        t.week_52_low,
        t.market_cap,
        -- P&L calculado
        ROUND((t.last_price - p.avg_price) * p.quantity, 2) AS unrealized_pnl,
        ROUND(((t.last_price - p.avg_price) / p.avg_price) * 100, 2) AS unrealized_pnl_pct,
        ROUND(t.last_price * p.quantity, 2) AS current_value,
        ROUND(p.avg_price * p.quantity, 2) AS cost_basis,
        -- Última valoración
        v.peg_value,
        v.peg_signal,
        v.dcf_intrinsic_value,
        v.dcf_signal,
        v.ddm_intrinsic_value,
        v.ddm_signal,
        v.pbv_ratio,
        v.pbv_signal,
        v.eps_signal,
        v.positive_signals,
        v.valuation_date
      FROM inv_portfolio_positions p
      JOIN inv_tickers t ON t.ticker = p.ticker
      LEFT JOIN inv_valuations v ON v.ticker = p.ticker
        AND v.valuation_date = (
          SELECT MAX(valuation_date) FROM inv_valuations WHERE ticker = p.ticker
        )
      WHERE p.status = 'active'
      ORDER BY (t.last_price * p.quantity) DESC
    `).all();

    // Calcular totales del portafolio
    let total_value = 0, total_cost = 0, total_pnl = 0;
    for (const pos of results) {
      total_value += pos.current_value || 0;
      total_cost  += pos.cost_basis  || 0;
      total_pnl   += pos.unrealized_pnl || 0;
    }

    // Agregar peso en cartera %
    const positions = results.map(p => ({
      ...p,
      portfolio_weight: total_value > 0 ? Math.round((p.current_value / total_value) * 10000) / 100 : 0
    }));

    return Response.json({
      success: true,
      data: {
        positions,
        summary: {
          total_value:   Math.round(total_value * 100) / 100,
          total_cost:    Math.round(total_cost * 100) / 100,
          total_pnl:     Math.round(total_pnl * 100) / 100,
          total_pnl_pct: total_cost > 0 ? Math.round((total_pnl / total_cost) * 10000) / 100 : 0,
          positions_count: results.length,
        }
      }
    });

  } catch (err) {
    console.error('Portfolio GET error:', err);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function onRequestPost(context) {
  const { env, request } = context;

  const auth = await requireAuth(context, ['admin']);
  if (auth.error) return auth.response;

  try {
    const body = await request.json();
    const { ticker, quantity, avg_price, first_buy_date, currency = 'USD', notes } = body;

    if (!ticker || !quantity || !avg_price) {
      return Response.json({ success: false, error: 'ticker, quantity y avg_price son requeridos' }, { status: 400 });
    }

    const id = crypto.randomUUID();

    await env.DB.prepare(`
      INSERT INTO inv_portfolio_positions (id, ticker, quantity, avg_price, currency, first_buy_date, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, 'active', ?)
      ON CONFLICT DO UPDATE SET
        quantity = excluded.quantity,
        avg_price = excluded.avg_price,
        notes = excluded.notes,
        updated_at = datetime('now')
    `).bind(id, ticker.toUpperCase(), quantity, avg_price, currency, first_buy_date || null, notes || null).run();

    // Marcar como portfolio en inv_tickers
    await env.DB.prepare(`
      INSERT INTO inv_tickers (ticker, is_in_portfolio, is_in_watchlist)
      VALUES (?, 1, 1)
      ON CONFLICT(ticker) DO UPDATE SET is_in_portfolio = 1, is_in_watchlist = 1, updated_at = datetime('now')
    `).bind(ticker.toUpperCase()).run();

    return Response.json({ success: true, data: { id, ticker, quantity, avg_price } });

  } catch (err) {
    console.error('Portfolio POST error:', err);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function onRequestDelete(context) {
  const { env, request } = context;

  const auth = await requireAuth(context, ['admin']);
  if (auth.error) return auth.response;

  const url = new URL(request.url);
  const ticker = url.searchParams.get('ticker')?.toUpperCase();
  const close_price = url.searchParams.get('close_price');

  if (!ticker) {
    return Response.json({ success: false, error: 'ticker requerido' }, { status: 400 });
  }

  await env.DB.prepare(`
    UPDATE inv_portfolio_positions
    SET status = 'closed', close_date = date('now'), close_price = ?, updated_at = datetime('now')
    WHERE ticker = ? AND status = 'active'
  `).bind(close_price || null, ticker).run();

  await env.DB.prepare(`
    UPDATE inv_tickers SET is_in_portfolio = 0, updated_at = datetime('now') WHERE ticker = ?
  `).bind(ticker).run();

  return Response.json({ success: true, message: `Posición ${ticker} cerrada` });
}
