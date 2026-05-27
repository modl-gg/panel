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
          manualChunks(id) {
            if (id.includes('node_modules')) {
              // Anything that imports recharts/d3 at module top-level must live in
              // the same chunk: victory-vendor re-exports `d3-*`, and shared-web's
              // chart wrapper does `import * as RechartsPrimitive from "recharts"`.
              // Leaving them in vendor builds a charts-vendor <-> vendor cycle,
              // which triggers a TDZ on the cross-chunk React import at load time.
              if (
                id.includes('node_modules/recharts') ||
                id.includes('node_modules/victory-vendor') ||
                id.includes('node_modules/d3-') ||
                id.includes('node_modules/internmap') ||
                /@modl-gg\/shared-web\/.*\/components\/ui\/chart\.js$/.test(id)
              ) return 'charts-vendor';
              if (id.includes('node_modules/@modl-gg/replay-viewer') || id.includes('node_modules/three')) return 'replay-viewer-vendor';
              if (id.includes('node_modules/@radix-ui/')) return 'radix-vendor';
              if (id.includes('node_modules/react-dnd') || id.includes('node_modules/dnd-core')) return 'dnd-vendor';
              if (id.includes('node_modules/react-hook-form') || id.includes('node_modules/@hookform/') || id.includes('node_modules/zod')) return 'form-vendor';
              if (id.includes('node_modules/i18next') || id.includes('node_modules/react-i18next')) return 'i18n-vendor';
              if (id.includes('node_modules/react-day-picker') || id.includes('node_modules/date-fns')) return 'date-vendor';
              if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) return 'react-vendor';
              if (id.includes('node_modules/lucide-react')) return 'icons-vendor';
              if (id.includes('node_modules/@tanstack/')) return 'query-vendor';
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
