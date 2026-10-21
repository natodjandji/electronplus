---
name: deploy
description: Deploy de Electron Plus a producción — la API a Cloud Run, la tienda a Firebase Hosting, y las reglas e índices de Firestore/Storage. Úsalo cuando pidan hacer deploy, publicar, desplegar o "subir a producción" cualquier parte de la app.
---

# Deploy de Electron Plus

Los deploys corren en GitHub Actions, con el workflow **Deploy**
(`.github/workflows/deploy.yml`). Usa la clave de la cuenta de servicio
`github-action-1308971196@electronplus-ve.iam.gserviceaccount.com`, guardada en
GitHub como el secreto `FIREBASE_SERVICE_ACCOUNT_ELECTRONPLUS_VE`. La clave
nunca pasa por la sesión de Claude: tú lanzas el workflow y lees sus logs con
las herramientas de GitHub (`mcp__github__*`).

Producción la usan clientes reales: **confirma con el usuario qué parte se
despliega, y desde qué rama, antes de lanzarlo**, salvo que ya lo haya dicho
en esta conversación.

| `target` | Despliega | Tarda |
|---|---|---|
| `check` | nada — inicia sesión y muestra la URL y revisión de la API, y los sitios de Hosting | ~1 min |
| `api` | la API (`electronplus-api`, Cloud Run, us-central1), construida desde el Dockerfile por Cloud Build | 5–8 min |
| `web` | la tienda (`frontend/`, Firebase Hosting) | 3–5 min |
| `rules` | `firestore.rules`, `firestore.indexes.json`, `storage.rules` | ~1 min |

El workflow corre los chequeos de la parte que despliega (tipos, lint,
pruebas) y se detiene si alguno falla.

## Cómo desplegar

1. Lo que se despliega es lo que está en GitHub en la rama elegida: todo con
   commit y push. Por defecto `main`; otra rama solo si el usuario lo pide.
2. Lanza el workflow:
   `mcp__github__actions_run_trigger` con `method: run_workflow`,
   `owner: natodjandji`, `repo: electronplus`, `workflow_id: deploy.yml`,
   `ref: <rama>`, `inputs: { target: <check|api|web|rules> }`.
3. Busca la ejecución con `mcp__github__actions_list`
   (`method: list_workflow_runs`, `resource_id: deploy.yml`) y espera a que
   termine sin hacer polling seguido: una revisión cada pocos minutos basta.
4. Si falla, lee el log con `mcp__github__get_job_logs`
   (`run_id`, `failed_only: true`, `return_content: true`).
5. Si un cambio toca API y tienda, despliega primero `api` y después `web`:
   la tienda puede llamar endpoints que la API vieja no tiene.

## Después del deploy

- API: `curl -s -o /dev/null -w "%{http_code}" <url del servicio>/api/categories`
  debe responder 200. La URL y la revisión nueva salen en el log del paso
  Deploy, o lanzando `target: check`.
- Tienda: el sitio (`https://electronplus.com.ve`) carga y el catálogo muestra
  productos.
- Dile al usuario qué se desplegó (rama, commit, revisión) y cómo quedó, con
  el enlace a la ejecución en Actions.

## Configuración que el workflow necesita

- Secreto `FIREBASE_SERVICE_ACCOUNT_ELECTRONPLUS_VE`: la clave JSON de la
  cuenta de servicio. Sin él, el paso Deploy falla con "no deploy key".
- Variables de repositorio `VITE_*` (Settings → Secrets and variables →
  Actions → Variables) para `web`: la lista está en `WEB_VARS` de
  `scripts/deploy.sh`. Si falta alguna, el script no construye la tienda, en
  vez de publicar una que apunte a localhost.
- Roles de la cuenta de servicio: Hosting Admin y Cloud Run Viewer (de
  `firebase init hosting:github`), más Cloud Run Source Developer, Service
  Account User y Service Usage Consumer para `api`, y Firebase Rules Admin y
  Cloud Datastore Index Admin para `rules`. Un 403 en el log suele ser un rol
  que falta: dile al usuario cuál.
- La configuración de la API en producción (variables, secretos, cuenta de
  servicio) vive en el servicio de Cloud Run. `api` la deja como está.

## Volver atrás

- API: manda el tráfico a la revisión anterior desde la consola de Cloud Run
  (pestaña Revisiones → Administrar tráfico), o con
  `gcloud run services update-traffic electronplus-api --region us-central1 --to-revisions <revisión>=100`
  desde una máquina con acceso.
- Tienda: el historial de versiones de Hosting en la consola de Firebase tiene
  un botón Rollback para cada versión anterior; o lanza `web` sobre el commit
  anterior.

## Sin GitHub Actions

`scripts/deploy.sh check|api|web|rules` hace lo mismo desde cualquier shell
con la clave en `GCP_SA_KEY_JSON` o `GCP_SA_KEY_BASE64`. En una sesión cloud de
Claude: `*.docker.pkg.dev` está bloqueado (por eso la imagen la construye
Cloud Build) y el proxy no transporta gRPC, así que los scripts que tocan
datos de Firestore en producción no corren desde ahí.
