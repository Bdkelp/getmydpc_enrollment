#!/usr/bin/env node

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { Client } from 'pg';

dotenv.config();

const connectionString = String(process.env.DATABASE_URL || '').trim().replace(/^"|"$/g, '');
if (!connectionString) {
  console.error('Missing DATABASE_URL');
  process.exit(1);
}

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

const token = crypto.randomBytes(4).toString('hex');
const nowIso = new Date().toISOString();

function directRow(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    agent_id: `agent-direct-${token}`,
    member_id: `member-${token}`,
    enrollment_id: `enrollment-${token}`,
    commission_amount: 9,
    coverage_type: 'other',
    status: 'pending',
    payment_status: 'unpaid',
    commission_type: null,
    override_for_agent_id: null,
    notes: `smoke-direct-${token}`,
    created_at: nowIso,
    updated_at: nowIso,
    ...overrides,
  };
}

async function insertCommission(row) {
  const query = `
    insert into public.agent_commissions (
      id, agent_id, member_id, enrollment_id, commission_amount, coverage_type,
      status, payment_status, commission_type, override_for_agent_id, notes,
      created_at, updated_at
    ) values (
      $1,$2,$3,$4,$5,$6,
      $7,$8,$9,$10,$11,
      $12,$13
    )
  `;

  const values = [
    row.id,
    row.agent_id,
    row.member_id,
    row.enrollment_id,
    row.commission_amount,
    row.coverage_type,
    row.status,
    row.payment_status,
    row.commission_type,
    row.override_for_agent_id,
    row.notes,
    row.created_at,
    row.updated_at,
  ];

  await client.query(query, values);
}

async function expectUniqueViolation(row, label) {
  const savepointName = `sp_${crypto.randomUUID().replace(/-/g, '')}`;
  await client.query(`SAVEPOINT ${savepointName}`);

  let violated = false;
  try {
    await insertCommission(row);
  } catch (error) {
    if (error && error.code === '23505') {
      violated = true;
      await client.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
    } else {
      await client.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
      throw error;
    }
  }

  await client.query(`RELEASE SAVEPOINT ${savepointName}`);
  assert.equal(violated, true, `${label} should hit unique violation`);
}

async function run() {
  await client.connect();
  await client.query('BEGIN');

  const results = [];

  const memberOnly = directRow({
    member_id: `member-only-${token}`,
    enrollment_id: `enrollment-member-only-${token}`,
    commission_amount: 9,
    notes: `smoke-member-only-${token}`,
  });
  await insertCommission(memberOnly);
  results.push('member only enrollment: insert ok');

  const memberSpouse = directRow({
    member_id: `member-spouse-${token}`,
    enrollment_id: `enrollment-member-spouse-${token}`,
    commission_amount: 15,
    notes: `smoke-member-spouse-${token}`,
  });
  await insertCommission(memberSpouse);
  results.push('member + spouse enrollment: insert ok');

  const memberChild = directRow({
    member_id: `member-child-${token}`,
    enrollment_id: `enrollment-member-child-${token}`,
    commission_amount: 17,
    notes: `smoke-member-child-${token}`,
  });
  await insertCommission(memberChild);
  results.push('member + child enrollment: insert ok');

  const family = directRow({
    member_id: `member-family-${token}`,
    enrollment_id: `enrollment-family-${token}`,
    commission_amount: 17,
    notes: `smoke-family-${token}`,
  });
  await insertCommission(family);
  results.push('family enrollment: insert ok');

  const retryBase = directRow({
    member_id: `member-retry-${token}`,
    enrollment_id: `enrollment-retry-${token}`,
    commission_amount: 9,
    notes: `smoke-retry-base-${token}`,
  });
  await insertCommission(retryBase);
  await expectUniqueViolation(
    {
      ...retryBase,
      id: crypto.randomUUID(),
      notes: `smoke-retry-duplicate-${token}`,
    },
    'duplicate retry of same enrollment'
  );
  results.push('duplicate retry of same enrollment: blocked by unique key');

  const callbackBase = directRow({
    member_id: `member-callback-repair-${token}`,
    enrollment_id: null,
    commission_amount: 9,
    notes: `smoke-callback-base-${token}`,
  });
  await insertCommission(callbackBase);
  await expectUniqueViolation(
    {
      ...callbackBase,
      id: crypto.randomUUID(),
      notes: `smoke-admin-repair-retry-${token}`,
    },
    'duplicate retry via callback/admin repair path'
  );
  results.push('duplicate retry through callback/admin repair path: blocked by unique key');

  const directLane = directRow({
    member_id: `member-direct-override-${token}`,
    enrollment_id: `enrollment-direct-override-${token}`,
    agent_id: `agent-writing-${token}`,
    commission_type: null,
    override_for_agent_id: null,
    notes: `smoke-direct-lane-${token}`,
  });
  await insertCommission(directLane);

  const overrideLane = directRow({
    member_id: directLane.member_id,
    enrollment_id: directLane.enrollment_id,
    agent_id: `agent-upline-${token}`,
    commission_type: 'override',
    override_for_agent_id: directLane.agent_id,
    notes: `smoke-override-lane-${token}`,
  });
  await insertCommission(overrideLane);

  await expectUniqueViolation(
    {
      ...overrideLane,
      id: crypto.randomUUID(),
      notes: `smoke-override-duplicate-${token}`,
    },
    'duplicate override lane retry'
  );
  results.push('direct + override lanes: one each allowed, duplicate override blocked');

  await client.query('ROLLBACK');

  console.log(
    JSON.stringify(
      {
        ok: true,
        token,
        results,
        note: 'All smoke inserts were rolled back; database state was not persisted by this script.',
      },
      null,
      2
    )
  );
}

run()
  .catch(async (error) => {
    try {
      await client.query('ROLLBACK');
    } catch {
      // no-op
    }
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await client.end();
    } catch {
      // no-op
    }
  });
