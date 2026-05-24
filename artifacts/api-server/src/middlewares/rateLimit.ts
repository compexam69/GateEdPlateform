import type { Request, Response, NextFunction } from "express";

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitRecord>();

function cleanup() {
  const now = Date.now();
  for (const [key, record] of store.entries()) {
    if (now > record.resetAt + 60_000) store.delete(key);
  }
}
setInterval(cleanup, 5 * 60_000);

export function rateLimit(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.ip ||
      req.socket.remoteAddress ||
      "unknown";
    const key = `${ip}:${req.method}:${req.path}`;
    const now = Date.now();

    const record = store.get(key);
    if (!record || now > record.resetAt) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    if (record.count >= maxRequests) {
      res.status(429).json({
        error: "Too many requests. Please try again later.",
        retryAfter: Math.ceil((record.resetAt - now) / 1000),
      });
      return;
    }

    record.count++;
    next();
  };
}
