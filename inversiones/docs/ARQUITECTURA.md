# Arquitectura del Módulo EduS Inversión

## 1. Cómo funciona el sistema

```
Tu PC (servidor Flask en puerto 5000)
        │
        ├── INICIAR_DASHBOARD.bat  ← Lo ejecutas para arrancar todo
        │         │
        │         ├── Inicia: python server.py  (Flask en :5000)
        │         └── Inicia: ngrok http 5000   (túnel público)
        │
        └── Túnel Ngrok ──► https://zestfully-retread-activism.ngrok-free.dev
                              (URL pública que ves desde tablet/exterior)
```

> **Regla de oro:** Cualquier cambio a los archivos HTML/CSS/JS en la carpeta local
> se refleja inmediatamente en `localhost:5000` y por ende también en la URL de Ngrok.
> NO hay que publicar nada. Solo reiniciar el servidor si se cambia `server.py`.

---

## 2. Las tres ubicaciones y su rol

### 📁 A) Servidor activo — LA FUENTE DE VERDAD (editar aquí)
```
C:\Users\eduar\OneDrive - Desarrollo Personal\
  Documents - Operativa Diaria\EduSTrader - Local Free\
  │
  ├── INICIAR_DASHBOARD.bat        ← Arranque del sistema
  ├── server.py                    ← Flask app (APIs + sirve archivos)
  ├── database_inversiones.py      ← Lógica de BD
  ├── inversiones.db               ← Base de datos SQLite ACTIVA
  │
  └── inversiones/                 ← Archivos servidos en /inversiones/
        ├── index.html             ← Portafolio
        ├── watchlist.html         ← Watchlist
        ├── scanner.html           ← Scanner de oportunidades
        ├── ticker.html            ← Análisis detallado de un ticker
        ├── cuestionario.html      ← Checklist de inversión
        ├── docs/                  ← 📚 DOCUMENTACIÓN DEL PROYECTO
        │     ├── ARQUITECTURA.md  ← Este archivo
        │     └── CHANGELOG.md     ← Registro de todos los cambios
        └── assets/
              ├── inv-styles.css   ← Todos los estilos del módulo
              ├── inv-dashboard.js ← Lógica JS (portfolio, scanner)
              └── inv-charts.js    ← Gráficos históricos
```
> ⚠️ SIEMPRE editar aquí. Estos son los archivos que Flask sirve en tiempo real.

---

### 📁 B) Repositorio GitHub — Respaldo e historial
```
C:\Users\eduar\OneDrive - Desarrollo Personal\
  Documents\GitHub\edus-trader\inversiones\
```
> ✅ Uso: Historial de versiones con `git commit`.
> Sincronizar después de confirmar cada cambio en A).

---

### 📁 C) Proyecto-Inversion — Legacy (no usar)
```
EduSTrader - Local Free\Proyecto-Inversion\
  ├── BD INVERSIONES V2.xlsx    ← Hoja original
  ├── inversiones.db            ← BD vieja (NO la usa el servidor)
  └── fetcher/                  ← Scripts viejos
```
> ❌ No editar. Solo referencia histórica.

---

## 3. Rutas del servidor Flask (`server.py`)

### Páginas HTML
| URL | Archivo | Descripción |
|-----|---------|-------------|
| `/inversiones/` | `inversiones/index.html` | Portafolio |
| `/inversiones/watchlist.html` | `inversiones/watchlist.html` | Watchlist |
| `/inversiones/scanner.html` | `inversiones/scanner.html` | Scanner |
| `/inversiones/ticker.html` | `inversiones/ticker.html` | Ticker detalle |
| `/inversiones/cuestionario.html` | `inversiones/cuestionario.html` | Cuestionario |

