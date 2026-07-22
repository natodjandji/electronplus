// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Firebase Hosting only serves static files (free Spark plan, no Cloud Functions/Cloud Run
// billing) — so the app builds in TanStack Start's SPA mode (prerendered shell + client-side
// rendering, no server runtime) instead of the default Cloudflare SSR target.
export default defineConfig({
  tanstackStart: {
    spa: { enabled: true, prerender: { enabled: true, crawlLinks: true } },
  },
  nitro: false,
});
