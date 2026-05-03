# ============================================================
# EduS Trader — Guía de Configuración Cloudflare
# ============================================================
# Lee esto de arriba a abajo antes de hacer cualquier deploy.
# Tiempo estimado: 30–45 minutos la primera vez.
# ============================================================


## PASO 1 — Instalar Wrangler (herramienta CLI de Cloudflare)
## ─────────────────────────────────────────────────────────────

```bash
npm install -g wrangler
```

Verifica que quedó instalado:
```bash
wrangler --version
# Debería mostrar: wrangler X.X.X
```


## PASO 2 — Conectar tu cuenta Cloudflare
## ─────────────────────────────────────────────────────────────

```bash
wrangler login
```

→ Se abre el navegador, inicia sesión en Cloudflare y autoriza Wrangler.
→ El token queda guardado localmente. No necesitas hacerlo de nuevo.


## PASO 3 — Crear la base de datos D1
## ─────────────────────────────────────────────────────────────

```bash
wrangler d1 create edus-trader-db
```

Cloudflare te devuelve algo así:

```
✅ Successfully created DB 'edus-trader-db'

[[d1_databases]]
binding = "DB"
database_name = "edus-trader-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"   ← COPIA ESTE ID
```

**Copia el database_id** y pégalo en el wrangler.toml (ver Paso 4).


## PASO 4 — Crear el wrangler.toml en la raíz del repositorio
## ─────────────────────────────────────────────────────────────

Crea el archivo `wrangler.toml` en la raíz (mismo nivel que index.html):

```toml
name = "edus-trader"
compatibility_date = "2024-09-23"
pages_build_output_dir = "."

[[d1_databases]]
binding = "DB"
database_name = "edus-trader-db"
database_id = "PEGA-AQUÍ-EL-ID-DEL-PASO-3"

[vars]
ENVIRONMENT = "production"
APP_URL = "https://edustrader.pages.dev"
```

⚠️  Las variables SENSIBLES (contraseñas, claves API) NO van aquí.
    Van en el dashboard de Cloudflare (Paso 6).


## PASO 5 — Ejecutar el schema de base de datos
## ─────────────────────────────────────────────────────────────

Esto crea todas las tablas en D1:

```bash
wrangler d1 execute edus-trader-db --file=./db/schema.sql
```

Verifica que las tablas se crearon:
```bash
wrangler d1 execute edus-trader-db \
  --command="SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
```

Deberías ver:
```
users, sessions, plans, subscriptions,
subscription_changes, payments, coupons,
coupon_uses, email_verifications
```


## PASO 6 — Variables de entorno en el Dashboard de Cloudflare
## ─────────────────────────────────────────────────────────────

Ruta: Cloudflare Dashboard
  → Workers & Pages
  → edus-trader (tu proyecto)
  → Settings
  → Environment Variables
  → Add variable (marcar "Encrypt" en todas)

Variables a crear:

┌─────────────────────────┬──────────────────────────────────────────────────┐
│ Nombre                  │ Valor / Cómo obtenerlo                           │
├─────────────────────────┼──────────────────────────────────────────────────┤
│ JWT_SECRET              │ Genera con: openssl rand -hex 32                 │
│                         │ Ej: a3f8b2c1d4e5...  (cadena larga y aleatoria) │
├─────────────────────────┼──────────────────────────────────────────────────┤
│ GOOGLE_CLIENT_ID        │ De Google Cloud Console (ver Paso 7)             │
├─────────────────────────┼──────────────────────────────────────────────────┤
│ GOOGLE_CLIENT_SECRET    │ De Google Cloud Console (ver Paso 7)             │
├─────────────────────────┼──────────────────────────────────────────────────┤
│ RESEND_API_KEY          │ De resend.com → API Keys → Create API Key        │
│                         │ Plan gratuito: 3.000 emails/mes                  │
├─────────────────────────┼──────────────────────────────────────────────────┤
│ LEMON_WEBHOOK_SECRET    │ De LemonSqueezy → Settings → Webhooks            │
│                         │ (añadir cuando configures la pasarela de pago)   │
└─────────────────────────┴──────────────────────────────────────────────────┘

Genera el JWT_SECRET así (en tu terminal):
```bash
openssl rand -hex 32
# Resultado: abc123def456...  (64 caracteres)
```

