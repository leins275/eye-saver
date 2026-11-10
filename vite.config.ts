/// <reference types="vitest/config" />
import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Three windows, one build: each HTML entry becomes a page under
// `dist/`, which Tauri serves as `frontendDist` (`hud.html`, `veil.html`).
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        hud: resolve(__dirname, "hud.html"),
        veil: resolve(__dirname, "veil.html"),
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["src/test/setup.ts"],
    globals: false,
  },
});
