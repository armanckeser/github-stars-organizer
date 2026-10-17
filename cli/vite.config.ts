import { defineConfig } from "vite";
import path from "node:path";

// Bundles the CLI and everything it imports (Hono, server/github.ts, the shared
// src/lib modules) into one file, so the published package has no dependencies
// to install and `npx` starts quickly. The app itself is built separately into
// dist/app by the root `build:cli` script.
export default defineConfig({
  root: path.resolve(__dirname),
  build: {
    ssr: path.resolve(__dirname, "src/cli.ts"),
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: false,
    target: "node20",
    minify: false,
    rolldownOptions: {
      output: { entryFileNames: "cli.js", banner: "#!/usr/bin/env node" },
    },
  },
  ssr: { noExternal: true, target: "node" },
});
