/**
 * EduSTrader — API: Valuations
 * GET /api/inversiones/valuations?ticker=XXX&days=90
 * GET /api/inversiones/valuations?all=true → todas las últimas valoraciones
 */

import { requireAuth } from '../../lib/auth.js';

export async function onRequestGet(context) {
  const { env, request } = context;

  const auth = await requireAuth(context, ['admin', 'member']);
  if (auth.error) return auth.response;

  const url = new URL(request.url);
  const ticker = url.searchParams.get('ticker')?.toUpperCase();
  const days   = parseInt(url.searchParams.get('days') || '365');
  const all    = url.searchParams.get('all') === 'true';

  try {
    if (all) {
      // Últimas valoraciones de todos los tickers rastreados
      const { results } = await env.DB.prepare(`
        SELECT 
          v.*,
          t.name, t.sector, t.instrument_type, t.last_price, t.price_change_pct
        FROM inv_valuations v
        JOIN inv_tickers t ON t.ticker = v.ticker
        WHERE v.valuation_date = (
          SELECT MAX(valuation_date) FROM inv_valuations v2 WHERE v2.ticker = v.ticker
        )
        AND (t.is_in_portfolio = 1 OR t.is_in_watchlist = 1)
        ORDER BY v.positive_signals DESC, v.peg_value ASC
      `).all();

      return Response.json({ success: true, data: results });
    }

    if (!ticker) {
      return Response.json({ success: false, error: 'ticker o all=true requerido' }, { status: 400 });
    }

    // Histórico de valoraciones para un ticker específico
    const { results } = await env.DB.prepare(`
      SELECT 
        v.*,
        t.name, t.sector
      FROM inv_valuations v
      JOIN inv_tickers t ON t.ticker = v.ticker
      WHERE v.ticker = ?
        AND v.valuation_date >= date('now', ? || ' days')
      ORDER BY v.valuation_date ASC
    `).bind(ticker, `-${days}`).all();

    // También retornar la última valoración completa
    const { results: latest } = await env.DB.prepare(`
      SELECT v.*, t.name, t.sector, t.last_price, t.week_52_high, t.week_52_low
      FROM inv_valuations v
      JOIN inv_tickers t ON t.ticker = v.ticker
      WHERE v.ticker = ?
      ORDER BY v.valuation_date DESC
      LIMIT 1
    `).bind(ticker).all();

    return Response.json({
      success: true,
      data: {
        ticker,
        history: results,
        latest: latest[0] || null,
      }
    });

  } catch (err) {
    console.error('Valuations GET error:', err);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
