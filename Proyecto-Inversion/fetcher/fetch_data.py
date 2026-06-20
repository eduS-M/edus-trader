"""
EduSTrader Investment Dashboard — Obtención de Datos Financieros
Archivo: fetch_data.py

Fuentes:
  - Yahoo Finance (yfinance): precio, EPS, PEG, precio histórico
  - FMP (Financial Modeling Prep): estados financieros (FCO, NI, Deuda, etc.)
"""

import time
import logging
import requests
import yfinance as yf
from datetime import datetime, date, timedelta
from config import (
    FMP_API_KEY, TICKER_YAHOO_MAP, SKIP_FUNDAMENTALS,
    SKIP_VALUATION_METHODS, LOG_FILE
)

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler()
    ]
)
log = logging.getLogger(__name__)

FMP_BASE = 'https://financialmodelingprep.com/api'


# ============================================================
# YAHOO FINANCE — Precio + EPS/PEG
# ============================================================

def get_yahoo_ticker(ticker):
    """Convierte ticker de portafolio a formato Yahoo Finance"""
    return TICKER_YAHOO_MAP.get(ticker, ticker)


def fetch_price_and_fundamentals(ticker, delay=0.5):
    """
    Obtiene precio actual, EPS, PEG, y datos de mercado desde Yahoo Finance.
    
    Returns:
        dict con price, eps_next_5y_pct, peg_ratio, pe_ratio, 
              shares_outstanding, market_cap, week_52_high, week_52_low
    """
    yticker = get_yahoo_ticker(ticker)
    result = {
        'ticker': ticker,
        'last_price': None,
        'price_change_pct': None,
        'week_52_high': None,
        'week_52_low': None,
        'shares_outstanding': None,
        'market_cap': None,
        'eps_next_5y_pct': None,
        'peg_ratio': None,
        'pe_ratio': None,
        'forward_pe': None,
        'name': None,
        'sector': None,
        'industry': None,
        'exchange': None,
        'error': None
    }

    try:
        stock = yf.Ticker(yticker)
        info = stock.info

        result['last_price']          = info.get('currentPrice') or info.get('regularMarketPrice')
        chg = info.get('regularMarketChangePercent')
        result['price_change_pct']    = (chg / 100) if chg is not None else None
        result['week_52_high']        = info.get('fiftyTwoWeekHigh')
        result['week_52_low']         = info.get('fiftyTwoWeekLow')
        result['shares_outstanding']  = info.get('sharesOutstanding')
        result['market_cap']          = info.get('marketCap')
        result['pe_ratio']            = info.get('trailingPE')
        result['forward_pe']          = info.get('forwardPE')
        result['peg_ratio']           = info.get('pegRatio')
        result['name']                = info.get('longName') or info.get('shortName')
        result['sector']              = info.get('sector')
        result['industry']            = info.get('industry')
        result['exchange']            = info.get('exchange')

        # EPS Next 5Y: Yahoo lo provee como decimal (0.15 = 15%)
        eps_growth = info.get('earningsGrowth') or info.get('revenueGrowth')
        # Preferir el dato de 5 años si está disponible
        result['eps_next_5y_pct'] = info.get('earningsQuarterlyGrowth') or eps_growth

        log.info(f"Yahoo: {ticker} -> ${result['last_price']}, PEG={result['peg_ratio']}")

    except Exception as e:
        result['error'] = str(e)
        log.error(f"Yahoo error {ticker}: {e}")

    time.sleep(delay)
    return result


def fetch_price_history(ticker, period='1y', interval='1d', delay=0.3):
    """
    Obtiene historial de precios para gráficos.
    
    Args:
        ticker: ticker del instrumento
        period: '1mo', '3mo', '6mo', '1y', '2y', '5y'
        interval: '1d', '1wk', '1mo'
    
    Returns:
        lista de dicts [{date, open, high, low, close, volume}]
    """
    yticker = get_yahoo_ticker(ticker)
    history = []

    try:
        stock = yf.Ticker(yticker)
        df = stock.history(period=period, interval=interval)

        for idx, row in df.iterrows():
            history.append({
                'ticker': ticker,
                'price_date': idx.strftime('%Y-%m-%d'),
                'open_price': round(float(row['Open']), 4) if row['Open'] else None,
                'high_price': round(float(row['High']), 4) if row['High'] else None,
                'low_price': round(float(row['Low']), 4) if row['Low'] else None,
                'close_price': round(float(row['Close']), 4) if row['Close'] else None,
                'volume': float(row['Volume']) if row['Volume'] else None,
            })

        log.info(f"Yahoo historia: {ticker} -> {len(history)} dias")

    except Exception as e:
        log.error(f"Yahoo historia error {ticker}: {e}")

    time.sleep(delay)
    return history


