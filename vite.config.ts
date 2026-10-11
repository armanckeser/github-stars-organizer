import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import path from "path";

// Link previews need absolute URLs, so og:url and og:image come from the
// deployment's own address, which the Pages workflow passes in as
// VITE_SITE_URL. Unset (dev, a self-hosted build) this adds nothing.
function sharePreviewUrls(siteUrl: string | undefined): Plugin {
  return {
    name: "share-preview-urls",
    transformIndexHtml() {
      if (!siteUrl) return;
      const site = siteUrl.endsWith("/") ? siteUrl : `${siteUrl}/`;
      return [
        { tag: "link", attrs: { rel: "canonical", href: site }, injectTo: "head" },
        { tag: "meta", attrs: { property: "og:url", content: site }, injectTo: "head" },
        { tag: "meta", attrs: { property: "og:image", content: `${site}og.jpg` }, injectTo: "head" },
      ];
    },
  };
}

export default defineConfig({
  // "/" everywhere except the GitHub Pages demo, which sets VITE_BASE=/<repo>/.
  base: process.env.VITE_BASE ?? "/",
  plugins: [
    TanStackRouterVite({ autoCodeSplitting: true, target: "react" }),
    react(),
    tailwindcss(),
    sharePreviewUrls(process.env.VITE_SITE_URL),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
