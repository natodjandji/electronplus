import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  API_PREFIX: z.string().default('api'),

  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  FIREBASE_PROJECT_ID: z.string().min(1, 'FIREBASE_PROJECT_ID is required'),
  // Base64-encoded service-account JSON. If omitted, falls back to
  // GOOGLE_APPLICATION_CREDENTIALS (a key file path) or the ambient
  // metadata server when running on GCP.
  FIREBASE_SERVICE_ACCOUNT_BASE64: z.string().optional(),
  // Defaults to the project's Firebase Storage default bucket name.
  FIREBASE_STORAGE_BUCKET: z.string().optional(),

  // The public storefront's URL — what product QR codes point to.
  PUBLIC_SITE_URL: z.string().default('https://electronplus.com.ve'),

  // Principal store's Profit Plus install (full 6-field catalog sync into
  // `products`, via profit-plus-bridge-principal). 'api' is the default —
  // ApiProfitPlusAdapter no-ops-with-a-logged-error until
  // PROFIT_PLUS_API_URL/KEY are set, same graceful-degradation as every
  // other optional integration below. There is deliberately no 'mock'
  // option: it used to seed a fake demo catalog on every cron tick, which
  // kept resurrecting products an admin had just deleted from the real
  // database — see erp-sync.module.ts.
  PROFIT_PLUS_ADAPTER: z.enum(['db', 'api']).default('api'),
  PROFIT_PLUS_SYNC_CRON: z.string().default('*/15 * * * *'),
  PROFIT_PLUS_DB_URL: z.string().optional(),
  PROFIT_PLUS_API_URL: z.string().optional(),
  PROFIT_PLUS_API_KEY: z.string().optional(),

  // Second store's own, ENTIRELY SEPARATE Profit Plus install — a
  // different SQL Server, a different bridge (see
  // profit-plus-bridge-secundaria/), a different sync engine
  // (SecondStoreSyncService, not SyncService above), and a different
  // Firestore collection (secondStoreProducts, not products). Both bridges
  // report the same shape (código, descripción, stock, precio1, precio2)
  // but never share config or code — they're two distinct ERP installs on
  // two distinct physical servers. Optional — the sync just skips its
  // scheduled run and logs a warning until both are set.
  SECOND_STORE_PROFIT_API_URL: z.string().optional(),
  SECOND_STORE_PROFIT_API_KEY: z.string().optional(),
  SECOND_STORE_SYNC_CRON: z.string().default('*/15 * * * *'),

  LOW_STOCK_DEFAULT_THRESHOLD: z.coerce.number().default(10),

  PAYPAL_CLIENT_ID: z.string().optional(),
  PAYPAL_CLIENT_SECRET: z.string().optional(),
  PAYPAL_ENV: z.enum(['sandbox', 'live']).default('sandbox'),

  CORS_ORIGIN: z.string().default('*'),

  // Transactional email (welcome, order confirmation, fulfillment updates).
  // Optional — EmailService logs instead of sending when unset, same
  // graceful-degradation as the other optional integrations above.
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().default('onboarding@resend.dev'),
  // The "From" address doesn't need a real inbox behind it — replies go
  // here instead, so a customer hitting "reply" lands in an inbox someone
  // actually reads without needing to stand up mail hosting on the domain.
  RESEND_REPLY_TO: z.string().default('electronplusve@gmail.com'),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${message}`);
  }
  return parsed.data;
}
