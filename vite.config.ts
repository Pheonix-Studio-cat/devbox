import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// The Vite entry lives in app/ so that the repository root can hold a
// generated, self-contained index.html — see scripts/build-standalone.mjs.
// That file is what GitHub Pages serves when it is set to deploy a branch
// verbatim rather than run this project's build.
export default defineConfig({
  root: "app",
  publicDir: "../public",
  // `base` is set for project-page hosting on GitHub Pages
  // (https://<user>.github.io/<repo>/). Override with BASE_PATH when
  // deploying anywhere else, e.g. BASE_PATH=/ npm run build.
  base: process.env.BASE_PATH ?? "/devbox/",
  build: {
    target: "es2022",
    outDir: "../dist",
    emptyOutDir: true,
  },
  test: {
    environment: "node",
    // Vite's root is app/, but the tests sit beside the code in src/.
    root: fileURLToPath(new URL(".", import.meta.url)),
    include: ["src/**/*.test.ts"],
  },
});
