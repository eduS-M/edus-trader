# EduS MasterPanel HUD V4 — Documentación de Lógica Interna

> Basado en el código fuente `EduSMasterPanelHUDV4.cs` (08/05/2026)

---

## 1. LAS 4 SEÑALES PRINCIPALES (SEMÁFORO)

El indicador monitorea **4 indicadores técnicos** en paralelo. Cada uno evalúa su **pendiente** (dirección alcista o bajista) comparando su valor actual contra su valor de hace `SlopeLookback` barras (por defecto 3).

### 1.1 SMA 20 — Media Móvil Simple de 20 períodos

| Aspecto | Detalle |
|---------|---------|
| **Qué monitorea** | Media móvil simple de 20 velas |
| **Dirección alcista** | `SMA20[0] > SMA20[SlopeLookback]` → la media está subiendo |
| **Dirección bajista** | `SMA20[0] <= SMA20[SlopeLookback]` → la media está bajando |
| **Valor mostrado** | `SMA20[0]` (valor actual de la media) |

### 1.2 SMA 80 — Media Móvil Simple de 80 períodos

| Aspecto | Detalle |
|---------|---------|
| **Qué monitorea** | Media móvil simple de 80 velas (tendencia de mediano plazo) |
| **Dirección alcista** | `SMA80[0] > SMA80[SlopeLookback]` |
| **Dirección bajista** | `SMA80[0] <= SMA80[SlopeLookback]` |
| **Valor mostrado** | `SMA80[0]` |

### 1.3 LinReg 89 — Regresión Lineal de 89 períodos

| Aspecto | Detalle |
|---------|---------|
| **Qué monitorea** | Línea de regresión lineal de 89 velas (tendencia estadística) |
| **Dirección alcista** | `LinReg89[0] > LinReg89[SlopeLookback]` |
| **Dirección bajista** | `LinReg89[0] <= LinReg89[SlopeLookback]` |
| **Valor mostrado** | `LinReg89[0]` |

### 1.4 AVWAP Dinámico — Dynamic Swing AVWAP

| Aspecto | Detalle |
|---------|---------|
| **Qué monitorea** | AVWAP (Anchored VWAP) dinámico con swing periods de 50/20 |
| **Dirección alcista** | `VWAP_Up[0]` existe (no NaN) y es mayor que `VWAP_Down[0]` |
| **Dirección bajista** | `VWAP_Down[0]` existe (no NaN) y es mayor que `VWAP_Up[0]` |
| **Valor mostrado** | El valor del AVWAP activo (Up o Down) |
| **Caso especial** | Si no hay VWAP definido, usa `Close[0]` como valor por defecto |

### 1.5 Tendencia Count (Score de alineación)

El `TendenciaCount` mide cuántas señales están alineadas con la dirección del AVWAP:

```
tendenciaCount = (SMA20Up == esAlc ? 1 : 0)
               + (SMA80Up == esAlc ? 1 : 0)
               + (LinRegUp == esAlc ? 1 : 0)
               + 1   ← AVWAP siempre cuenta como 1
```

- **4/4** = Las 4 señales alineadas
- **3/4** = 3 señales alineadas
- **2/4** o menos = Baja convicción

---

## 2. ZONAS AVWAP (CAPA 2)

Las zonas miden qué tan cerca está el precio del AVWAP (o LinReg89) en términos de ATR.

### 2.1 Cálculo de distancias

```
dA  = |Precio_Close - AVWAP| / ATR
dLR = |Precio_Close - LinReg89| / ATR
```

### 2.2 Condiciones de zona

| Señal | Condición | Color |
|-------|-----------|-------|
| **A+** | Pin al AVWAP (precio toca AVWAP y cierra del lado correcto) | Verde oscuro |
| **A** | Precio del lado de la tendencia Y `dA <= ZoneVerde` (por defecto ≤ 0.5 ATR) | Verde |
| **LR+** | Pin a LinReg89 | Verde LR |
| **LR** | Precio del lado de LinReg Y `dLR <= ZoneVerde` | Verde LR |
| **B+** | Precio del lado contrario pero `dA <= ZoneVerde` | Amarillo |
| **B** | Precio del lado de la tendencia pero `dA <= ZoneAmarilla` (por defecto ≤ 2.0 ATR) | Naranja |
| **--** | Ninguna condición anterior | Gris |

**Pines (A+ y LR+):**
- **Pin alcista**: AVWAP/LinReg está en tendencia alcista Y el mínimo de la vela tocó o cruzó el AVWAP/LinReg Y el cierre está por encima
- **Pin bajista**: AVWAP/LinReg está en tendencia bajista Y el máximo de la vela tocó o cruzó el AVWAP/LinReg Y el cierre está por debajo

---

## 3. SEMÁFORO — Estados

