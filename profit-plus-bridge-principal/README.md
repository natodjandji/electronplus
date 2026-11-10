# Profit Plus Bridge — Tienda Principal

API REST liviana (Node.js + Express) que consulta la base SQL Server de Profit
Plus en la tienda **principal** y devuelve el catálogo completo (código,
descripción, categoría, marca, stock, precio1, precio2 y costos) en JSON, listo
para que el backend en la nube lo sincronice. Proyecto standalone — no depende del backend
principal ni se despliega junto con él; corre localmente donde esté Profit
Plus (o en la misma red).

> La tienda **secundaria** tiene su propio bridge hermano en
> `../profit-plus-bridge-secundaria` — es una API separada, contra un SQL
> Server físicamente distinto, con su propio `.env` y su propio puerto.
> Mismo contrato de campos que este, esquema de columnas distinto.

## 1. El esquema de Profit Plus

> **La base de la tienda es `PRUEB26`**, aunque el nombre diga "prueba": ahí
> trabaja la tienda y de ahí lee el bridge (`DB_DATABASE=PRUEB26` en el
> `.env`). `ELECT26` tiene los mismos artículos, pero incompletos: al
> compararlas el 2026-11-10, 37 no tenían precio detal ni costo y 8 no tenían
> SKU. Si el bridge leyera `ELECT26`, esos productos saldrían en la web a $0.
> No cambies `DB_DATABASE` sin comparar antes las dos bases.

La consulta en `server.js` (`PRODUCTOS_QUERY`) está escrita con el esquema
real de Profit Plus (verificado en la base `ELECT26` el 2026-10-15; `PRUEB26`
tiene las mismas tablas y columnas): las
tablas `art` (artículos y precios), `st_almac` (existencia por almacén),
`lin_art` (líneas) y `cat_art` (marcas). La web usa como **código de barra**
la **referencia** del artículo (`ref`, o el código interno si está vacía),
como **SKU** el campo **Modelo**, y lo reconoce por su código interno
(`co_art`), que es único. La columna del Modelo no se supone: al arrancar,
el bridge la busca entre las columnas de `art` (`modelo`, o la que contenga
"model") y el registro dice cuál usó (`INFO SKU desde art.modelo`). Si no
encuentra ninguna, el catálogo sale igual, sin SKU, y el registro lista las
columnas de `art` (`WARN No hay campo Modelo en art; columnas: …`). La web
también lo anota en su registro en cada cambio. Los nombres cambian entre
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

### El costo de cada producto

Profit Plus guarda el costo de un artículo en varias columnas de `art`: el
**último costo** (el de la última compra o entrada) y el **costo promedio**,
cada uno en la moneda de la empresa y en la "otra moneda". Cómo se llaman
cambia entre versiones, así que el bridge (desde la 1.3.0) no elige una: al
arrancar busca en `art` las columnas numéricas con "cos" en el nombre
(`ult_cos_un`, `cos_pro_un`, `ult_cos_om`…) o llamadas `ULOM`, y manda todas,
con su nombre, en `costos`. El registro dice cuáles encontró (`INFO Costos
desde art.ult_cos_un, art.cos_pro_un, …`) o, si no hay ninguna, lista las
columnas de `art`.

La web usa el **último costo en otra moneda** (`ult_cos_om`, el "ULOM" de
Profit): en esa moneda, dólares, carga la tienda sus costos. Las demás
columnas no se usan. Un artículo con ese costo en 0 queda sin costo en la
web. Como el bridge manda todas, si algún día hay que usar otra columna, se
cambia en la web sin volver a actualizar el bridge en esta PC.

El costo nunca sale en la tienda: solo lo ve el administrador, y sirve para el
margen de cada venta, el valor del inventario y las órdenes de compra.

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
  "columnaSku": "modelo",
  "columnasCosto": ["ult_cos_un", "cos_pro_un", "ult_cos_om", "cos_pro_om"],
  "productos": [
    { "codigo": "LAM001001", "referencia": "91248923474", "modelo": "LP609", "descripcion": "Bombillo LED 9W", "categoriaCodigo": "07", "categoria": "Iluminación", "marcaCodigo": "01", "marca": "Lucerna", "stock": 42, "precio1": 4.5, "precio2": 3.2, "costos": { "ult_cos_un": 2.1, "cos_pro_un": 2.05, "ult_cos_om": 0, "cos_pro_om": 0 } }
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

### Actualizar el bridge en la PC

1. Copia a la carpeta del bridge en la PC `server.js`, `columna-sku.js`,
   `columnas-costo.js`, `db-config.js`, `verificar.js`, `verificacion.js` y
   `package.json`, sin tocar el `.env` ni `node_modules` (las dependencias no
   cambiaron en la 1.3.0: no hace falta `npm install`).
2. Reinicia la tarea, en PowerShell como administrador:

   ```powershell
   Stop-ScheduledTask -TaskName "ElectronPlus Bridge Principal"
   Get-NetTCPConnection -LocalPort 4000 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
   Start-ScheduledTask -TaskName "ElectronPlus Bridge Principal"
   ```

3. En la carpeta del bridge, corre `npm run verificar` (ver abajo).
4. Revisa el registro: en la primera consulta del catálogo después de
   reiniciar (la de `npm run verificar` o la próxima sincronización) dice
   `SKU desde art.<columna> (campo Modelo)` y `Costos desde art.<columnas>`.

### Verificar los datos

```bash
npm run verificar
```

Con el bridge corriendo, lee los artículos directo de las tablas de Profit
(`art`, `lin_art`, `cat_art`, `st_almac`) y los compara, campo por campo
(código de barra, SKU, nombre, categoría, marca, stock, precio detal y
mayor), con lo que entrega el bridge y con lo que publica la web. Los costos
se comparan solo con el bridge: la tienda en línea no los publica. Solo lee:
no cambia nada en Profit ni en la web. El informe sale en pantalla y queda
en `verificacion-profit.txt`:

- cuántos artículos tienen el SKU (campo Modelo) lleno, y una muestra;
- qué columnas de costo hay, cuántos artículos tienen cada una llena, una
  muestra de los que tienen costo y los artículos cuyo costo es mayor que su
  precio detal (casi siempre, un costo en otra moneda);
- los códigos de barra o SKU repetidos en Profit, que conviene corregir allá;
- si el bridge que corre es anterior a la 1.2.0 (no manda el SKU) o a la
  1.3.0 (no manda los costos);
- los artículos que faltan en el bridge o que difieren, con el valor de
  cada lado;
- los que difieren en la web y los que no están publicados (ocultos en el
  panel o todavía sin sincronizar). En la web el stock puede ser mayor que
  el de Profit: suma las unidades de la tienda secundaria enlazadas al
  producto. Menor es una diferencia.

La web se sincroniza cada 15 minutos: un cambio reciente en Profit aparece
como diferencia en la web hasta la próxima sincronización. Termina con
código 1 si encontró diferencias.

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
| `GET` | `/api/productos-sincronizacion` | `Authorization: Bearer <API_KEY>` | Catálogo completo: código, referencia, modelo (SKU), descripción, código y nombre de la categoría, marca, stock, precio1, precio2 y costos |
| `GET` | `/health` | ninguna | Confirma que el proceso está vivo (no expone datos ni toca SQL Server) |

Las respuestas llevan `Cache-Control: no-store` y el catálogo va comprimido
con gzip cuando el cliente lo acepta (el backend sí).
