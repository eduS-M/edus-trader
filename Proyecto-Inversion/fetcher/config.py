"""
EduSTrader Investment Dashboard — Configuración
Archivo: config.py
"""

import os
from pathlib import Path

# ============================================================
# API KEYS (cargar desde .env o variables de entorno)
# ============================================================
# Crea un archivo .env en esta misma carpeta con:
#   FMP_API_KEY=tu_api_key_aqui
#   CLOUDFLARE_API_TOKEN=tu_token_aqui
#   CLOUDFLARE_ACCOUNT_ID=tu_account_id
#   CLOUDFLARE_D1_DATABASE_ID=6a751f5f-78bd-4e59-97bb-b149c63c7230

def load_env():
    """Carga variables del archivo .env o FMP_API_KEY.env si existe"""
    base = Path(__file__).parent
    # Buscar en orden: .env primero, luego FMP_API_KEY.env
    for env_name in ['.env', 'FMP_API_KEY.env']:
        env_path = base / env_name
        if env_path.exists():
            with open(env_path) as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#') and '=' in line:
                        key, value = line.split('=', 1)
                        # Solo setear si no está ya seteado (prioridad .env > FMP_API_KEY.env)
                        if key.strip() not in os.environ:
                            os.environ[key.strip()] = value.strip()

load_env()

FMP_API_KEY            = os.environ.get('FMP_API_KEY', '')
CLOUDFLARE_API_TOKEN   = os.environ.get('CLOUDFLARE_API_TOKEN', '')
CLOUDFLARE_ACCOUNT_ID  = os.environ.get('CLOUDFLARE_ACCOUNT_ID', '')
CLOUDFLARE_D1_DB_ID    = os.environ.get('CLOUDFLARE_D1_DATABASE_ID', '6a751f5f-78bd-4e59-97bb-b149c63c7230')
CLOUDFLARE_PAGES_URL   = os.environ.get('CLOUDFLARE_PAGES_URL', 'https://edustrader.pages.dev')

# ============================================================
# CONFIGURACIÓN GENERAL
# ============================================================

# Tasa de descuento usada en DCF (Default 10%, se reemplaza con WACC real si hay datos)
DISCOUNT_RATE = 0.10          # 10% anual

# WACC — Parámetros
RISK_FREE_RATE = 0.045        # 4.5% (10yr Treasury, default si no se puede obtener)
EQUITY_RISK_PREMIUM = 0.055   # 5.5% (Damodaran 2025)
DEFAULT_COST_OF_DEBT = 0.05   # 5% (default si no hay interest expense)

# Años de proyección para DCF y DDM
DCF_PROJECTION_YEARS = 10

# Tasa de crecimiento terminal (después de los 10 años)
TERMINAL_GROWTH_RATE = 0.03   # 3%

# Umbrales de valoración PEG
PEG_SUBVALORADA  = 1.0
PEG_INVERTIBLE   = 2.0        # > 1 y <= 2

# Umbrales PBV
PBV_THRESHOLD_NORMAL = 0.5    # < 0.5 = muy bueno
PBV_THRESHOLD_BANK   = 1.5   # < 1.5 = bueno (bancos)
BANKING_SECTORS = [
    'Banking Services',
    'Banks',
    'Investment Banking & Investment Services',
]

# Earning Estimate: crecimiento mínimo bueno
EPS_GROWTH_THRESHOLD = 0.15   # 15%

# ============================================================
# PORTAFOLIO ACTIVO (desde Excel — carga inicial)
# ============================================================
PORTFOLIO_POSITIONS = [
    {'ticker': 'SPLG',   'quantity': 12.0642,    'avg_price': 64.60,    'first_buy_date': '2023-01-01'},
    {'ticker': 'BTCUSD', 'quantity': 0.00611850, 'avg_price': 75319.20, 'first_buy_date': '2023-01-01'},
    {'ticker': 'GOOGL',  'quantity': 2.0008,     'avg_price': 159.26,   'first_buy_date': '2024-01-01'},
    {'ticker': 'QQQM',   'quantity': 1.0009,     'avg_price': 184.04,   'first_buy_date': '2024-01-01'},
    {'ticker': 'QCOM',   'quantity': 1.0073,     'avg_price': 154.08,   'first_buy_date': '2024-07-01'},
    {'ticker': 'ETHUSD', 'quantity': 0.04001668, 'avg_price': 2668.27,  'first_buy_date': '2025-04-01'},
    {'ticker': 'O',      'quantity': 2.0401,     'avg_price': 54.70,    'first_buy_date': '2024-01-01'},
    {'ticker': 'IBKR',   'quantity': 0.0419,     'avg_price': 24.50,    'first_buy_date': '2023-01-01'},
    {'ticker': 'CVX',    'quantity': 0.0073,     'avg_price': 155.09,   'first_buy_date': '2024-03-01'},
    {'ticker': 'NKE',    'quantity': 0.0068,     'avg_price': 77.75,    'first_buy_date': '2024-01-01'},
]

