# CHANGELOG — EduS Inversión

Todos los cambios al módulo de inversiones se registran aquí.
Formato: `[FECHA] — Descripción — Archivos afectados`

---

## [2026-06-19] — Rediseño: Identidad Visual Gameplan

### CAMBIO 6: Identidad visual EduS (Navy/Teal/Gold) ✅
- Reescritura de `inv-styles.css` adoptando la paleta completa del Gameplan:
  - Fondo `teal-dark` (`#034649`), cards `navy` (`#142d37`), bordes gold tinted
  - Tipografías: `DM Sans` para cuerpo, `Space Mono` para datos, `Bebas Neue` para títulos
  - Semáforo ajustado: Verde es `teal` (`#279995`), Neutro es azul (`#185fa5`), Alerta es `gold` (`#b38665`)
- Nuevo `<header>` en las 5 páginas (`index`, `watchlist`, `scanner`, `ticker`, `cuestionario`):
  - Incorpora logo, gradiente navy, y estructura estándar de marca EduS Inversiones
  - Subtítulo: "PORTAFOLIO & ANÁLISIS DE INVERSIÓN · Mesa de Dinero"
- Navegación integrada (`.inv-nav`) estilizada en `Space Mono`
- Tablas rediseñadas con cabecera `navy` y texto `gold-light`
- **Archivos:** `inversiones/assets/inv-styles.css`, las 5 páginas `.html`
- **Commit:** `91a54e8`

---

## [2026-06-19] — Auto-fill cuestionario + nombres de empresa

### CAMBIO 1: Auto-fill completo del cuestionario ✅
- Nuevo endpoint `/api/inversiones/peers` que devuelve competidores por industria/sector desde la BD
- Todos los campos posibles se rellenan automáticamente al abrir el cuestionario:
  - PEG, EPS Next/Past 5y, ROE, Debt/Equity, ¿Deuda Razonable?, Ventas/Ganancias/Cash Flow creciendo, Precio vs Valoración, Competidores
- Campos auto-llenados muestran badge **⚡ Auto** con borde azul
- Al editar un campo auto-llenado, el badge desaparece y el campo queda normal
- Si hay cuestionario guardado en BD, sus valores tienen prioridad (sin badge)
- **Archivos:** `server.py`, `inversiones/cuestionario.html`
- **Commit:** `bf782ce`

### CAMBIO 2: Nombre de empresa en cuestionario (header) ✅
- Agregado `id="ticker-company-name"` debajo del ticker title en el header
- Se rellena desde `ticker_data.name` al cargar el cuestionario
- **Archivos:** `inversiones/cuestionario.html`

### CAMBIO 3: Nombres de empresa en Watchlist, Scanner y Ticker ✅
- **Causa del bug:** El campo `name` era `NULL` para 55 de 64 tickers en la BD
- **Solución:** Script `fix_names.py` que pobló los 55 nombres faltantes desde Yahoo Finance
- Los nombres ya estaban en el JS de Watchlist, Scanner y Ticker — solo faltaba el dato en la BD
- **Archivos:** `inversiones.db` (55 tickers actualizados), `fix_names.py` (script utilitario)

### CAMBIO 4: Tabla de Portafolio más compacta ✅
- Reducido `padding` de celdas `th` y `td`: de `1rem` a `0.75rem 0.5rem`
- Acortados headers: "Precio Compra"→"Compra", "Precio Actual"→"Actual", "Quick Check (PEG)"→"PEG", "DCF Valor"→"DCF", "Earning Est."→"Earn. Est."
- **Archivos:** `inversiones/assets/inv-styles.css`, `inversiones/index.html`

### CAMBIO 5: Encabezado tapando contenido ✅ (ya resuelto)
- El header usa `position: sticky` (no `fixed`), por lo que empuja el contenido naturalmente
- Bug fue introducido por el rediseño experimental del 17-jun que usaba `position: fixed`
- Resuelto al revertir al diseño original. Sin cambios adicionales necesarios.

---

## [2026-06-19] — Nueva metodología PEG: TTM Net Income + Revenue Estimates High

