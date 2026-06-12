import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = env.VITE_API_URL || "http://localhost:3001";

  return {
    plugins: [react()],
    resolve: {
      alias: { "@": resolve(__dirname, "./src") },
    },
    server: {
      port: 3000,
      proxy: {
        "/api": { target, changeOrigin: true },
      },
    },
  };
});
