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

## 6. Reglas de trabajo para cambios

1. **Editar SIEMPRE en A)** (`EduSTrader - Local Free\inversiones\`)
2. **Un cambio a la vez** — confirmar visualmente antes del siguiente
3. **No tocar** colores, logo ni fuentes de `inv-styles.css` sin aprobación explícita
4. **Registrar cada cambio** en `docs/CHANGELOG.md`
5. **Después de confirmar** → copiar a B) (GitHub) y hacer commit
6. **URL de prueba:** `https://zestfully-retread-activism.ngrok-free.dev/inversiones/`