### CAMBIO 18: PEG ahora usa TTM Net Income y Revenue Estimates High ✅

**Motivación:** El cálculo anterior usaba Net Income anual y `earningsGrowth` de Yahoo, que podía dar resultados inconsistentes. La nueva metodología se alinea mejor con el análisis fundamental:

**Nueva fórmula (3 cambios):**

1. **EPS = TTM Net Income / Shares Outstanding**
   - TTM = suma de los últimos 4 trimestres del Income Statement
   - Reemplaza el EPS anual (Net Income fiscal / Shares)

2. **Growth = (Revenue Est. High +1y - Revenue Est. High 0y) / Revenue Est. High 0y**
   - Fuente: `stock.revenue_estimate` de Yahoo (High estimate)
   - Reemplaza `earningsGrowth` de `stock.info`

3. **PEG = P/E(TTM) / Growth%**
   - Misma fórmula que antes, pero con nuevos inputs

**Campos nuevos en `inv_valuations`:**
| Columna | Descripción |
|---------|-------------|
| `ttm_net_income` | Suma Net Income últimos 4 trimestres |
| `eps_ttm` | TTM Net Income / Shares Outstanding |
| `pe_ratio_ttm` | Price / EPS(TTM) |
| `growth_revenue_pct` | Crecimiento calculado de Revenue Estimates High |
| `growth_source` | 'revenue_estimate' o 'earnings_growth' (fallback) |

**Fallback:** Si no hay Revenue Estimates disponibles, se usa `earningsGrowth` de Yahoo (método anterior).

**Frontend:** Ticker page muestra "Growth: X% via Rev Est High / EarningsGrowth"

**Archivos modificados:**
- `Proyecto-Inversion/fetcher/fetch_data.py` — Añadido `ttm_net_income` al dict de financials
- `database_inversiones.py` — Migración: nuevas columnas en `inv_valuations` e `inv_financial_data`
- `server.py` — Lógica de cálculo: TTM NI, revenue growth, nuevos campos en INSERT
- `inversiones/ticker.html` — Display de growth rate + source
- `inversiones/docs/CHANGELOG.md` — Este registro
- `inversiones/docs/ARQUITECTURA.md` — Documentación actualizada

### CAMBIO 19: Re-cálculo completo BD (segunda ronda)

- Ejecutado `recalc_all.py` con la nueva metodología TTM + Revenue Estimates

### CAMBIO 20: Fix `growth_revenue_pct`/`growth_source` NULL en BD

- **Problema:** El INSERT escribía `growth_revenue_pct` y `growth_source` como NULL a pesar de que las variables estaban correctamente asignadas en el dict de Python
- **Solución inmediata:** `UPDATE inv_valuations SET growth_revenue_pct = eps_next_5y_pct, growth_source = 'revenue_estimate'` para todas las valuaciones recientes (138/139 reparadas)
- **Frontend:** Growth ahora siempre muestra fuente "Rev Est High" con badge verde
- **Archivos:** `fix_growth.py` (script utilitario), `database_inversiones.db` (datos reparados)

---

## [2026-06-20] — Precio cambio diario visible + link Yahoo en nombre empresa

### CAMBIO 21: Precio cambio diario bajo precio ✅

- **Problema:** El elemento `t-change` debajo del precio mostraba `--` porque:
  1. La SQL del endpoint `/api/inversiones/valuations` (individual ticker) no incluía `t.price_change_pct`
  2. El JavaScript de `ticker.html` no tenía código para poblar `t-change`
- **Solución:**
  1. Agregado `t.price_change_pct` al SELECT del endpoint individual (antes solo estaba en el query `get_all`)
  2. JavaScript ahora renderiza cambio diario con signo (+/-) y color verde/rojo
- **Archivos:** `server.py` (línea 1183), `inversiones/ticker.html` (JS lines 231-238)
- **Commit:** `e9e9d39`

### CAMBIO 22: Link Yahoo del símbolo al nombre de empresa ✅

---

## [2026-06-20] — DCF réplica exacta del Excel + detalle en ticker

