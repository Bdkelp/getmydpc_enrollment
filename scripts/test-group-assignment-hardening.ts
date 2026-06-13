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

function testAssignableAgentValidatorDefined(): void {
  const routePath = path.resolve(process.cwd(), 'server/routes/group-enrollment.ts');
  const routeContent = readFileSync(routePath, 'utf8');

  assert.equal(/const ensureAssignableAgent = async \(agentId: string\): Promise<void> =>/.test(routeContent), true);
  assert.equal(routeContent.includes('Selected assignment target does not exist'), true);
  assert.equal(routeContent.includes('Selected assignment target is inactive'), true);
  assert.equal(routeContent.includes('Selected assignment target must be an agent or admin'), true);
}

function testCreateFlowUsesAssignableAgentValidator(): void {
  const routePath = path.resolve(process.cwd(), 'server/routes/group-enrollment.ts');
  const routeContent = readFileSync(routePath, 'utf8');

  const createBlock = sliceBetween(
    routeContent,
    "router.post('/api/groups', async (req: AuthRequest, res: Response) => {",
    "router.patch('/api/groups/:groupId', async (req: AuthRequest, res: Response) => {",
  );

  assert.equal(createBlock.length > 0, true, 'Create group route block not found');
  assert.equal(/if \(selectedAssignedAgentId\) \{\s*await ensureAssignableAgent\(selectedAssignedAgentId\);\s*\}/.test(createBlock), true);
}

function testUpdateFlowUsesAssignableAgentValidator(): void {
  const routePath = path.resolve(process.cwd(), 'server/routes/group-enrollment.ts');
  const routeContent = readFileSync(routePath, 'utf8');

  const updateBlock = sliceBetween(
    routeContent,
    "router.patch('/api/groups/:groupId', async (req: AuthRequest, res: Response) => {",
    "router.post('/api/groups/:groupId/reassign', async (req: AuthRequest, res: Response) => {",
  );

  assert.equal(updateBlock.length > 0, true, 'Update group route block not found');
  assert.equal(/if \(selectedAssignedAgentId\) \{\s*await ensureAssignableAgent\(selectedAssignedAgentId\);\s*\}/.test(updateBlock), true);
}

function testReassignFlowUsesAssignableAgentValidator(): void {
  const routePath = path.resolve(process.cwd(), 'server/routes/group-enrollment.ts');
  const routeContent = readFileSync(routePath, 'utf8');

  const reassignBlock = sliceBetween(
    routeContent,
    "router.post('/api/groups/:groupId/reassign', async (req: AuthRequest, res: Response) => {",
    "router.post('/api/groups/:groupId/members', async (req: AuthRequest, res: Response) => {",
  );

  assert.equal(reassignBlock.length > 0, true, 'Reassign route block not found');
  assert.equal(/await ensureAssignableAgent\(normalizedNewAgentId\);/.test(reassignBlock), true);
  assert.equal(/replace\('assignment', 'reassignment'\)/.test(reassignBlock), true);
}

function run(): void {
  testAssignableAgentValidatorDefined();
  testCreateFlowUsesAssignableAgentValidator();
  testUpdateFlowUsesAssignableAgentValidator();
  testReassignFlowUsesAssignableAgentValidator();
  console.log('Group assignment hardening tests passed');
}

run();
