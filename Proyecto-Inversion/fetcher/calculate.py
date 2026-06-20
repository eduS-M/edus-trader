"""
EduSTrader Investment Dashboard — Motor de Cálculo de Valoraciones
Archivo: calculate.py

Replica exactamente la lógica de la hoja "M2 DE VALORACION ACCIONES" del Excel.
"""

import math
from config import (
    DISCOUNT_RATE, DCF_PROJECTION_YEARS, TERMINAL_GROWTH_RATE,
    PEG_SUBVALORADA, PEG_INVERTIBLE, PBV_THRESHOLD_NORMAL,
    PBV_THRESHOLD_BANK, BANKING_SECTORS, EPS_GROWTH_THRESHOLD
)


# ============================================================
# MÉTODO 1: Quick Check — PEG Ratio
# ============================================================

def calculate_quick_check(pe_ratio, eps_growth_next_5y):
    """
    PEG = P/E / (EPS Growth Next 5Y × 100)
    
    Interpretación:
      < 1   → Subvalorada (Mejor Oportunidad) 🟢
      = 1   → Precio Justo
      > 1 y <= 2 → Invertible 🟡
      > 2   → Sobrevalorada 🔴
    
    Args:
        pe_ratio: Ratio P/E actual
        eps_growth_next_5y: Crecimiento EPS próximos 5 años (decimal, ej: 0.15)
    
    Returns:
        dict con peg_value y señal
    """
    result = {
        'peg_value': None,
        'peg_eps_growth': eps_growth_next_5y,
        'peg_pe_used': pe_ratio,
        'peg_signal': 'n/a',
        'applies': False
    }

    if not pe_ratio or not eps_growth_next_5y:
        return result
    if eps_growth_next_5y <= 0 or pe_ratio <= 0:
        return result

    # PEG usa el % como número entero (ej: 15 para 15%), igual que el Excel
    growth_pct = eps_growth_next_5y * 100
    peg = pe_ratio / growth_pct

    result['peg_value'] = round(peg, 4)
    result['applies'] = True

    if peg < PEG_SUBVALORADA:
        result['peg_signal'] = 'subvalorada'
    elif peg == PEG_SUBVALORADA:
        result['peg_signal'] = 'justo'
    elif peg <= PEG_INVERTIBLE:
        result['peg_signal'] = 'invertible'
    else:
        result['peg_signal'] = 'sobrevalorada'

    return result


# ============================================================
# MÉTODO 2: Flujo de Caja Descontado (DCF)
# ============================================================

def calculate_dcf(
    operating_cash_flow,
    eps_growth_rate,
    shares_outstanding,
    current_price,
    discount_rate=DISCOUNT_RATE,
    years=DCF_PROJECTION_YEARS,
    terminal_growth=TERMINAL_GROWTH_RATE
):
    """
    Descuenta los flujos de caja operativos proyectados a 10 años.
    Replica la fórmula del Excel columna por columna.
    
    Args:
        operating_cash_flow: FCO del último año fiscal (en millones o miles)
        eps_growth_rate: Tasa de crecimiento anual (decimal, ej: 0.15)
        shares_outstanding: Acciones en circulación (misma unidad que FCO)
        current_price: Precio actual del mercado
        discount_rate: WACC/tasa de descuento (default 10%)
        years: Años de proyección (default 10)
        terminal_growth: Crecimiento terminal (default 3%)
    
    Returns:
        dict con valor intrínseco, diferencia y señal
    """
    result = {
        'dcf_intrinsic_value': None,
        'dcf_diff_vs_price': None,
        'dcf_diff_pct': None,
        'dcf_applies': False,
        'dcf_signal': 'n/a',
        'dcf_projections': []
    }

    if not operating_cash_flow or not eps_growth_rate or not shares_outstanding:
        return result
    if operating_cash_flow <= 0:
        # No aplica: FCO negativo
        result['dcf_applies'] = False
        return result
    if eps_growth_rate <= 0:
        return result

    result['dcf_applies'] = True

    # Proyectar FCO para cada año
    total_pv = 0.0
    fco_proyectado = operating_cash_flow

    for year in range(1, years + 1):
        # Crecimiento años 1-5 igual al estimado. Años 6-10 topado al 15%
        current_growth = min(eps_growth_rate, 0.15) if year > 5 and eps_growth_rate > 0.15 else eps_growth_rate
        fco_proyectado = fco_proyectado * (1 + current_growth)
        discount_factor = 1 / ((1 + discount_rate) ** year)
        pv = fco_proyectado * discount_factor
        total_pv += pv
        result['dcf_projections'].append({
            'year': year,
            'fco_projected': round(fco_proyectado, 2),
            'discount_factor': round(discount_factor, 6),
            'present_value': round(pv, 2)
        })

    # Valor terminal (Gordon Growth Model)
    fco_terminal = fco_proyectado * (1 + terminal_growth)
    terminal_value = fco_terminal / (discount_rate - terminal_growth)
    terminal_pv = terminal_value / ((1 + discount_rate) ** years)
    total_pv += terminal_pv

    # Valor intrínseco por acción
    intrinsic_per_share = total_pv / shares_outstanding
    diff = intrinsic_per_share - current_price
    diff_pct = diff / current_price if current_price else 0

    result['dcf_intrinsic_value'] = round(intrinsic_per_share, 4)
    result['dcf_diff_vs_price'] = round(diff, 4)
    result['dcf_diff_pct'] = round(diff_pct, 6)

    # Señal: positivo = precio mercado < intrínseco → SUBVALORADA
    if diff > 0:
        result['dcf_signal'] = 'subvalorada'
    else:
        result['dcf_signal'] = 'sobrevalorada'

    return result


