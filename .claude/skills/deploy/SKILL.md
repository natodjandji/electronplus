---
name: deploy
description: Deploy de Electron Plus a producción — la API a Cloud Run, la tienda a Firebase Hosting, y las reglas e índices de Firestore/Storage. Úsalo cuando pidan hacer deploy, publicar, desplegar o "subir a producción" cualquier parte de la app.
---

# Deploy de Electron Plus

Todo pasa por `scripts/deploy.sh`, que inicia sesión con la cuenta de servicio
de deploy y corre la herramienta que toca. Producción la usan clientes reales:
**confirma con el usuario qué parte se despliega antes de correrlo**, salvo que
ya lo haya dicho en esta conversación.

| Comando | Despliega | Tarda |
|---|---|---|
| `scripts/deploy.sh check` | nada — inicia sesión y muestra la URL y revisión de la API, y los sitios de Hosting | segundos |
| `scripts/deploy.sh api` | la API (`electronplus-api`, Cloud Run, us-central1), construida desde el Dockerfile por Cloud Build | 3–6 min |
| `scripts/deploy.sh web` | la tienda (`frontend/`, Firebase Hosting) | 2–4 min |
| `scripts/deploy.sh rules` | `firestore.rules`, `firestore.indexes.json`, `storage.rules` | ~1 min |

## Antes del deploy

1. Despliega lo que está en la rama que pidió el usuario, con commit y push —
   nunca cambios sin commit.
2. Corre los chequeos de la parte que se despliega y detente si alguno falla:
   - API: `npx jest`, `npx tsc --noEmit -p tsconfig.json`, `npx eslint "src/**/*.ts"`
   - Tienda: `cd frontend && npx vitest run && npx tsc --noEmit && npx eslint .`
3. Si un cambio toca las dos, despliega primero la API: la tienda puede llamar
   endpoints que la API vieja no tiene.

## Requisitos

- `GCP_SA_KEY_BASE64` en el entorno: la clave JSON de la cuenta de servicio de
  deploy, en base64 en una sola línea. Sin ella el script se detiene y lo dice;
  dile al usuario que va en la configuración del entorno cloud (nunca le pidas
  pegar una clave en el chat).
- Para `web`: los valores `VITE_*` de producción (la lista está en `WEB_VARS`
  dentro del script), desde el entorno o `frontend/.env.production`. El script
  no construye sin ellos: el build saldría bien igual, pero con una tienda que
  apunta a localhost.
- La configuración de la API en producción (variables, secretos, cuenta de
  servicio) vive en el servicio de Cloud Run. `deploy.sh api` la deja como
  está; cámbiala solo si el usuario lo pide, con `gcloud run services update`.

## Después del deploy

- API: `curl -s -o /dev/null -w "%{http_code}" <url del servicio>/api/categories`
  debe responder 200, y `scripts/deploy.sh check` muestra la revisión nueva.
- Tienda: el sitio (`VITE_PUBLIC_SITE_URL`) carga y el catálogo muestra productos.
- Dile al usuario qué se desplegó (commit, revisión) y cómo quedó.

## Volver atrás

- API: manda el tráfico a la revisión anterior —
  `gcloud run revisions list --service electronplus-api --region us-central1`,
  luego
  `gcloud run services update-traffic electronplus-api --region us-central1 --to-revisions <revisión>=100`.
  Corre antes `scripts/deploy.sh check` para que gcloud tenga la sesión iniciada.
- Tienda: el historial de versiones de Hosting en la consola de Firebase tiene
  un botón Rollback para cada versión anterior; o despliega de nuevo el commit
  anterior.

## Límites de la sesión cloud

- `*.docker.pkg.dev` está bloqueado, así que las imágenes las construye Cloud
  Build (`--source .`) y nunca se suben desde aquí. `.gcloudignore` limita lo
  que se sube a lo que el Dockerfile necesita.
- El Admin SDK de Firestore usa gRPC, que el proxy de la sesión no transporta:
  los scripts que leen o escriben datos de producción (seeds, recálculos) no
  se pueden correr desde aquí.
