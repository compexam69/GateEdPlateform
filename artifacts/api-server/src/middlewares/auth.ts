import { Request, Response, NextFunction } from "express";
import { getUserFromRequest } from "../lib/supabase";

export interface AuthRequest extends Request {
  user?: { id: string; email: string; role: string; emailVerified: boolean; isApproved: boolean };
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const user = await getUserFromRequest(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!user.emailVerified) {
    res.status(403).json({
      error: "Email not verified. Please verify your email address before accessing this resource.",
      code: "EMAIL_NOT_VERIFIED",
    });
    return;
  }
  if (!user.isApproved) {
    res.status(403).json({
      error: "Account pending approval. An admin will review and approve your account shortly.",
      code: "PENDING_APPROVAL",
    });
    return;
  }
  req.user = user;
  next();
}

export async function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  const user = await getUserFromRequest(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (user.role !== "admin" && user.role !== "super_admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  req.user = user;
  next();
}

export async function requireSuperAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  const user = await getUserFromRequest(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (user.role !== "super_admin") {
    res.status(403).json({ error: "Super admin access required" });
    return;
  }
  req.user = user;
  next();
}
