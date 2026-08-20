import assert from 'node:assert/strict';

const databaseUrl = process.env.DATABASE_URL || '';
const environment = String(process.env.APP_ENV || process.env.NODE_ENV || '').toLowerCase();
const allowProduction = process.env.ALLOW_COMMISSION_PIPELINE_PRODUCTION_TESTS === 'true';

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required; staging validation refuses to run without a database.');
}
if (['production', 'prod'].includes(environment) && !allowProduction) {
  throw new Error('Refusing to run commission pipeline staging validation against production. Set ALLOW_COMMISSION_PIPELINE_PRODUCTION_TESTS=true only with explicit approval.');
}
if (process.env.COMMISSION_PIPELINE_TEST_DATA_MARKER !== 'PHASE2C_STAGING_ONLY') {
  throw new Error('Set COMMISSION_PIPELINE_TEST_DATA_MARKER=PHASE2C_STAGING_ONLY to confirm isolated test data.');
}

const { Pool } = await import('pg');
const pool = new Pool({ connectionString: databaseUrl });
const client = await pool.connect();

try {
  const { rows: schemaRows } = await client.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND ((table_name = 'payments' AND column_name IN ('commission_processing_status','ledger_sync_status'))
        OR (table_name = 'agent_commissions' AND column_name = 'source_payment_id')
        OR (table_name = 'commission_ledger' AND column_name IN ('source_payment_id','compensation_type'))
        OR (table_name = 'financial_exceptions' AND column_name IN ('fingerprint','retry_count','status')))
  `);
  const schemaKeys = new Set(schemaRows.map((row) => `${row.table_name}.${row.column_name}`));
  for (const required of [
    'payments.commission_processing_status', 'payments.ledger_sync_status',
    'agent_commissions.source_payment_id', 'commission_ledger.source_payment_id',
    'commission_ledger.compensation_type',
    'financial_exceptions.fingerprint', 'financial_exceptions.retry_count', 'financial_exceptions.status',
  ]) assert.ok(schemaKeys.has(required), `Missing required staging column: ${required}`);

  const { rows: unresolvedRows } = await client.query(`
    SELECT p.id, p.status, p.commission_processing_status, p.ledger_sync_status
    FROM payments p
    WHERE p.status IN ('succeeded','success','paid','captured')
      AND (p.commission_processing_status IN ('failed','pending') OR p.ledger_sync_status IN ('failed','pending'))
    LIMIT 100
  `);
  console.log(`Staging precheck: ${unresolvedRows.length} existing retryable payment state row(s).`);
  const { rows: exceptionRows } = await client.query(`SELECT status, count(*)::int AS count FROM financial_exceptions GROUP BY status ORDER BY status`);
  const { rows: legacyRows } = await client.query(`SELECT count(*)::int AS count FROM commission_payouts`);
  console.log('Phase 3A exception states:', exceptionRows);
  console.log(`Historical commission_payouts rows preserved: ${legacyRows[0]?.count || 0}`);
  console.log('Required DB-backed scenarios: individual confirmation twice, concurrent confirmation, ledger sync twice, writing/override carry-forward, group writing/override, holidays, manual verification plus delayed callback, and exception lifecycle.');
  if (process.env.COMMISSION_PIPELINE_STAGING_SCENARIOS === 'true') {
    if (process.env.COMMISSION_PIPELINE_STAGING_FIXTURE_ID !== 'PHASE3A_ISOLATED_FIXTURE') {
      throw new Error('Set COMMISSION_PIPELINE_STAGING_FIXTURE_ID=PHASE3A_ISOLATED_FIXTURE before running mutating staging scenarios.');
    }
    console.log('Scenario mode authorized for the isolated Phase 3A fixture; repository-specific fixture execution must be supplied by the staging operator.');
  }
  console.log('Validation precheck passed; no production data was written.');
} finally {
  client.release();
  await pool.end();
}