# ============================================================
# WATCHLIST INICIAL (desde Excel — hoja Seguimiento)
# ============================================================
WATCHLIST_TICKERS = [
    # Acciones de seguimiento activo (con análisis de valoración en el Excel)
    {'ticker': 'AAPL',  'sector': 'Computers, Phones & Household Electronics'},
    {'ticker': 'AMZN',  'sector': 'Diversified Retail'},
    {'ticker': 'META',  'sector': 'Software & IT Services'},
    {'ticker': 'MSFT',  'sector': 'Software & IT Services'},
    {'ticker': 'NVDA',  'sector': 'Semiconductors & Semiconductor Equipment'},
    {'ticker': 'TSLA',  'sector': 'Automobiles & Auto Parts'},
    {'ticker': 'AVGO',  'sector': 'Semiconductors & Semiconductor Equipment'},
    {'ticker': 'TSM',   'sector': 'Semiconductors & Semiconductor Equipment'},
    {'ticker': 'LLY',   'sector': 'Pharmaceuticals'},
    {'ticker': 'V',     'sector': 'Professional & Commercial Services'},
    {'ticker': 'MA',    'sector': 'Software & IT Services'},
    {'ticker': 'KO',    'sector': 'Beverages'},
    {'ticker': 'BRK-B', 'sector': 'Consumer Goods Conglomerates'},
    {'ticker': 'WMT',   'sector': 'Food & Drug Retailing'},
    {'ticker': 'MCD',   'sector': 'Hotels & Entertainment Services'},
    {'ticker': 'MELI',  'sector': 'Software & IT Services'},
    {'ticker': 'NFLX',  'sector': 'Software & IT Services'},
    {'ticker': 'PANW',  'sector': 'Software & IT Services'},
    {'ticker': 'ORCL',  'sector': 'Software & IT Services'},
    {'ticker': 'ADBE',  'sector': 'Software & IT Services'},
    {'ticker': 'COIN',  'sector': 'Financial Technology'},
    {'ticker': 'DELL',  'sector': 'Computers, Phones & Household Electronics'},
    {'ticker': 'SMCI',  'sector': 'Computers, Phones & Household Electronics'},
    {'ticker': 'SQM',   'sector': 'Chemicals'},
    {'ticker': 'DHR',   'sector': 'Healthcare Equipment & Supplies'},
    {'ticker': 'BAC',   'sector': 'Banking Services'},
    {'ticker': 'OXY',   'sector': 'Oil & Gas'},
    {'ticker': 'XOM',   'sector': 'Oil & Gas'},
    {'ticker': 'PBR',   'sector': 'Oil & Gas'},
    {'ticker': 'NEE',   'sector': 'Electrical Utilities & IPPs'},
    {'ticker': 'IBM',   'sector': 'Software & IT Services'},
    {'ticker': 'PEP',   'sector': 'Beverages'},
    {'ticker': 'CSCO',  'sector': 'Communications & Networking'},
    {'ticker': 'ARM',   'sector': 'Semiconductors & Semiconductor Equipment'},
    {'ticker': 'KNSL',  'sector': 'Insurance'},
    {'ticker': 'CB',    'sector': 'Insurance'},
    {'ticker': 'MAR',   'sector': 'Hotels & Entertainment Services'},
    {'ticker': 'HCA',   'sector': 'Healthcare Providers & Services'},
    {'ticker': 'DIS',   'sector': 'Media & Publishing'},
    {'ticker': 'NKE',   'sector': 'Textiles & Apparel'},
    # ETFs de seguimiento
    {'ticker': 'GLD',   'sector': 'ETF'},
    {'ticker': 'GLDM',  'sector': 'ETF'},
    {'ticker': 'PHYS',  'sector': 'ETF'},
    {'ticker': 'IBIT',  'sector': 'ETF'},
    {'ticker': 'VOO',   'sector': 'ETF'},
    {'ticker': 'IWM',   'sector': 'ETF'},
    {'ticker': 'QQQM',  'sector': 'ETF'},
    {'ticker': 'XLK',   'sector': 'ETF'},
    {'ticker': 'XLF',   'sector': 'ETF'},
    {'ticker': 'XLV',   'sector': 'ETF'},
    {'ticker': 'XLI',   'sector': 'ETF'},
    {'ticker': 'XLE',   'sector': 'ETF'},
    {'ticker': 'XLB',   'sector': 'ETF'},
    {'ticker': 'XLY',   'sector': 'ETF'},
    {'ticker': 'XLU',   'sector': 'ETF'},
    {'ticker': 'XLRE',  'sector': 'ETF'},
    {'ticker': 'XLC',   'sector': 'ETF'},
]

# ============================================================
# TICKERS QUE NO SON ACCIONES USA (Yahoo ticker map)
# ============================================================
# Algunos tickers del broker no coinciden con Yahoo Finance
TICKER_YAHOO_MAP = {
    'BTCUSD': 'BTC-USD',
    'ETHUSD': 'ETH-USD',
    'ADAUSD': 'ADA-USD',
    'USDCLP': 'CLP=X',
    'BRK.B':  'BRK-B',
}

# Tickers crypto/forex que NO tienen estados financieros
SKIP_FUNDAMENTALS = {'BTCUSD', 'ETHUSD', 'ADAUSD', 'USDCLP', 'BTC-USD', 'ETH-USD', 'ADA-USD'}

# ETFs que no tienen PEG/EPS pero sí precio y seguimiento técnico
SKIP_VALUATION_METHODS = {
    'SPLG', 'QQQM', 'GLD', 'GLDM', 'PHYS', 'IBIT', 'VOO', 'IWM',
    'XLK', 'XLF', 'XLV', 'XLI', 'XLE', 'XLB', 'XLY', 'XLU', 'XLRE',
    'XLC', 'XSD', 'XSW', 'XHE', 'XES', 'XOP', 'XAR', 'XBI',
    'DAX', 'EWX', 'KCE', 'XLG', 'SPYM', 'SPHR'
}

# ============================================================
# LOGGING
# ============================================================
LOG_FILE = Path(__file__).parent / 'logs' / 'fetcher.log'
LOG_FILE.parent.mkdir(exist_ok=True)
