import { defineConfig } from "vitest/config";

// `base` is set for project-page hosting on GitHub Pages
// (https://<user>.github.io/<repo>/). Override with BASE_PATH when
// deploying anywhere else, e.g. BASE_PATH=/ npm run build.
export default defineConfig({
  base: process.env.BASE_PATH ?? "/devbox/",
  build: {
    target: "es2022",
    outDir: "dist",
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
