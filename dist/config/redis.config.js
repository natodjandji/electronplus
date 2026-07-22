"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseRedisUrl = parseRedisUrl;
function parseRedisUrl(url) {
    const parsed = new URL(url);
    return {
        host: parsed.hostname,
        port: Number(parsed.port || 6379),
        password: parsed.password || undefined,
        username: parsed.username || undefined,
    };
}
//# sourceMappingURL=redis.config.js.map