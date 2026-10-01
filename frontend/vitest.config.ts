import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Separate from vite.config.ts on purpose: that one wires up TanStack Start's
// SSR/prerender plugins, which tests neither need nor should boot. Tests here
// cover pure logic (no DOM), so a bare node environment is enough.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
