import { defineConfig } from "vite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { thirdPartyLicenses } from "../scripts/third-party-licenses";

// Bundles the CLI and everything it imports (Hono, server/github.ts, the shared
// src/lib modules) into one file, so the published package has no dependencies
// to install and `npx` starts quickly. The app itself is built separately into
// dist/app by the root `build:cli` script.
const cliPackage = JSON.parse(readFileSync(path.resolve(__dirname, "package.json"), "utf8")) as { version: string };

export default defineConfig({
  root: path.resolve(__dirname),
  plugins: [thirdPartyLicenses()],
  define: { __APP_VERSION__: JSON.stringify(cliPackage.version) },
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
