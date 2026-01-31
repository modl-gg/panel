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
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks: {
            "react-vendor": ["react", "react-dom"],
            "ui-vendor": ["lucide-react", "wouter", "@tanstack/react-query"],
            "radix-vendor": [
              "@radix-ui/react-accordion",
              "@radix-ui/react-alert-dialog",
              "@radix-ui/react-aspect-ratio",
              "@radix-ui/react-avatar",
              "@radix-ui/react-checkbox",
              "@radix-ui/react-collapsible",
              "@radix-ui/react-context-menu",
              "@radix-ui/react-dialog",
              "@radix-ui/react-dropdown-menu",
              "@radix-ui/react-hover-card",
              "@radix-ui/react-label",
              "@radix-ui/react-menubar",
              "@radix-ui/react-navigation-menu",
            ],
          },
        },
      },
    },
    server: {
      port: 3000,
      proxy: {
        '/v1': {
          target: 'http://localhost:8080',
          changeOrigin: true,
          secure: false,
        },
      },
    },
  };
});
