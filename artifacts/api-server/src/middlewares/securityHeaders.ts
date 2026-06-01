import type { Request, Response, NextFunction } from "express";

/**
 * Applies HTTP security headers to every API response.
 *
 * The Express server serves only JSON — no HTML — so the CSP is intentionally
 * strict (default-src 'none'). The frontend SPA has its own CSP declared via
 * a <meta> tag in index.html and Vite server.headers.
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  const isProd = process.env["NODE_ENV"] === "production";

  // Prevent MIME-type sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");

  // Disallow framing of any API response
  res.setHeader("X-Frame-Options", "DENY");

  // Leak minimal referrer info cross-origin
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  // Disable browser features the API never needs
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");

  // Isolate this origin from cross-origin documents
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin"); // allow frontend to fetch API

  // API only serves JSON — no embedded resources needed
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; frame-ancestors 'none'; form-action 'none'"
  );

  // HSTS — production only (dev uses plain HTTP)
  if (isProd) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }

  next();
}
