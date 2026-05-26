-- ============================================================
-- EduS Trader — Módulo de Inversiones (Migración 002)
-- Cloudflare D1 / SQLite
-- ============================================================

-- ------------------------------------------------------------
-- 1. INV_TICKERS — Catálogo maestro de todos los instrumentos
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inv_tickers (
  ticker            TEXT PRIMARY KEY,               -- ej. 'AAPL', 'BTCUSD'
  name              TEXT,                            -- nombre completo
  sector            TEXT,
  industry          TEXT,
  instrument_type   TEXT NOT NULL DEFAULT 'stock'
                    CHECK (instrument_type IN ('stock','etf','crypto','currency','reit','other')),
  exchange          TEXT,
  currency          TEXT NOT NULL DEFAULT 'USD',

  -- Pertenencia a universos
  is_in_portfolio   INTEGER NOT NULL DEFAULT 0,      -- 1 = posición activa
  is_in_watchlist   INTEGER NOT NULL DEFAULT 0,      -- 1 = en watchlist personal
  is_in_sp500       INTEGER NOT NULL DEFAULT 0,      -- 1 = componente del S&P 500
  is_custom_scanner INTEGER NOT NULL DEFAULT 0,      -- 1 = agregado manualmente al scanner

  -- Datos de mercado (actualizados diariamente)
  last_price        REAL,
  price_change_pct  REAL,                            -- % variación del día
  week_52_high      REAL,
  week_52_low       REAL,
  shares_outstanding REAL,
  market_cap        REAL,
  last_price_updated_at TEXT,

  -- Metadatos
  notes             TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_inv_tickers_portfolio  ON inv_tickers(is_in_portfolio);
CREATE INDEX IF NOT EXISTS idx_inv_tickers_watchlist  ON inv_tickers(is_in_watchlist);
CREATE INDEX IF NOT EXISTS idx_inv_tickers_sp500      ON inv_tickers(is_in_sp500);
CREATE INDEX IF NOT EXISTS idx_inv_tickers_sector     ON inv_tickers(sector);

-- ------------------------------------------------------------
-- 2. INV_PORTFOLIO_POSITIONS — Posiciones del portafolio
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inv_portfolio_positions (
  id              TEXT PRIMARY KEY,                  -- UUID v4
  ticker          TEXT NOT NULL REFERENCES inv_tickers(ticker),

  -- Datos de la posición
  quantity        REAL NOT NULL,
  avg_price       REAL NOT NULL,                     -- precio promedio ponderado
  currency        TEXT NOT NULL DEFAULT 'USD',
  first_buy_date  TEXT,                              -- fecha primer trade ISO-8601
  last_buy_date   TEXT,

  -- Estado
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','closed')),
  close_date      TEXT,                              -- NULL = aún abierta
  close_price     REAL,

  -- P&L snapshot (se recalcula con el fetcher)
  current_price   REAL,
  current_value   REAL,
  unrealized_pnl  REAL,
  unrealized_pnl_pct REAL,

  notes           TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_inv_positions_ticker ON inv_portfolio_positions(ticker);
CREATE INDEX IF NOT EXISTS idx_inv_positions_status ON inv_portfolio_positions(status);

-- ------------------------------------------------------------
-- 3. INV_FINANCIAL_DATA — Estados financieros por ticker/año
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inv_financial_data (
  id                      TEXT PRIMARY KEY,           -- UUID v4
  ticker                  TEXT NOT NULL REFERENCES inv_tickers(ticker),
  fiscal_year             INTEGER NOT NULL,
  fiscal_quarter          INTEGER,                    -- NULL = anual; 1-4 = trimestral
  period_type             TEXT NOT NULL DEFAULT 'annual'
                          CHECK (period_type IN ('annual','quarterly')),
  report_date             TEXT,                       -- fecha de publicación

  -- Cash Flow Statement (para DCF)
  operating_cash_flow     REAL,                       -- FCO / Cash from Operating Activities
  capex                   REAL,                       -- Capital Expenditure (opcional)
  free_cash_flow          REAL,                       -- FCO - capex

  -- Income Statement (para DDM - Ganancias Descontadas)
  net_income              REAL,
  revenue                 REAL,
  eps_diluted             REAL,

  -- Balance Sheet (para PBV y DCF)
  short_term_debt         REAL,
  long_term_debt          REAL,
  cash_and_investments    REAL,
  total_assets            REAL,
  total_liabilities       REAL,
  total_goodwill          REAL,
  total_intangibles       REAL,
  book_value_per_share    REAL,

  -- Datos de Yahoo Finance (EPS estimaciones)
  eps_next_5y_pct         REAL,                       -- ej. 0.15 = 15% anual
  eps_past_5y_pct         REAL,
  peg_ratio               REAL,                       -- PEG de Yahoo
  pe_ratio                REAL,
  forward_pe              REAL,

  -- Fuente de datos
  source_cashflow         TEXT DEFAULT 'fmp',         -- 'fmp','yahoo','manual'
  source_income           TEXT DEFAULT 'fmp',
  source_balance          TEXT DEFAULT 'fmp',
  source_eps              TEXT DEFAULT 'yahoo',

  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at              TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE(ticker, fiscal_year, fiscal_quarter, period_type)
);

CREATE INDEX IF NOT EXISTS idx_inv_financial_ticker ON inv_financial_data(ticker);
CREATE INDEX IF NOT EXISTS idx_inv_financial_year   ON inv_financial_data(fiscal_year);

-- ------------------------------------------------------------
-- 4. INV_VALUATIONS — Histórico de valoraciones por fecha
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inv_valuations (
  id                    TEXT PRIMARY KEY,             -- UUID v4
  ticker                TEXT NOT NULL REFERENCES inv_tickers(ticker),
  valuation_date        TEXT NOT NULL,                -- ISO-8601 (YYYY-MM-DD)
  price_at_date         REAL,                         -- precio cuando se calculó

  -- Método 1: Quick Check (PEG)
  peg_value             REAL,
  peg_eps_growth        REAL,                         -- EPS next 5Y usado
  peg_pe_used           REAL,                         -- P/E usado
  peg_signal            TEXT
                        CHECK (peg_signal IN ('subvalorada','justo','invertible','sobrevalorada','n/a')),

  -- Método 2: Flujo de Caja Descontado (DCF)
  dcf_intrinsic_value   REAL,                         -- valor intrínseco por acción
  dcf_diff_vs_price     REAL,                         -- intrínseco - precio_mercado
  dcf_diff_pct          REAL,                         -- % diferencia
  dcf_applies           INTEGER DEFAULT 1,            -- 0 = no aplica (FCO negativo)
  dcf_signal            TEXT
                        CHECK (dcf_signal IN ('subvalorada','sobrevalorada','n/a')),

  -- Método 3: Ganancias Descontadas (DDM)
  ddm_intrinsic_value   REAL,
  ddm_diff_vs_price     REAL,
  ddm_diff_pct          REAL,
  ddm_applies           INTEGER DEFAULT 1,
  ddm_signal            TEXT
                        CHECK (ddm_signal IN ('subvalorada','sobrevalorada','n/a')),

  -- Método 4: Valor en Libros (PBV)
  pbv_ratio             REAL,
  pbv_is_bank           INTEGER DEFAULT 0,            -- 1 = usar umbral de banco (1.5)
  pbv_signal            TEXT
                        CHECK (pbv_signal IN ('muy_bueno','bueno','atencion','n/a')),

  -- Método 5: Earning Estimate (Yahoo)
  eps_next_5y_pct       REAL,
  eps_signal            TEXT
                        CHECK (eps_signal IN ('bueno','bajo','n/a')),

  -- Score global (0-5 señales positivas)
  positive_signals      INTEGER DEFAULT 0,

  -- Inputs financieros usados (snapshot)
  fiscal_year_used      INTEGER,

  created_at            TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE(ticker, valuation_date)
);

CREATE INDEX IF NOT EXISTS idx_inv_valuations_ticker ON inv_valuations(ticker);
CREATE INDEX IF NOT EXISTS idx_inv_valuations_date   ON inv_valuations(valuation_date);
CREATE INDEX IF NOT EXISTS idx_inv_valuations_signal ON inv_valuations(peg_signal);

-- ------------------------------------------------------------
-- 5. INV_PRICE_HISTORY — Precios diarios por ticker
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inv_price_history (
  id           TEXT PRIMARY KEY,
  ticker       TEXT NOT NULL REFERENCES inv_tickers(ticker),
  price_date   TEXT NOT NULL,                         -- YYYY-MM-DD
  open_price   REAL,
  high_price   REAL,
  low_price    REAL,
  close_price  REAL NOT NULL,
  volume       REAL,
  UNIQUE(ticker, price_date)
);

CREATE INDEX IF NOT EXISTS idx_inv_price_ticker ON inv_price_history(ticker);
CREATE INDEX IF NOT EXISTS idx_inv_price_date   ON inv_price_history(price_date);

-- ------------------------------------------------------------
-- 6. INV_QUESTIONNAIRE_ANSWERS — Cuestionario de inversión
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inv_questionnaire_answers (
  id              TEXT PRIMARY KEY,                   -- UUID v4
  ticker          TEXT NOT NULL REFERENCES inv_tickers(ticker),
  analysis_date   TEXT NOT NULL,                      -- YYYY-MM-DD

  -- Sección 1: Análisis Fundamental
  sales_growing        INTEGER,                       -- 0/1
  earnings_growing     INTEGER,
  cashflow_growing     INTEGER,
  roe                  REAL,
  eps_past_5y          REAL,
  eps_next_5y          REAL,
  peg                  REAL,
  debt_equity          REAL,
  current_ratio        REAL,
  debt_reasonable      INTEGER,                       -- 0/1
  avg_volume_3m        REAL,
  insider_pct          REAL,
  insider_change_pct   REAL,
  institutional_pct    REAL,
  institutional_change REAL,
  next_earnings_date   TEXT,
  competitive_advantage TEXT,
  competitors          TEXT,                          -- tickers separados por coma
  add_to_watchlist     INTEGER,

  -- Sección 2: Valoración
  valuation_methods    TEXT,                          -- JSON array
  price_vs_valuation   TEXT,                          -- 'muy_bajo','bajo','justo','alto','muy_alto'

  -- Sección 3: Análisis Técnico
  market_type          TEXT,                          -- 'tendencial','consolidacion','oscilante','erratico'
  price_action_notes   TEXT,
  has_fibonacci        INTEGER,
  sma50_support        INTEGER,
  sma150_support       INTEGER,
  sma200_support       INTEGER,

  -- Notas generales
  analyst_notes        TEXT,
  final_decision       INTEGER,                       -- 0/1 ¿invertir?

  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE(ticker, analysis_date)
);

CREATE INDEX IF NOT EXISTS idx_inv_quest_ticker ON inv_questionnaire_answers(ticker);
CREATE INDEX IF NOT EXISTS idx_inv_quest_date   ON inv_questionnaire_answers(analysis_date);

-- ------------------------------------------------------------
-- 7. INV_SCANNER_UNIVERSE — Universo del scanner
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inv_scanner_universe (
  ticker       TEXT PRIMARY KEY REFERENCES inv_tickers(ticker),
  source       TEXT NOT NULL DEFAULT 'sp500'
               CHECK (source IN ('sp500','custom','watchlist')),
  is_active    INTEGER NOT NULL DEFAULT 1,
  added_date   TEXT NOT NULL DEFAULT (datetime('now')),
  notes        TEXT
);

CREATE INDEX IF NOT EXISTS idx_inv_scanner_source ON inv_scanner_universe(source);
CREATE INDEX IF NOT EXISTS idx_inv_scanner_active ON inv_scanner_universe(is_active);

-- ------------------------------------------------------------
-- TRIGGERS: updated_at automático
-- ------------------------------------------------------------
CREATE TRIGGER IF NOT EXISTS trg_inv_tickers_updated
  AFTER UPDATE ON inv_tickers
  BEGIN UPDATE inv_tickers SET updated_at = datetime('now') WHERE ticker = NEW.ticker; END;

CREATE TRIGGER IF NOT EXISTS trg_inv_positions_updated
  AFTER UPDATE ON inv_portfolio_positions
  BEGIN UPDATE inv_portfolio_positions SET updated_at = datetime('now') WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS trg_inv_financial_updated
  AFTER UPDATE ON inv_financial_data
  BEGIN UPDATE inv_financial_data SET updated_at = datetime('now') WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS trg_inv_quest_updated
  AFTER UPDATE ON inv_questionnaire_answers
  BEGIN UPDATE inv_questionnaire_answers SET updated_at = datetime('now') WHERE id = NEW.id; END;

-- ------------------------------------------------------------
-- DATOS INICIALES: Portafolio activo (desde Excel)
-- ------------------------------------------------------------
INSERT OR IGNORE INTO inv_tickers (ticker, name, sector, instrument_type, is_in_portfolio, is_in_watchlist)
VALUES
  ('SPLG',   'SPDR Portfolio S&P 500 ETF',               'ETF',                        'etf',    1, 1),
  ('BTCUSD', 'Bitcoin / USD',                             'Crypto',                     'crypto', 1, 1),
  ('GOOGL',  'Alphabet Inc.',                             'Software & IT Services',     'stock',  1, 1),
  ('QQQM',   'Invesco NASDAQ 100 ETF',                    'ETF',                        'etf',    1, 1),
  ('QCOM',   'Qualcomm Inc.',                             'Semiconductors',             'stock',  1, 1),
  ('ETHUSD', 'Ethereum / USD',                            'Crypto',                     'crypto', 1, 1),
  ('O',      'Realty Income Corporation',                 'Residential & Commercial REIT','reit', 1, 1),
  ('IBKR',   'Interactive Brokers Group Inc.',            'Investment Banking',         'stock',  1, 1),
  ('CVX',    'Chevron Corporation',                       'Oil & Gas',                  'stock',  1, 1),
  ('NKE',    'Nike Inc.',                                 'Textiles & Apparel',         'stock',  1, 1);
