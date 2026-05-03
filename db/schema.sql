-- ============================================================
-- EduS Trader — Esquema de Base de Datos (Cloudflare D1)
-- ============================================================
-- Ejecutar en orden. D1 usa SQLite — sin tipos como SERIAL,
-- usar INTEGER PRIMARY KEY AUTOINCREMENT o TEXT para UUIDs.
-- ============================================================


-- ------------------------------------------------------------
-- 1. USERS
-- Cada persona que se registra, con o sin suscripción activa.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,          -- UUID v4 generado en el servidor
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT,                      -- NULL si se registró solo con Google
  google_id     TEXT UNIQUE,               -- NULL si se registró con email
  name          TEXT,
  avatar_url    TEXT,

  -- Plan activo (desnormalizado para lecturas rápidas en el middleware)
  -- Se sincroniza desde subscriptions al activar/cancelar
  plan          TEXT NOT NULL DEFAULT 'free'
                CHECK (plan IN ('free','basic','pro','premium')),
  plan_expires_at TEXT,                    -- ISO-8601. NULL = free o de por vida

  -- Estado de la cuenta
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','suspended','deleted')),
  email_verified INTEGER NOT NULL DEFAULT 0, -- 0 = no, 1 = sí

  -- Metadatos
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_email    ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_plan     ON users(plan);
CREATE INDEX IF NOT EXISTS idx_users_google   ON users(google_id);

-- ------------------------------------------------------------
-- 2. EMAIL_VERIFICATIONS
-- Tokens para verificar email al registrarse y para
-- recuperación de contraseña.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_verifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      TEXT NOT NULL UNIQUE,
  type       TEXT NOT NULL CHECK (type IN ('verify_email','reset_password')),
  expires_at TEXT NOT NULL,                -- ISO-8601
  used_at    TEXT,                         -- NULL = no usado todavía
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_email_verif_token   ON email_verifications(token);
CREATE INDEX IF NOT EXISTS idx_email_verif_user    ON email_verifications(user_id);