### APIs REST
| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/inversiones/portfolio` | GET | Posiciones activas + resumen |
| `/api/inversiones/watchlist` | GET | Tickers en watchlist |
| `/api/inversiones/scanner` | GET | Scan con filtros |
| `/api/inversiones/valuations` | GET | Historial + última valuación |
| `/api/inversiones/questionnaire` | GET/POST | Leer/guardar cuestionario |
| `/api/inversiones/risk` | GET | ATR(14), stop loss y target |
| `/api/inversiones/price_history` | GET | OHLCV histórico |

---

## 4. Datos disponibles para Auto-Fill del Cuestionario

La API `/api/inversiones/questionnaire?ticker=XXXX` devuelve tres objetos:

### `data.valuations`
| Campo | → Formulario |
|-------|-------------|
| `peg_value` | `peg` |
| `eps_next_5y_pct × 100` | `eps_next_5y` |
| `dcf_signal` + `peg_signal` | `price_vs_valuation` (inferido) |

### `data.ticker_data`
| Campo | → Formulario / Cálculo |
|-------|----------------------|
| `net_income / (total_assets - total_liabilities) × 100` | `roe` |
| `total_liabilities / (total_assets - total_liabilities)` | `debt_equity` |
| `operating_cash_flow > 0` | `cashflow_growing` |
| `net_income > 0` | `earnings_growing` |
| `revenue > 0` | `sales_growing` |
| `eps_past_5y_pct × 100` | `eps_past_5y` |
| `debt_equity < 2` → Sí | `debt_reasonable` |

### `data.latest`
Si existe (cuestionario guardado anteriormente), sus valores tienen **prioridad** sobre el auto-fill.

---

## 5. Campos del formulario cuestionario.html

### Sección 1 — Análisis Fundamental
| Campo | Tipo | Auto-fill |
|-------|------|-----------|
| `sales_growing` | select Sí/No | ✅ `revenue > 0` |
| `earnings_growing` | select Sí/No | ✅ `net_income > 0` |
| `cashflow_growing` | select Sí/No | ✅ `operating_cash_flow > 0` |
| `roe` | número % | ✅ Calculado |
| `eps_past_5y` | número % | ✅ `eps_past_5y_pct × 100` |
| `eps_next_5y` | número % | ✅ `eps_next_5y_pct × 100` |
| `peg` | número | ✅ `peg_value` |
| `debt_equity` | número | ✅ Calculado |
| `debt_reasonable` | select Sí/No | ✅ `debt_equity < 2` |
| `competitors` | texto | ❌ Manual |

### Sección 2 — Valoración
| Campo | Tipo | Auto-fill |
|-------|------|-----------|
| `price_vs_valuation` | select | ✅ Inferido de señales DCF/PEG |

### Sección 3 — Técnico y Decisión
| Campo | Tipo | Auto-fill |
|-------|------|-----------|
| `market_type` | select | ❌ Manual |
| `price_action_notes` | textarea | ❌ Manual |
| `analyst_notes` | textarea | ❌ Manual |
| `final_decision` | select | ❌ Manual |

---

## 6. Pipeline de datos — Ciclo completo

### 6A. Flujo general

```
Yahoo Finance (yfinance)
       │
       ├── <info> ──────────────────────────► inv_tickers (name, sector, last_price, ...)
       │
       ├── <history(period='5y')> ──────────► inv_price_history (1255 filas OHLCV)
       │
       ├── <cashflow> + <financials> ───────► inv_financial_data (OCF, NI, Total Assets...)
       │    + <balance_sheet>                    │
       │                                         └──► calculate_all_valuations()
       │                                                    │
       └── <info> (epsGrowth, pegRatio...) ────┘              │
                                                               ├──► inv_valuations (hoy)
                                                               │
                                                               └──► inv_valuations (históricas por año fiscal)
