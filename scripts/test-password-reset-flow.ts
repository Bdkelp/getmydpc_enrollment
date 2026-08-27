import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const load = (path: string) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [
  resetService,
  emailService,
  authRoutes,
  adminRoutes,
  forgotPasswordPage,
  adminUsersPage,
] = await Promise.all([
  load("server/services/password-reset-service.ts"),
  load("server/email.ts"),
  load("server/routes/supabase-auth.ts"),
  load("server/routes/admin-users.ts"),
  load("client/src/pages/forgot-password.tsx"),
  load("client/src/pages/admin-users.tsx"),
]);

assert.match(resetService, /type: "recovery"/);
assert.match(resetService, /supabaseAdmin\.auth\.admin\.generateLink/);
assert.match(resetService, /sendPasswordRecoveryEmail/);
assert.match(emailService, /Password reset email sent via SendGrid/);

assert.match(authRoutes, /\/api\/auth\/forgot-password/);
assert.match(authRoutes, /deliverPasswordReset/);
assert.match(
  forgotPasswordPage,
  /apiClient\.post\("\/api\/auth\/forgot-password"/,
);
assert.doesNotMatch(forgotPasswordPage, /resetPasswordForEmail/);

assert.match(adminRoutes, /\/api\/admin\/users\/:userId\/send-password-reset/);
assert.match(adminRoutes, /const actorUser = req\.realUser \|\| req\.user/);
assert.match(adminUsersPage, /Send password reset/);
assert.match(adminUsersPage, /onSuccess: \(\) => setLocation\('\/agent'\)/);
assert.doesNotMatch(
  adminUsersPage,
  /onSuccess: \(\) => setLocation\('\/agent\/commission-center'\)/,
);
assert.equal(
  (adminUsersPage.match(/startImpersonationMutation\.mutate/g) || []).length,
  1,
);

console.log("Password reset and agent drop-in flow contract tests passed.");
