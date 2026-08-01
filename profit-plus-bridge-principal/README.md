# Profit Plus Bridge — Tienda Principal

API REST liviana (Node.js + Express) que consulta la base SQL Server de Profit
Plus en la tienda **principal** y devuelve el catálogo completo (código,
descripción, categoría, stock, precio1, precio2) en JSON, listo para que el
backend en la nube lo sincronice. Proyecto standalone — no depende del backend
principal ni se despliega junto con él; corre localmente donde esté Profit
Plus (o en la misma red).

> Para la tienda **secundaria** (que solo necesita descripción y stock) usa
> el proyecto hermano `../profit-plus-bridge-secundaria` — es una API
> separada, con su propio `.env` y su propio puerto.

## 1. Verificar el esquema real antes de usarla

La consulta en `server.js` (`PRODUCTOS_QUERY`) está armada sobre la
convención estándar de Profit Plus (tablas `saArt`, `saInvent`,
`saGrupoArt`), pero **los nombres exactos de columnas varían entre
versiones**. Antes de correrla en serio, confirma el esquema real contra tu
base — conéctate con SQL Server Management Studio (o `sqlcmd`) y corre:

```sql
-- Lista las columnas reales de cada tabla
EXEC sp_columns saArt;
EXEC sp_columns saInvent;
EXEC sp_columns saGrupoArt;

-- O mira unas filas reales para reconocer los campos a simple vista
SELECT TOP 5 * FROM saArt;
SELECT TOP 5 * FROM saInvent;
```

Con eso, ajusta los nombres de columna dentro del string `PRODUCTOS_QUERY`
en `server.js` (está comentado campo por campo). Si tu instalación no tiene
tabla de grupos/categorías separada, quita el `LEFT JOIN saGrupoArt` y usa
directamente el código de grupo del artículo como `categoria`. Si no existe
una columna de "activo" (`Art_Activo`), quita esa condición del `WHERE`.

## 2. Instalar y configurar

Requiere [Node.js](https://nodejs.org) 18 o superior instalado en la máquina
donde vas a correr esto (idealmente la misma red que el SQL Server de Profit
Plus).

```bash
cd profit-plus-bridge-principal
npm install
cp .env.example .env
```

Edita `.env` con los datos reales de conexión (servidor, base, usuario,
contraseña) y genera un `API_KEY` largo y aleatorio, por ejemplo:

```bash
openssl rand -hex 32
```

## 3. Correrla

```bash
npm start
```

Deja el proceso corriendo y prueba el endpoint (reemplaza `TU_API_KEY`):

```bash
curl -H "Authorization: Bearer TU_API_KEY" http://localhost:4000/api/productos-sincronizacion
```

Respuesta esperada:

```json
{
  "total": 3,
  "productos": [
    { "codigo": "EP-LED-9W", "descripcion": "Bombillo LED 9W", "categoria": "Iluminación", "stock": 42, "precio1": 4.5, "precio2": 3.2 }
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
   nssm install ProfitPlusBridgePrincipal
   ```
3. En la ventana que abre:
   - **Path**: la ruta a `node.exe` (normalmente `C:\Program Files\nodejs\node.exe`)
   - **Startup directory**: la ruta a esta carpeta (`profit-plus-bridge-principal`)
   - **Arguments**: `server.js`
4. Instala el servicio y arráncalo:
   ```
   nssm start ProfitPlusBridgePrincipal
   ```

Alternativa más simple si no quieres instalar nada adicional: crear una
tarea programada en el **Programador de tareas de Windows** que ejecute
`node server.js` desde esta carpeta "al iniciar sesión" o "al iniciar el
sistema".

## 5. Exponerla a internet (para que el backend en la nube la alcance)

Esta API corre en la red local de la tienda, sin IP pública por defecto. El
backend en la nube (Cloud Run) necesita poder alcanzarla vía
`PROFIT_PLUS_API_URL` — para eso tienes dos caminos típicos:

- **Túnel** (más rápido de poner a andar): [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) (gratis, y ya tienes el dominio en Cloudflare) o [ngrok](https://ngrok.com/). Te da una URL pública fija que reenvía al puerto 4000 local, sin abrir puertos en el router.
- **Port forwarding** en el router del local + IP fija/DDNS — más manual y menos seguro si no le sumas HTTPS.

Cualquiera de los dos, la URL resultante es lo que va en `PROFIT_PLUS_API_URL`
del backend principal, con el mismo `API_KEY` que configuraste aquí en
`PROFIT_PLUS_API_KEY`.

## Endpoints

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/productos-sincronizacion` | `Authorization: Bearer <API_KEY>` | Catálogo completo: código, descripción, categoría, stock, precio1, precio2 |
| `GET` | `/health` | ninguna | Confirma que el proceso está vivo (no expone datos) |