```

### 6B. Pipeline al añadir un ticker (`POST /api/inversiones/watchlist/add`)

| Paso | Función | Origen | Destino | Tiempo estimado |
|------|---------|--------|---------|-----------------|
| 1. Verificar existencia | consulta SQL | `inv_tickers` | — | instantáneo |
| 2. Metadata del ticker | `stock.info` | Yahoo | `inv_tickers` (name, sector, industry, exchange) | ~1-2s |
| 3. Precio + rango 52s | `stock.history(period='5y')` | Yahoo | `UPDATE inv_tickers SET last_price, price_change_pct, week_52_high, week_52_low` | incluido en #4 |
| 4. Historial precios 5 años | `stock.history(period='5y')` | Yahoo | `inv_price_history` (~1255 filas) | ~3-5s |
| 5. Datos financieros | `fetch_financials_fmp()` via yfinance | Yahoo (cashflow, financials, balance_sheet) | `inv_financial_data` (1 fila, último año fiscal) | ~2-3s |
| 6. Valoración actual | `calculate_all_valuations()` | `fin_data` + `stock.info` | `inv_valuations` (1 fila, hoy) | incluido en #5 |
| 7. Valoraciones históricas | `_run_historical_valuations()` | Yahoo financials multi-año + precios 5y | `inv_valuations` (hasta 5 filas, una por año fiscal) | ~3-5s |

> **Tiempo total estimado:** 10-20s para un ticker bursátil típico.

### 6C. Eliminar ticker (`POST /api/inversiones/watchlist/remove`)

- **Soft delete:** `UPDATE inv_tickers SET is_in_watchlist = 0`
- **No se eliminan** datos de `inv_price_history`, `inv_financial_data` ni `inv_valuations`
- Si se re-agrega el mismo ticker, se reactiva (`is_in_watchlist = 1`) y se **recalculan** valoraciones completas con datos frescos

---

## 7. Esquema de Base de Datos (`inversiones.db`)

### 7A. `inv_tickers` — Maestro de tickers

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `ticker` | TEXT PK | Símbolo (AAPL, MSFT...) |
| `name` | TEXT | Nombre largo de la empresa |
| `sector` | TEXT | Sector industrial |
| `industry` | TEXT | Industria específica |
| `exchange` | TEXT | Bolsa (NASDAQ, NYSE...) |
| `instrument_type` | TEXT | stock / etf / crypto |
| `currency` | TEXT | Divisa (USD por defecto) |
| `last_price` | REAL | Último precio de cierre disponible |
| `price_change_pct` | REAL | Cambio porcentual vs día anterior |
| `week_52_high` | REAL | Máximo en 52 semanas |
| `week_52_low` | REAL | Mínimo en 52 semanas |
| `market_cap` | REAL | Capitalización de mercado |
| `shares_outstanding` | REAL | Acciones en circulación |
| `is_in_portfolio` | INTEGER | 0/1 — está en el portafolio |
| `is_in_watchlist` | INTEGER | 0/1 — está en seguimiento |
| `is_in_sp500` | INTEGER | 0/1 — pertenece al S&P 500 |
| `is_custom_scanner` | INTEGER | 0/1 — incluido en scanner personalizado |
| `created_at` | TEXT | Fecha de creación |
| `updated_at` | TEXT | Fecha de última actualización |

### 7B. `inv_financial_data` — Estados financieros anuales

| Columna | Tipo | Descripción | Origen |
|---------|------|-------------|--------|
| `id` | TEXT PK | UUID |
| `ticker` | TEXT FK → inv_tickers | |
| `fiscal_year` | INTEGER | Año fiscal (ej: 2025) |
| `fiscal_quarter` | INTEGER | Trimestre (0 = anual) |
| `period_type` | TEXT | 'annual' por defecto |
| `report_date` | TEXT | Fecha del reporte |
| `operating_cash_flow` | REAL | Flujo de caja operativo (TTM) | Yahoo: Cash Flow Statement → 'Operating Cash Flow' |
| `capex` | REAL | Capex | Yahoo: 'Capital Expenditure' |
| `free_cash_flow` | REAL | FCO - Capex | Calculado |
| `net_income` | REAL | Ingreso neto | Yahoo: Income Statement → 'Net Income' |
| `revenue` | REAL | Ingresos totales | Yahoo: 'Total Revenue' |
| `eps_diluted` | REAL | Utilidad diluida por acción | Yahoo: 'Diluted EPS' |
| `short_term_debt` | REAL | Deuda corto plazo | Yahoo: Balance Sheet → 'Short Term Debt' |
| `long_term_debt` | REAL | Deuda largo plazo | Yahoo: 'Long Term Debt' |
| `cash_and_investments` | REAL | Efectivo e inversiones | Yahoo: 'Cash And Cash Equivalents' |
| `total_assets` | REAL | Activos totales | Yahoo: 'Total Assets' |
| `total_liabilities` | REAL | Pasivos totales | Yahoo: 'Total Liabilities Net Minority Interest' |
| `total_goodwill` | REAL | Goodwill | Yahoo: 'Goodwill' |
| `total_intangibles` | REAL | Intangibles | Yahoo: 'Other Intangible Assets' |
| `book_value_per_share` | REAL | Valor contable por acción | Yahoo: calculado o 'Book Value Per Share' |
| `eps_next_5y_pct` | REAL | Crecimiento EPS estimado 5y | Yahoo: stock.info → 'earningsGrowth' |
| `eps_past_5y_pct` | REAL | Crecimiento EPS histórico 5y | Yahoo: (dato esporádico) |
| `peg_ratio` | REAL | Ratio PEG | Yahoo: stock.info → 'pegRatio' |
| `pe_ratio` | REAL | Price/Earnings | Yahoo: stock.info → 'trailingPE' |
| `forward_pe` | REAL | Forward PE | Yahoo: stock.info → 'forwardPE' |
| UNIQUE | (ticker, fiscal_year, fiscal_quarter, period_type) |

**Claves de búsqueda en los DataFrames de yfinance para cada campo:**

| Campo | Cash Flow Statement | Income Statement | Balance Sheet |
|-------|-------------------|-----------------|---------------|
| `operating_cash_flow` | `'Operating Cash Flow'` / `'Cash Flow From Continuing Operating Activities'` | | |
| `net_income` | | `'Net Income'` / `'Net Income Common Stockholders'` | |
| `total_assets` | | | `'Total Assets'` / `'TotalAssets'` |
| `total_liabilities` | | | `'Total Liabilities Net Minority Interest'` / `'TotalLiabilities'` |
| `eps_diluted` | | `'Diluted EPS'` / `'Basic EPS'` | |
| `ordinary_shares` | | | `'Ordinary Shares Number'` / `'Share Issued'` |

> 📌 **Nota:** Estos nombres de índice varían entre tickers. El código prueba múltiples variantes en orden de prioridad.

### 7C. `inv_valuations` — Resultados de valoración

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | TEXT PK | UUID |
| `ticker` | TEXT FK → inv_tickers | |
| `valuation_date` | TEXT | Fecha de la valoración |
| `price_at_date` | REAL | Precio del activo en esa fecha |
| `peg_value` | REAL | Ratio PEG calculado (fórmula manual: P/E / EarningsGrowth / 100) |
| `peg_eps_growth` | REAL | Tasa de crecimiento usada para PEG (de stock.info → earningsGrowth) |
| `peg_pe_used` | REAL | P/E usado para el cálculo (Price / EPS, donde EPS = Net Income / Shares) |
| `peg_signal` | TEXT | subvalorada / justo / invertible / sobrevalorada / n/a |
| `peg_yahoo_value` | REAL | PEG de Yahoo Finance (referencia, no afecta señal) |
| `ttm_net_income` | REAL | Suma Net Income últimos 4 trimestres |
| `eps_ttm` | REAL | EPS basado en TTM (TTM Net Income / Shares) |
| `pe_ratio_ttm` | REAL | P/E basado en EPS(TTM) |
| `growth_revenue_pct` | REAL | Crecimiento calculado de Revenue Estimates High |
| `growth_source` | TEXT | 'revenue_estimate' o 'earnings_growth' (fallback) |
| `dcf_intrinsic_value` | REAL | Valor intrínseco DCF |
| `dcf_diff_vs_price` | REAL | Diferencia (intrínseco - precio) |
| `dcf_diff_pct` | REAL | Diferencia porcentual |
| `dcf_applies` | INTEGER | 0/1 — DCF aplicable |
| `dcf_signal` | TEXT | subvalorada / sobrevalorada / n/a |
| `ddm_intrinsic_value` | REAL | Valor intrínseco DDM |
| `ddm_diff_vs_price` | REAL | Diferencia DDM vs precio |
| `ddm_diff_pct` | REAL | Diferencia porcentual DDM |
| `ddm_applies` | INTEGER | 0/1 — DDM aplicable |
| `ddm_signal` | TEXT | subvalorada / sobrevalorada / n/a |
| `pbv_ratio` | REAL | Price/Book Value |
| `pbv_is_bank` | INTEGER | 0/1 — es banco (ajuste PBV) |
| `pbv_signal` | TEXT | muy_bueno / bueno / atencion / sobrevalorada / n/a |
| `eps_next_5y_pct` | REAL | Crecimiento EPS estimado (del info) |
| `eps_signal` | TEXT | bueno / regular / malo / n/a |
| `positive_signals` | INTEGER | Score 0-5: suma de señales positivas |
| `fiscal_year_used` | INTEGER | Año fiscal de los datos usados |
| `created_at` | TEXT | Timestamp de inserción |
| UNIQUE | (ticker, valuation_date) |

**Reglas del score (`positive_signals`):**
- PEG signal = subvalorada o invertible → +1
- DCF signal = subvalorada → +1
- DDM signal = subvalorada → +1
- PBV signal = muy_bueno o bueno → +1
- EPS signal = bueno → +1

### 7D. `inv_price_history` — Precios históricos diarios

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | TEXT PK | UUID |
| `ticker` | TEXT FK → inv_tickers | |
| `price_date` | TEXT | Fecha de la sesión |
| `open_price` | REAL | Precio de apertura |
| `high_price` | REAL | Máximo del día |
| `low_price` | REAL | Mínimo del día |
| `close_price` | REAL | Precio de cierre |
| `volume` | INTEGER | Volumen negociado |
| UNIQUE | (ticker, price_date) |

> **Volumen de datos:** ~1255 filas por ticker (5 años hábiles).  
> **Origen:** `yfinance.Ticker.history(period='5y')` con pandas DataFrame de 1255 registros.

### 7E. `inv_questionnaire_answers` — Respuestas del cuestionario

Guarda las respuestas del formulario de `cuestionario.html`. Contiene todos los campos del formulario más `ticker`, `analysis_date`, `created_at`. Los datos guardados tienen prioridad sobre auto-fill al reabrir el cuestionario.

### 7F. `inv_portfolio_positions` — Posiciones del portafolio

Almacena las posiciones abiertas con `ticker`, `quantity`, `avg_price`, `fecha_compra`. Cada ticker debe tener también `is_in_portfolio = 1` en `inv_tickers`.

### 7G. Tabla de relaciones entre tablas

```
inv_tickers (1) ─────┬── (N) inv_price_history
                     ├── (N) inv_financial_data    (uno por año fiscal)
                     ├── (N) inv_valuations         (uno por fecha de valoración)
                     ├── (N) inv_questionnaire_answers
                     └── (N) inv_portfolio_positions
