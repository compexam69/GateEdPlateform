import * as Sentry from "@sentry/node";
import type { Express } from "express";

const SENTRY_DSN = process.env["SENTRY_DSN"];

export function initSentry(): void {
  if (!SENTRY_DSN) {
    console.info("[sentry] SENTRY_DSN not set — error monitoring disabled");
    return;
  }
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env["NODE_ENV"] ?? "development",
    tracesSampleRate: 0,
    skipOpenTelemetrySetup: true,
    integrations: [],
  });
  console.info("[sentry] Backend error monitoring active");
}

export function setupSentryErrorHandler(app: Express): void {
  if (!SENTRY_DSN) return;
  Sentry.setupExpressErrorHandler(app);
}

export function captureException(error: unknown, context?: Record<string, unknown>): void {
  if (!SENTRY_DSN) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}
