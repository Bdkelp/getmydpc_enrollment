import { hasAtLeastRole, normalizeRole } from "../auth/roles";

type UserIdentity = {
  id?: string | null;
  role?: string | null;
};

type ImpersonationSession = {
  impersonator_user_id?: string | null;
  target_user_id?: string | null;
  status?: string | null;
  expires_at?: string | null;
};

export type CommissionCenterRequestContext = {
  realUser?: UserIdentity | null;
  user?: UserIdentity | null;
  impersonationSession?: ImpersonationSession | null;
  impersonationContextError?: string | null;
  now?: Date;
};

export type CommissionCenterIdentity = {
  realActorUserId: string;
  effectiveAgentUserId: string;
  isImpersonating: boolean;
};

type AuthorizationResult =
  | { ok: true; identity: CommissionCenterIdentity }
  | { ok: false; reason: string };

const isAgentRole = (role: string | null | undefined): boolean => {
  const normalized = normalizeRole(role);
  return (
    normalized === "agent" ||
    normalized === "agency_manager" ||
    normalized === "agency_admin" ||
    String(role || "").trim().toLowerCase() === "user"
  );
};

export function resolveCommissionCenterIdentity(
  context: CommissionCenterRequestContext,
): AuthorizationResult {
  const realActorUserId = String(context.realUser?.id || "").trim();
  const effectiveUserId = String(context.user?.id || "").trim();

  if (!realActorUserId || !effectiveUserId) {
    return { ok: false, reason: "missing_authenticated_user" };
  }

  if (context.impersonationContextError) {
    return { ok: false, reason: context.impersonationContextError };
  }

  if (realActorUserId === effectiveUserId) {
    if (!isAgentRole(context.user?.role) && !hasAtLeastRole(context.user?.role, "admin")) {
      return { ok: false, reason: "wrong_effective_role" };
    }

    return {
      ok: true,
      identity: {
        realActorUserId,
        effectiveAgentUserId: effectiveUserId,
        isImpersonating: false,
      },
    };
  }

  const session = context.impersonationSession;
  if (!hasAtLeastRole(context.realUser?.role, "admin")) {
    return { ok: false, reason: "non_admin_impersonation_actor" };
  }
  if (!session) {
    return { ok: false, reason: "missing_impersonation_context" };
  }
  if (session.status !== "active") {
    return { ok: false, reason: "inactive_impersonation_context" };
  }
  if (session.impersonator_user_id !== realActorUserId) {
    return { ok: false, reason: "impersonator_mismatch" };
  }
  if (session.target_user_id !== effectiveUserId) {
    return { ok: false, reason: "target_mismatch" };
  }
  if (session.expires_at && new Date(session.expires_at).getTime() <= (context.now || new Date()).getTime()) {
    return { ok: false, reason: "expired_impersonation_context" };
  }
  if (!isAgentRole(context.user?.role)) {
    return { ok: false, reason: "target_not_agent" };
  }

  return {
    ok: true,
    identity: {
      realActorUserId,
      effectiveAgentUserId: effectiveUserId,
      isImpersonating: true,
    },
  };
}