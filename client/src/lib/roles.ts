export type Role = "member" | "user" | "agent" | "admin" | "super_admin";

const ROLE_ORDER: Role[] = ["member", "user", "agent", "admin", "super_admin"];
const ROLE_SYNONYMS: Record<string, Role> = {
  member: "member",
  members: "member",
  user: "user",
  users: "user",
  agent: "agent",
  agents: "agent",
  admin: "admin",
  admins: "admin",
  administrator: "admin",
  super_admin: "super_admin",
  super_admins: "super_admin",
  superadmin: "super_admin",
  superadmins: "super_admin",
  "super administrator": "super_admin",
};

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

export function normalizeRole(role: string | undefined | null): Role | null {
  if (!role) {
    return null;
  }

  const cleaned = role.trim().toLowerCase().replace(/[\r\n\t]+/g, "");
  const slugged = cleaned.replace(/[\s-]+/g, "_");
  const mapped = ROLE_SYNONYMS[slugged];
  if (mapped) {
    return mapped;
  }

  if (slugged.includes("super") && slugged.includes("admin")) {
    return "super_admin";
  }
  if (slugged.includes("admin")) {
    return "admin";
  }
  if (slugged.includes("agent")) {
    return "agent";
  }
  if (slugged.includes("member")) {
    return "member";
  }
  if (slugged.includes("user")) {
    return "user";
  }

  return null;
}

export function isAgentOrAbove(role: string | undefined | null): boolean {
  return hasAtLeastRole(role, "agent");
}

export function isAdminOrAbove(role: string | undefined | null): boolean {
  return hasAtLeastRole(role, "admin");
}

export function isSuperAdmin(role: string | undefined | null): boolean {
  return normalizeRole(role) === "super_admin";
}