```

---

## 8. Fórmula de Cálculo del PEG Ratio

### 8A. Fórmula exacta (metodología actual)

```
PEG = P/E(TTM) ÷ Growth%  
Growth% = (Revenue_Est_High_NextYear - Revenue_Est_High_ThisYear) / Revenue_Est_High_ThisYear × 100
```

Donde cada variable se calcula así:

| Variable | Fórmula | Fuente |
|----------|---------|--------|
| **TTM Net Income** | Suma de Net Income últimos 4 trimestres | Yahoo quarterly financials (`stock.quarterly_financials`) |
| **EPS(TTM)** | `TTM Net Income / Shares Outstanding` | Quarterly suma + Yahoo info (`sharesOutstanding`) |
| **P/E(TTM)** | `Precio / EPS(TTM)` | Precio actual Yahoo + EPS(TTM) |
| **Growth** | `(High_+1y - High_0y) / High_0y` | Yahoo Revenue Estimates (`stock.revenue_estimate`), columna `high` |
| **PEG** | `P/E(TTM) / (Growth × 100)` = `P/E(TTM) / Growth_Decimal / 100` | — |

**Ejemplo ADI con nueva metodología:**

| Paso | Variable | Valor |
|------|----------|-------|
| 1 | TTM Net Income (4Q) | 1,176M + 831M + 788M + 519M = **3,313M** |
| 2 | Shares Outstanding | **487M** |
| 3 | EPS(TTM) = 3,313M / 487M | **6.80** |
| 4 | Price | **\$434.46** |
| 5 | P/E(TTM) = 434.46 / 6.80 | **63.87** |
| 6 | Revenue High 0y | \$14,966M |
| 7 | Revenue High +1y | \$18,943M |
| 8 | Growth = (18,943 - 14,966) / 14,966 | **26.57%** |
| 9 | **PEG = 63.87 / (0.2657 × 100) = 63.87 / 26.57** | **2.40** |

### 8B. Fallback: Earnings Growth

Si `stock.revenue_estimate` no está disponible o devuelve datos incompletos, se usa el método anterior:
- Growth = `earningsGrowth` de `stock.info` (crecimiento interanual de ganancias)
- EPS = Net Income anual / Shares Outstanding
- `growth_source` se marca como `'earnings_growth'`

### 8C. Interpretación de la señal PEG

| PEG | Señal |
|-----|-------|
| < 1 | **Subvalorada** 🟢 (mejor oportunidad) |
| = 1 | **Precio Justo** |
| > 1 y ≤ 2 | **Invertible** 🟡 |
| > 2 | **Sobrevalorada** 🔴 |

### 8C. Diferencia con Yahoo PEG

Yahoo Finance provee su propio PEG (`pegRatio` en `stock.info`), pero su fórmula de cálculo es interna y puede diferir del nuestro. Por eso:

- **PEG manual** (`peg_value`) → Se usa para la señal y los charts. Es el que aparece en tablas (Portfolio, Watchlist, Scanner) y en los gráficos históricos.
- **Yahoo PEG** (`peg_yahoo_value`) → Se guarda como referencia informativa en la página del ticker, sin afectar señales ni cálculos.

### 8D. Cálculo actual (vía fetcher, importado en server.py)

```
fetch_financials_fmp() ──► fin_data (dict)
        │                        │
        │                   calculate_all_valuations()
        │                        │
        └── stock.info ─────────┘
        (epsGrowth, pegRatio)     │
                                   ├── calculate_quick_check() → PEG
                                   ├── calculate_dcf()         → DCF
                                   ├── calculate_ddm()         → DDM
                                   ├── calculate_pbv()         → PBV
                                   └── calculate_earning_estimate() → EPS signal