Si no tienes openssl, usa este comando Node.js:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```


## PASO 7 — Configurar Google OAuth
## ─────────────────────────────────────────────────────────────

1. Ve a: https://console.cloud.google.com
2. Crea un proyecto nuevo (o usa uno existente)
3. Menú izquierdo → APIs & Services → Credentials
4. Clic en "Create Credentials" → OAuth client ID
5. Application type: "Web application"
6. Name: "EduS Trader"
7. Authorized redirect URIs → Add URI:
   https://edustrader.pages.dev/api/auth/google/callback
8. Clic en "Create"
9. Copia el "Client ID" y el "Client Secret"
10. Pégalos en las variables de entorno del Paso 6

⚠️  Si usas un dominio personalizado (ej: edustrader.com),
    añade también esa URL en los redirect URIs.


## PASO 8 — Hacer tu primera cuenta de admin
## ─────────────────────────────────────────────────────────────

Después del primer deploy, regístrate normalmente en el sitio.
Luego ejecuta este comando para darte rol de admin:

```bash
wrangler d1 execute edus-trader-db \
  --command="UPDATE users SET role = 'admin' WHERE email = 'tu@email.com'"
```

Nota: el campo `role` hay que añadirlo al schema de users.
Ejecuta esto primero:

```bash
wrangler d1 execute edus-trader-db \
  --command="ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'member'"
```

Después da el rol:
```bash
wrangler d1 execute edus-trader-db \
  --command="UPDATE users SET role = 'admin' WHERE email = 'tu@email.com'"
```

El panel admin estará en: https://edustrader.pages.dev/admin/


## PASO 9 — Probar localmente antes del deploy
## ─────────────────────────────────────────────────────────────

Cloudflare Pages tiene un servidor local con D1 incluido:

```bash
# Crear la DB local (copia de la de producción)
wrangler d1 execute edus-trader-db --local --file=./db/schema.sql

# Arrancar el servidor local
wrangler pages dev . --d1=DB
```

→ Tu sitio corre en http://localhost:8788
→ Los endpoints de Functions funcionan igual que en producción
→ La DB local es independiente de la de producción


## PASO 10 — Deploy a producción
## ─────────────────────────────────────────────────────────────

Opción A (recomendada) — Deploy automático via GitHub:
  1. Conecta tu repo en Cloudflare Dashboard
     → Workers & Pages → Create → Pages → Connect to Git
  2. Cada push a `main` hace deploy automático

Opción B — Deploy manual desde terminal:
```bash
wrangler pages deploy .
```


## ESTRUCTURA FINAL DEL REPOSITORIO
## ─────────────────────────────────────────────────────────────

```
edus-trader/
├── wrangler.toml              ← configuración Cloudflare (raíz)
├── index.html                 ← blog público
├── pricing.html               ← página de planes
│
├── members/
│   └── index.html             ← portal de miembros (login + sidebar)
│
├── admin/
│   └── index.html             ← panel de administración
│
├── db/
│   ├── schema.sql             ← esquema de base de datos
│   └── CLOUDFLARE_SETUP.md   ← este archivo
│
└── functions/
    ├── _middleware.js         ← control de acceso (se ejecuta primero)
    │
    ├── lib/
    │   ├── jwt.js             ← criptografía (uso interno)
    │   └── response.js        ← helpers HTTP (uso interno)
    │
    └── api/
        ├── auth/
        │   ├── register.js    ← POST /api/auth/register
        │   ├── login.js       ← POST /api/auth/login
        │   ├── logout.js      ← POST /api/auth/logout
        │   ├── google.js      ← GET  /api/auth/google
        │   └── verify-email.js← GET  /api/auth/verify-email
        │
        ├── coupons/
        │   └── validate.js    ← POST /api/coupons/validate
        │
        └── admin/
            ├── coupons.js     ← GET|POST|PUT|DELETE /api/admin/coupons
            ├── members.js     ← GET|PUT /api/admin/members
            ├── stats.js       ← GET /api/admin/stats
            └── plans.js       ← GET /api/admin/plans  (pendiente)
```


## PROBLEMAS COMUNES
## ─────────────────────────────────────────────────────────────

❌ "Cannot find module '../../lib/jwt.js'"
   → Verifica que la carpeta functions/lib/ existe con jwt.js y response.js

❌ "D1_ERROR: no such table: users"
   → Ejecuta de nuevo: wrangler d1 execute edus-trader-db --file=./db/schema.sql

❌ Google OAuth devuelve "redirect_uri_mismatch"
   → La URL en Google Console debe ser EXACTAMENTE igual a la de tu sitio,
     incluyendo https:// y sin barra al final

❌ JWT_SECRET no encontrado en producción
   → Verifica en Cloudflare Dashboard que la variable esté en
     "Production" (no solo en "Preview")

❌ El panel /admin/ no carga (403)
   → Ejecuta el comando ALTER TABLE y UPDATE del Paso 8
     para darte rol de admin