# ============================================================
# MÉTODO 3: Ganancias Descontadas (DDM adaptado)
# ============================================================

def calculate_ddm(
    net_income,
    eps_growth_rate,
    shares_outstanding,
    current_price,
    discount_rate=DISCOUNT_RATE,
    years=DCF_PROJECTION_YEARS,
    terminal_growth=TERMINAL_GROWTH_RATE
):
    """
    Igual que DCF pero usando Net Income en lugar de FCO.
    Aplica para empresas con crecimiento en Ganancia Neta.
    
    Returns:
        dict con valor intrínseco, diferencia y señal
    """
    result = {
        'ddm_intrinsic_value': None,
        'ddm_diff_vs_price': None,
        'ddm_diff_pct': None,
        'ddm_applies': False,
        'ddm_signal': 'n/a',
    }

    if not net_income or not eps_growth_rate or not shares_outstanding:
        return result
    if net_income <= 0 or eps_growth_rate <= 0:
        result['ddm_applies'] = False
        return result

    result['ddm_applies'] = True

    total_pv = 0.0
    ni_proyectado = net_income

    for year in range(1, years + 1):
        current_growth = min(eps_growth_rate, 0.15) if year > 5 and eps_growth_rate > 0.15 else eps_growth_rate
        ni_proyectado = ni_proyectado * (1 + current_growth)
        discount_factor = 1 / ((1 + discount_rate) ** year)
        total_pv += ni_proyectado * discount_factor

    # Valor terminal
    ni_terminal = ni_proyectado * (1 + terminal_growth)
    terminal_value = ni_terminal / (discount_rate - terminal_growth)
    terminal_pv = terminal_value / ((1 + discount_rate) ** years)
    total_pv += terminal_pv

    intrinsic_per_share = total_pv / shares_outstanding
    diff = intrinsic_per_share - current_price
    diff_pct = diff / current_price if current_price else 0

    result['ddm_intrinsic_value'] = round(intrinsic_per_share, 4)
    result['ddm_diff_vs_price'] = round(diff, 4)
    result['ddm_diff_pct'] = round(diff_pct, 6)

    if diff > 0:
        result['ddm_signal'] = 'subvalorada'
    else:
        result['ddm_signal'] = 'sobrevalorada'

    return result


# ============================================================
# MÉTODO 4: Valor en Libros (Price-to-Book Value)
# ============================================================

def calculate_pbv(
    total_assets,
    total_liabilities,
    shares_outstanding,
    current_price,
    sector=None
):
    """
    PBV = Precio / (Book Value por Acción)
    Book Value por Acción = (Total Assets - Total Liabilities) / Shares Outstanding
    
    Umbrales:
      < 0.5 → Muy Bueno 🟢 (< 1.5 para bancos)
      0.5-1 → Bueno 🟡
      > 1   → Atención 🔴
    
    Returns:
        dict con pbv_ratio y señal
    """
    result = {
        'pbv_ratio': None,
        'pbv_book_value_ps': None,
        'pbv_is_bank': False,
        'pbv_signal': 'n/a',
        'pbv_applies': False
    }

    if not total_assets or not total_liabilities or not shares_outstanding:
        return result
    if shares_outstanding <= 0:
        return result

    equity = total_assets - total_liabilities
    if equity <= 0:
        # Patrimonio neto negativo - no aplica PBV pero informar
        result['pbv_signal'] = 'na'
        result['pbv_ratio'] = None
        return result

    book_value_ps = equity / shares_outstanding
    if book_value_ps <= 0 or not current_price:
        return result

    pbv = current_price / book_value_ps

    is_bank = sector and any(s.lower() in sector.lower() for s in BANKING_SECTORS)
    threshold = PBV_THRESHOLD_BANK if is_bank else PBV_THRESHOLD_NORMAL

    result['pbv_ratio'] = round(pbv, 4)
    result['pbv_book_value_ps'] = round(book_value_ps, 4)
    result['pbv_is_bank'] = is_bank
    result['pbv_applies'] = True

    if pbv < threshold:
        result['pbv_signal'] = 'muy_bueno'
    elif pbv < 1.0:
        result['pbv_signal'] = 'bueno'
    else:
        result['pbv_signal'] = 'atencion'

    return result


