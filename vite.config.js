import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  appType: "mpa",
  base: "./",
  build: {
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, "index.html"),
        tuner: resolve(import.meta.dirname, "tuner/index.html"),
        profile: resolve(import.meta.dirname, "profile/index.html"),
        chain: resolve(import.meta.dirname, "chain/index.html"),
      },
    },
  },
  server: {
    port: 5173,
  },
});
