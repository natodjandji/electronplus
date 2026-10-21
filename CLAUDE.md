# Electron Plus

Tienda en línea + panel operativo de Electron Plus (Venezuela). Monorepo con tres
partes independientes:

| Carpeta | Qué es | Stack |
|---|---|---|
| `src/` | API backend | NestJS 11 + Firebase Admin (Firestore, Auth, Storage), desplegado en Cloud Run |
| `frontend/` | Tienda + paneles admin/vendedor | TanStack Start (SPA prerenderada) + React 19 + React Query + Tailwind/shadcn, en Firebase Hosting. Conectado a **Lovable** |
| `profit-plus-bridge-principal/`, `profit-plus-bridge-secundaria/` | APIs Express locales que leen el SQL Server de Profit Plus de cada tienda | Node + mssql, se despliegan aparte en cada tienda |

```
Navegador (SPA) ──Bearer token Firebase──► API Nest (/api) ──► Firestore / Storage
                                             ├─► PayPal, Cashea, Resend, Meta (WhatsApp/IG), Anthropic
                                             └─► Bridges Profit Plus ──► SQL Server de cada tienda
```

## Comandos

Backend (raíz):
- `npm run start:dev` — API en `http://localhost:3000/api` (Swagger en `/api/docs` fuera de producción)
- `npm test` — Jest (`*.spec.ts`; usa `src/test/fake-firestore.ts` en lugar de Firestore real)
- `npm run lint`, `npm run build`
- `npm run seed`, `npm run set-user-role` — scripts en `src/database/seeds/`

Frontend (`frontend/`):
- `npm run dev`, `npm run build` (+ `postbuild` → `scripts/finalize-hosting.mjs`), `npm test` (Vitest), `npm run lint`

## Reglas importantes

- **Lovable**: no reescribir historia publicada (sin force-push, rebase, amend ni squash de commits ya
  subidos). Ver `frontend/AGENTS.md`. Mantener la rama siempre funcionando.
- **Firestore está cerrado al cliente** (`firestore.rules` deniega todo). El frontend solo habla con la
  API; nunca acceder a Firestore desde el navegador. Storage: solo `products/**` es de lectura pública;
  `payment-proofs/**` se sirve por URL firmada desde el backend.
- **Dos ERPs distintos**: la tienda principal (`erp-sync`, colección `products`) y la secundaria
  (`second-store`, colección `secondStoreProducts`) son instalaciones de Profit Plus separadas, con
  bridges, config y lógica separados. No mezclarlas.
- **Lo que viene de Profit Plus no se edita en la web**: código, nombre, categoría, precios y stock de un
  producto con `erpExternalId` se rechazan en `ProductsService` (la próxima sincronización los pisaría).
- **Dinero**: usar `round2` y `TAX_RATE` (IVA 16 %) de `src/common/utils/money.ts`; el frontend tiene la
  misma lógica en `frontend/src/lib/money.ts` — mantenerlas iguales.
- **Fechas del negocio** en hora de Caracas: `src/common/utils/store-day.ts`.
- **Transacciones Firestore**: todas las lecturas antes de cualquier escritura (por eso existen pares como
  `getForUpdateMany` + `reserveStock`, `getStockForUpdateMany` + `applyStockDelta`).
- Integraciones opcionales (PayPal, Cashea, Resend, Meta, Anthropic, bridges): sin credenciales se
  desactivan sin romper nada. Esquema de variables: `src/config/env.validation.ts` (zod).
- Textos al usuario en español; comentarios de código en inglés, con doc comments que explican el *por qué*.

## Backend (`src/`)

### Infraestructura
- `main.ts` — helmet, compression, CORS por lista (`CORS_ORIGIN`), `ValidationPipe` con whitelist estricto,
  raw body para la firma de webhooks de Meta, `trust proxy` para el throttler (100 req/min por IP).
- `firebase/firestore.repository.ts` — wrapper tipado por colección (`findById`, `findByIds`, `create`,
  `createIfAbsent`, `patch`, `findAll`, `count`…). Rechaza ids con `/`.
- `firebase/firestore-collections.ts` — nombres de todas las colecciones.
- `firebase/collection-snapshot.ts` — copia de una colección entera empaquetada en pocos "shards"
  (`snapshots/{name}`) para que leer el catálogo cueste ~1 lectura. Toda escritura debe llamar a
  `apply()` después; se reconstruye semanalmente y se verifica el conteo a diario.
- Guards (`common/guards/`):
  - `FirebaseAuthGuard` — rol desde el custom claim; si falta, lee/crea `users/{uid}` (emite
    `user.created`) y rellena el claim. Tokens de staff: chequeo de revocación con caché de 60 s.
  - `OptionalFirebaseAuthGuard` (rutas públicas que varían si hay sesión), `RolesGuard` + `@Roles()`.
  - `SchedulerAuthGuard` — OIDC de Cloud Scheduler/Cloud Tasks para `/internal/*`.
- Roles (`common/enums/role.enum.ts`): `client`, `admin`, `warehouse_operator`, `seller`.
- Tareas periódicas: con `SCHEDULER_INVOKER_EMAIL` + `SCHEDULER_AUDIENCE`, Cloud Scheduler llama a
  `POST /api/internal/cron/{erp-sync,second-store-sync,daily}` y `main.ts` apaga los timers internos;
  sin ellas (local) corren los `@Cron`/`CronJob` en proceso.
- `common/http/fetch-bridge.ts` — GET a los bridges con reintento y timeout.
- `common/utils/removal-guard.ts` — impide que un sync retire >10 % del catálogo de golpe.

