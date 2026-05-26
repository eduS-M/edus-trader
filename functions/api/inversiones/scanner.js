/**
 * EduSTrader — API: Scanner
 * GET /api/inversiones/scanner?filter=subvaloradas
 */

import { requireAuth } from '../../lib/auth.js';

export async function onRequestGet(context) {
  const { env, request } = context;

  const auth = await requireAuth(context, ['admin']);
  if (auth.error) return auth.response;

  const url = new URL(request.url);
  const filter = url.searchParams.get('filter') || 'all';

  try {
    let query = `
      SELECT 
        t.ticker, t.name, t.sector, t.industry,
        t.last_price, t.market_cap,
        v.peg_value, v.peg_signal,
        v.dcf_intrinsic_value, v.dcf_diff_pct, v.dcf_signal,
        v.pbv_ratio, v.pbv_signal,
        v.positive_signals
      FROM inv_tickers t
      JOIN inv_valuations v ON v.ticker = t.ticker
        AND v.valuation_date = (
          SELECT MAX(valuation_date) FROM inv_valuations v2 WHERE v2.ticker = t.ticker
        )
      WHERE (t.is_in_sp500 = 1 OR t.is_custom_scanner = 1 OR t.is_in_watchlist = 1)
    `;

    // Filtros de búsqueda (Scanner logic)
    if (filter === 'subvaloradas') {
      // Mejores oportunidades: PEG < 1 O (PEG <= 2 y DCF subvalorada)
      query += ` AND (v.peg_signal = 'subvalorada' OR (v.peg_signal IN ('justo', 'invertible') AND v.dcf_signal = 'subvalorada'))`;
    } else if (filter === 'peg_only') {
      // Solo Quick Check
      query += ` AND v.peg_signal = 'subvalorada'`;
    } else if (filter === 'dcf_only') {
      // Solo DCF
      query += ` AND v.dcf_signal = 'subvalorada'`;
    } else if (filter === 'top_score') {
      // Puntuación global >= 3
      query += ` AND v.positive_signals >= 3`;
    }

    query += ` ORDER BY v.positive_signals DESC, v.peg_value ASC NULLS LAST LIMIT 100`;

    const { results } = await env.DB.prepare(query).all();

    return Response.json({
      success: true,
      data: results,
      count: results.length
    });

  } catch (err) {
    console.error('Scanner GET error:', err);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
