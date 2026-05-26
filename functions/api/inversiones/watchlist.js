/**
 * EduSTrader — API: Watchlist
 * GET  /api/inversiones/watchlist?sector=Technology
 * POST /api/inversiones/watchlist  → Agregar ticker al watchlist
 * DELETE /api/inversiones/watchlist?ticker=XXX
 */

import { requireAuth } from '../../lib/auth.js';

export async function onRequestGet(context) {
  const { env, request } = context;

  const auth = await requireAuth(context, ['admin', 'member']);
  if (auth.error) return auth.response;

  const url    = new URL(request.url);
  const sector = url.searchParams.get('sector');

  try {
    let query = `
      SELECT 
        t.ticker, t.name, t.sector, t.industry, t.instrument_type,
        t.last_price, t.price_change_pct, t.week_52_high, t.week_52_low,
        t.market_cap, t.is_in_portfolio,
        v.peg_value, v.peg_signal,
        v.dcf_intrinsic_value, v.dcf_diff_pct, v.dcf_signal,
        v.ddm_intrinsic_value, v.ddm_diff_pct, v.ddm_signal,
        v.pbv_ratio, v.pbv_signal,
        v.eps_next_5y_pct, v.eps_signal,
        v.positive_signals, v.valuation_date,
        -- Variación vs 52w
        ROUND(((t.last_price - t.week_52_low) / (t.week_52_high - t.week_52_low)) * 100, 1) AS position_52w_pct
      FROM inv_tickers t
      LEFT JOIN inv_valuations v ON v.ticker = t.ticker
        AND v.valuation_date = (
          SELECT MAX(valuation_date) FROM inv_valuations v2 WHERE v2.ticker = t.ticker
        )
      WHERE t.is_in_watchlist = 1
    `;

    const params = [];
    if (sector && sector !== 'all') {
      query += ` AND t.sector = ?`;
      params.push(sector);
    }

    query += ` ORDER BY v.positive_signals DESC, t.sector ASC, t.ticker ASC`;

    const { results } = await env.DB.prepare(query).bind(...params).all();

    // Obtener sectores únicos para los filtros
    const { results: sectors } = await env.DB.prepare(`
      SELECT DISTINCT sector FROM inv_tickers 
      WHERE is_in_watchlist = 1 AND sector IS NOT NULL
      ORDER BY sector ASC
    `).all();

    return Response.json({
      success: true,
      data: {
        tickers: results,
        sectors: sectors.map(s => s.sector),
        count: results.length
      }
    });

  } catch (err) {
    console.error('Watchlist GET error:', err);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function onRequestPost(context) {
  const { env, request } = context;

  const auth = await requireAuth(context, ['admin']);
  if (auth.error) return auth.response;

  const body = await request.json();
  const { ticker, sector, notes } = body;

  if (!ticker) {
    return Response.json({ success: false, error: 'ticker requerido' }, { status: 400 });
  }

  await env.DB.prepare(`
    INSERT INTO inv_tickers (ticker, sector, is_in_watchlist, notes)
    VALUES (?, ?, 1, ?)
    ON CONFLICT(ticker) DO UPDATE SET 
      is_in_watchlist = 1,
      sector = COALESCE(excluded.sector, sector),
      notes = COALESCE(excluded.notes, notes),
      updated_at = datetime('now')
  `).bind(ticker.toUpperCase(), sector || null, notes || null).run();

  return Response.json({ success: true, message: `${ticker.toUpperCase()} agregado al watchlist` });
}

export async function onRequestDelete(context) {
  const { env, request } = context;

  const auth = await requireAuth(context, ['admin']);
  if (auth.error) return auth.response;

  const url = new URL(request.url);
  const ticker = url.searchParams.get('ticker')?.toUpperCase();

  if (!ticker) return Response.json({ success: false, error: 'ticker requerido' }, { status: 400 });

  await env.DB.prepare(`
    UPDATE inv_tickers SET is_in_watchlist = 0, updated_at = datetime('now') WHERE ticker = ?
  `).bind(ticker).run();

  return Response.json({ success: true, message: `${ticker} eliminado del watchlist` });
}
