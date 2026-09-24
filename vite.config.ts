import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// The Vite entry lives in app/ so that the repository root can hold a
// generated, self-contained index.html — see scripts/build-standalone.mjs.
// That file is what GitHub Pages serves when it is set to deploy a branch
// verbatim rather than run this project's build.
export default defineConfig({
  root: "app",
  publicDir: "../public",
  // Relative asset URLs, so the build works at any path: the repository root,
  // a GitHub Pages project page, a subfolder. Hard-coding the repository name
  // here meant renaming the repository broke every asset.
  base: process.env.BASE_PATH ?? "./",
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
