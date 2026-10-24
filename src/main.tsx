import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { routeTree } from "./routeTree.gen";
import "./index.css";
import "./lib/collections";

// BASE_URL is Vite's `base`: "/" normally, "/github-stars-organizer/" for the
// demo on GitHub Pages, which serves a project site under the repo name.
const router = createRouter({ routeTree, basepath: import.meta.env.BASE_URL });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
    {/* The app is dark only (class="dark" on <html>); Sonner defaults to light. Top,
        so it doesn't cover the bulk-action bar at the bottom on phones. */}
    <Toaster theme="dark" position="top-center" richColors closeButton />
  </StrictMode>,
);
