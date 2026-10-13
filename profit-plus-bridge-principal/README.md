# Profit Plus Bridge — Tienda Principal

API REST liviana (Node.js + Express) que consulta la base SQL Server de Profit
Plus en la tienda **principal** y devuelve el catálogo completo (código,
descripción, categoría, stock, precio1, precio2) en JSON, listo para que el
backend en la nube lo sincronice. Proyecto standalone — no depende del backend
principal ni se despliega junto con él; corre localmente donde esté Profit
Plus (o en la misma red).

> La tienda **secundaria** tiene su propio bridge hermano en
> `../profit-plus-bridge-secundaria` — es una API separada, contra un SQL
> Server físicamente distinto, con su propio `.env` y su propio puerto.
> Mismo contrato de campos que este, esquema de columnas distinto.

## 1. Verificar el esquema real antes de usarla

La consulta en `server.js` (`PRODUCTOS_QUERY`) es **aproximada**: los
nombres de tablas y columnas de Profit Plus cambian entre versiones, y la
del bridge secundario resultó ser otra completamente distinta. Antes de
usarla en serio hay que escribirla contra el esquema real.

Con el `.env` ya configurado (paso 2), corre el diagnóstico — es de solo
lectura y solo mira el catálogo (artículos, existencias, almacenes,
precios, líneas, monedas):

```bash
npm run diagnostico
```

Prueba la conexión con los mismos datos que usará el servidor y guarda en
`diagnostico-profit.txt` las tablas, sus columnas y unas filas de ejemplo.
Ese archivo es lo que hace falta para reescribir `PRODUCTOS_QUERY`. Si la
conexión falla, el mensaje dice qué revisar.

Usa un usuario de SQL Server **de solo lectura** (rol `db_datareader` sobre
la base de Profit Plus), nunca `sa`: el bridge nunca escribe.

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
    { "codigo": "EP-LED-9W", "descripcion": "Bombillo LED 9W", "categoria": "Iluminación", "stock": 42, "precio1": 4.5, "precio2": 3.2 }
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

Esta API corre en la PC de la tienda, sin IP pública. El backend en la nube
(Cloud Run) la alcanza por un [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/),
igual que el bridge secundario: `cloudflared` corre como servicio en esta PC,
abre el túnel hacia afuera (el router no abre ningún puerto) y publica
`https://profit-principal.electronplus.com.ve` apuntando a
`http://127.0.0.1:4000`.

Esa URL va en `PROFIT_PLUS_API_URL` del backend principal, y la misma
`API_KEY` de aquí en el secreto `profit-plus-api-key` (`PROFIT_PLUS_API_KEY`).
No uses port forwarding: expondría el bridge sin HTTPS.

## Endpoints

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/productos-sincronizacion` | `Authorization: Bearer <API_KEY>` | Catálogo completo: código, descripción, categoría, stock, precio1, precio2 |
| `GET` | `/health` | ninguna | Confirma que el proceso está vivo (no expone datos ni toca SQL Server) |

Las respuestas llevan `Cache-Control: no-store` y el catálogo va comprimido
con gzip cuando el cliente lo acepta (el backend sí).
