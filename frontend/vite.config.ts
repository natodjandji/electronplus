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
  vite: {
    build: {
      rollupOptions: {
        output: {
          // Default splitting gives every icon and every shadcn/ui
          // primitive its own chunk (each shared by 2+ routes), so a
          // single page load fans out into 30+ concurrent asset requests.
          // The app works fine like that, but that request burst is also
          // exactly what got this app's own admin traffic misidentified
          // as bot activity by Cloudflare in production (verified: the
          // failing chunk fetches 200 fine individually and under a
          // scripted 30x-concurrent burst from a plain server, only
          // breaking down from an automated *browser*). Consolidating the
          // small shared vendor/UI chunks into a couple of larger ones
          // cuts that fan-out without touching any Cloudflare setting.
          manualChunks(id) {
            if (id.includes("node_modules")) {
              if (id.includes("lucide-react")) return "vendor-icons";
              if (id.includes("@radix-ui")) return "vendor-radix";
            } else if (id.includes("/src/components/ui/")) {
              return "ui-primitives";
            }
          },
        },
      },
    },
  },
});
