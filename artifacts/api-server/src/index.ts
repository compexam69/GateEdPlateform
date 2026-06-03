import app from "./app";
import { logger } from "./lib/logger";
import { dashboardCache, subjectsCache } from "./lib/cache";

const port = Number(process.env["PORT"] ?? "8080");

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${process.env["PORT"]}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  // Start background sweeps to evict expired cache entries every 5 minutes.
  // Without these, memory grows unboundedly as users accumulate stale keys.
  dashboardCache.startPrune();
  subjectsCache.startPrune();

  logger.info({ port }, "Server listening");
});
