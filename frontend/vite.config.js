import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    target: "esnext",
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("react") || id.includes("react-dom")) {
              return "vendor-react";
            }
            if (id.includes("@react-oauth")) {
              return "vendor-oauth";
            }
            if (id.includes("recharts")) {
              return "vendor-recharts";
            }
            return "vendor";
          }
        },
      },
    },
  },
  server: {
    port: 3000,
    proxy: {
      "/auth":       "http://localhost:8000",
      "/portfolios": "http://localhost:8000",
      "/risk":       "http://localhost:8000",
      "/news":       "http://localhost:8000",
      "/export":     "http://localhost:8000",
      "/ws":         { target: "ws://localhost:8000", ws: true },
    },
  },
});
