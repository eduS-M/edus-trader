// ============================================================
// functions/api/auth/google.js
// GET /api/auth/google  -> inicia el flujo OAuth con Google
//
// El callback se maneja en: functions/api/auth/google/callback.js
// Cloudflare Pages requiere archivos separados para sub-rutas.
// ============================================================

import { generateId }  from '../../lib/jwt.js';
import { redirect }    from '../../lib/response.js';

export async function onRequestGet({ request, env }) {
  // Generar state anti-CSRF
  const state = generateId();

  const params = new URLSearchParams({
    client_id:     env.GOOGLE_CLIENT_ID,
    redirect_uri:  `${env.APP_URL}/api/auth/google/callback`,
    response_type: 'code',
    scope:         'openid email profile',
    state,
    access_type:   'online',
    prompt:        'select_account',
  });

  // Cookie de estado con vida de 10 minutos
  const stateCookie = [
    `oauth_state=${state}`,
    'Path=/api/auth',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Max-Age=600',
  ].join('; ');

  return redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`, stateCookie);
}
