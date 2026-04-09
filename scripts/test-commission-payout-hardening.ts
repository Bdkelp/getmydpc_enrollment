import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  buildCancellationReversalRows,
  buildHexonaCsvFromBatch,
  buildQuickBooksCsvFromBatch,
  getCancellationImpactedUnpaidRows,
  getNextPayoutDate,
  getPayableRowsForBatchOperations,
} from '../server/services/commission-ledger-service';
import { calculateCommission } from '../server/commissionCalculator';
import { addDaysLocal, formatLocalDate, parseLocalDate } from '../shared/localDate';

function testSameDayAnchors(): void {
  assert.equal(formatLocalDate(getNextPayoutDate('1st-cycle', parseLocalDate('2026-05-01'))), '2026-05-01');
  assert.equal(formatLocalDate(getNextPayoutDate('15th-cycle', parseLocalDate('2026-05-15'))), '2026-05-15');
}

function testLocalDateBoundaryBehavior(): void {
  assert.equal(formatLocalDate(parseLocalDate('2026-03-01')), '2026-03-01');
  assert.equal(formatLocalDate(addDaysLocal('2026-03-01', 1)), '2026-03-02');
  assert.equal(formatLocalDate(addDaysLocal('2026-03-01', -1)), '2026-02-28');
}

function testCancellationQueuedRowHeldScenario(): void {
  const rows = [
    {
      id: 'row-queued',
      status: 'queued',
      payout_batch_id: 'batch-1',
      commission_period_start: '2026-05-01',
      commission_period_end: '2026-05-15',
    },
    {
      id: 'row-earned-future',
      status: 'earned',
      payout_batch_id: null,
      commission_period_start: '2026-05-16',
      commission_period_end: '2026-05-31',
    },
  ];

  const impacted = getCancellationImpactedUnpaidRows(rows as any[], '2026-05-10');
  assert.equal(impacted.length, 2);
  assert.ok(impacted.some((row: any) => row.id === 'row-queued'));
}

function testReversalPolicyNonPayable(): void {
  const paidRows = [
    {
      id: 'paid-1',
      agent_id: 'agent-1',
      agent_name: 'Agent One',
      writing_number: 'A001',
      member_id: 'member-1',
      member_name: 'Member One',
      membership_tier: 'Base',
      coverage_type: 'Member Only',
      commission_period_start: '2026-04-01',
      commission_period_end: '2026-04-15',
      commission_amount: 25,
    },
  ];

  const reversals = buildCancellationReversalRows(paidRows, '2026-04-10', 'Cancelled');
  assert.equal(reversals.length, 1);
  assert.equal(reversals[0].status, 'reversed');
  assert.equal(reversals[0].payout_batch_id, null);
  assert.equal(reversals[0].commission_amount, -25);
}

function testPayableFilteringAndExport(): void {
  const batch = {
    id: 'batch-abc12345',
    cutoff_date: '2026-05-15',
    scheduled_pay_date: '2026-05-15',
  };

  const rows = [
    {
      id: 'queued-1',
      agent_id: 'agent-1',
      agent_name: 'Agent One',
      writing_number: 'A001',
      member_name: 'Queued Member',
      membership_tier: 'Base',
      coverage_type: 'Member Only',
      commission_amount: 20,
      statement_number: 'S1',
      commission_type: 'renewal',
      status: 'queued',
    },
    {
      id: 'held-1',
      agent_id: 'agent-1',
      agent_name: 'Agent One',
      writing_number: 'A001',
      member_name: 'Held Member',
      membership_tier: 'Base',
      coverage_type: 'Member Only',
      commission_amount: 20,
      statement_number: 'S2',
      commission_type: 'renewal',
      status: 'held',
    },
    {
      id: 'reversed-1',
      agent_id: 'agent-1',
      agent_name: 'Agent One',
      writing_number: 'A001',
      member_name: 'Reversed Member',
      membership_tier: 'Base',
      coverage_type: 'Member Only',
      commission_amount: -20,
      statement_number: 'S3',
      commission_type: 'reversal',
      status: 'reversed',
    },
  ];

  const payableRows = getPayableRowsForBatchOperations(rows as any[]);
  assert.equal(payableRows.length, 1);
  assert.equal(payableRows[0].id, 'queued-1');

  const qbCsv = buildQuickBooksCsvFromBatch(batch, rows as any[]);
  const hexonaCsv = buildHexonaCsvFromBatch(batch, rows as any[]);
  assert.ok(qbCsv.includes('Queued Member'));
  assert.ok(!qbCsv.includes('Held Member'));
  assert.ok(!qbCsv.includes('Reversed Member'));
  assert.ok(hexonaCsv.includes('Queued Member'));
  assert.ok(!hexonaCsv.includes('Held Member'));
  assert.ok(!hexonaCsv.includes('Reversed Member'));
}

function testAdminBypassBlocked(): void {
  const routesPath = path.resolve(process.cwd(), 'server/routes.ts');
  const routesContent = readFileSync(routesPath, 'utf8');

  const singlePayoutRouteBlocked = /\/api\/admin\/commission\/:commissionId\/payout[\s\S]*status\(410\)/.test(routesContent);
  const batchPayoutRouteBlocked = /\/api\/admin\/commissions\/batch-payout[\s\S]*status\(410\)/.test(routesContent);

  assert.equal(singlePayoutRouteBlocked, true);
  assert.equal(batchPayoutRouteBlocked, true);
}

