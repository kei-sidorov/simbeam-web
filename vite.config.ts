import { defineConfig } from "vite";

export default defineConfig({
  build: {
    target: "es2022",
    // Single-page app, no code splitting needed at this size — one JS file
    // loads faster than a module graph.
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
  server: {
    port: 5173,
  },
});
