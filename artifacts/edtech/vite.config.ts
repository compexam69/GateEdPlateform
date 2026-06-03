import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { VitePWA } from "vite-plugin-pwa";

const port = Number(process.env.PORT ?? "5000");
const basePath = process.env.BASE_PATH ?? "/";

/**
 * Content Security Policy for the React SPA.
 *
 * Directive rationale:
 *  - script-src: 'self' only; two sha256 hashes whitelist the inline scripts
 *    injected by @replit/vite-plugin-runtime-error-modal in development (they
 *    are harmless no-ops in production). No 'unsafe-inline'.
 *  - style-src: 'unsafe-inline' is required because Framer Motion applies
 *    animation transforms via element.style at runtime.
 *  - connect-src: Supabase REST + Realtime WSS, Backblaze B2 presigned URLs
 *    (regional subdomains vary so *.backblazeb2.com covers them all), and
 *    Sentry ingestion.
 *  - worker-src: blob: is needed for the PWA service worker injected by
 *    vite-plugin-pwa and for PDF.js worker blobs.
 *  - frame-ancestors: only effective in HTTP headers (ignored in meta tags);
 *    this is the canonical enforcement point — the meta tag is belt-and-
 *    suspenders for static hosting environments that don't set headers.
 */
const csp = [
  "default-src 'self'",
  "script-src 'self'" +
    " 'sha256-L7SfyzTM3npW90hLyjdsYsxVh+bDBqSHkvhPRa2jshQ='" +
    " 'sha256-6zo87Fg0XqbKOP1XEwHCmVJ4yfWii/6FiRQsK0hr2d8='",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https://*.supabase.co https://*.backblazeb2.com",
  "connect-src 'self'" +
    " https://*.supabase.co wss://*.supabase.co" +
    " https://*.backblazeb2.com https://api.backblazeb2.com" +
    " https://*.ingest.sentry.io https://*.sentry.io",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
].join("; ");

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
      injectRegister: "auto",
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webp}"],
      },
      manifest: {
        name: "EdTech Study Platform",
        short_name: "EdTech",
        description: "Smart mastery-based learning for JEE, NEET, GATE and competitive exams.",
        start_url: "/",
        display: "standalone",
        background_color: "#0F172A",
        theme_color: "#6366F1",
        orientation: "portrait-primary",
        categories: ["education"],
        lang: "en",
        icons: [
          { src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
    headers: {
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Content-Security-Policy": csp,
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    headers: {
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Content-Security-Policy": csp,
    },
  },
});
