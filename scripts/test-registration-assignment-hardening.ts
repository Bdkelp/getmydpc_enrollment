import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function sliceBetween(content: string, startToken: string, endToken: string): string {
  const start = content.indexOf(startToken);
  if (start === -1) return '';
  const end = content.indexOf(endToken, start + startToken.length);
  if (end === -1) return content.slice(start);
  return content.slice(start, end);
}

function testOptionalAuthenticatedUserHelperExists(): void {
  const routesPath = path.resolve(process.cwd(), 'server/routes.ts');
  const routesContent = readFileSync(routesPath, 'utf8');

  assert.equal(/async function getOptionalAuthenticatedUser\(req: any\): Promise<any \| null>/.test(routesContent), true);
  assert.equal(/supabase\.auth\.getUser\(token\)/.test(routesContent), true);
  assert.equal(/const dbUser = await storage\.getUser\(user\.id\)/.test(routesContent), true);
}

function testRegistrationAssignmentAuthGuards(): void {
  const routesPath = path.resolve(process.cwd(), 'server/routes.ts');
  const routesContent = readFileSync(routesPath, 'utf8');

  const registrationBlock = sliceBetween(
    routesContent,
    "app.post(\"/api/registration\", async (req: any, res: any) => {",
    "app.post(\"/api/agent/enrollment\", authMiddleware, async (req: any, res: any) => {",
  );

  assert.equal(registrationBlock.length > 0, true, 'Registration route block not found');
  assert.equal(/const authenticatedUser = await getOptionalAuthenticatedUser\(req\);/.test(registrationBlock), true);

  assert.equal(
    /if \(normalizedRequestedEnrolledByAgentId\) \{[\s\S]*Authentication required when assigning an enrolling agent/.test(registrationBlock),
    true,
  );

  assert.equal(
    /Only admins can assign enrollment to another agent/.test(registrationBlock),
    true,
  );

  assert.equal(
    /if \(overrideEnrollmentDate\) \{[\s\S]*Authentication required for enrollment date override/.test(registrationBlock),
    true,
  );

  assert.equal(
    /Only admins can override enrollment date/.test(registrationBlock),
    true,
  );
}

function testAssignedAgentTargetValidation(): void {
  const routesPath = path.resolve(process.cwd(), 'server/routes.ts');
  const routesContent = readFileSync(routesPath, 'utf8');

  const registrationBlock = sliceBetween(
    routesContent,
    "app.post(\"/api/registration\", async (req: any, res: any) => {",
    "app.post(\"/api/agent/enrollment\", authMiddleware, async (req: any, res: any) => {",
  );

  assert.equal(
    /Assigned enrolling agent is inactive/.test(registrationBlock),
    true,
  );

  assert.equal(
    /Assigned enrolling user must be an agent or admin/.test(registrationBlock),
    true,
  );

  assert.equal(
    /if \(authenticatedUser && isAdmin\(authenticatedUser\.role\)\)/.test(registrationBlock),
    true,
  );
}

function run(): void {
  testOptionalAuthenticatedUserHelperExists();
  testRegistrationAssignmentAuthGuards();
  testAssignedAgentTargetValidation();
  console.log('Registration assignment hardening tests passed');
}

run();
