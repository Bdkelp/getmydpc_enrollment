export type Role = "member" | "user" | "agent" | "admin" | "super_admin";

const ROLE_ORDER: Role[] = ["member", "user", "agent", "admin", "super_admin"];

export function hasAtLeastRole(
  userRole: string | undefined | null,
  minRole: Role,
): boolean {
  if (!userRole) {
    return false;
  }

  const normalized = userRole as Role;
  if (!ROLE_ORDER.includes(normalized)) {
    return false;
  }

  return ROLE_ORDER.indexOf(normalized) >= ROLE_ORDER.indexOf(minRole);
}

export function isAgentOrAbove(role: string | undefined | null): boolean {
  return hasAtLeastRole(role, "agent");
}

export function isAdminOrAbove(role: string | undefined | null): boolean {
  return hasAtLeastRole(role, "admin");
}

export function isSuperAdmin(role: string | undefined | null): boolean {
  return role === "super_admin";
}