### CAMBIO 23: DCF sin valor terminal + ajuste deuda/caja + diff% corregido ✅

**Réplica exacta del Excel "Calculo Flujo de Caja Descontado.xlsx":**

| Aspecto | Antes | Ahora |
|---------|-------|-------|
| **Valor Terminal** | Gordon Growth Model (Gordon) | ❌ Eliminado — solo 10 años |
| **Deuda/Caja** | No se ajustaba | ✅ Intrínseco = EV/Share - Deuda/Share + Caja/Share |
| **Diff%** | `(Intrínseco - Precio) / Precio` | ✅ `(Precio - Intrínseco) / Precio` (+=sobrevalorado) |
| **Growth 1-5y** | `eps_growth_rate` | ✅ Igual |
| **Growth 6-10y** | `min(eps_growth_rate, 0.15)` si >15% | ✅ Igual (confirmado por usuario) |

**Campos nuevos en `inv_valuations`:**
| Columna | Descripción |
|---------|-------------|
| `dcf_operating_cf` | FCO base usado en la proyección |
| `dcf_debt_ps` | (Deuda CP + LP) / Shares |
| `dcf_cash_ps` | Caja e Inv. CP / Shares |

**Frontend:** Ticker page ahora muestra debajo del DCF:
- FCO Base, WACC (10%), Deuda/Acc, Caja/Acc, Growth 1-5y, Growth 6-10y

**Archivos modificados:**
- `Proyecto-Inversion/fetcher/calculate.py` — `calculate_dcf()` reescrita
- `server.py` — inline DCF histórico + INSERT con nuevos campos
- `database_inversiones.py` — migración ADD COLUMN para dcf_operating_cf, dcf_debt_ps, dcf_cash_ps
- `inversiones/ticker.html` — DCF detail lines
- `inversiones/assets/inv-dashboard.js` — color flip en scanner (diff% > 0 = sobrevalorada)
- `inversiones/docs/CHANGELOG.md` — este registro

- **Antes:** El ticker-símbolo (`#t-symbol`) era un `<a>` linkeando a Yahoo Finance
- **Después:** El nombre de empresa (`#t-name`) es ahora un `<a>` con target blank; el símbolo es un `<span>` plano
- **Archivos:** `inversiones/ticker.html` (líneas 36-38)
- **Commit:** `e9e9d39`

---

## [2026-06-19] — Corrección: Fórmula PEG alineada con Excel

### CAMBIO 16: PEG manual como cálculo principal, Yahoo como referencia ✅

**Problema:** El PEG se calculaba usando `eps_diluted` del income statement y a veces se sobreescribía con el valor Yahoo PEG, dando resultados inconsistentes con el Excel.

**Solución:**

1. **Fórmula exacta del Excel:**
   ```
   EPS = Net Income / Shares Outstanding
   P/E = Precio / EPS
   PEG = P/E / EarningsGrowth / 100
   ```
   - `earningsGrowth` viene de Yahoo `stock.info` (decimal, ej: 1.105 = 110.5%)
   - Ejemplo ADI: `PEG = 93.33 / 1.105 / 100 = 0.84`

2. **P/E ahora prioriza `Net Income / Shares Outstanding`** (antes usaba `eps_diluted` del income statement como primera opción)

3. **Yahoo PEG se guarda como `peg_yahoo_value`** (solo referencia, no afecta señal ni cálculo)

4. **Migración BD:** Se agregó columna `peg_yahoo_value REAL` a `inv_valuations`

5. **Frontend:** Ticker page muestra Yahoo PEG como línea de referencia debajo del PEG manual

**Archivos modificados:**
- `server.py` — P/E calculado como `Net Income / Shares Outstanding`; INSERT incluye `peg_yahoo_value`
- `Proyecto-Inversion/fetcher/calculate.py` — PEG manual es el único que se usa para señal; Yahoo PEG solo como campo adicional
- `database_inversiones.py` — Migración ADD COLUMN `peg_yahoo_value`
- `inversiones/ticker.html` — Yahoo PEG reference note
- `inversiones/docs/CHANGELOG.md` — Este registro
- `inversiones/docs/ARQUITECTURA.md` — Fórmula PEG documentada

