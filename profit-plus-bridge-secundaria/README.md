# Profit Plus Bridge — Tienda Secundaria

API REST liviana (Node.js + Express) que consulta la base SQL Server de
Profit Plus en la tienda **secundaria** y devuelve, en JSON, el catálogo
completo (código, descripción, precio1, precio2, stock) — mismo contrato de
campos que el bridge de la tienda principal (`../profit-plus-bridge-principal`),
pero contra un SQL Server físicamente distinto, con nombres de columna
distintos. Proyecto standalone, independiente del backend principal y del
otro bridge.

## 1. Esquema — ya verificado contra el servidor real

A diferencia del bridge principal (que sigue con una consulta aproximada
pendiente de verificar), la consulta de `server.js` **ya se corrió contra el
SQL Server real de esta tienda y respondió correctamente**. Columnas
confirmadas:

| Tabla | Columna | Significado |
|---|---|---|
| `art` | `ref` | Código del artículo |
| `art` | `art_des` | Descripción |
| `art` | `prec_vta1` | Precio 1 (detal) |
| `art` | `prec_vta2` | Precio 2 (mayor) |
| `art` | `co_art` | Clave del artículo (usada para el JOIN) |
| `st_almac` | `stock_act` | Existencia |
| `st_almac` | `co_art` | Clave del artículo (usada para el JOIN) |

⚠️ La consulta se validó contra la base `PRUE24` — si ese es un ambiente de
prueba, confirma que `DB_DATABASE` en producción apunte a la base real antes
de dejarlo corriendo en serio.

Si Profit Plus maneja varios almacenes y quieres filtrar por uno específico
(como ya hace el bridge principal vía `WAREHOUSE_CODE`), identifica primero
el nombre de la columna de código de almacén en `st_almac` — no se incluyó
en la consulta validada, así que no se puede armar ese filtro todavía sin
confirmar ese nombre.

## 2. Instalar y configurar

Requiere [Node.js](https://nodejs.org) 18.19 o superior (la versión LTS
actual sirve) en la máquina donde vas a correr esto, idealmente la misma del
SQL Server de la tienda secundaria.

```bash
cd profit-plus-bridge-secundaria
npm ci
cp .env.example .env
```

Edita `.env` con los datos reales de conexión (servidor, base, usuario de
solo lectura, contraseña) y genera la `API_KEY`, **distinta** a la del
bridge de la tienda principal. El bridge no arranca con la clave de ejemplo
ni con una de menos de 32 caracteres:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

El bridge escucha solo en `127.0.0.1` (variable `HOST`): el túnel del paso 5
entra por ahí y ningún otro equipo de la red de la tienda necesita llegar a
él.

## 3. Correrla

```bash
npm start
```

Deja el proceso corriendo y prueba el endpoint (reemplaza `TU_API_KEY`):

```bash
curl -H "Authorization: Bearer TU_API_KEY" http://127.0.0.1:4001/api/productos-sincronizacion
```

Respuesta esperada:

```json
{
  "total": 2,
  "productos": [
    { "codigo": "EP-LED-9W", "descripcion": "Bombillo LED 9W", "precio1": 4.5, "precio2": 3.2, "stock": 42 },
    { "codigo": "EP-CBL-12AWG", "descripcion": "Cable THHN 12 AWG", "precio1": 68, "precio2": 55, "stock": 12 }
  ]
}
```

Si SQL Server no responde o las credenciales fallan, el endpoint responde
`503` (fallo de conexión, que suele pasar solo) o `500` con el tipo de fallo
y un id, sin tumbar el proceso:

```json
{ "error": "No se pudo consultar Profit Plus.", "motivo": "login", "id": "0d8efcc7" }
```

El mensaje completo de SQL Server, con qué revisar, queda en el registro
del bridge en la línea con ese id; a la respuesta no va, porque nombra el
equipo, la instancia, la base y el usuario. `/health` sigue respondiendo
mientras arreglas la conexión.

## 4. Dejarla corriendo como servicio (Windows)

