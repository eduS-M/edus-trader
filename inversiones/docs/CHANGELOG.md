# CHANGELOG — EduS Inversión

Todos los cambios al módulo de inversiones se registran aquí.
Formato: `[FECHA] — Descripción — Archivos afectados`

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
