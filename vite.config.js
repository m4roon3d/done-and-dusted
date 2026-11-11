import { defineConfig } from "vite";

// base "./" lets the same build run from a sub-folder (GitHub Pages) and inside the Android / iOS app.
const run = process.env.GITHUB_RUN_NUMBER || process.env.RENDER_GIT_COMMIT?.slice(0, 7) || "dev";
const sha = (process.env.GITHUB_SHA || process.env.RENDER_GIT_COMMIT || "").slice(0, 7);

export default defineConfig({
  define: { __APP_BUILD__: JSON.stringify(sha ? `${run} (${sha})` : String(run)) },
  base: "./",
  build: { outDir: "dist", target: "es2020", assetsInlineLimit: 0 },
  server: { host: true },
});
