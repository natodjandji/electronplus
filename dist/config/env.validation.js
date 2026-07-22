"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.envSchema = void 0;
exports.validateEnv = validateEnv;
const zod_1 = require("zod");
exports.envSchema = zod_1.z.object({
    NODE_ENV: zod_1.z.enum(['development', 'test', 'production']).default('development'),
    PORT: zod_1.z.coerce.number().default(3000),
    API_PREFIX: zod_1.z.string().default('api'),
    REDIS_URL: zod_1.z.string().min(1, 'REDIS_URL is required'),
    FIREBASE_PROJECT_ID: zod_1.z.string().min(1, 'FIREBASE_PROJECT_ID is required'),
    FIREBASE_SERVICE_ACCOUNT_BASE64: zod_1.z.string().optional(),
    API_PUBLIC_URL: zod_1.z.string().default('http://localhost:3000/api'),
    PROFIT_PLUS_ADAPTER: zod_1.z.enum(['mock', 'db', 'api']).default('mock'),
    PROFIT_PLUS_SYNC_CRON: zod_1.z.string().default('*/15 * * * *'),
    PROFIT_PLUS_DB_URL: zod_1.z.string().optional(),
    PROFIT_PLUS_API_URL: zod_1.z.string().optional(),
    PROFIT_PLUS_API_KEY: zod_1.z.string().optional(),
    LOW_STOCK_DEFAULT_THRESHOLD: zod_1.z.coerce.number().default(10),
    PAYPAL_CLIENT_ID: zod_1.z.string().optional(),
    PAYPAL_CLIENT_SECRET: zod_1.z.string().optional(),
    PAYPAL_ENV: zod_1.z.enum(['sandbox', 'live']).default('sandbox'),
    CORS_ORIGIN: zod_1.z.string().default('*'),
});
function validateEnv(config) {
    const parsed = exports.envSchema.safeParse(config);
    if (!parsed.success) {
        const message = parsed.error.issues
            .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
            .join('\n');
        throw new Error(`Invalid environment configuration:\n${message}`);
    }
    return parsed.data;
}
//# sourceMappingURL=env.validation.js.map