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

Requiere [Node.js](https://nodejs.org) 18 o superior instalado en la máquina
donde vas a correr esto (idealmente la misma red que el SQL Server de la
tienda secundaria).

```bash
cd profit-plus-bridge-secundaria
npm install
cp .env.example .env
```

Edita `.env` con los datos reales de conexión (servidor, base, usuario,
contraseña) y genera un `API_KEY` largo y aleatorio, **distinto** al que
uses en el bridge de la tienda principal:

```bash
openssl rand -hex 32
```

## 3. Correrla

```bash
npm start
```

Deja el proceso corriendo y prueba el endpoint (reemplaza `TU_API_KEY`):

```bash
curl -H "Authorization: Bearer TU_API_KEY" http://localhost:4001/api/productos-sincronizacion
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
`500` con un mensaje descriptivo (`error` + `detalle`) en vez de tumbar el
proceso — puedes seguir pegándole al `/health` para confirmar que el
servidor Node sigue vivo mientras arreglas la conexión.

## 4. Dejarla corriendo como servicio (Windows)

La forma más simple y robusta de que esto sobreviva un reinicio de la PC sin
que alguien tenga que abrir una terminal manualmente es
[NSSM](https://nssm.cc/) (Non-Sucking Service Manager), gratuito:

1. Descarga NSSM y descomprímelo en cualquier carpeta.
2. Abre una terminal como Administrador en esa carpeta y corre:
   ```
   nssm install ProfitPlusBridgeSecundaria
   ```
3. En la ventana que abre:
   - **Path**: la ruta a `node.exe` (normalmente `C:\Program Files\nodejs\node.exe`)
   - **Startup directory**: la ruta a esta carpeta (`profit-plus-bridge-secundaria`)
   - **Arguments**: `server.js`
4. Instala el servicio y arráncalo:
   ```
   nssm start ProfitPlusBridgeSecundaria
   ```

Alternativa más simple si no quieres instalar nada adicional: crear una
tarea programada en el **Programador de tareas de Windows** que ejecute
`node server.js` desde esta carpeta "al iniciar sesión" o "al iniciar el
sistema".

## 5. Exponerla a internet (para que el backend en la nube la alcance)

Esta API corre en la red local de la tienda secundaria, sin IP pública por
defecto. El backend en la nube necesita poder alcanzarla vía
`SECOND_STORE_PROFIT_API_URL` — para eso tienes dos caminos típicos:

- **Túnel** (más rápido de poner a andar): [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) (gratis) o [ngrok](https://ngrok.com/). Te da una URL pública fija que reenvía al puerto 4001 local, sin abrir puertos en el router.
- **Port forwarding** en el router del local + IP fija/DDNS — más manual y menos seguro si no le sumas HTTPS.

La URL resultante va en `SECOND_STORE_PROFIT_API_URL` del backend en la
nube, con el mismo `API_KEY` que configuraste aquí en `SECOND_STORE_PROFIT_API_KEY`.

## Endpoints

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/productos-sincronizacion` | `Authorization: Bearer <API_KEY>` | Catálogo completo: código, descripción, precio1, precio2, stock |
| `GET` | `/health` | ninguna | Confirma que el proceso está vivo (no expone datos) |