# ============================================================
# MÉTODO 5: Earning Estimate (Yahoo Finance)
# ============================================================

def calculate_earning_estimate(eps_next_5y):
    """
    Si EPS Next 5Y > 15% → Bueno
    
    Returns:
        dict con señal
    """
    result = {
        'eps_next_5y_pct': eps_next_5y,
        'eps_signal': 'n/a',
        'eps_applies': False
    }

    if eps_next_5y is None:
        return result

    result['eps_applies'] = True
    if eps_next_5y > EPS_GROWTH_THRESHOLD:
        result['eps_signal'] = 'bueno'
    else:
        result['eps_signal'] = 'bajo'

    return result


# ============================================================
# VALORACIÓN COMPLETA — combina los 5 métodos
# ============================================================

def calculate_all_valuations(ticker_data, financial_data, price):
    """
    Calcula los 5 métodos de valoración para un ticker.
    
    Args:
        ticker_data: dict con info del ticker (sector, etc.)
        financial_data: dict con datos financieros (FCO, NI, Deuda, etc.)
        price: float precio actual de mercado
    
    Returns:
        dict completo con todos los métodos + score global
    """
    sector = ticker_data.get('sector', '')
    eps_growth = financial_data.get('eps_next_5y_pct')
    pe_ratio = financial_data.get('pe_ratio')
    peg_yahoo = financial_data.get('peg_ratio')
    operating_cf = financial_data.get('operating_cash_flow')
    net_income = financial_data.get('net_income')
    shares = financial_data.get('shares_outstanding') or ticker_data.get('shares_outstanding')
    total_assets = financial_data.get('total_assets')
    total_liabilities = financial_data.get('total_liabilities')

    # Calcular cada método
    qc = calculate_quick_check(
        pe_ratio=pe_ratio,
        eps_growth_next_5y=eps_growth
    )
    # Guardar Yahoo PEG como referencia (NO sobreescribe el cálculo manual)
    if peg_yahoo and peg_yahoo > 0:
        qc['peg_yahoo_value'] = round(peg_yahoo, 4)

    dcf = calculate_dcf(
        operating_cash_flow=operating_cf,
        eps_growth_rate=eps_growth,
        shares_outstanding=shares,
        current_price=price
    )

    ddm = calculate_ddm(
        net_income=net_income,
        eps_growth_rate=eps_growth,
        shares_outstanding=shares,
        current_price=price
    )

    pbv = calculate_pbv(
        total_assets=total_assets,
        total_liabilities=total_liabilities,
        shares_outstanding=shares,
        current_price=price,
        sector=sector
    )

    ee = calculate_earning_estimate(eps_growth)

    # Score global: contar señales positivas
    positive = 0
    if qc.get('peg_signal') in ('subvalorada', 'justo', 'invertible'):
        positive += 1
    if dcf.get('dcf_signal') == 'subvalorada':
        positive += 1
    if ddm.get('ddm_signal') == 'subvalorada':
        positive += 1
    if pbv.get('pbv_signal') in ('muy_bueno', 'bueno'):
        positive += 1
    if ee.get('eps_signal') == 'bueno':
        positive += 1

    return {
        'ticker': ticker_data.get('ticker'),
        'price_at_date': price,
        'fiscal_year_used': financial_data.get('fiscal_year'),
        # Método 1
        'peg_value': qc.get('peg_value'),
        'peg_eps_growth': qc.get('peg_eps_growth'),
        'peg_pe_used': qc.get('peg_pe_used'),
        'peg_signal': qc.get('peg_signal', 'n/a'),
        'peg_yahoo_value': qc.get('peg_yahoo_value'),
        # Método 2
        'dcf_intrinsic_value': dcf.get('dcf_intrinsic_value'),
        'dcf_diff_vs_price': dcf.get('dcf_diff_vs_price'),
        'dcf_diff_pct': dcf.get('dcf_diff_pct'),
        'dcf_applies': 1 if dcf.get('dcf_applies') else 0,
        'dcf_signal': dcf.get('dcf_signal', 'n/a'),
        # Método 3
        'ddm_intrinsic_value': ddm.get('ddm_intrinsic_value'),
        'ddm_diff_vs_price': ddm.get('ddm_diff_vs_price'),
        'ddm_diff_pct': ddm.get('ddm_diff_pct'),
        'ddm_applies': 1 if ddm.get('ddm_applies') else 0,
        'ddm_signal': ddm.get('ddm_signal', 'n/a'),
        # Método 4
        'pbv_ratio': pbv.get('pbv_ratio'),
        'pbv_is_bank': 1 if pbv.get('pbv_is_bank') else 0,
        'pbv_signal': pbv.get('pbv_signal', 'n/a'),
        # Método 5
        'eps_next_5y_pct': ee.get('eps_next_5y_pct'),
        'eps_signal': ee.get('eps_signal', 'n/a'),
        # Score global
        'positive_signals': positive,
    }