```

**Ubicación del código fuente:** `Proyecto-Inversion/fetcher/calculate.py`  
**Parametrización:** WACC fijo 10%, crecimiento terminal 3%, proyección DCF a 10 años.

**Flujo de datos para PEG:**

1. `_fetch_financials(ticker)` → obtiene `net_income`, `shares_outstanding`, `eps_diluted` de Yahoo
2. `_run_ticker_valuation()` → suplementa `earningsGrowth` y `pegRatio` desde `stock.info`
3. Calcula **EPS = Net Income / Shares Outstanding** (primera opción)
4. Calcula **P/E = Precio / EPS**
5. `calculate_all_valuations()` → llama `calculate_quick_check(pe_ratio, eps_growth_next_5y)` 
6. `calculate_quick_check` → `peg = pe_ratio / (eps_growth_next_5y * 100)` → señal

### 8E. Cálculo histórico (simplificado inline en server.py)

Para las valoraciones históricas por año fiscal, se usa una versión simplificada que no depende del fetcher:

- **PEG:** `P/E ÷ (epsGrowth × 100)` con P/E = precio ÷ EPS del año fiscal (EPS = Net Income / Shares)
- **DCF:** Proyección a 10 años partiendo del Operating Cash Flow histórico, WACC fijo 10%
- **PBV:** `Price ÷ ((Total Assets - Total Liabilities) / Shares)`
- **DDM:** No se calcula en el histórico (se deja NULL)

> **Diferencia clave:** El cálculo actual usa `calculate_all_valuations()` del fetcher que tiene lógica más sofisticada (DDM, EPS estimate, ajustes sectoriales). El cálculo histórico solo genera PEG, DCF y PBV para poblar los charts.

### 8F. `download_historical.py` (alternativa)

El script `Proyecto-Inversion/fetcher/download_historical.py` ofrece un procesamiento mensual (60 filas en 5 años) usando datos financieros trimestrales de FMP. No se utiliza en el flujo de "añadir ticker" porque es mucho más lento y requiere FMP API key para datos históricos trimestrales.

---

## 9. API REST — Detalle de endpoints

| Endpoint | Método | Parámetros | Respuesta | Uso |
|----------|--------|-------------|-----------|-----|
| `/api/inversiones/watchlist` | GET | `sector` (opcional) | `{data: {tickers, sectors, count}}` | Cargar tabla watchlist |
| `/api/inversiones/watchlist/add` | POST | `{ticker}` | `{message, success}` | Añadir + pipeline completo |
| `/api/inversiones/watchlist/remove` | POST | `{ticker}` | `{message, success}` | Soft delete |
| `/api/inversiones/portfolio` | GET | — | Posiciones + resumen del portafolio | Dashboard |
| `/api/inversiones/scanner` | GET | `filter` (all/subvaloradas/...) | Tickers con valoraciones | Scanner |
| `/api/inversiones/valuations` | GET | `ticker`, `days` (opcional), `all` | Historial + última valuación con `price_change_pct`, `week_52_high`, `week_52_low` | Ticker page charts + cambio diario |
| `/api/inversiones/price_history` | GET | `ticker`, `days` | OHLCV histórico | Ticker page chart |
| `/api/inversiones/risk` | GET | `ticker` | ATR(14), stop loss, target | Ticker page |
| `/api/inversiones/peers` | GET | `ticker` | Competidores del mismo sector | Cuestionario |
| `/api/inversiones/questionnaire` | GET/POST | `ticker` (GET); form data (POST) | Datos auto-fill / guardar respuestas | Cuestionario |

---

## 10. Reglas de trabajo para cambios

1. **Editar SIEMPRE en A)** (`EduSTrader - Local Free\inversiones\`)
2. **Un cambio a la vez** — confirmar visualmente antes del siguiente
3. **Mantener Identidad Visual Gameplan** en `inv-styles.css` (Navy/Teal/Gold, DM Sans/Space Mono/Bebas Neue) sin desvíos
4. **Registrar cada cambio** en `docs/CHANGELOG.md`
5. **Después de confirmar** → copiar a B) (GitHub) y hacer commit
6. **URL de prueba:** `https://zestfully-retread-activism.ngrok-free.dev/inversiones/`