### Módulos (`src/modules/`)
| Módulo | Responsabilidad |
|---|---|
| `products` | Catálogo desde el snapshot en memoria (`/products/catalog`, `/products`, best-sellers), CRUD admin, categorías, reserva/ajuste de stock. Emite `stock.changed`. |
| `orders` | Checkout: reserva stock, descuento, envío, IVA, crea el pago; `compensate()` revierte si el pago falla. Estados `pending_payment_verification → paid → preparing → shipped \| ready_for_pickup → fulfilled` o `cancelled`. Máx. 5 pedidos sin pagar por cliente. Pedido desde cotización aprobada. |
| `payments` | Manuales (transferencia, pago móvil, Zelle, efectivo, otros) verificados por admin; PayPal (captura por API); Cashea (inicial, retorno, confirmación, cancelación); crédito B2B con `creditLimit`. |
| `erp-sync` | Sync de la tienda principal vía `ProfitPlusAdapter` (`ApiProfitPlusAdapter`): solo escribe lo que cambió, oculta productos retirados (`erpRemovedAt`), marcas → proveedores. `ErpExportService` reporta ventas pagadas con reintentos/backoff. |
| `second-store` | Sync de la tienda secundaria; emparejamiento por código/descripción (`second-store-matching.ts`); enlace manual a productos del catálogo. |
| `quotes` | Cotizaciones del cliente `draft → sent → approved/rejected`; descuento global o precio mayorista por el admin; PDF por token. |
| `sales-carts` | Carritos de vendedores en mostrador (`/vendedor`); lista detal/mayor; cotización compartida (`sharedQuotes`, 3 días, PDF + QR). No tocan stock (la factura se hace en Profit). |
| `messaging` | Asistente de ventas con Claude para WhatsApp/Instagram: webhook de Meta → mensajes guardados → respuesta con debounce de ~6 s (Cloud Tasks o en proceso) → `SalesAgentService` con herramientas (`agent/sales-tools.ts`). Se pausa si interviene un humano; handoff emite evento. Panel en `/admin/conversations`. |
| `inventory` | Alertas de stock bajo a partir de `stock.changed`. |
| `notifications` | Notificaciones admin en Firestore + WebSocket (namespace `/realtime`). |
| `email` | Resend + plantillas en `templates/`; sin API key solo hace log. |
| `finance`, `purchase-orders`, `expenses` | Proveedores, facturas por pagar y abonos, órdenes de compra (emitir, pagar, cancelar, ingreso de stock), gastos; vencimientos recalculados a diario. |
| `reports` | Resumen diario de ventas (`salesDailySummaries`), series, participación por categoría, rentabilidad. |
| Otros | `reviews` (reseñas vía QR, `/resena`), `qr` (etiquetas), `exchange-rate` (tasa BCV), `discount-codes`, `shipping-rates` (por estado/ciudad), `payment-methods`, `uploads` (sharp, miniaturas), `seo` (`/sitemap.xml`, fuera del prefijo `/api`), `client-errors`, `users`, `auth` (`POST /auth/session`). |

### Flujo de eventos
- `payment.verified` → `OrdersService.markPaid` → `order.paid` → export de la venta a Profit (`ErpSyncEventsListener`)
- `order.created` / `order.status_changed` → email y notificaciones; cancelado → cancelar en Cashea
- `stock.changed` → alertas de inventario → `stock.alert.raised` → notificación + email
- vencimientos de facturas/gastos, errores de sync, handoff de chat, reseñas → notificaciones/email

## Frontend (`frontend/src/`)

- Rutas por archivo en `routes/` (`routeTree.gen.ts` es generado, no editar). Ver `routes/README.md`.
  - Públicas: `/`, `/catalog`, `/collections`, `/product/$id`, `/product/qr/$id`, `/cart`, `/checkout`,
    `/quotes`, `/login`, `/register`, `/resena`, `/cotizacion/$token`, `/cashea/retorno/$orderId`
  - Cliente (`ClientGuard`): `/client/orders`
  - Vendedor: `/vendedor`, `/vendedor/carrito/$id` (escáner con zxing / BarcodeDetector)
  - Admin (`AdminGuard` en `admin.tsx`): inventario, stock, segunda tienda, pedidos, cotizaciones, ventas en
    tienda, compras, órdenes de compra, proveedores, gastos, usuarios, reseñas, conversaciones, etiquetas, ajustes
- `lib/api-client.ts` — `apiFetch` (token de Firebase, `VITE_API_BASE_URL`), `reportError`.
- `lib/electron-store.tsx` — contexto global: rol, carrito en localStorage reconciliado con el catálogo
  (`cart-reconcile.ts`), descuento. `lib/auth-context.tsx` — sesión Firebase (email + Google).
- `lib/use-realtime-ops-sync.ts` — socket.io para notificaciones y refresco de datos operativos.
- `lib/chat-bot.ts` — chat de la web **basado en reglas, sin LLM** (distinto del asistente de WhatsApp/IG).
- `vite.config.ts` — SPA con prerender de `/`, `/catalog`, `/collections` (mantener en sincronía con
  `STATIC_PAGES` del sitemap en `src/modules/seo`). No añadir plugins que ya trae
  `@lovable.dev/vite-tanstack-config`.
- React Query con `staleTime` global de 60 s; las mutaciones invalidan sus propias queries.

## Despliegue
- API: `Dockerfile` (Node 22) → Cloud Run (`electronplus-api`, us-central1).
- Frontend: `frontend/dist/client` → Firebase Hosting (`firebase.json`; todo reescribe a `/_shell.html`,
  `/sitemap.xml` se reenvía a Cloud Run).
- Bridges: corren en la red de cada tienda; ver su `README.md` (usuario SQL de solo lectura, `API_KEY` ≥ 32 caracteres).