El semáforo combina las 4 señales (Capa 1) con las zonas (Capa 2) y las capas de validación (Capa 3 y 4).

### 3.1 Combinaciones de Señales

| Variable | Señales |
|----------|---------|
| `a4a` (4/4 alcista) | SMA20 UP **Y** SMA80 UP **Y** LinReg UP **Y** AVWAP UP |
| `a4b` (4/4 bajista) | SMA20 DOWN **Y** SMA80 DOWN **Y** LinReg DOWN **Y** AVWAP DOWN |
| `m3a` (3/4 alcista) | SMA20 UP **Y** SMA80 DOWN **Y** LinReg UP **Y** AVWAP UP |
| `m3b` (3/4 bajista) | SMA20 DOWN **Y** SMA80 UP **Y** LinReg DOWN **Y** AVWAP DOWN |

### 3.2 Capas de Validación (Capa 3 y Capa 4)

| Capa | Propósito | Fórmula (sin tolerancia) | Propiedad |
|------|-----------|--------------------------|-----------|
| **Capa 3** | AVWAP vs Banda Media Keltner | Alcista: `AVWAP > KeltnerMid`, Bajista: `AVWAP < KeltnerMid` | `UsarCapa3` |
| **Capa 4** | LinReg89 vs Banda Media Keltner | Alcista: `LinReg89 > KeltnerMid`, Bajista: `LinReg89 < KeltnerMid` | `UsarCapa4` |

**Tolerancia configurable** (`ToleranciaBM_ATR`): Cuando > 0, se afloja la exigencia permitiendo que AVWAP/LinReg esté hasta N×ATR del "lado equivocado" de la BM:

| Dirección | Fórmula con tolerancia |
|-----------|----------------------|
| **Alcista** (Capa 3) | `AVWAP > KeltnerMid - (ToleranciaBM_ATR × ATR)` |
| **Bajista** (Capa 3) | `AVWAP < KeltnerMid + (ToleranciaBM_ATR × ATR)` |
| **Alcista** (Capa 4) | `LinReg89 > KeltnerMid - (ToleranciaBM_ATR × ATR)` |
| **Bajista** (Capa 4) | `LinReg89 < KeltnerMid + (ToleranciaBM_ATR × ATR)` |

> Ejemplo: Con `ToleranciaBM_ATR = 1.5` y ATR=10 puntos, el AVWAP alcista solo necesita estar por encima de `BM - 15` puntos (en vez de estrictamente > BM).

Si la capa está desactivada (`UsarCapa3 = false`), siempre pasa como válida.

### 3.3 Matriz de Estados

| Señales | Zona | Capa 3 | Capa 4 | Estado |
|---------|------|--------|--------|--------|
| 4/4 alcista | A/A+ | OK | - | **VERDE ALCISTA** |
| 4/4 bajista | A/A+ | OK | - | **VERDE BAJISTA** |
| 4/4 alcista | LR/LR+ | - | OK | **VERDE ALCISTA** |
| 4/4 bajista | LR/LR+ | - | OK | **VERDE BAJISTA** |
| 4/4 alcista | A/A+ | falla | - | **AMARILLO ALCISTA** |
| 4/4 bajista | A/A+ | falla | - | **AMARILLO BAJISTA** |
| 4/4 alcista | LR/LR+ | - | falla | **AMARILLO ALCISTA** |
| 4/4 bajista | LR/LR+ | - | falla | **AMARILLO BAJISTA** |
| 4/4 alcista | B/B+ | - | - | **AMARILLO ALCISTA** |
| 4/4 bajista | B/B+ | - | - | **AMARILLO BAJISTA** |
| 3/4 alcista | A/A+ o LR/LR+ | - | - | **AMARILLO ALCISTA** |
| 3/4 bajista | A/A+ o LR/LR+ | - | - | **AMARILLO BAJISTA** |
| Cualquier otra combinación | - | - | - | **ROJO** |

---

## 4. FILTROS V4 (ADVANCED FILTERS)

Antes de generar una entrada, se aplican **3 filtros institucionales**:

### 4.1 Filtro HTF (Higher Timeframe)

| Propiedad | Valor | Descripción |
|-----------|-------|-------------|
| `UsarFiltroHTF` | true/false | Activa el filtro |
| `HTF_Minutos` | 15 (default) | Período en minutos cuando Tipo=Minuto |
| `HTF_PeriodType` | Minuto / Tick | Tipo de período del HTF |
| `HTF_Ticks` | 987 (default) | Período en ticks cuando Tipo=Tick |
**Condición**: La dirección del semáforo debe estar alineada con la tendencia del timeframe superior.
**Lógica**: 
```
alcista_HTF = Close[1] (HTF) > SMA20 (HTF)
pasaHTF    = (dirección del semáforo == alcista_HTF)
```
**Requiere**: Agregar una segunda Data Series al chart (ej: 15 min si operas en 5 min).

