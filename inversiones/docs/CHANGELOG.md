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

## Pendiente (próximos cambios)

- [ ] **CAMBIO 1:** Auto-fill completo del cuestionario (todos los campos posibles)
- [ ] **CAMBIO 2:** Nombre de empresa en Portafolio (visual)
- [ ] **CAMBIO 3:** Nombre de empresa en Watchlist y Scanner
- [ ] **CAMBIO 4:** Tabla portafolio más compacta (sin scroll horizontal)
- [ ] **CAMBIO 5:** Verificar si encabezado tapa contenido
