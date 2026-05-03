// ============================================================
// functions/lib/jwt.js
// JWT firmado con HMAC-SHA256 + utilidades de contraseña
// Usa Web Crypto API nativa de Cloudflare Workers — sin deps
// ============================================================

// ------------------------------------------------------------
// JWT
// ------------------------------------------------------------

/**
 * Crea un JWT firmado con HMAC-SHA256.
 * payload debe incluir: { sub, email, plan, name? }
 * El token expira según JWT_EXPIRY_HOURS (env) o 24h por defecto.
 */
export async function signJWT(payload, secret, expiryHours = 24) {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    ...payload,
    iat: now,
    exp: now + expiryHours * 3600,
  };

  const header  = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body    = b64url(JSON.stringify(claims));
  const message = `${header}.${body}`;
  const sig     = await hmacSign(message, secret);

  return `${message}.${sig}`;
}

/**
 * Verifica y decodifica un JWT.
 * Lanza error si la firma es inválida o el token expiró.
 */
export async function verifyJWT(token, secret) {
  if (!token || typeof token !== 'string') throw new Error('Token vacío');

  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Formato JWT inválido');

  const [header, body, sig] = parts;
  const message = `${header}.${body}`;

  // Verificar firma
  const expected = await hmacSign(message, secret);
  if (!timingSafeEqual(sig, expected)) throw new Error('Firma inválida');

  // Decodificar payload
  const claims = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/')));

  // Verificar expiración
  if (claims.exp && claims.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Token expirado');
  }

  return claims;
}

// ------------------------------------------------------------
// Contraseñas (bcrypt-style con PBKDF2)
// ------------------------------------------------------------

/**
 * Hashea una contraseña con PBKDF2-SHA256 + salt aleatorio.
 * Devuelve string con formato: "salt:hash" (ambos en hex)
 */
export async function hashPassword(password) {
  const salt   = crypto.getRandomValues(new Uint8Array(16));
  const saltHx = toHex(salt);
  const hash   = await pbkdf2(password, salt);
  return `${saltHx}:${toHex(hash)}`;
}

/**
 * Compara una contraseña en texto plano con un hash almacenado.
 */
export async function verifyPassword(password, stored) {
  const [saltHx, storedHash] = stored.split(':');
  if (!saltHx || !storedHash) return false;

  const salt = fromHex(saltHx);
  const hash = toHex(await pbkdf2(password, salt));
  return timingSafeEqual(hash, storedHash);
}

// ------------------------------------------------------------
// Generadores de tokens
// ------------------------------------------------------------

/** UUID v4 aleatorio */
export function generateId() {
  return crypto.randomUUID();
}

/** Token opaco aleatorio (para verificación de email, reset pwd) */
export function generateToken(bytes = 32) {
  const arr = crypto.getRandomValues(new Uint8Array(bytes));
  return toHex(arr);
}

// ------------------------------------------------------------
// Helpers internos
// ------------------------------------------------------------

async function hmacSign(message, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return b64url(sig);
}

async function pbkdf2(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password),
    'PBKDF2', false, ['deriveBits']
  );
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    keyMaterial, 256
  );
  return new Uint8Array(derived);
}

function b64url(input) {
  const bytes = typeof input === 'string'
    ? new TextEncoder().encode(input)
    : (input instanceof ArrayBuffer ? new Uint8Array(input) : input);
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function toHex(buf) {
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex) {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < arr.length; i++) arr[i] = parseInt(hex.slice(i*2, i*2+2), 16);
  return arr;
}

/** Comparación en tiempo constante para evitar timing attacks */
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