### 4.2 Filtro Nodos (Nodes V8 Institutional)

| Propiedad | `UsarFiltroNodos` / `Nodo_DistanciaTicks` |
|-----------|------------------------------------------|
**Condición**: El precio de cierre no debe estar cerca de un nodo institucional de alto volumen.
**Lógica**: Recorre `nodesV8.nodesToDraw` (nodos estructurales) y `nodesV8.nakedNodes` (nodos desnudos). Si el precio está dentro de `Nodo_DistanciaTicks` de algún nodo, el filtro NO pasa.
**Propósito**: Evitar entrar en zonas de alta liquidez donde el precio podría revertirse.

### 4.3 Filtro POCs (Simple Naked POCs)

| Propiedad | `UsarFiltroPocs` / `Poc_DistanciaTicks` |
|-----------|----------------------------------------|
**Condición**: El precio de cierre no debe estar cerca de un Point of Control (POC) desnudo activo.
**Lógica**: Recorre `nakedPocs.nakedLevels`. Si algún nivel está activo y el precio está dentro de `Poc_DistanciaTicks`, el filtro NO pasa.
**Propósito**: Bloquear entradas que van directo contra un POC desnudo.

---

## 5. SEÑAL DE ENTRADA — Condiciones Completas

Para que el HUD genere una **señal de entrada válida**, TODAS las siguientes condiciones deben cumplirse SIMULTÁNEAMENTE:

### 5.1 Condiciones Obligatorias (AND lógico)

```
SI:
  1. Semáforo VERDE (alcista o bajista)
  Y 2. Pasa Filtro de Ancho Keltner (si activo)
  Y 3. Pasa Confirmación de Barras (si activo)
  Y 4. Pasa Filtro HTF        (si activo)
  Y 5. Pasa Filtro Nodos      (si activo)
  Y 6. Pasa Filtro POCs       (si activo)
ENTONCES → Señal de entrada activa
```

### 5.2 Detalle de cada condición

| # | Condición | Propiedad | Fórmula |
|---|-----------|-----------|---------|
| 1 | **Semáforo Verde** | — | `estadoActual == VerdeAlcista` o `VerdeBajista` |
| 2 | **Ancho de Banda** | `FiltroApertura` + `MinKeltnerVsATR` | `k_bandWidth >= MinKeltnerVsATR * ATR` (default: 1.8 * ATR) |
| 3 | **Confirmación** | `EsperarConfirmacion` + `BarrasConfirmacion` | La señal verde debe mantenerse al menos `BarrasConfirmacion` velas (default: 2) |
| 4 | **HTF** | `UsarFiltroHTF` | Dirección alineada con HTF |
| 5 | **Nodos** | `UsarFiltroNodos` | Precio lejos de nodos institucionales |
| 6 | **POCs** | `UsarFiltroPocs` | Precio lejos de POCs desnudos |

### 5.3 Activación de entrada

Cuando todas las condiciones se cumplen, la señal de entrada se activa con:

```
e_entrada  = Close[0]          (precio de cierre de la vela actual)
e_avwap    = AVWAP activo      (VWAP_Up o VWAP_Down según dirección)
```

### 5.4 Persistencia de señal

Una vez que se activa una señal, el HUD **la recuerda** aunque luego el semáforo deje de estar verde. La señal se muestra como **HISTÓRICA** (naranja) en lugar de **ACTIVA** (verde), conservando:
- Precio de entrada, stop, T1, T2, RR ratios
- Timestamp de activación
- Zona y tipo de señal (zona AVWAP o LR)

---

## 6. CÁLCULO DE STOP Y TARGETS

### 6.1 Keltner Channel (base de todo)

El Keltner Channel usa:
- **Período**: `Kelt_Period` (default: 52)
- **Multiplicador**: `Kelt_Multiplier` (default: 3.5)
- **Banda media**: EMA del precio típico (H+L+C)/3 en período `Kelt_Period`
- **Rango**: EMA de la diferencia `High - Low` en período `Kelt_Period`

```
kDiff[0]   = High[0] - Low[0]
kMid       = EMA_Typical[0]
kOff       = EMA_Diff[0] * Kelt_Multiplier
k_bandWidth = (kMid + kOff) - (kMid - kOff) = kOff * 2
```

### 6.2 Stop (Modo Keltner — `UsarStopKeltner = true`)

| Concepto | Valor |
|----------|-------|
| Stop en pts | `k_stopPts = k_bandWidth * Kelt_StopPct` (default: 30% del ancho) |
| Stop precio | Alcista: `entrada - stopPts`, Bajista: `entrada + stopPts` |
| T1 (RR 1:2) | Alcista: `entrada + stopPts * 2`, Bajista: `entrada - stopPts * 2` |
| T2 (RR 1:3) | Alcista: `entrada + stopPts * 3`, Bajista: `entrada - stopPts * 3` |
| RR1 | `T1_Pts / Stop_Pts = 2.0` |
| RR2 | `T2_Pts / Stop_Pts = 3.0` |

