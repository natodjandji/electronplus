export function parseRedisUrl(url: string): {
  host: string;
  port: number;
  password?: string;
  username?: string;
  tls?: Record<string, never>;
} {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    password: parsed.password || undefined,
    username: parsed.username || undefined,
    tls: parsed.protocol === 'rediss:' ? {} : undefined,
  };
}