-- ------------------------------------------------------------
-- 3. PLANS
-- Catálogo de planes. Separado de users para poder cambiar
-- precios sin migrar datos.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plans (
  id           TEXT PRIMARY KEY,           -- 'free','basic','pro','premium'
  name         TEXT NOT NULL,              -- 'Free', 'Basic', 'Pro', 'Premium Plus'
  description  TEXT,
  tier         INTEGER NOT NULL UNIQUE,    -- 0,1,2,3 — para comparar jerarquía
  is_active    INTEGER NOT NULL DEFAULT 1,

  -- Precios en centavos USD (evita decimales en SQLite)
  price_monthly   INTEGER NOT NULL DEFAULT 0,
  price_annual    INTEGER NOT NULL DEFAULT 0,  -- precio total año (no mensual × 12)
  price_lifetime  INTEGER NOT NULL DEFAULT 0,  -- 0 = no disponible

  -- IDs en la pasarela de pago (LemonSqueezy o Stripe)
  -- Se llenan cuando se configure la pasarela
  gateway_monthly_id  TEXT,
  gateway_annual_id   TEXT,
  gateway_lifetime_id TEXT,

  -- Qué secciones puede ver este plan (JSON array de rutas)
  -- Ejemplo: '["reporte-","gameplan-","cierre-"]'
  allowed_path_patterns TEXT NOT NULL DEFAULT '[]',

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Datos iniciales de planes
INSERT OR IGNORE INTO plans
  (id, name, description, tier, price_monthly, price_annual, price_lifetime, allowed_path_patterns)
VALUES
  ('free',    'Free',         'Acceso al blog público',                              0, 0,    0,     0,     '[]'),
  ('basic',   'Basic',        'Análisis de operativa y Game Plan',                   1, 1500, 14400, 0,     '["reporte","gameplan","cierre-de-mes","analisis_","premercado"]'),
  ('pro',     'Pro',          'Basic + Indicadores y Dashboard',                     2, 2900, 27800, 0,     '["reporte","gameplan","cierre-de-mes","analisis_","premercado","repositorio","dashboard","backtesting"]'),
  ('premium', 'Premium Plus', 'Acceso total: todo lo anterior + Manuales completos', 3, 4900, 46800, 29900, '["reporte","gameplan","cierre-de-mes","analisis_","premercado","repositorio","dashboard","backtesting","EduS_","manual_","edus-trader-dofa"]');

-- ------------------------------------------------------------
-- 4. SUBSCRIPTIONS
-- Una suscripción por usuario. Al cambiar de plan se actualiza
-- este registro y se inserta en subscription_changes.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscriptions (
  id              TEXT PRIMARY KEY,        -- UUID v4
  user_id         TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  plan_id         TEXT NOT NULL REFERENCES plans(id),

  billing_cycle   TEXT NOT NULL DEFAULT 'monthly'
                  CHECK (billing_cycle IN ('monthly','annual','lifetime','trial')),
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','past_due','cancelled','expired','trialing')),

  -- Fechas del ciclo actual
  current_period_start TEXT NOT NULL,      -- ISO-8601
  current_period_end   TEXT,               -- NULL = lifetime

  -- Cancelación
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,  -- 1 = cancela al final del período
  cancelled_at         TEXT,

  -- Datos de la pasarela (LemonSqueezy / Stripe)
  gateway             TEXT CHECK (gateway IN ('lemon','stripe')),
  gateway_sub_id      TEXT UNIQUE,         -- ID de suscripción en la pasarela
  gateway_customer_id TEXT,

  -- Cupón aplicado actualmente
  coupon_id       TEXT REFERENCES coupons(id),

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_subs_user       ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subs_status     ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subs_gateway_id ON subscriptions(gateway_sub_id);

-- ------------------------------------------------------------
-- 5. SUBSCRIPTION_CHANGES
-- Historial de cambios de plan: upgrades, downgrades,
-- cancelaciones. Fundamental para la lógica de prorrateo.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscription_changes (
  id              TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES users(id),

  change_type     TEXT NOT NULL
                  CHECK (change_type IN ('created','upgraded','downgraded','cancelled','reactivated','expired')),

  from_plan_id    TEXT REFERENCES plans(id),
  to_plan_id      TEXT REFERENCES plans(id),
  from_billing    TEXT,
  to_billing      TEXT,

  -- Para prorrateo: cuánto se cobró / acreditó en este cambio
  proration_amount  INTEGER,               -- centavos. Positivo = cobro, negativo = crédito
  proration_days    INTEGER,               -- días restantes en el período anterior

  -- ID del pago relacionado en la pasarela
  gateway_payment_id TEXT,

  effective_at    TEXT NOT NULL DEFAULT (datetime('now')),
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sub_changes_user ON subscription_changes(user_id);
CREATE INDEX IF NOT EXISTS idx_sub_changes_sub  ON subscription_changes(subscription_id);

-- ------------------------------------------------------------
-- 6. PAYMENTS
-- Historial completo de cobros. Cada renovación, upgrade,
-- pago de por vida o reembolso queda aquí.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
  id              TEXT PRIMARY KEY,        -- UUID v4 (nuestro ID interno)
  user_id         TEXT NOT NULL REFERENCES users(id),
  subscription_id TEXT REFERENCES subscriptions(id),

  -- Importes en centavos USD
  amount          INTEGER NOT NULL,        -- total cobrado
  amount_refunded INTEGER NOT NULL DEFAULT 0,
  currency        TEXT NOT NULL DEFAULT 'USD',

  status          TEXT NOT NULL
                  CHECK (status IN ('pending','paid','failed','refunded','partially_refunded')),

  -- Qué se pagó
  description     TEXT,                    -- ej. 'Suscripción Pro mensual · Nov 2026'
  plan_id         TEXT REFERENCES plans(id),
  billing_cycle   TEXT,

  -- Prorrateo
  is_proration    INTEGER NOT NULL DEFAULT 0,
  proration_days  INTEGER,

  -- Cupón aplicado en este pago
  coupon_id       TEXT REFERENCES coupons(id),
  discount_amount INTEGER NOT NULL DEFAULT 0,

  -- Datos de la pasarela
  gateway             TEXT,
  gateway_payment_id  TEXT UNIQUE,         -- ID del charge/invoice en Stripe o LS
  gateway_invoice_url TEXT,                -- URL de la factura en la pasarela

  paid_at    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_payments_user       ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status     ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_gateway_id ON payments(gateway_payment_id);
CREATE INDEX IF NOT EXISTS idx_payments_created    ON payments(created_at);

-- ------------------------------------------------------------
-- 7. COUPONS
-- Códigos de descuento con límites de uso, fechas y tipo.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS coupons (
  id            TEXT PRIMARY KEY,          -- UUID v4
  code          TEXT NOT NULL UNIQUE,      -- ej. 'LAUNCH50', 'AMIGO2026'
  description   TEXT,

  discount_type TEXT NOT NULL
                CHECK (discount_type IN ('percent','fixed')),
  discount_value INTEGER NOT NULL,         -- % o centavos según tipo

  -- Restricciones
  max_uses      INTEGER,                   -- NULL = ilimitado
  uses_count    INTEGER NOT NULL DEFAULT 0,
  max_uses_per_user INTEGER NOT NULL DEFAULT 1,

  -- Solo válido para ciertos planes (JSON array) o NULL = todos
  applicable_plans TEXT,                   -- ej. '["pro","premium"]'

  -- Solo válido para ciertos ciclos o NULL = todos
  applicable_billing TEXT,                 -- ej. '["annual","lifetime"]'

  -- Vigencia
  valid_from TEXT,
  valid_until TEXT,                        -- NULL = sin expiración

  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_coupons_code   ON coupons(code);
CREATE INDEX IF NOT EXISTS idx_coupons_active ON coupons(is_active);

-- ------------------------------------------------------------
-- 8. COUPON_USES
-- Registro de qué usuario usó qué cupón, para respetar
-- el límite max_uses_per_user.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS coupon_uses (
  id         TEXT PRIMARY KEY,
  coupon_id  TEXT NOT NULL REFERENCES coupons(id),
  user_id    TEXT NOT NULL REFERENCES users(id),
  payment_id TEXT REFERENCES payments(id),
  used_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(coupon_id, user_id)               -- un cupón por usuario (salvo override)
);

-- ------------------------------------------------------------
-- 9. SESSIONS
-- Sesiones activas para invalidación (logout en todos los
-- dispositivos, sesiones robadas, etc.)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,             -- token de sesión (almacenado en cookie)
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_agent TEXT,
  ip_address TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_user    ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- ------------------------------------------------------------
-- TRIGGER: actualizar updated_at automáticamente
-- ------------------------------------------------------------
CREATE TRIGGER IF NOT EXISTS trg_users_updated
  AFTER UPDATE ON users
  BEGIN UPDATE users SET updated_at = datetime('now') WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS trg_subs_updated
  AFTER UPDATE ON subscriptions
  BEGIN UPDATE subscriptions SET updated_at = datetime('now') WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS trg_plans_updated
  AFTER UPDATE ON plans
  BEGIN UPDATE plans SET updated_at = datetime('now') WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS trg_coupons_updated
  AFTER UPDATE ON coupons
  BEGIN UPDATE coupons SET updated_at = datetime('now') WHERE id = NEW.id; END;