### 6.2b Stop Máximo en Dólares (`StopMaxDolares`)

| Propiedad | Descripción |
|-----------|-------------|
| `StopMaxDolares` | 0 = desactivado. Si > 0, el stop calculado se limita a este valor |

Cuando `StopMaxDolares > 0` y el stop calculado excede este valor:
1. Se recalcula `e_stopPts = StopMaxDolares / (PointValue × Contracts)`
2. Se mantiene el piso de 1 tick mínimo
3. **Los targets (T1, T2) NO se modifican** — se conservan en sus precios originales

> Esto significa que el **RR ratio mejora automáticamente**: al reducir el riesgo pero mantener la recompensa, la relación riesgo/beneficio aumenta. Ejemplo: si el Keltner daba stop $350 con target $700 (RR 1:2), al limitar el stop a $200 obtienes RR 1:3.5.

### 6.3 Stop (Modo ATR — `UsarStopKeltner = false`)

| Concepto | Fórmula |
|----------|---------|
| Stop | `e_avwap ± (ATR * Stop_ATRMult)` |
| T1 | Banda superior/inferior del Keltner (`kUp` o `kLo`) |
| T2 | T1 + distancia AVWAP→Keltner (en la misma dirección) |

### 6.4 Visualización en dólares

```
k_stopUsd   = k_stopPts   * PointValue * Contracts
k_targetUsd = k_targetPts * PointValue * Contracts
```

---

## 7. MONITOREO DE POSICIÓN ABIERTA

El HUD incluye una sección que monitorea la posición actual vía un `DispatcherTimer`.

### 7.1 Datos mostrados

| Línea | Información |
|-------|-------------|
| 1 | Dirección (LONG/SHORT) + Cantidad + Precio de entrada |
| 2 | P&L no realizado en $ y en puntos |
| 3 | Stop Risk $, Target Profit $, R:R, modo (ATM/Manual) |

### 7.2 Tracking de señales en CSV

Cuando `RegistrarSenales = true`, cada señal de entrada se registra en un archivo CSV con:
- **Apertura**: ID único, timestamp, mercado, cuenta, timeframe, dirección, estado, zona, entrada, stop, T1, T2, RR1, RR2, KeltnerWidth, ATR
- **Cierre**: ID único, timestamp de cierre, resultado (STOP/T2), si T1 fue tocado, precio de salida, barras de duración

### 7.3 Alertas

| Alerta | Condición | Sonido |
|--------|-----------|--------|
| **4/4 Señales** | `TendenciaCount` llega a 4 | `Alert1.wav` |
| **Zona A** | Zona cambia a A+ o A | `Alert2.wav` |

---

## 8. DIAGRAMA DE FLUJO RESUMIDO

```
CADA VELA (OnBarUpdate):
  │
  ├─ Calcular SMA20, SMA80, LinReg89, AVWAP (Capas 1)
  ├─ Calcular Zonas AVWAP/LinReg (Capa 2)
  ├─ Calcular Keltner Channel
  │
  ├─ Validar Capa 3 (AVWAP vs Keltner BM)
  ├─ Validar Capa 4 (LinReg89 vs Keltner BM)
  │
  ├─ Determinar estado del SEMÁFORO
  │   └─ Verde / Amarillo / Rojo
  │
  ├─ Aplicar FILTROS V4:
  │   ├─ Filtro HTF
  │   ├─ Filtro Nodos
  │   └─ Filtro POCs
  │
  ├─ Si VERDE + Filtros OK + Confirmación:
  │   └─ GENERAR SEÑAL DE ENTRADA
  │       ├─ Precio entrada = Close[0]
  │       ├─ Stop/T1/T2 (Keltner o ATR)
  │       └─ Registrar en CSV
  │
  └─ Actualizar HUD (WPF + SharpDX)
```

---

## 9. PARÁMETROS RECOMENDADOS POR MERCADO

| Mercado | TF Base/HTF | Keltner (Mult/Stop%) | ZoneVerde | Notas |
|---------|-------------|---------------------|-----------|-------|
| **ES** (S&P 500) | 5m / 15m | 1.5 / 30% | 0.5 | FiltroNodos obligatorio |
| **NQ** (Nasdaq) | 5m / 15m | 2.0 / 28% | 0.6 | FiltroApertura esencial |
| **CL** (Crudo) | 5m / 15m | 2.0 / 25% | 0.6 | Stop reducido al 25% |
| **GC** (Oro) | 5m / 15m | 1.8 / 30% | 0.5 | UsarCapa3 = True |
