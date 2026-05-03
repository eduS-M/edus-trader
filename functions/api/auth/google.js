// ============================================================
// functions/api/auth/google.js
// GET /api/auth/google          → redirige a Google
// GET /api/auth/google/callback → procesa el código OAuth
// ============================================================

import { signJWT, generateId } from '../../lib/jwt.js';
import { redirect, serverError, badRequest, buildSessionCookie } from '../../lib/response.js';

// ---- Inicio del flujo OAuth --------------------------------
export async function onRequestGet({ request, env }) {
  const url    = new URL(request.url);
  const isCallback = url.pathname.endsWith('/callback');

  if (isCallback) return handleCallback({ url, env, request });

  // Generar state anti-CSRF (guardado en cookie temporal)
  const state    = generateId();
  const params   = new URLSearchParams({
    client_id:     env.GOOGLE_CLIENT_ID,
    redirect_uri:  `${env.APP_URL}/api/auth/google/callback`,
    response_type: 'code',
    scope:         'openid email profile',
    state,
    access_type:   'online',
    prompt:        'select_account',
  });

  const stateCookie = [
    `oauth_state=${state}`,
    'Path=/api/auth',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Max-Age=600',          // 10 minutos para completar el OAuth
  ].join('; ');

  return redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
    stateCookie
  );
}

// ---- Callback de Google ------------------------------------
async function handleCallback({ url, env, request }) {
  const code  = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) return redirect('/members/?error=google_cancelled');
  if (!code || !state) return badRequest('Parámetros OAuth inválidos');

  // Verificar state anti-CSRF
  const cookieHeader = request.headers.get('Cookie') || '';
  const storedState  = getCookie(cookieHeader, 'oauth_state');
  if (!storedState || storedState !== state) {
    return redirect('/members/?error=oauth_state_mismatch');
  }

  try {
    // 1. Intercambiar código por tokens de Google
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri:  `${env.APP_URL}/api/auth/google/callback`,
        grant_type:    'authorization_code',
      }),
    });

    if (!tokenRes.ok) return redirect('/members/?error=google_token_failed');
    const tokens = await tokenRes.json();

    // 2. Obtener perfil del usuario desde Google
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!profileRes.ok) return redirect('/members/?error=google_profile_failed');
    const profile = await profileRes.json();

    const { sub: googleId, email, name, picture } = profile;
    if (!email) return redirect('/members/?error=no_email');

    const emailLower = email.toLowerCase();

    // 3. Buscar o crear usuario
    let user = await env.DB.prepare(`
      SELECT id, email, name, plan, plan_expires_at, status
      FROM users WHERE email = ? OR google_id = ?
    `).bind(emailLower, googleId).first();

    if (user) {
      // Usuario existente — actualizar datos de Google si cambió algo
      await env.DB.prepare(`
        UPDATE users SET
          google_id     = ?,
          name          = COALESCE(name, ?),
          avatar_url    = ?,
          email_verified = 1,
          last_login_at = datetime('now')
        WHERE id = ?
      `).bind(googleId, name, picture, user.id).run();
    } else {
      // Usuario nuevo — crear con plan free
      const userId = generateId();
      await env.DB.prepare(`
        INSERT INTO users (id, email, google_id, name, avatar_url, plan, status, email_verified)
        VALUES (?, ?, ?, ?, ?, 'free', 'active', 1)
      `).bind(userId, emailLower, googleId, name, picture).run();

      user = { id: userId, email: emailLower, name, plan: 'free', plan_expires_at: null };
    }

    // 4. Plan activo
    const plan = getActivePlan(user);

    // 5. Crear sesión y firmar JWT
    const sessionId = generateId();
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

    await env.DB.prepare(`
      INSERT INTO sessions (id, user_id, user_agent, ip_address, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      sessionId, user.id,
      (request.headers.get('User-Agent') || '').slice(0, 255),
      request.headers.get('CF-Connecting-IP') || '',
      expiresAt
    ).run();

    const token = await signJWT(
      { sub: user.id, sid: sessionId, email: user.email, name: user.name, plan },
      env.JWT_SECRET,
      168   // 7 días para Google login
    );

    const jwtCookie   = buildSessionCookie(token, 7 * 24 * 3600);
    const clearState  = 'oauth_state=; Path=/api/auth; HttpOnly; Secure; Max-Age=0';

    // Redirigir a la zona de miembros con las dos cookies
    const response = redirect('/members/', jwtCookie);
    response.headers.append('Set-Cookie', clearState);
    return response;

  } catch (err) {
    console.error('Error en Google OAuth callback:', err);
    return serverError();
  }
}

function getActivePlan(user) {
  if (user.plan === 'free' || !user.plan_expires_at) return user.plan;
  return new Date(user.plan_expires_at) < new Date() ? 'free' : user.plan;
}

function getCookie(header, name) {
  const match = header.split(';').map(c => c.trim())
    .find(c => c.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : null;
}
