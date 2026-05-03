// ============================================================
// functions/api/auth/login.js
// POST /api/auth/login
// Login con email + contraseña → devuelve cookie JWT
// ============================================================

import { verifyPassword, signJWT, generateId } from '../../lib/jwt.js';
import { ok, badRequest, unauthorized, serverError, preflight, buildSessionCookie } from '../../lib/response.js';

export async function onRequestOptions() { return preflight(); }

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); }
  catch { return badRequest('JSON inválido'); }

  const { email, password, rememberMe } = body;
  if (!email || !password) return badRequest('Email y contraseña son obligatorios');

  await new Promise(r => setTimeout(r, 300)); // anti brute-force

  try {
    const user = await env.DB.prepare(`
      SELECT id, email, name, password_hash, plan, plan_expires_at, status
      FROM users WHERE email = ?
    `).bind(email.toLowerCase().trim()).first();

    if (!user)                        return unauthorized('Email o contraseña incorrectos');
    if (user.status === 'suspended')  return unauthorized('Tu cuenta está suspendida. Contacta soporte.');
    if (user.status === 'deleted')    return unauthorized('Esta cuenta no existe');
    if (!user.password_hash)          return unauthorized('Esta cuenta usa Google para iniciar sesión');

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) return unauthorized('Email o contraseña incorrectos');

    // Plan activo (verificar expiración)
    const plan = getActivePlan(user);

    // Actualizar last_login y sincronizar plan
    await env.DB.prepare(
      `UPDATE users SET last_login_at = datetime('now'), plan = ? WHERE id = ?`
    ).bind(plan, user.id).run();

    // Crear sesión en DB
    const sessionId   = generateId();
    const expiryHours = rememberMe ? 168 : 24;
    const expiresAt   = new Date(Date.now() + expiryHours * 3600 * 1000).toISOString();

    await env.DB.prepare(`
      INSERT INTO sessions (id, user_id, user_agent, ip_address, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      sessionId, user.id,
      (request.headers.get('User-Agent') || '').slice(0, 255),
      request.headers.get('CF-Connecting-IP') || '',
      expiresAt
    ).run();

    // Firmar JWT
    const token = await signJWT(
      { sub: user.id, sid: sessionId, email: user.email, name: user.name, plan },
      env.JWT_SECRET,
      expiryHours
    );

    return ok(
      { message: 'Login correcto', plan, name: user.name },
      { 'Set-Cookie': buildSessionCookie(token, expiryHours * 3600) }
    );

  } catch (err) {
    console.error('Error en login:', err);
    return serverError();
  }
}

function getActivePlan(user) {
  if (user.plan === 'free' || !user.plan_expires_at) return user.plan;
  return new Date(user.plan_expires_at) < new Date() ? 'free' : user.plan;
}
