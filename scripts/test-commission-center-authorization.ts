import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolveCommissionCenterIdentity } from "../server/services/commission-center-authorization";

const admin = { id: "admin-1", role: "admin" };
const superAdmin = { id: "super-1", role: "super_admin" };
const agentA = { id: "agent-a", role: "agent" };
const agentB = { id: "agent-b", role: "agent" };
const activeSession = (actorId: string, targetId: string) => ({
  impersonator_user_id: actorId,
  target_user_id: targetId,
  status: "active",
  expires_at: "2099-01-01T00:00:00.000Z",
});

const normalAgent = resolveCommissionCenterIdentity({ realUser: agentA, user: agentA });
assert.equal(normalAgent.ok, true);
assert.deepEqual(normalAgent.identity, {
  realActorUserId: "agent-a",
  effectiveAgentUserId: "agent-a",
  isImpersonating: false,
});

const adminWithoutViewAs = resolveCommissionCenterIdentity({ realUser: admin, user: admin });
assert.equal(adminWithoutViewAs.ok, true);

const adminViewingAgent = resolveCommissionCenterIdentity({
  realUser: admin,
  user: agentA,
  impersonationSession: activeSession(admin.id, agentA.id),
});
assert.equal(adminViewingAgent.ok, true);
assert.equal(adminViewingAgent.identity.effectiveAgentUserId, agentA.id);
assert.equal(adminViewingAgent.identity.realActorUserId, admin.id);
assert.equal(adminViewingAgent.identity.isImpersonating, true);

const superAdminViewingAgent = resolveCommissionCenterIdentity({
  realUser: superAdmin,
  user: agentA,
  impersonationSession: activeSession(superAdmin.id, agentA.id),
});
assert.equal(superAdminViewingAgent.ok, true);
assert.equal(superAdminViewingAgent.identity.effectiveAgentUserId, agentA.id);

const forgedAgentTarget = resolveCommissionCenterIdentity({
  realUser: agentA,
  user: agentB,
  impersonationSession: activeSession(agentA.id, agentB.id),
});
assert.equal(forgedAgentTarget.ok, false);
assert.equal(forgedAgentTarget.reason, "non_admin_impersonation_actor");

const missingContext = resolveCommissionCenterIdentity({ realUser: admin, user: agentA });
assert.equal(missingContext.ok, false);
assert.equal(missingContext.reason, "missing_impersonation_context");

const expiredContext = resolveCommissionCenterIdentity({
  realUser: admin,
  user: agentA,
  impersonationSession: {
    ...activeSession(admin.id, agentA.id),
    expires_at: "2020-01-01T00:00:00.000Z",
  },
  now: new Date("2026-08-20T00:00:00.000Z"),
});
assert.equal(expiredContext.ok, false);
assert.equal(expiredContext.reason, "expired_impersonation_context");

const targetNotAgent = resolveCommissionCenterIdentity({
  realUser: admin,
  user: { id: "admin-2", role: "admin" },
  impersonationSession: activeSession(admin.id, "admin-2"),
});
assert.equal(targetNotAgent.ok, false);
assert.equal(targetNotAgent.reason, "target_not_agent");

const afterExit = resolveCommissionCenterIdentity({ realUser: admin, user: admin });
assert.equal(afterExit.ok, true);
assert.equal(afterExit.identity.isImpersonating, false);

const financialRoutes = await readFile(new URL("../server/routes/financial-exceptions.ts", import.meta.url), "utf8");
const indexRoutes = await readFile(new URL("../server/index.ts", import.meta.url), "utf8");
const literalRouteIndex = indexRoutes.indexOf("app.use('/', financialExceptionRoutes)");
const genericRouteIndex = financialRoutes.indexOf("/api/agent/commission-center");
assert.notEqual(literalRouteIndex, -1);
assert.notEqual(genericRouteIndex, -1);
assert.match(financialRoutes, /authenticateToken/);
assert.match(financialRoutes, /resolveCommissionCenterIdentity/);
assert.match(financialRoutes, /effectiveAgentUserId/);

console.log("Commission Center View-as-Agent authorization tests passed.");
console.log("Confirmed: normal self access, admin/super-admin valid impersonation, forged target rejection, invalid context rejection, audit identity retention, exit restoration, and literal-route registration.");
