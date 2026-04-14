# EduS Trader - Sitio Web

Sitio estático para Cloudflare Pages. Réplica exacta del Blogspot con mejoras de rendimiento.

## Estructura
```
/
├── index.html          # Página principal
├── assets/
│   └── banner.png      # Banner del encabezado
└── README.md
```

## Deploy en Cloudflare Pages

1. Sube este repo a GitHub
2. Cloudflare Dashboard → Workers & Pages → Create → Pages
3. Connect to Git → selecciona este repo
4. Build settings:
   - Framework preset: None
   - Build command: (vacío)
   - Build output: /
5. Deploy

URL: https://edustrader.pages.dev

## Actualizar contenido

Para añadir nueva sesión:
1. Edita `index.html`
2. Busca `<!-- 10 ABR -->`
3. Copia el bloque `<a class="edus-card"...` y pega arriba
4. Cambia fecha, datos, link
5. Commit → push → Cloudflare despliega automático (30 seg)

## Dominio personalizado

Pages → Custom domains → Add → edustrader.com
