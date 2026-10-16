# Profit Plus Bridge — Tienda Principal

API REST liviana (Node.js + Express) que consulta la base SQL Server de Profit
Plus en la tienda **principal** y devuelve el catálogo completo (código,
descripción, categoría, marca, stock, precio1, precio2) en JSON, listo para que el
backend en la nube lo sincronice. Proyecto standalone — no depende del backend
principal ni se despliega junto con él; corre localmente donde esté Profit
Plus (o en la misma red).

> La tienda **secundaria** tiene su propio bridge hermano en
> `../profit-plus-bridge-secundaria` — es una API separada, contra un SQL
> Server físicamente distinto, con su propio `.env` y su propio puerto.
> Mismo contrato de campos que este, esquema de columnas distinto.

## 1. El esquema de Profit Plus

La consulta en `server.js` (`PRODUCTOS_QUERY`) está escrita con el esquema
real de la base de la tienda (`ELECT26`, verificado el 2026-10-15): las
tablas `art` (artículos y precios), `st_almac` (existencia por almacén),
`lin_art` (líneas) y `cat_art` (marcas). La web muestra como código del
producto la **referencia** del artículo (`ref`, o el código interno si está
vacía) y lo reconoce por su código interno (`co_art`), que es único. Los nombres cambian entre
versiones de Profit Plus: si algún día se actualiza Profit, o la consulta
falla con "nombre de columna no válido", vuelve a verificarlos.

Con el `.env` ya configurado (paso 2), corre el diagnóstico — es de solo
lectura y solo mira el catálogo (artículos, existencias, almacenes,
precios, líneas, monedas):

```bash
npm run diagnostico
```

Prueba la conexión con los mismos datos que usará el servidor y guarda en
`diagnostico-profit.txt` las tablas, sus columnas y unas filas de ejemplo.
Con ese archivo se escribe o corrige `PRODUCTOS_QUERY`. Si la conexión
falla, el mensaje dice qué revisar.

Usa un usuario de SQL Server **de solo lectura** (rol `db_datareader` sobre
la base de Profit Plus), nunca `sa`: el bridge nunca escribe.

### La categoría de cada producto

Profit Plus clasifica cada artículo de varias formas (línea, sublínea,
categoría); el diagnóstico muestra en "Clasificaciones usadas por los
artículos" cuál llena la tienda y con cuántos valores. La consulta toma esa
clasificación y devuelve su código (`categoriaCodigo`) y su descripción
(`categoria`). En la web, el código es la identidad de la categoría: si en
Profit le cambian el nombre, la categoría sigue siendo la misma, con el
nombre nuevo, y sus productos se actualizan en la siguiente sincronización.
Un artículo sin clasificación queda en "Sin categoría".

La tienda principal agrupa por **línea** (esa es la categoría en la web) y
usa la **categoría** de Profit, renombrada, para guardar la **marca** del
producto. La consulta devuelve su código (`marcaCodigo`) y su descripción
(`marca`), null si el artículo no tiene. En la web:

- la marca se muestra en el producto, la búsqueda la encuentra y el filtro
  "Marca" aparece cuando hay dos o más;
- cada marca es también un **proveedor**: la sincronización asigna sus
  productos al proveedor de la marca (lo crea con solo el nombre la primera
  vez, o adopta uno que ya se llame igual). Lo enlaza el código de la marca,
  así que al proveedor se le puede cambiar el nombre en la web sin perder el
  enlace.

## 2. Instalar y configurar

Requiere [Node.js](https://nodejs.org) 18.19 o superior (la versión LTS
actual sirve) en la máquina donde vas a correr esto, idealmente la misma del
SQL Server de Profit Plus.

```bash
cd profit-plus-bridge-principal
npm ci
cp .env.example .env
```

Edita `.env` con los datos reales de conexión (servidor, base, usuario,
contraseña) y genera la `API_KEY`. El bridge no arranca con la clave de
ejemplo ni con una de menos de 32 caracteres:

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
curl -H "Authorization: Bearer TU_API_KEY" http://127.0.0.1:4000/api/productos-sincronizacion
```

Respuesta esperada:

```json
{
  "total": 3,
  "productos": [
    { "codigo": "LAM001001", "referencia": "91248923474", "descripcion": "Bombillo LED 9W", "categoriaCodigo": "07", "categoria": "Iluminación", "marcaCodigo": "01", "marca": "Lucerna", "stock": 42, "precio1": 4.5, "precio2": 3.2 }
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

## 4. Dejarla corriendo sola (Windows)

En la tienda corre como **tarea programada** de Windows, no con NSSM (su
sitio no estaba disponible al instalar la tienda secundaria):

- Tarea `ElectronPlus Bridge Principal`: corre como SYSTEM al iniciar el
  equipo, sin límite de tiempo, y si el proceso termina la reintenta cada
  minuto (hasta 999 veces).
- Acción: `cmd /c "node.exe" server.js >> C:\electronplus\logs\bridge-principal.log 2>&1`,
  con esta carpeta como directorio de trabajo (de ahí lee el `.env`).
- Reiniciarla: `Stop-ScheduledTask`, cerrar el `node` que quede en el
  puerto 4000 y `Start-ScheduledTask`. Detener la tarea puede dejar vivo al
  proceso hijo.
- El registro es UTF-8: léelo con `Get-Content -Encoding UTF8`.

## 5. Exponerla a internet (para que el backend en la nube la alcance)

Esta API corre en la PC de la tienda, sin IP pública. El backend en la nube
(Cloud Run) la alcanza por un [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/):
`cloudflared` corre como servicio en esta PC, abre el túnel hacia afuera (el
router no abre ningún puerto) y publica
`https://profit-principal.electronplus.com.ve` apuntando a
`http://127.0.0.1:4000`.

El túnel (`profit-plus-principal`) se administra desde el panel de
Cloudflare (Zero Trust → Tunnels): ahí está su nombre público y a dónde
apunta. En la PC solo está el servicio `cloudflared`, instalado con el token
del túnel. Ese token es una credencial: no se comparte ni se guarda en
archivos.

El servicio arranca en modo retrasado y con reintentos (`sc config
cloudflared start= delayed-auto`, `sc failureflag cloudflared 1`): al
encender la PC, Windows le da 45 segundos para arrancar y, con el equipo
ocupado, en la secundaria no le alcanzaron. Además, la tarea
`ElectronPlus Vigilante Tunel` lo arranca si lo encuentra detenido (3
minutos después de encender y luego cada 5 minutos).

Esa URL va en `PROFIT_PLUS_API_URL` del backend principal, y la misma
`API_KEY` de aquí en el secreto `profit-plus-api-key` (`PROFIT_PLUS_API_KEY`).
No uses port forwarding: expondría el bridge sin HTTPS.

## Endpoints

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/productos-sincronizacion` | `Authorization: Bearer <API_KEY>` | Catálogo completo: código, descripción, código y nombre de la categoría, marca, stock, precio1, precio2 |
| `GET` | `/health` | ninguna | Confirma que el proceso está vivo (no expone datos ni toca SQL Server) |

Las respuestas llevan `Cache-Control: no-store` y el catálogo va comprimido
con gzip cuando el cliente lo acepta (el backend sí).
