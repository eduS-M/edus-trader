# ============================================================
# EduS Trader — Configuración Cloudflare (wrangler.toml)
# ============================================================
# Coloca este archivo en la RAÍZ del repositorio.
# Reemplaza los valores entre <> con los tuyos.
# ============================================================

name = "edus-trader"
compatibility_date = "2024-09-23"
pages_build_output_dir = "."

# Base de datos D1
[[d1_databases]]
binding = "DB"           # Nombre con el que accedes en Functions: context.env.DB
database_name = "edus-trader-db"
database_id = "<PEGAR_EL_ID_QUE_DA_CLOUDFLARE_AL_CREAR_LA_DB>"

# Variables de entorno (las sensibles van en el dashboard, no aquí)
[vars]
ENVIRONMENT = "production"
JWT_EXPIRY_HOURS = "24"
SESSION_LIFETIME_DAYS = "7"
APP_URL = "https://edustrader.pages.dev"

# ============================================================
# COMANDOS PARA CONFIGURAR D1 (ejecutar en terminal)
# ============================================================
#
# 1. Instalar Wrangler (si no lo tienes):
#    npm install -g wrangler
#
# 2. Login en Cloudflare:
#    wrangler login
#
# 3. Crear la base de datos D1:
#    wrangler d1 create edus-trader-db
#    → Copia el database_id que devuelve y pégalo arriba
#
# 4. Ejecutar el esquema en PRODUCCIÓN:
#    wrangler d1 execute edus-trader-db --file=./db/schema.sql
#
# 5. Verificar que las tablas se crearon:
#    wrangler d1 execute edus-trader-db --command="SELECT name FROM sqlite_master WHERE type='table'"
#
# 6. Para pruebas en LOCAL (crea una copia local de D1):
#    wrangler d1 execute edus-trader-db --local --file=./db/schema.sql
#    wrangler pages dev . --d1=DB
#
# ============================================================
# VARIABLES DE ENTORNO SENSIBLES
# Agregar en: Cloudflare Dashboard → Pages → edus-trader
#             → Settings → Environment Variables
# ============================================================
#
# JWT_SECRET          = (cadena aleatoria larga, ej: openssl rand -hex 32)
# CFP_PASSWORD        = (contraseña actual de la zona de miembros)
# GOOGLE_CLIENT_ID    = (de Google Cloud Console)
# GOOGLE_CLIENT_SECRET= (de Google Cloud Console)
# RESEND_API_KEY      = (de resend.com para emails)
# LEMON_WEBHOOK_SECRET= (de LemonSqueezy → Settings → Webhooks)
# ============================================================
