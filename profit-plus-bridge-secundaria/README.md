# Profit Plus Bridge — Tienda Secundaria

API REST liviana (Node.js + Express) que consulta la base SQL Server de
Profit Plus en la tienda **secundaria** y devuelve, en JSON, únicamente
**descripción y stock** de cada producto — es lo único que esta tienda
sincroniza. Proyecto standalone, independiente del backend principal y del
bridge de la tienda principal (`../profit-plus-bridge-principal`, que expone
el catálogo completo con código/categoría/precios).

## 1. Verificar el esquema real antes de usarla

La consulta en `server.js` (`PRODUCTOS_QUERY`) está armada sobre la
convención estándar de Profit Plus (tablas `saArt`, `saInvent`), pero **los
nombres exactos de columnas varían entre versiones**. Antes de correrla en
serio, confirma el esquema real contra tu base — conéctate con SQL Server
Management Studio (o `sqlcmd`) y corre:

```sql
-- Lista las columnas reales de cada tabla
EXEC sp_columns saArt;
EXEC sp_columns saInvent;

-- O mira unas filas reales para reconocer los campos a simple vista
SELECT TOP 5 * FROM saArt;
SELECT TOP 5 * FROM saInvent;
```

Con eso, ajusta los nombres de columna dentro del string `PRODUCTOS_QUERY`
en `server.js`. Si no existe una columna de "activo" (`Art_Activo`), quita
esa condición del `WHERE`.

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
    { "descripcion": "Bombillo LED 9W", "stock": 42 },
    { "descripcion": "Cable THHN 12 AWG", "stock": 12 }
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
defecto. El backend en la nube necesita poder alcanzarla — para eso tienes
dos caminos típicos:

- **Túnel** (más rápido de poner a andar): [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) (gratis) o [ngrok](https://ngrok.com/). Te da una URL pública fija que reenvía al puerto 4001 local, sin abrir puertos en el router.
- **Port forwarding** en el router del local + IP fija/DDNS — más manual y menos seguro si no le sumas HTTPS.

## Endpoints

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/productos-sincronizacion` | `Authorization: Bearer <API_KEY>` | Solo descripción y stock por producto |
| `GET` | `/health` | ninguna | Confirma que el proceso está vivo (no expone datos) |
