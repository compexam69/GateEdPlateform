import { Router } from "express";
import { generateCsrfToken } from "../middlewares/csrf";

const router = Router();

/**
 * GET /csrf-token
 *
 * Returns a fresh CSRF token as JSON and sets the corresponding HttpOnly
 * cookie.  The SPA calls this endpoint once per session (lazily, before the
 * first state-mutating request) and caches the returned token.
 *
 * Clients should pass their Authorization header so the token is tied to the
 * authenticated user's session identifier — see the CSRF middleware for details.
 *
 * This is a GET endpoint, so it is automatically excluded from CSRF protection
 * by the doubleCsrfProtection middleware's `ignoredMethods` list.
 */
router.get("/csrf-token", (req, res) => {
  const token = generateCsrfToken(req, res);
  res.json({ token });
});

export default router;
