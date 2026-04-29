import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function sliceBetween(content, startToken, endToken) {
  const start = content.indexOf(startToken);
  if (start === -1) return '';
  const end = content.indexOf(endToken, start + startToken.length);
  if (end === -1) return content.slice(start);
  return content.slice(start, end);
}

function assertLifecycleKeys(block, context) {
  const requiredKeys = [
    'subscriptionStatus',
    'pendingAction',
    'nextBillingDate',
    'accessThroughDate',
    'paidThroughDate',
    'paymentRiskStatus',
    'commissionStatus',
  ];

  for (const key of requiredKeys) {
    const hasKey = block.includes(`${key}:`) || block.includes(`${key},`);
    assert.equal(
      hasKey,
      true,
      `${context} is missing lifecycleSummary key ${key}`,
    );
  }
}

function testAgentEnrollmentsLifecycleSummaryContract() {
  const storagePath = path.resolve(process.cwd(), 'server/storage.ts');
  const storageContent = readFileSync(storagePath, 'utf8');

  const buildLifecycleSummaryBlock = sliceBetween(
    storageContent,
    'const buildLifecycleSummary = (input: {',
    'const mapEnrollmentRowToDetails = (row: EnrollmentRow, familyRows: FamilyMemberRow[]) => {',
  );

  assert.equal(buildLifecycleSummaryBlock.length > 0, true, 'buildLifecycleSummary definition not found in storage.ts');
  assertLifecycleKeys(buildLifecycleSummaryBlock, 'storage buildLifecycleSummary');

  const agentMappingBlock = sliceBetween(
    storageContent,
    'export async function getEnrollmentsByAgent(agentId: string, startDate?: string, endDate?: string): Promise<User[]> {',
    'export async function getLeadsByAgent(agentId: string, startDate?: string, endDate?: string): Promise<Lead[]> {',
  );

  assert.equal(
    /lifecycleSummary:\s*buildLifecycleSummary\(/.test(agentMappingBlock),
    true,
    'getEnrollmentsByAgent must attach lifecycleSummary via buildLifecycleSummary',
  );
}

function testAdminEnrollmentsLifecycleSummaryContract() {
  const routePath = path.resolve(process.cwd(), 'server/routes/payment-tracking.ts');
  const routeContent = readFileSync(routePath, 'utf8');

  assert.equal(
    routeContent.includes("router.get('/api/admin/enrollments-with-payments'"),
    true,
    'Admin enrollments-with-payments endpoint route is missing',
  );

  const enrichBlock = sliceBetween(
    routeContent,
    'const enrichLifecycleSummary = (row: any) => {',
    'const enrollments = (result.rows || []).map(enrichLifecycleSummary);',
  );

  assert.equal(enrichBlock.length > 0, true, 'enrichLifecycleSummary mapper not found in payment-tracking.ts');
  assertLifecycleKeys(enrichBlock, 'admin enrollments enrichLifecycleSummary');

  assert.equal(
    routeContent.includes('const enrollments = (result.rows || []).map(enrichLifecycleSummary);'),
    true,
    'Admin enrollments endpoint must map rows with enrichLifecycleSummary',
  );
}

function run() {
  testAgentEnrollmentsLifecycleSummaryContract();
  testAdminEnrollmentsLifecycleSummaryContract();
  console.log('Lifecycle summary API contract tests passed');
}

run();
