// ============================================================
// functions/lib/emails.js
// Libreria centralizada de envio de emails via Resend
// Todos los templates HTML del flujo de autenticacion
// ============================================================

const BRAND = {
  name:        'EduS Trader',
  color:       '#3dd6c0',
  colorDark:   '#2bb8a4',
  bgDark:      '#0f172a',
  bgCard:      '#1e293b',
  textMuted:   '#94a3b8',
  textLight:   '#e2e8f0',
  url:         'https://edustrader.pages.dev',
};

// ─────────────────────────────────────────────────────────────
// Funcion base de envio
// ─────────────────────────────────────────────────────────────
async function sendEmail({ apiKey, from, to, subject, html }) {
  const fromAddress = from || 'onboarding@resend.dev';

  // Resend requiere "Nombre <email>" o solo "<email>"
  // Si el valor de EMAIL_FROM ya tiene ese formato, lo usamos directamente.
  // Si no, lo envolvemos con el nombre de la marca.
  const fromField = fromAddress.includes('<')
    ? fromAddress
    : `${BRAND.name} <${fromAddress}>`;

  const res = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ from: fromField, to: [to], subject, html }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend error ${res.status}: ${body}`);
  }

  return res.json();
}

// ─────────────────────────────────────────────────────────────
// Template base (wrapper HTML/CSS compartido)
// ─────────────────────────────────────────────────────────────
function baseTemplate({ title, preheader, content }) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background-color: #0a0f1e;
      color: ${BRAND.textLight};
      line-height: 1.6;
    }
    .wrapper {
      max-width: 560px;
      margin: 40px auto;
      padding: 0 16px 40px;
    }
    /* Header */
    .header {
      text-align: center;
      padding: 32px 0 24px;
    }
    .logo-text {
      font-size: 22px;
      font-weight: 700;
      color: ${BRAND.color};
      letter-spacing: -0.5px;
    }
    .logo-text span { color: ${BRAND.textLight}; }
    /* Card */
    .card {
      background: ${BRAND.bgCard};
      border: 1px solid rgba(61, 214, 192, 0.15);
      border-radius: 16px;
      padding: 40px 36px;
    }
    /* Button */
    .btn {
      display: inline-block;
      padding: 14px 32px;
      background: linear-gradient(135deg, ${BRAND.color}, ${BRAND.colorDark});
      color: ${BRAND.bgDark} !important;
      font-weight: 700;
      font-size: 15px;
      text-decoration: none;
      border-radius: 10px;
      margin: 24px 0;
      letter-spacing: 0.2px;
    }
    .btn-center { text-align: center; }
    /* Divider */
    .divider {
      border: none;
      border-top: 1px solid rgba(255,255,255,0.07);
      margin: 28px 0;
    }
    /* Badge */
    .badge {
      display: inline-block;
      background: rgba(61, 214, 192, 0.12);
      color: ${BRAND.color};
      border: 1px solid rgba(61, 214, 192, 0.3);
      border-radius: 20px;
      padding: 4px 14px;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.8px;
      text-transform: uppercase;
      margin-bottom: 16px;
    }
    h1 {
      font-size: 24px;
      font-weight: 700;
      color: ${BRAND.textLight};
      margin-bottom: 12px;
      line-height: 1.3;
    }
    p { color: ${BRAND.textMuted}; font-size: 15px; margin-bottom: 12px; }
    p.highlight { color: ${BRAND.textLight}; }
    .token-box {
      background: rgba(0,0,0,0.3);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 8px;
      padding: 12px 16px;
      font-family: monospace;
      font-size: 13px;
      color: ${BRAND.color};
      word-break: break-all;
      margin: 16px 0;
    }
    .feature-list {
      list-style: none;
      margin: 16px 0;
    }
    .feature-list li {
      padding: 8px 0;
      color: ${BRAND.textMuted};
      font-size: 14px;
      border-bottom: 1px solid rgba(255,255,255,0.05);
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .feature-list li:last-child { border-bottom: none; }
    .feature-list li .icon { color: ${BRAND.color}; font-size: 16px; }
    /* Footer */
    .footer {
      text-align: center;
      padding-top: 24px;
    }
    .footer p {
      font-size: 12px;
      color: #475569;
      margin-bottom: 4px;
    }
    .footer a { color: ${BRAND.color}; text-decoration: none; }
    .expire-note {
      font-size: 12px !important;
      color: #475569 !important;
      margin-top: 8px !important;
    }
  </style>
</head>
<body>
  <!-- Preheader oculto para clientes de correo -->
  <div style="display:none;max-height:0;overflow:hidden;color:transparent">${preheader}&nbsp;‌&nbsp;‌&nbsp;‌</div>

  <div class="wrapper">
    <div class="header">
      <div class="logo-text">EduS <span>Trader</span></div>
    </div>

    <div class="card">
      ${content}
    </div>

    <div class="footer">
      <p>© ${new Date().getFullYear()} EduS Trader · <a href="${BRAND.url}">edustrader.pages.dev</a></p>
      <p>Si no realizaste esta acción, ignora este correo.</p>
    </div>
  </div>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────
// Template 1: Verificacion de email (registro email/password)
// ─────────────────────────────────────────────────────────────
function verifyEmailTemplate({ firstName, verifyUrl }) {
  return baseTemplate({
    title:     'Verifica tu cuenta — EduS Trader',
    preheader: `Hola ${firstName}, un clic para activar tu cuenta en EduS Trader.`,
    content: `
      <div class="badge">✉ Verificación de cuenta</div>
      <h1>¡Bienvenido, ${firstName}!</h1>
      <p class="highlight">Tu cuenta ha sido creada exitosamente.</p>
      <p>Para comenzar a acceder al contenido de EduS Trader, confirma tu correo electrónico haciendo clic en el botón:</p>

      <div class="btn-center">
        <a href="${verifyUrl}" class="btn">✅ Verificar mi cuenta →</a>
      </div>

      <hr class="divider">

      <p>Con tu cuenta <strong style="color:${BRAND.textLight}">Free</strong> tendrás acceso a:</p>
      <ul class="feature-list">
        <li><span class="icon">📊</span>Acceso al portal de miembros</li>
        <li><span class="icon">🔔</span>Notificaciones del mercado</li>
        <li><span class="icon">⬆️</span>Posibilidad de upgrade a Basic, Pro o Premium</li>
      </ul>

      <p class="expire-note">⏱ Este enlace expira en <strong>24 horas</strong>. Si no creaste esta cuenta, ignora este mensaje.</p>

      <hr class="divider">
      <p style="font-size:13px">Si el botón no funciona, copia y pega este link en tu navegador:</p>
      <div class="token-box">${verifyUrl}</div>
    `,
  });
}

// ─────────────────────────────────────────────────────────────
// Template 2: Bienvenida Google (nuevo usuario via OAuth)
// ─────────────────────────────────────────────────────────────
function welcomeGoogleTemplate({ firstName, appUrl }) {
  const portalUrl = `${appUrl}/members/portal/`;

  return baseTemplate({
    title:     '¡Bienvenido a EduS Trader!',
    preheader: `Hola ${firstName}, tu cuenta Google fue conectada exitosamente.`,
    content: `
      <div class="badge">🚀 Cuenta activada</div>
      <h1>¡Bienvenido, ${firstName}!</h1>
      <p class="highlight">Tu cuenta fue creada y verificada correctamente mediante Google.</p>
      <p>Ya puedes acceder al portal de miembros y explorar todo el contenido disponible en EduS Trader.</p>

      <div class="btn-center">
        <a href="${portalUrl}" class="btn">🏠 Ir al portal →</a>
      </div>

      <hr class="divider">

      <p>Tu cuenta está en plan <strong style="color:${BRAND.color}">Free</strong>. Cuando quieras acceder a reportes diarios, análisis en profundidad y herramientas premium, puedes hacer upgrade:</p>

      <ul class="feature-list">
        <li><span class="icon">📈</span><strong style="color:${BRAND.textLight}">Basic</strong> — Reportes y análisis diarios</li>
        <li><span class="icon">⚡</span><strong style="color:${BRAND.textLight}">Pro</strong> — Repositorio NT8 + backtesting</li>
        <li><span class="icon">💎</span><strong style="color:${BRAND.textLight}">Premium</strong> — Indicadores, manuales y todo lo anterior</li>
      </ul>

      <div class="btn-center">
        <a href="${appUrl}/pricing.html" style="
          display:inline-block; padding:10px 24px;
          border:1px solid rgba(61,214,192,0.4); border-radius:8px;
          color:${BRAND.color}; font-size:13px; text-decoration:none; font-weight:600;
        ">Ver planes →</a>
      </div>
    `,
  });
}

// ─────────────────────────────────────────────────────────────
// Template 3: Confirmacion post-verificacion exitosa
// ─────────────────────────────────────────────────────────────
function emailVerifiedTemplate({ firstName, appUrl }) {
  const portalUrl = `${appUrl}/members/portal/`;

  return baseTemplate({
    title:     '¡Email verificado! — EduS Trader',
    preheader: `${firstName}, tu email fue verificado. Ya puedes iniciar sesión.`,
    content: `
      <div class="badge">✅ Email verificado</div>
      <h1>¡Todo listo, ${firstName}!</h1>
      <p class="highlight">Tu correo electrónico ha sido verificado correctamente.</p>
      <p>Ahora puedes iniciar sesión y acceder a todo el contenido de EduS Trader con tu cuenta.</p>

      <div class="btn-center">
        <a href="${portalUrl}" class="btn">🏠 Acceder al portal →</a>
      </div>

      <hr class="divider">

      <p style="font-size:13px;text-align:center;">
        ¿Preguntas? Escríbeme en
        <a href="https://twitter.com/" style="color:${BRAND.color}">Twitter/X</a>
        o responde directamente este correo.
      </p>
    `,
  });
}

// ─────────────────────────────────────────────────────────────
// Funciones exportadas publicas
// ─────────────────────────────────────────────────────────────

/**
 * Envia email de verificacion de cuenta (registro email/password)
 */
export async function sendVerificationEmail({ to, name, token, appUrl, apiKey, from }) {
  const verifyUrl = `${appUrl}/api/auth/verify-email?token=${token}`;
  const firstName = (name || 'Trader').split(' ')[0];

  return sendEmail({
    apiKey,
    from,
    to,
    subject: '✅ Verifica tu cuenta — EduS Trader',
    html:    verifyEmailTemplate({ firstName, verifyUrl }),
  });
}

/**
 * Envia email de bienvenida para usuarios nuevos via Google OAuth
 */
export async function sendWelcomeGoogleEmail({ to, name, appUrl, apiKey, from }) {
  const firstName = (name || 'Trader').split(' ')[0];

  return sendEmail({
    apiKey,
    from,
    to,
    subject: '🚀 ¡Bienvenido a EduS Trader!',
    html:    welcomeGoogleTemplate({ firstName, appUrl }),
  });
}

/**
 * Envia email de confirmacion post-verificacion exitosa
 */
export async function sendEmailVerifiedConfirmation({ to, name, appUrl, apiKey, from }) {
  const firstName = (name || 'Trader').split(' ')[0];

  return sendEmail({
    apiKey,
    from,
    to,
    subject: '✅ Email verificado — EduS Trader',
    html:    emailVerifiedTemplate({ firstName, appUrl }),
  });
}
