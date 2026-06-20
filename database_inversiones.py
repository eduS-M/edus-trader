"""
EduSTrader - Inversiones Database Manager
Maneja la base de datos local SQLite (inversiones.db)
"""

import sqlite3
import os
from pathlib import Path

DB_FILE = Path(__file__).parent / 'inversiones.db'

def get_db_connection():
    """Retorna una conexión a la base de datos con acceso por nombre de columna"""
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Crea las tablas si no existen basándose en la migración original de Cloudflare"""
    if not DB_FILE.exists():
        print(f"Creando nueva base de datos en {DB_FILE}")

    with get_db_connection() as conn:
        cursor = conn.cursor()
        
        # 1. INV_TICKERS
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS inv_tickers (
            ticker            TEXT PRIMARY KEY,
            name              TEXT,
            sector            TEXT,
            industry          TEXT,
            instrument_type   TEXT NOT NULL DEFAULT 'stock',
            exchange          TEXT,
            currency          TEXT NOT NULL DEFAULT 'USD',
            is_in_portfolio   INTEGER NOT NULL DEFAULT 0,
            is_in_watchlist   INTEGER NOT NULL DEFAULT 0,
            is_in_sp500       INTEGER NOT NULL DEFAULT 0,
            is_custom_scanner INTEGER NOT NULL DEFAULT 0,
            last_price        REAL,
            price_change_pct  REAL,
            week_52_high      REAL,
            week_52_low       REAL,
            shares_outstanding REAL,
            market_cap        REAL,
            last_price_updated_at TEXT,
            notes             TEXT,
            created_at        TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
        )""")
        
        # 2. INV_PORTFOLIO_POSITIONS
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS inv_portfolio_positions (
            id              TEXT PRIMARY KEY,
            ticker          TEXT NOT NULL REFERENCES inv_tickers(ticker),
            quantity        REAL NOT NULL,
            avg_price       REAL NOT NULL,
            currency        TEXT NOT NULL DEFAULT 'USD',
            first_buy_date  TEXT,
            last_buy_date   TEXT,
            status          TEXT NOT NULL DEFAULT 'active',
            close_date      TEXT,
            close_price     REAL,
            current_price   REAL,
            current_value   REAL,
            unrealized_pnl  REAL,
            unrealized_pnl_pct REAL,
            notes           TEXT,
            created_at      TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
        )""")
        
        # 3. INV_FINANCIAL_DATA
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS inv_financial_data (
            id                      TEXT PRIMARY KEY,
            ticker                  TEXT NOT NULL REFERENCES inv_tickers(ticker),
            fiscal_year             INTEGER NOT NULL,
            fiscal_quarter          INTEGER NOT NULL DEFAULT 0,
            period_type             TEXT NOT NULL DEFAULT 'annual',
            report_date             TEXT,
            operating_cash_flow     REAL,
            capex                   REAL,
            free_cash_flow          REAL,
            net_income              REAL,
            revenue                 REAL,
            eps_diluted             REAL,
            short_term_debt         REAL,
            long_term_debt          REAL,
            cash_and_investments    REAL,
            total_assets            REAL,
            total_liabilities       REAL,
            total_goodwill          REAL,
            total_intangibles       REAL,
            book_value_per_share    REAL,
            eps_next_5y_pct         REAL,
            eps_past_5y_pct         REAL,
            peg_ratio               REAL,
            pe_ratio                REAL,
            forward_pe              REAL,
            source_cashflow         TEXT DEFAULT 'fmp',
            source_income           TEXT DEFAULT 'fmp',
            source_balance          TEXT DEFAULT 'fmp',
            source_eps              TEXT DEFAULT 'yahoo',
            created_at              TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at              TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(ticker, fiscal_year, fiscal_quarter, period_type)
        )""")
        
        # 4. INV_VALUATIONS
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS inv_valuations (
            id                    TEXT PRIMARY KEY,
            ticker                TEXT NOT NULL REFERENCES inv_tickers(ticker),
            valuation_date        TEXT NOT NULL,
            price_at_date         REAL,
            peg_value             REAL,
            peg_eps_growth        REAL,
            peg_pe_used           REAL,
            peg_signal            TEXT,
            dcf_intrinsic_value   REAL,
            dcf_diff_vs_price     REAL,
            dcf_diff_pct          REAL,
            dcf_applies           INTEGER DEFAULT 1,
            dcf_signal            TEXT,
            ddm_intrinsic_value   REAL,
            ddm_diff_vs_price     REAL,
            ddm_diff_pct          REAL,
            ddm_applies           INTEGER DEFAULT 1,
            ddm_signal            TEXT,
            pbv_ratio             REAL,
            pbv_is_bank           INTEGER DEFAULT 0,
            pbv_signal            TEXT,
            eps_next_5y_pct       REAL,
            eps_signal            TEXT,
            positive_signals      INTEGER DEFAULT 0,
            fiscal_year_used      INTEGER,
            created_at            TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(ticker, valuation_date)
        )""")
        
        # Migración: agregar peg_yahoo_value si no existe
        try:
            cursor.execute("ALTER TABLE inv_valuations ADD COLUMN peg_yahoo_value REAL")
        except Exception:
            pass  # ya existe
        # Migración: columnas TTM + revenue growth
        for col in ['ttm_net_income', 'eps_ttm', 'pe_ratio_ttm', 'growth_revenue_pct']:
            try:
                cursor.execute(f"ALTER TABLE inv_valuations ADD COLUMN {col} REAL")
            except Exception:
                pass
        try:
            cursor.execute("ALTER TABLE inv_valuations ADD COLUMN growth_source TEXT")
        except Exception:
            pass

        # Migración: ttm_net_income en inv_financial_data
        try:
            cursor.execute("ALTER TABLE inv_financial_data ADD COLUMN ttm_net_income REAL")
        except Exception:
            pass

        # Migración: columnas DCF detalle
        for col in ['dcf_operating_cf', 'dcf_debt_ps', 'dcf_cash_ps', 'dcf_growth_5y', 'dcf_growth_6_10', 'dcf_wacc']:
            try:
                cursor.execute(f"ALTER TABLE inv_valuations ADD COLUMN {col} REAL")
            except Exception:
                pass

        # 5. INV_PRICE_HISTORY
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS inv_price_history (
            id           TEXT PRIMARY KEY,
            ticker       TEXT NOT NULL REFERENCES inv_tickers(ticker),
            price_date   TEXT NOT NULL,
            open_price   REAL,
            high_price   REAL,
            low_price    REAL,
            close_price  REAL NOT NULL,
            volume       REAL,
            UNIQUE(ticker, price_date)
        )""")
        
        # 6. INV_QUESTIONNAIRE_ANSWERS
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS inv_questionnaire_answers (
            id              TEXT PRIMARY KEY,
            ticker          TEXT NOT NULL REFERENCES inv_tickers(ticker),
            analysis_date   TEXT NOT NULL,
            sales_growing        INTEGER,
            earnings_growing     INTEGER,
            cashflow_growing     INTEGER,
            roe                  REAL,
            eps_past_5y          REAL,
            eps_next_5y          REAL,
            peg                  REAL,
            debt_equity          REAL,
            current_ratio        REAL,
            debt_reasonable      INTEGER,
            avg_volume_3m        REAL,
            insider_pct          REAL,
            insider_change_pct   REAL,
            institutional_pct    REAL,
            institutional_change REAL,
            next_earnings_date   TEXT,
            competitive_advantage TEXT,
            competitors          TEXT,
            add_to_watchlist     INTEGER,
            valuation_methods    TEXT,
            price_vs_valuation   TEXT,
            market_type          TEXT,
            price_action_notes   TEXT,
            has_fibonacci        INTEGER,
            sma50_support        INTEGER,
            sma150_support       INTEGER,
            sma200_support       INTEGER,
            analyst_notes        TEXT,
            final_decision       INTEGER,
            created_at           TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at           TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(ticker, analysis_date)
        )""")

        # 7. INV_SCANNER_UNIVERSE
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS inv_scanner_universe (
            ticker       TEXT PRIMARY KEY REFERENCES inv_tickers(ticker),
            source       TEXT NOT NULL DEFAULT 'sp500',
            is_active    INTEGER NOT NULL DEFAULT 1,
            added_date   TEXT NOT NULL DEFAULT (datetime('now')),
            notes        TEXT
        )""")
        
        # Inicializar datos iniciales si la tabla de tickers está vacía
        cursor.execute("SELECT COUNT(*) FROM inv_tickers")
        if cursor.fetchone()[0] == 0:
            print("Insertando datos iniciales del portafolio en SQLite...")
            tickers_iniciales = [
                ('SPLG', 'SPDR Portfolio S&P 500 ETF', 'ETF', 'etf', 1, 1),
                ('BTCUSD', 'Bitcoin / USD', 'Crypto', 'crypto', 1, 1),
                ('GOOGL', 'Alphabet Inc.', 'Software & IT Services', 'stock', 1, 1),
                ('QQQM', 'Invesco NASDAQ 100 ETF', 'ETF', 'etf', 1, 1),
                ('QCOM', 'Qualcomm Inc.', 'Semiconductors', 'stock', 1, 1),
                ('ETHUSD', 'Ethereum / USD', 'Crypto', 'crypto', 1, 1),
                ('O', 'Realty Income Corporation', 'Residential & Commercial REIT', 'reit', 1, 1),
                ('IBKR', 'Interactive Brokers Group Inc.', 'Investment Banking', 'stock', 1, 1),
                ('CVX', 'Chevron Corporation', 'Oil & Gas', 'stock', 1, 1),
                ('NKE', 'Nike Inc.', 'Textiles & Apparel', 'stock', 1, 1)
            ]
            cursor.executemany("""
                INSERT OR IGNORE INTO inv_tickers (ticker, name, sector, instrument_type, is_in_portfolio, is_in_watchlist)
                VALUES (?, ?, ?, ?, ?, ?)
            """, tickers_iniciales)
            
        conn.commit()

# Ejecutar inicialización al importar si es necesario
# Ejecutar inicialización al importar si es necesario
# Como usamos IF NOT EXISTS, es seguro llamarlo siempre.
# Evita problemas si el archivo se crea vacío sin tablas.
init_db()

def execute_query(sql, params=None, fetch='all'):
    """Helper para ejecutar queries y devolver diccionarios"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(sql, params or ())
            
            if sql.strip().upper().startswith(('INSERT', 'UPDATE', 'DELETE')):
                conn.commit()
                return {'success': True, 'rowcount': cursor.rowcount}
            
            if fetch == 'all':
                rows = cursor.fetchall()
                return [dict(row) for row in rows]
            elif fetch == 'one':
                row = cursor.fetchone()
                return dict(row) if row else None
            return True
    except Exception as e:
        print(f"DB Error: {e}")
        return {'success': False, 'error': str(e)}
