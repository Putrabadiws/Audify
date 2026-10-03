/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const BACKEND_URL = process.env.AUDIFY_BACKEND_URL ?? "http://127.0.0.1:8000";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": new URL("./src", import.meta.url).pathname },
  },
  server: {
    // Same-origin in dev: no CORS preflights, and <audio src="/api/..."> just works.
    proxy: {
      "/api": BACKEND_URL,
      "/health": BACKEND_URL,
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: { modules: { classNameStrategy: "non-scoped" } },
  },
});