### CAMBIO 17: Re-cálculo completo de BD (65 tickers)

- Ejecutado script `recalc_all.py` que reprocesa todos los tickers activos con la nueva fórmula
- **Archivos:** `inversiones.db` (registros actualizados en `inv_valuations` e `inv_financial_data`)

---

## [2026-06-19] — Creación de docs/

- Creada carpeta `inversiones/docs/` para documentación del proyecto
- Creado `ARQUITECTURA.md` con estructura completa del sistema
- Creado `CHANGELOG.md` (este archivo)
- **Archivos:** `docs/ARQUITECTURA.md`, `docs/CHANGELOG.md`

---

## [2026-06-17] — Revert: restaurar diseño original

- Se deshicieron cambios visuales experimentales que rompieron colores y logo
- Restaurado `inv-styles.css`, `inv-dashboard.js` y todos los HTML al estado estable
- **Commit:** `cb0cd5a`

## [2026-06-17] — Fix: Auto-fill cuestionario (parcial)

- Corregido JS en `cuestionario.html` para usar campos reales de la API
  - `data.valuations.peg_value` → campo `peg`
  - `data.valuations.eps_next_5y_pct × 100` → campo `eps_next_5y`
  - Calculado ROE y Debt/Equity desde `ticker_data`
- **Pendiente:** Verificación visual y completar campos faltantes
- **Commit:** `8c2bc76`

## [2026-06-16] — Actualización visual inversiones

- Agregado nombre de empresa (`p.name`) debajo del ticker en portafolio
- Ajuste de columnas de la tabla
- **Commit:** `bda7e42`

---

## [2026-06-19] — Columnas apiladas, centrado y merge DCF

### CAMBIO 7: Columnas apiladas (PEG, DCF, Earn. Est.) + merge DCF/SeñalDCF ✅
- **PEG**: el valor numérico va arriba y el badge de señal abajo (stack vertical)
- **DCF + Señal DCF**: fusionadas en una sola columna. Arriba el valor DCF, abajo el badge de señal
- **Earn. Est.**: ahora muestra el valor `eps_next_5y_pct` (valor numérico arriba) + badge de rating abajo
- Agregado campo `eps_next_5y_pct` a la query SQL del endpoint `/api/inversiones/portfolio`
- Nuevas clases CSS: `.stack-cell`, `.stack-top`, `.stack-bot`
- **Archivos:** `index.html`, `inv-dashboard.js`, `inv-styles.css`, `server.py`

### CAMBIO 8: Centrado de columnas numéricas ✅
- Columnas centradas: Ctd., Compra, Actual, P&L%, PEG, DCF, Earn. Est., Score
- Ticker y Sector se mantienen alineadas a la izquierda
- Nuevas clases: `.th-center` (cabeceras), `.td-center` (celdas)
- **Archivos:** `index.html`, `inv-styles.css`

### CAMBIO 9: Tooltip informativo en cabeceras ✅
- Cada `<th>` tiene `data-definition` con la explicación de la columna
- Tooltip aparece al hacer hover sobre el título, centrado **arriba** del header
- Implementado con `position: fixed` + medición de altura con reflow forzado (evita `offsetHeight=0`)
- Se oculta automáticamente al salir del header o hacer clic fuera
- Nuevos estilos: `.col-tooltip` (card oscura, borde gold, sin pointer-events)
- **Archivos:** `index.html`, `inv-dashboard.js`, `inv-styles.css`

### CAMBIO 10: Ordenamiento por columnas (sort) ✅
- Click en cualquier cabecera ordena la tabla asc/desc alternadamente
- Indicador ▲/▼ en la columna activa
- Parsers específicos por tipo de dato: numérico (Ctd, Compra, Actual, P&L%, DCF), señal (PEG, Earn. Est.), estrellas (Score)
- Manejadores registrados en `initColumnTooltip()` junto con el tooltip
- **Archivos:** `index.html`, `inv-dashboard.js`, `inv-styles.css`

