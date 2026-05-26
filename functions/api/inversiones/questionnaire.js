/**
 * EduSTrader — API: Questionnaire
 * GET  /api/inversiones/questionnaire?ticker=XXX
 * POST /api/inversiones/questionnaire  → Guardar respuestas
 */

import { requireAuth } from '../../lib/auth.js';

export async function onRequestGet(context) {
  const { env, request } = context;

  const auth = await requireAuth(context, ['admin']);
  if (auth.error) return auth.response;

  const url = new URL(request.url);
  const ticker = url.searchParams.get('ticker')?.toUpperCase();

  if (!ticker) return Response.json({ success: false, error: 'ticker requerido' }, { status: 400 });

  try {
    const { results } = await env.DB.prepare(`
      SELECT * FROM inv_questionnaire_answers
      WHERE ticker = ?
      ORDER BY analysis_date DESC
    `).bind(ticker).all();

    return Response.json({
      success: true,
      data: {
        ticker,
        history: results,
        latest: results[0] || null
      }
    });

  } catch (err) {
    console.error('Questionnaire GET error:', err);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function onRequestPost(context) {
  const { env, request } = context;

  const auth = await requireAuth(context, ['admin']);
  if (auth.error) return auth.response;

  try {
    const body = await request.json();
    const { ticker, analysis_date, ...answers } = body;

    if (!ticker) return Response.json({ success: false, error: 'ticker requerido' }, { status: 400 });

    const date = analysis_date || new Date().toISOString().split('T')[0];
    const id = crypto.randomUUID();

    await env.DB.prepare(`
      INSERT INTO inv_questionnaire_answers (
        id, ticker, analysis_date,
        sales_growing, earnings_growing, cashflow_growing, roe, eps_past_5y, eps_next_5y,
        peg, debt_equity, current_ratio, debt_reasonable, avg_volume_3m, insider_pct,
        insider_change_pct, institutional_pct, institutional_change, next_earnings_date,
        competitive_advantage, competitors, add_to_watchlist,
        valuation_methods, price_vs_valuation,
        market_type, price_action_notes, has_fibonacci, sma50_support, sma150_support, sma200_support,
        analyst_notes, final_decision
      ) VALUES (
        ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?
      )
      ON CONFLICT(ticker, analysis_date) DO UPDATE SET
        sales_growing = excluded.sales_growing,
        earnings_growing = excluded.earnings_growing,
        cashflow_growing = excluded.cashflow_growing,
        roe = excluded.roe,
        eps_past_5y = excluded.eps_past_5y,
        eps_next_5y = excluded.eps_next_5y,
        peg = excluded.peg,
        debt_equity = excluded.debt_equity,
        current_ratio = excluded.current_ratio,
        debt_reasonable = excluded.debt_reasonable,
        avg_volume_3m = excluded.avg_volume_3m,
        insider_pct = excluded.insider_pct,
        insider_change_pct = excluded.insider_change_pct,
        institutional_pct = excluded.institutional_pct,
        institutional_change = excluded.institutional_change,
        next_earnings_date = excluded.next_earnings_date,
        competitive_advantage = excluded.competitive_advantage,
        competitors = excluded.competitors,
        add_to_watchlist = excluded.add_to_watchlist,
        valuation_methods = excluded.valuation_methods,
        price_vs_valuation = excluded.price_vs_valuation,
        market_type = excluded.market_type,
        price_action_notes = excluded.price_action_notes,
        has_fibonacci = excluded.has_fibonacci,
        sma50_support = excluded.sma50_support,
        sma150_support = excluded.sma150_support,
        sma200_support = excluded.sma200_support,
        analyst_notes = excluded.analyst_notes,
        final_decision = excluded.final_decision,
        updated_at = datetime('now')
    `).bind(
      id, ticker.toUpperCase(), date,
      answers.sales_growing, answers.earnings_growing, answers.cashflow_growing, answers.roe, answers.eps_past_5y, answers.eps_next_5y,
      answers.peg, answers.debt_equity, answers.current_ratio, answers.debt_reasonable, answers.avg_volume_3m, answers.insider_pct,
      answers.insider_change_pct, answers.institutional_pct, answers.institutional_change, answers.next_earnings_date,
      answers.competitive_advantage, answers.competitors, answers.add_to_watchlist,
      JSON.stringify(answers.valuation_methods || []), answers.price_vs_valuation,
      answers.market_type, answers.price_action_notes, answers.has_fibonacci, answers.sma50_support, answers.sma150_support, answers.sma200_support,
      answers.analyst_notes, answers.final_decision
    ).run();

    return Response.json({ success: true, message: `Cuestionario para ${ticker} guardado` });

  } catch (err) {
    console.error('Questionnaire POST error:', err);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
