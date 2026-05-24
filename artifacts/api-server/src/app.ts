import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { rateLimit } from "./middlewares/rateLimit";
import { initSentry, setupSentryErrorHandler } from "./lib/sentry";
import { initWebPush } from "./lib/push";

initSentry();
initWebPush();

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Strict rate limits on sensitive write endpoints
app.use("/api/exam/submit", rateLimit(10, 60_000));
app.use("/api/exam/start", rateLimit(20, 60_000));
app.use("/api/b2/upload-url", rateLimit(5, 3_600_000));
app.use("/api/b2/profile-upload-url", rateLimit(5, 3_600_000));
// General API rate limit: 200 req/min per IP
app.use("/api", rateLimit(200, 60_000));
app.use("/api", router);

// Sentry error handler — MUST be after all routes
setupSentryErrorHandler(app);

export default app;
