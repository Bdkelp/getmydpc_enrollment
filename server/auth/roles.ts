import type { Request, Response, NextFunction } from "express";

export type Role = "agent" | "admin" | "super_admin";

const ROLE_ORDER: Role[] = ["agent", "admin", "super_admin"];
const ROLE_SYNONYMS: Record<string, Role> = {
  agent: "agent",
  agents: "agent",
  admin: "admin",
  administrator: "admin",
  super_admin: "super_admin",
  superadmin: "super_admin",
  "super_administrator": "super_admin",
};

const fullAccessEmailSet = new Set<string>(
  (process.env.FULL_ACCESS_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);

export function isFullAccessEmail(email?: string | null): boolean {
  if (!email) {
    return false;
  }

  return fullAccessEmailSet.has(email.toLowerCase());
}

export function hasAtLeastRole(
  userRole: string | undefined | null,
  minRole: Role,
): boolean {
  const normalized = normalizeRole(userRole);
  if (!normalized) {
    return false;
  }

  return ROLE_ORDER.indexOf(normalized) >= ROLE_ORDER.indexOf(minRole);
}

export function normalizeRole(
  userRole: string | undefined | null,
): Role | null {
  if (!userRole) {
    return null;
  }

  const cleaned = userRole.trim().toLowerCase().replace(/[\r\n\t]+/g, "");
  const slugged = cleaned.replace(/[\s-]+/g, "_");
  return ROLE_SYNONYMS[slugged] || null;
}

export function requireRole(minRole: Role) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user || (req as any).authUser;
    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const userRole = normalizeRole((user.role || user.user_role) as string | undefined);
    if (!userRole || !hasAtLeastRole(userRole, minRole)) {
      return res
        .status(403)
        .json({ message: "Forbidden: insufficient role", requiredRole: minRole });
    }

    return next();
  };
}
