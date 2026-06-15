import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function testMigrationAddsSnapshotAndReferences(): void {
  const migrationPath = path.resolve(process.cwd(), 'migrations/20260613_add_agent_lineage_snapshots.sql');
  const migration = readFileSync(migrationPath, 'utf8');

  assert.equal(migration.includes('CREATE TABLE IF NOT EXISTS public.agent_lineage_snapshots'), true);
  assert.equal(migration.includes('uq_agent_lineage_snapshots_member_payment'), true);
  assert.equal(migration.includes('idempotency_key TEXT NOT NULL'), true);
  assert.equal(migration.includes('ADD COLUMN IF NOT EXISTS lineage_snapshot_id UUID REFERENCES public.agent_lineage_snapshots(id)'), true);
}

function testEpxRoutesCaptureAndAttachSnapshots(): void {
  const routePath = path.resolve(process.cwd(), 'server/routes/epx-hosted-routes.ts');
  const routeContent = readFileSync(routePath, 'utf8');

  assert.equal(routeContent.includes('async function ensureLineageSnapshotForPayment('), true);
  assert.equal(routeContent.includes('onConflict: \'member_id,payment_id\''), true);
  assert.equal(routeContent.includes('async function attachLineageSnapshotToCommissionAndLedger('), true);
  assert.equal(routeContent.includes('lineage_snapshot_id: lineageSnapshotId,'), true);
}

function testLedgerAndRecurringSyncCarrySnapshotIds(): void {
  const ledgerPath = path.resolve(process.cwd(), 'server/services/commission-ledger-service.ts');
  const ledgerContent = readFileSync(ledgerPath, 'utf8');
  const recurringPath = path.resolve(process.cwd(), 'server/services/recurring-post-success-persistence.ts');
  const recurringContent = readFileSync(recurringPath, 'utf8');

  assert.equal(ledgerContent.includes('lineageSnapshotId?: string;'), true);
  assert.equal(ledgerContent.includes('lineage_snapshot_id: item.lineageSnapshotId || null,'), true);
  assert.equal(recurringContent.includes('lineage_snapshot_id'), true);
  assert.equal(recurringContent.includes('lineageSnapshotId: commission?.lineage_snapshot_id ? String(commission.lineage_snapshot_id) : undefined,'), true);
}

function run(): void {
  testMigrationAddsSnapshotAndReferences();
  testEpxRoutesCaptureAndAttachSnapshots();
  testLedgerAndRecurringSyncCarrySnapshotIds();
  console.log('Lineage snapshot hardening tests passed');
}

run();