# ============================================================
# FMP API — Estados Financieros
# ============================================================

def fmp_get(endpoint, params=None, delay=0.3):
    """
    Llamada genérica a la API de FMP.
    
    Returns:
        list o dict, o None si hay error
    """
    if not FMP_API_KEY:
        log.error("FMP_API_KEY no configurada. Crea un archivo .env con FMP_API_KEY=tu_key")
        return None

    url = f"{FMP_BASE}{endpoint}"
    p = params or {}
    p['apikey'] = FMP_API_KEY

    try:
        resp = requests.get(url, params=p, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if isinstance(data, list) and len(data) > 0:
                return data
            elif isinstance(data, dict) and data:
                return data
            else:
                return None
        elif resp.status_code == 429:
            log.warning("FMP rate limit - esperando 60s")
            time.sleep(60)
            return fmp_get(endpoint, params, delay)
        else:
            log.error(f"FMP HTTP {resp.status_code} — {endpoint}")
            return None
    except Exception as e:
        log.error(f"FMP error {endpoint}: {e}")
        return None
    finally:
        time.sleep(delay)


def fetch_financials_fmp(ticker):
    """
    Obtiene estados financieros usando Yahoo Finance (yfinance).
    FMP restringió los endpoints gratuitos (HTTP 403), así que usamos Yahoo como alternativa.
    """
    import pandas as pd
    if ticker in SKIP_FUNDAMENTALS:
        log.info(f"Skip fundamentals: {ticker} (crypto/forex)")
        return None

    result = {
        'ticker': ticker,
        'fiscal_year': None,
        'report_date': None,
        'operating_cash_flow': None,
        'free_cash_flow': None,
        'net_income': None,
        'revenue': None,
        'eps_diluted': None,
        'short_term_debt': None,
        'long_term_debt': None,
        'cash_and_investments': None,
        'total_assets': None,
        'total_liabilities': None,
        'total_goodwill': None,
        'total_intangibles': None,
        'book_value_per_share': None,
        'shares_outstanding': None,
        'ttm_net_income': None,
        'interest_expense': None,
        'income_tax_expense': None,
        'income_before_tax': None,
        'beta': None,
        'market_cap': None,
        'error': None
    }

    try:
        yticker = get_yahoo_ticker(ticker)
        stock = yf.Ticker(yticker)
        
        cf = stock.cashflow
        inc = stock.financials
        bs = stock.balance_sheet
        
        if cf.empty or inc.empty or bs.empty:
            log.warning(f"Yahoo: No hay suficientes datos financieros para {ticker}")
            return None
            
        latest_date = inc.columns[0]
        result['fiscal_year'] = latest_date.year
        result['report_date'] = latest_date.strftime('%Y-%m-%d')
        
        def get_val(df, keys):
            for k in keys:
                if k in df.index:
                    val = df.loc[k, latest_date]
                    if pd.notna(val):
                        return float(val)
            return None

        result['operating_cash_flow'] = get_val(cf, ['Operating Cash Flow', 'Total Cash From Operating Activities'])
        result['free_cash_flow'] = get_val(cf, ['Free Cash Flow'])
        
        result['net_income'] = get_val(inc, ['Net Income', 'Net Income Common Stockholders'])
        result['revenue'] = get_val(inc, ['Total Revenue', 'Operating Revenue'])
        result['eps_diluted'] = get_val(inc, ['Diluted EPS', 'Basic EPS'])
        
        result['short_term_debt'] = get_val(bs, ['Current Debt And Capital Lease Obligation', 'Current Debt', 'Short Long Term Debt']) or 0
        result['long_term_debt'] = get_val(bs, ['Long Term Debt And Capital Lease Obligation', 'Long Term Debt']) or 0
        result['cash_and_investments'] = get_val(bs, ['Cash Cash Equivalents And Short Term Investments', 'Cash And Cash Equivalents'])
        result['total_assets'] = get_val(bs, ['Total Assets'])
        result['total_liabilities'] = get_val(bs, ['Total Liabilities Net Minority Interest', 'Total Liabilities'])
        
        result['total_goodwill'] = get_val(bs, ['Goodwill']) or 0
        result['total_intangibles'] = get_val(bs, ['Other Intangible Assets', 'Intangible Assets']) or 0

        result['interest_expense'] = get_val(inc, ['Interest Expense', 'Interest Expense Non Operating']) or 0
        result['income_tax_expense'] = get_val(inc, ['Tax Provision', 'Income Tax Expense', 'Income Tax']) or 0
        result['income_before_tax'] = get_val(inc, ['Income Before Tax', 'Pretax Income', 'Income Before Tax Expense'])

        info = stock.info
        result['shares_outstanding'] = info.get('sharesOutstanding')
        result['book_value_per_share'] = info.get('bookValue')
        result['beta'] = info.get('beta')
        result['market_cap'] = info.get('marketCap')

        # TTM Net Income (suma últimos 4 trimestres)
        try:
            qinc = stock.quarterly_financials
            if qinc is not None and not qinc.empty:
                cols = qinc.columns[:4]
                ttm = 0
                has_ni = False
                for col in cols:
                    if 'Net Income' in qinc.index and pd.notna(qinc.loc['Net Income', col]):
                        ttm += float(qinc.loc['Net Income', col])
                        has_ni = True
                if has_ni:
                    result['ttm_net_income'] = ttm
        except Exception:
            pass

        log.info(f"Yahoo Financials: {ticker} FY{result['fiscal_year']} OK")

    except Exception as e:
        result['error'] = str(e)
        log.error(f"Yahoo financials error {ticker}: {e}")

    return result


# ============================================================
# S&P 500 — Lista de Tickers
# ============================================================

def get_sp500_tickers():
    """
    Obtiene la lista actual de componentes del S&P 500 desde Wikipedia.
    
    Returns:
        list de dicts [{ticker, name, sector, sub_industry}]
    """
    import pandas as pd

    url = 'https://en.wikipedia.org/wiki/List_of_S%26P_500_companies'
    try:
        tables = pd.read_html(url)
        df = tables[0]
        tickers = []
        for _, row in df.iterrows():
            t = str(row['Symbol']).replace('.', '-')  # BRK.B → BRK-B
            tickers.append({
                'ticker': t,
                'name': str(row.get('Security', '')),
                'sector': str(row.get('GICS Sector', '')),
                'industry': str(row.get('GICS Sub-Industry', '')),
                'is_in_sp500': 1
            })
        log.info(f"S&P 500: {len(tickers)} componentes obtenidos")
        return tickers
    except Exception as e:
        log.error(f"Error obteniendo S&P 500: {e}")
        return []


# ============================================================
# BULK FETCH — Para múltiples tickers
# ============================================================

def fetch_bulk_prices(tickers, delay=0.4):
    """
    Obtiene precios y fundamentales básicos para una lista de tickers.
    Optimizado con yfinance.download() para speed.
    
    Returns:
        dict {ticker: data}
    """
    results = {}

    # Convertir a formato Yahoo
    yahoo_tickers = [get_yahoo_ticker(t) for t in tickers]
    ticker_map = {get_yahoo_ticker(t): t for t in tickers}

    log.info(f"Fetching precios para {len(tickers)} tickers...")

    # Descargar todos los precios de una sola vez (mucho más rápido)
    try:
        import pandas as pd
        data = yf.download(
            yahoo_tickers,
            period='2d',
            interval='1d',
            group_by='ticker',
            auto_adjust=True,
            progress=False
        )

        today = date.today().strftime('%Y-%m-%d')
        yesterday = (date.today() - timedelta(days=1)).strftime('%Y-%m-%d')

        for yticker in yahoo_tickers:
            original = ticker_map.get(yticker, yticker)
            try:
                if len(yahoo_tickers) == 1:
                    df = data
                else:
                    df = data[yticker]

                if df.empty:
                    continue

                last_row = df.iloc[-1]
                prev_row = df.iloc[-2] if len(df) >= 2 else last_row

                price = float(last_row['Close']) if 'Close' in last_row else None
                prev_close = float(prev_row['Close']) if 'Close' in prev_row else price
                change_pct = ((price - prev_close) / prev_close) if price and prev_close else None

                results[original] = {
                    'ticker': original,
                    'last_price': round(price, 4) if price else None,
                    'price_change_pct': round(change_pct, 6) if change_pct else None,
                    'price_date': today
                }
            except Exception as e:
                log.warning(f"Precio {original}: {e}")
                continue

    except Exception as e:
        log.error(f"Bulk download error: {e}")

    # Obtener fundamentales individualmente (más lento, solo para no-crypto/ETF)
    fundamentals_tickers = [t for t in tickers if t not in SKIP_VALUATION_METHODS and t not in SKIP_FUNDAMENTALS]
    for ticker in fundamentals_tickers:
        try:
            fund = fetch_price_and_fundamentals(ticker, delay=delay)
            if ticker in results:
                results[ticker].update(fund)
            else:
                results[ticker] = fund
        except Exception as e:
            log.warning(f"Fundamentales {ticker}: {e}")

    log.info(f"Bulk fetch completo: {len(results)} tickers procesados")
    return results
