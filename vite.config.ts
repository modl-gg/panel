import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig(({ mode }) => {
  const envDir = path.resolve(import.meta.dirname);
  const env = loadEnv(mode, envDir, '');

  return {
    plugins: [react()],
    define: {
      'import.meta.env.VITE_API_BASE_URL': JSON.stringify(
        process.env.VITE_API_BASE_URL || env.VITE_API_BASE_URL || ''
      ),
      'import.meta.env.VITE_REPLAY_ATLAS_BASE_URL': JSON.stringify(
        process.env.VITE_REPLAY_ATLAS_BASE_URL || env.VITE_REPLAY_ATLAS_BASE_URL || ''
      ),
    },
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "client", "src"),
        "@shared": path.resolve(import.meta.dirname, "shared"),
      },
      preserveSymlinks: true,
    },
    optimizeDeps: {
      include: ["@modl-gg/shared-web"],
    },
    ssr: {
      noExternal: ["@modl-gg/shared-web"],
    },
    root: path.resolve(import.meta.dirname, "client"),
    envDir: envDir,
    build: {
      outDir: path.resolve(import.meta.dirname, "dist"),
      emptyOutDir: true,
      commonjsOptions: {
        include: [/node_modules/, /@modl-gg\/shared-web/],
        transformMixedEsModules: true,
      },
      sourcemap: 'hidden',
      rollupOptions: {
        output: {
          // The chunk dependency graph must stay acyclic: a cycle between two
          // vendor chunks makes one of them evaluate while the other is still
          // initializing, so a cross-chunk binding read at module-eval time
          // (e.g. `React.forwardRef`) throws `Cannot access 'j' before
          // initialization` (a TDZ) at load. The rules below keep each package's
          // own module graph inside a single chunk so no such cycle can form.
          manualChunks(id) {
            if (id.includes('node_modules')) {
              // charts-vendor owns the whole recharts/d3 animation graph so its
              // top-level imports (d3, react-smooth) resolve within one chunk.
              // shared-web's chart wrapper lives in shared-web-vendor and imports
              // recharts one-way from here.
              if (
                id.includes('node_modules/recharts') ||
                id.includes('node_modules/victory-vendor') ||
                id.includes('node_modules/d3-') ||
                id.includes('node_modules/internmap') ||
                id.includes('node_modules/react-smooth') ||
                id.includes('node_modules/fast-equals')
              ) return 'charts-vendor';
              if (id.includes('node_modules/@modl-gg/replay-viewer') || id.includes('node_modules/three')) return 'replay-viewer-vendor';
              // Group radix with its required helpers so radix-vendor never has
              // to pull bindings back from vendor (the helpers are peer-deps of
              // the @radix-ui/react-* primitives).
              if (
                id.includes('node_modules/@radix-ui/') ||
                id.includes('node_modules/@floating-ui/') ||
                id.includes('node_modules/react-remove-scroll') ||
                id.includes('node_modules/react-remove-scroll-bar') ||
                id.includes('node_modules/react-style-singleton') ||
                id.includes('node_modules/aria-hidden') ||
                id.includes('node_modules/use-callback-ref') ||
                id.includes('node_modules/use-sidecar') ||
                id.includes('node_modules/use-sync-external-store') ||
                id.includes('node_modules/get-nonce') ||
                id.includes('node_modules/detect-node-es') ||
                id.includes('node_modules/tslib')
              ) return 'radix-vendor';
              if (id.includes('node_modules/react-dnd') || id.includes('node_modules/dnd-core')) return 'dnd-vendor';
              if (id.includes('node_modules/react-hook-form') || id.includes('node_modules/@hookform/') || id.includes('node_modules/zod')) return 'form-vendor';
              if (id.includes('node_modules/i18next') || id.includes('node_modules/react-i18next')) return 'i18n-vendor';
              if (id.includes('node_modules/react-day-picker') || id.includes('node_modules/date-fns')) return 'date-vendor';
              // Match React core only, not arbitrary react-* packages. The old
              // `includes('node_modules/react')` swept in react-smooth,
              // react-markdown, react-resizable-panels, react-remove-scroll,
              // etc., which transitively import vendor modules and built
              // react-vendor ↔ vendor cycles.
              if (/[\\/]node_modules[\\/](react|react-dom|react-is|scheduler)[\\/]/.test(id)) return 'react-vendor';
              if (id.includes('node_modules/lucide-react')) return 'icons-vendor';
              if (id.includes('node_modules/@tanstack/')) return 'query-vendor';
              // Keep the entire @modl-gg/shared-web package in a single chunk.
              // Splitting its module graph across chunks (its barrels in
              // charts-vendor, its components in `vendor`) is what built the
              // vendor ↔ charts-vendor cycle and the `Cannot access 'j' before
              // initialization` TDZ. shared-web only imports the vendor chunks
              // above one-way, so a dedicated chunk keeps the graph acyclic.
              // Match its own source only; its nested node_modules copies
              // (recharts v2, lucide, etc.) are claimed by the rules above or
              // fall through to `vendor`, never back into shared-web-vendor.
              const sharedWeb = 'node_modules/@modl-gg/shared-web/';
              const swIndex = id.indexOf(sharedWeb);
              if (swIndex !== -1 && !id.includes('node_modules/', swIndex + sharedWeb.length)) {
                return 'shared-web-vendor';
              }
              return 'vendor';
            }
          },
        },
      },
    },
    server: {
      port: 3000,
      proxy: {
        '/api/v1/realtime/ws': {
          target: 'http://localhost:8080',
          changeOrigin: true,
          secure: false,
          ws: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
        '/api': {
          target: 'http://localhost:8080',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
  };
});
