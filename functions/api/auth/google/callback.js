// ============================================================
// functions/api/auth/google/callback.js
// GET /api/auth/google/callback  -> procesa el codigo OAuth de Google
//
// NOTA: Este archivo existe separado de google.js porque
// Cloudflare Pages asigna cada Function a su ruta exacta.
// /api/auth/google  -> google.js  (inicia el flujo)
// /api/auth/google/callback -> google/callback.js  (este archivo)
// ============================================================

import { signJWT, generateId }                                from '../../../../lib/jwt.js';
import { redirect, serverError, buildSessionCookie }          from '../../../../lib/response.js';
import { sendWelcomeGoogleEmail }                              from '../../../../lib/emails.js';

export async function onRequestGet({ request, env }) {
  const url   = new URL(request.url);
  const code  = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  // El usuario cancelo el login con Google
  if (error) return redirect('/members/?error=google_cancelled');

  if (!code || !state) return redirect('/members/?error=oauth_params_missing');

  // Verificar que el state coincide con la cookie anti-CSRF
  const cookieHeader = request.headers.get('Cookie') || '';
  const storedState  = getCookie(cookieHeader, 'oauth_state');

  if (!storedState || storedState !== state)
    return redirect('/members/?error=oauth_state_mismatch');

  try {
    // ─── 1. Intercambiar codigo por tokens ───────────────────
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri:  `${env.APP_URL}/api/auth/google/callback`,
        grant_type:    'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text().catch(() => '');
      console.error('Google token error:', tokenRes.status, errBody);
      return redirect('/members/?error=google_token_failed');
    }
    const tokens = await tokenRes.json();

    // ─── 2. Obtener perfil del usuario ────────────────────────
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!profileRes.ok) return redirect('/members/?error=google_profile_failed');
    const profile = await profileRes.json();

    const { sub: googleId, email, name, picture } = profile;
    if (!email) return redirect('/members/?error=no_email');

    const emailLower = email.toLowerCase();

    // ─── 3. Buscar o crear usuario en D1 ─────────────────────
    let user = await env.DB.prepare(
      'SELECT id, email, name, plan, plan_expires_at, status, role FROM users WHERE email = ? OR google_id = ?'
    ).bind(emailLower, googleId).first();

    let isNewUser = false;

    if (user) {
      // Usuario existente — actualizar datos de Google
      await env.DB.prepare(
        `UPDATE users
         SET google_id = ?, name = COALESCE(name, ?), avatar_url = ?,
             email_verified = 1, last_login_at = datetime('now')
         WHERE id = ?`
      ).bind(googleId, name, picture, user.id).run();
    } else {
      // Usuario nuevo — registrar con plan free
      isNewUser    = true;
      const userId = generateId();

      await env.DB.prepare(
        `INSERT INTO users (id, email, google_id, name, avatar_url, plan, status, email_verified)
         VALUES (?, ?, ?, ?, ?, 'free', 'active', 1)`
      ).bind(userId, emailLower, googleId, name, picture).run();

      user = { id: userId, email: emailLower, name, plan: 'free', plan_expires_at: null, role: 'member' };
    }

    // ─── 4. Email de bienvenida para usuarios nuevos ──────────
    if (isNewUser && env.RESEND_API_KEY) {
      sendWelcomeGoogleEmail({
        to:     emailLower,
        name,
        appUrl: env.APP_URL || 'https://edustrader.pages.dev',
        apiKey: env.RESEND_API_KEY,
        from:   env.EMAIL_FROM || 'onboarding@resend.dev',
      }).catch(err => console.error('[Email] Error bienvenida Google:', err));
    }

    // ─── 5. Crear sesion y JWT ────────────────────────────────
    const plan      = getActivePlan(user);
    const sessionId = generateId();
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

    await env.DB.prepare(
      'INSERT INTO sessions (id, user_id, user_agent, ip_address, expires_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(
      sessionId, user.id,
      (request.headers.get('User-Agent') || '').slice(0, 255),
      request.headers.get('CF-Connecting-IP') || '',
      expiresAt
    ).run();

    const token = await signJWT(
      {
        sub:   user.id,
        sid:   sessionId,
        email: user.email,
        name:  user.name || name,
        plan,
        role:  user.role || 'member',
      },
      env.JWT_SECRET,
      168 // 7 dias en horas
    );

    // ─── 6. Setear cookie y redirigir al portal ───────────────
    const jwtCookie  = buildSessionCookie(token, 7 * 24 * 3600);
    const clearState = 'oauth_state=; Path=/api/auth; HttpOnly; Secure; Max-Age=0';

    const response = redirect('/members/portal/', jwtCookie);
    response.headers.append('Set-Cookie', clearState);
    return response;

  } catch (err) {
    console.error('[Google OAuth Callback] Error inesperado:', err);
    return serverError();
  }
}

// ─── Helpers ─────────────────────────────────────────────────

function getActivePlan(user) {
  if (user.plan === 'free' || !user.plan_expires_at) return user.plan;
  return new Date(user.plan_expires_at) < new Date() ? 'free' : user.plan;
}

function getCookie(header, name) {
  const match = header.split(';').map(c => c.trim()).find(c => c.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : null;
}
