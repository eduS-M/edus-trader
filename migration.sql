-- Migración de la Base de Datos para Producción (EduS Trader)

-- Ejecuta estos comandos en tu base de datos (Cloudflare D1) para aplicar los cambios recientes sin perder datos.

-- 1. Añadir campos de perfil
ALTER TABLE users ADD COLUMN phone TEXT;
ALTER TABLE users ADD COLUMN country TEXT;
ALTER TABLE users ADD COLUMN address TEXT;
ALTER TABLE users ADD COLUMN tax_id TEXT;

-- 2. Añadir campo de rol
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member','admin'));

-- Nota: En SQLite/D1 a veces las restricciones CHECK agregadas mediante ALTER TABLE son ignoradas dependiendo de la versión de SQLite, 
-- pero el campo se creará correctamente con el valor por defecto.
