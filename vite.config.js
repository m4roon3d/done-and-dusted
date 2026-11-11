import { defineConfig } from "vite";

// base "./" lets the same build run from a sub-folder (GitHub Pages) and inside the Android / iOS app.
export default defineConfig({
  base: "./",
  build: { outDir: "dist", target: "es2020", assetsInlineLimit: 0 },
  server: { host: true },
});
