// ============================================================
// EduS Trader — Cloudflare Pages Middleware
// Protege todas las páginas privadas con autenticación por cookie
// ============================================================

// Contraseña (debe coincidir con la del members/index.html)
// IMPORTANTE: mueve esto a una variable de entorno en Cloudflare Pages
// Settings → Environment Variables → CFP_PASSWORD
const PASSWORD = 'edustrader2026';

// Nombre de la cookie de sesión
const COOKIE_NAME = 'edus_session';

// Páginas y rutas PÚBLICAS — no requieren login
// Cualquier otra URL será protegida automáticamente
const PUBLIC_PATHS = [
  '/',
  '/index.html',
  '/members',
  '/members/',
  '/members/index.html',
];

// Extensiones de assets que siempre son públicos
const PUBLIC_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg',
                            '.css', '.js', '.woff', '.woff2', '.ttf', '.ico'];

// ============================================================

export async function onRequest(context) {
  const { request, next, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  // Usar contraseña de variable de entorno si está disponible
  const password = (env && env.CFP_PASSWORD) ? env.CFP_PASSWORD : PASSWORD;

  // 1. Dejar pasar assets (imágenes, fuentes, etc.)
  const ext = path.substring(path.lastIndexOf('.')).toLowerCase();
  if (PUBLIC_EXTENSIONS.includes(ext)) {
    return await next();
  }

  // 2. Dejar pasar rutas públicas
  if (PUBLIC_PATHS.includes(path) || PUBLIC_PATHS.includes(path + '/')) {
    return await next();
  }

  // 3. Manejar el endpoint de login (POST desde members/index.html)
  if (path === '/api/login' && request.method === 'POST') {
    return handleLogin(request, password);
  }

  // 4. Manejar el endpoint de logout
  if (path === '/api/logout') {
    return handleLogout();
  }

  // 5. Verificar cookie de sesión para cualquier otra ruta
  const cookie = getCookie(request, COOKIE_NAME);
  if (!isValidSession(cookie, password)) {
    // No autenticado — redirigir al login con la URL de destino
    const loginUrl = `/members/?redirect=${encodeURIComponent(path)}`;
    return Response.redirect(new URL(loginUrl, url.origin).toString(), 302);
  }

  // 6. Autenticado — dejar pasar
  return await next();
}

// ============================================================
// Handlers
// ============================================================

async function handleLogin(request, password) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Bad request' }, 400);
  }

  if (body.password !== password) {
    // Pequeña pausa para evitar fuerza bruta
    await new Promise(r => setTimeout(r, 500));
    return jsonResponse({ ok: false, error: 'Contraseña incorrecta' }, 401);
  }

  // Crear token de sesión simple (hash de la contraseña + sal fija)
  const sessionToken = await hashToken(password + '_edus_salt_2026');

  const response = jsonResponse({ ok: true });
  response.headers.set(
    'Set-Cookie',
    `${COOKIE_NAME}=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`
    // Max-Age=86400 = 24 horas. Cambia a 604800 para 7 días.
  );
  return response;
}

function handleLogout() {
  const response = Response.redirect('/', 302);
  response.headers.set(
    'Set-Cookie',
    `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
  );
  return response;
}

// ============================================================
// Helpers
// ============================================================

function getCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  const cookies = header.split(';').map(c => c.trim());
  for (const cookie of cookies) {
    const [key, ...parts] = cookie.split('=');
    if (key.trim() === name) return parts.join('=').trim();
  }
  return null;
}

async function hashToken(input) {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function isValidSession(cookie, password) {
  if (!cookie) return false;
  const expected = await hashToken(password + '_edus_salt_2026');
  return cookie === expected;
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