La forma más simple y robusta de que esto sobreviva un reinicio de la PC sin
que alguien tenga que abrir una terminal manualmente es
[NSSM](https://nssm.cc/) (Non-Sucking Service Manager), gratuito. En una
terminal como Administrador (ajusta las rutas):

```powershell
nssm install ProfitPlusBridgeSecundaria "C:\Program Files\nodejs\node.exe" server.js
nssm set ProfitPlusBridgeSecundaria AppDirectory C:\ruta\a\profit-plus-bridge-secundaria
nssm set ProfitPlusBridgeSecundaria AppStdout C:\ruta\a\logs\bridge-secundaria.log
nssm set ProfitPlusBridgeSecundaria AppStderr C:\ruta\a\logs\bridge-secundaria.log
nssm set ProfitPlusBridgeSecundaria AppRotateFiles 1
nssm set ProfitPlusBridgeSecundaria AppRotateOnline 1
nssm set ProfitPlusBridgeSecundaria AppRotateBytes 1048576
nssm set ProfitPlusBridgeSecundaria Start SERVICE_AUTO_START
nssm start ProfitPlusBridgeSecundaria
```

`AppDirectory` es lo importante: el bridge lee el `.env` de esa carpeta.

## 5. Exponerla a internet (para que el backend en la nube la alcance)

Esta API corre en la PC de la tienda, sin IP pública. El backend en la nube
la alcanza por un [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/):
`cloudflared` corre como servicio, abre el túnel hacia afuera (el router no
abre ningún puerto) y publica `https://profit-secundaria.electronplus.com.ve`
apuntando a `http://127.0.0.1:4001`.

Esa URL va en `SECOND_STORE_PROFIT_API_URL` del backend, y la misma
`API_KEY` de aquí en el secreto `second-store-profit-api-key`
(`SECOND_STORE_PROFIT_API_KEY`). No uses port forwarding: expondría el
bridge sin HTTPS.

## 6. Actualizar una instalación que ya corre

La versión endurecida (octubre 2026) cambia tres cosas que pueden impedir
que arranque o que el túnel la alcance. Revísalas antes de reemplazar
nada; la sincronización corre cada 30 minutos, así que hazlo justo después
de una (en punto o y media).

1. **¿Dónde está la carpeta?** En PowerShell como administrador:
   `nssm get ProfitPlusBridgeSecundaria AppDirectory`.
2. **¿cloudflared corre en esta misma PC?** En Cloudflare → Zero Trust →
   Networks → Tunnels → el túnel de la secundaria → *Public hostname*
   `profit-secundaria`: si el *Service* es `localhost:4001` o
   `127.0.0.1:4001`, no hay nada que hacer (mejor `127.0.0.1:4001`). Si es
   una IP de la red (`192.168.x.x:4001`), cloudflared está en otra PC: o lo
   instalas en esta y cambias el *Service* a `127.0.0.1:4001`, o pones
   `HOST=0.0.0.0` en el `.env` (el bridge queda expuesto a la red de la
   tienda, como hasta ahora).
3. **¿La `API_KEY` tiene al menos 32 caracteres?** Si es más corta, genera
   otra (paso 2), ponla en el `.env` y como versión nueva del secreto
   `second-store-profit-api-key` en Google Cloud; la API debe reiniciarse
   para tomarla.

Después:

```powershell
# Respaldo de la carpeta actual (incluye el .env)
Copy-Item -Recurse C:\ruta\a\profit-plus-bridge-secundaria C:\ruta\a\profit-plus-bridge-secundaria-respaldo
nssm stop ProfitPlusBridgeSecundaria
# Copia los archivos nuevos encima (server.js, db-config.js, package.json,
# package-lock.json, .env.example, README.md) — el .env se queda como está.
cd C:\ruta\a\profit-plus-bridge-secundaria
npm ci
nssm start ProfitPlusBridgeSecundaria
curl.exe http://127.0.0.1:4001/health
```

Comprueba con la clave que el catálogo sale completo (`total` cerca de
5 400) y luego, en el panel de la web, *Tienda secundaria → Sincronizar*.

Si algo falla, vuelve atrás: `nssm stop ProfitPlusBridgeSecundaria`, borra
la carpeta, renombra el respaldo a su nombre original y
`nssm start ProfitPlusBridgeSecundaria`.

## Endpoints

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/productos-sincronizacion` | `Authorization: Bearer <API_KEY>` | Catálogo completo: código, descripción, precio1, precio2, stock |
| `GET` | `/health` | ninguna | Confirma que el proceso está vivo (no expone datos ni toca SQL Server) |

Las respuestas llevan `Cache-Control: no-store` y el catálogo va comprimido
con gzip cuando el cliente lo acepta (el backend sí).