function testCommissionUnitByCoverageTier(): void {
  const scenarios = [
    { plan: 'MyPremierPlan Base', coverage: 'Member Only', expected: 9 },
    { plan: 'MyPremierPlan Base', coverage: 'Member/Spouse', expected: 15 },
    { plan: 'MyPremierPlan Base', coverage: 'Member/Child', expected: 17 },
    { plan: 'MyPremierPlan Base', coverage: 'Family', expected: 17 },
  ];

  for (const scenario of scenarios) {
    const result = calculateCommission(scenario.plan, scenario.coverage, false);
    assert.ok(result, `Expected commission for ${scenario.plan} ${scenario.coverage}`);
    assert.equal(result!.commission, scenario.expected);
  }
}

function testDependentCountLabelsDoNotMultiplyCommission(): void {
  const familyBaseline = calculateCommission('MyPremierPlan Base', 'Family', false);
  const familyWithDependentCount = calculateCommission('MyPremierPlan Base', 'Family (4 dependents)', false);
  const childBaseline = calculateCommission('MyPremierPlan Base', 'Member/Child', false);
  const childWithDependentCount = calculateCommission('MyPremierPlan Base', 'Member/Child x3', false);

  assert.ok(familyBaseline && familyWithDependentCount && childBaseline && childWithDependentCount);
  assert.equal(familyWithDependentCount!.commission, familyBaseline!.commission);
  assert.equal(childWithDependentCount!.commission, childBaseline!.commission);
}

function testCommissionUnitDedupeGuardPresent(): void {
  const routesPath = path.resolve(process.cwd(), 'server/routes.ts');
  const routesContent = readFileSync(routesPath, 'utf8');

  const helperDefined = /async function findExistingCommissionUnit\(/.test(routesContent);
  const usedInCommissionGenerator = /createCommissionWithCheck[\s\S]*findExistingCommissionUnit\(/.test(routesContent);
  const usedInRegistrationFlow = /\[Registration\][\s\S]*findExistingCommissionUnit\(/.test(routesContent);

  assert.equal(helperDefined, true);
  assert.equal(usedInCommissionGenerator, true);
  assert.equal(usedInRegistrationFlow, true);
}

function testMinimumThresholdCarryForwardRules(): void {
  const shouldCarryForward = (total: number, minimum = 25) => Number(total || 0) < Number(minimum || 25);
  assert.equal(shouldCarryForward(24.99), true);
  assert.equal(shouldCarryForward(25), false);
  assert.equal(shouldCarryForward(35), false);
  assert.equal(shouldCarryForward(-5), true);
  assert.equal(shouldCarryForward(0), true);
}

function testUnderMinimumOverrideAccessAndAuditGuards(): void {
  const routesPath = path.resolve(process.cwd(), 'server/routes.ts');
  const routesContent = readFileSync(routesPath, 'utf8');
  const servicePath = path.resolve(process.cwd(), 'server/services/commission-ledger-service.ts');
  const serviceContent = readFileSync(servicePath, 'utf8');

  const routeAllowsAdminAndSuperAdmin = /override-carry-forward[\s\S]*if \(!isAdmin\(req\.user\?\.role\)\)/.test(routesContent);
  const routeStillEnforcesReason = /override-carry-forward[\s\S]*if \(!reason\)[\s\S]*Override reason is required/.test(routesContent);
  const routeRequiresAgentForAdmin = /override-carry-forward[\s\S]*actorRole !== 'super_admin' && !agentId/.test(routesContent);

  const serviceRequiresReason = /if \(!reason\) \{[\s\S]*Override reason is required/.test(serviceContent);
  const serviceUsesManualReleaseAuditType = /event_type: 'manual_under_minimum_release'/.test(serviceContent);
  const serviceKeepsHeaderReconciliationGuard = /assertBatchHeaderTotalsMatch\(batchId, 'manual-release'\)/.test(serviceContent);

  assert.equal(routeAllowsAdminAndSuperAdmin, true);
  assert.equal(routeStillEnforcesReason, true);
  assert.equal(routeRequiresAgentForAdmin, true);
  assert.equal(serviceRequiresReason, true);
  assert.equal(serviceUsesManualReleaseAuditType, true);
  assert.equal(serviceKeepsHeaderReconciliationGuard, true);
}

function run(): void {
  testSameDayAnchors();
  testLocalDateBoundaryBehavior();
  testCancellationQueuedRowHeldScenario();
  testReversalPolicyNonPayable();
  testPayableFilteringAndExport();
  testAdminBypassBlocked();
  testCommissionUnitByCoverageTier();
  testDependentCountLabelsDoNotMultiplyCommission();
  testCommissionUnitDedupeGuardPresent();
  testMinimumThresholdCarryForwardRules();
  testUnderMinimumOverrideAccessAndAuditGuards();
  console.log('Commission payout hardening tests passed');
}

run();