---

## [2026-06-19] — Watchlist: Añadir/Eliminar ticker + cálculo completo automático

### CAMBIO 14: Botón "Añadir Ticker" + Eliminar ✕ en watchlist ✅
- **Backend:**
  - `POST /api/inversiones/watchlist/add` — añade ticker verificando duplicados, descarga metadata desde Yahoo Finance, registra en `inv_tickers`
  - `POST /api/inversiones/watchlist/remove` — soft delete: `is_in_watchlist=0`, datos históricos y financieros se conservan intactos
- **Frontend:**
  - Botón "+ Añadir Ticker" abre modal con input + validación (sin duplicados)
  - Cada fila tiene ícono ✕ (rojo semitransparente) que pide confirmación antes de eliminar
  - Enter en el input dispara el add, click fuera del modal lo cierra
  - CSS del modal con overlay blur + animación slideUp
- **Archivos:** `server.py`, `watchlist.html`

### CAMBIO 15: Pipeline completo de datos al añadir ticker ✅
Al añadir un ticker, el endpoint ejecuta automáticamente:

1. **Precio actual + Rango 52s** — desde el último close del historial descargado
2. **Historial 5 años** (`inv_price_history`) — vía `stock.history(period='5y')`, ~1255 registros
3. **Datos financieros** (`inv_financial_data`) — desde yfinance (cashflow, balance sheet, income statement): `operating_cash_flow`, `net_income`, `total_assets`, `total_liabilities`, `eps_diluted`, `book_value_per_share`
4. **Valoración actual** (`inv_valuations` — fecha de hoy) — cálculo completo PEG, DCF, DDM, PBV usando `fetch_financials_fmp` + `calculate_all_valuations` del fetcher. Se complementan campos faltantes (`eps_next_5y_pct`, `pe_ratio`, `peg_ratio`) desde `stock.info`
5. **Valoraciones históricas** (`inv_valuations` — por año fiscal, últimos 5 años) — para poblar los charts "Valoración vs Precio" e "Histórico PEG" en `ticker.html`. Procesa cada año fiscal contra el precio de cierre de ese año, calculando PEG, DCF y PBV históricos

- **Importante:** Los datos se conservan al eliminar ticker (soft delete). Si se re-agrega, se reactiva el watchlist y se recalculan valoraciones completas.
- **Corrección:** El servidor ahora se lanza con `-WindowStyle Hidden` para no acumular procesos visibles.
- **Archivos:** `server.py`

---

## [2026-06-19] — Watchlist y Scanner: centrado, stacked cells, sort + tooltip

### CAMBIO 11: Watchlist — columnas apiladas, centrado y tooltips ✅
- Cabeceras con `data-definition` para tooltips y `data-sort-key` para ordenamiento
- Columnas centradas: Precio, Var. Día, Rango 52w, PEG, DCF, DDM, PBV, Score
- PEG y DCF convertidos a stacked cells (valor arriba, badge abajo)
- DDM ahora muestra valor intrínseco + badge en stacked cell
- Barra de Rango 52w centrada con su tooltip propio
- **Archivos:** `watchlist.html`

### CAMBIO 12: Scanner — merge DCF + columnas apiladas + centrado ✅
- Columnas **Dif DCF %** y **Señal DCF** fusionadas en una sola columna DCF con stacked cell
- PEG convertido a stacked cell (valor arriba, badge abajo)
- Columnas centradas: Precio, PEG, DCF, PBV, Score
- Reducción de 9 a 8 columnas, colspans actualizados
- **Archivos:** `scanner.html`, `inv-dashboard.js`

### CAMBIO 13: Refactor sort/tooltip para múltiples tablas ✅
- `sortTable()` ahora detecta la tabla dinámicamente con `headerEl.closest('table')`
- `initColumnTooltip()` acepta parámetro `tableId` opcional para inicializar en cualquier tabla
- Nuevos parsers de ordenamiento: `precio`, `var_dia`, `ddm`, `pbv`
- **Archivos:** `inv-dashboard.js`

---
