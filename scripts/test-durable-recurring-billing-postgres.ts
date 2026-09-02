import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import pg from "pg";

const connectionString = process.env.DURABLE_BILLING_TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error("DURABLE_BILLING_TEST_DATABASE_URL is required");
}

const parsedUrl = new URL(connectionString);
if (
  !["localhost", "127.0.0.1", "::1"].includes(parsedUrl.hostname) ||
  !parsedUrl.pathname.toLowerCase().includes("test")
) {
  throw new Error(
    "Integration tests require a local database whose name contains 'test'",
  );
}

const pool = new pg.Pool({ connectionString, max: 6 });
const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    "scripts/sql/2026-09-02_recurring_billing_durable_cycles.sql",
  ),
  "utf8",
);

async function claim(
  workerId: string,
  runId: number,
  subscriptionIds: number[] | null = null,
) {
  return pool.query(
    "SELECT * FROM public.claim_recurring_billing_cycles($1, $2, 1, 30, $3::int[])",
    [workerId, runId, subscriptionIds],
  );
}

async function seedSubscription(
  id: number,
  memberId: number,
  cycleDate: string,
) {
  await pool.query(
    `INSERT INTO members (id, status, is_active, first_payment_date, enrollment_date)
     VALUES ($1, 'active', true, $2::timestamptz, $2::timestamptz)`,
    [memberId, `${cycleDate}T12:00:00Z`],
  );
  await pool.query(
    `INSERT INTO subscriptions (id, member_id, status, pending_reason, next_billing_date)
      VALUES ($1, $2, 'active', NULL, $3::timestamp)`,
    [id, memberId, cycleDate],
  );
  await pool.query(
    `INSERT INTO recurring_billing_cycles
       (subscription_id, member_id, cycle_date, processor_reference, amount,
        payment_method_type, processor_auth_guid)
     VALUES ($1, $2, $3::date, $4, 49.00, 'CreditCard', $5)`,
    [
      id,
      memberId,
      cycleDate,
      `RECUR-${id}-${cycleDate.replaceAll("-", "")}`,
      `AUTH-GUID-${id}-12345678`,
    ],
  );
}

async function run() {
  await pool.query(`
    DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DROP TABLE IF EXISTS recurring_billing_cycles, recurring_billing_runs, payments,
      subscriptions, members CASCADE;
    CREATE TABLE members (
      id integer PRIMARY KEY,
      status text NOT NULL,
      is_active boolean NOT NULL,
      first_payment_date timestamptz,
      enrollment_date timestamptz
    );
    CREATE TABLE subscriptions (
      id integer PRIMARY KEY,
      member_id integer NOT NULL REFERENCES members(id),
      status text NOT NULL,
      pending_reason text,
      next_billing_date timestamp without time zone,
      updated_at timestamptz NOT NULL DEFAULT NOW()
    );
    CREATE TABLE payments (
      id serial PRIMARY KEY,
      member_id integer REFERENCES members(id),
      subscription_id integer REFERENCES subscriptions(id),
      amount numeric(12,2),
      currency text,
      status text,
      payment_method text,
      transaction_id text,
      epx_auth_guid text,
      payment_transaction_at timestamptz,
      payment_confirmed_at timestamptz,
      platform_verified_at timestamptz,
      verification_method text,
      metadata jsonb,
      created_at timestamptz,
      updated_at timestamptz
    );
  `);
  await pool.query(migration);

  const anonymousClient = await pool.connect();
  try {
    await anonymousClient.query("SET ROLE anon");
    await assert.rejects(
      anonymousClient.query("SELECT * FROM recurring_billing_cycles"),
      /permission denied/,
    );
  } finally {
    await anonymousClient.query("RESET ROLE").catch(() => undefined);
    anonymousClient.release();
  }

  const runRows = await pool.query(
    `INSERT INTO recurring_billing_runs (trigger_source, worker_id, mode)
     VALUES ('manual', 'integration', 'live'), ('manual', 'integration-2', 'live')
     RETURNING id`,
  );
  const firstRunId = Number(runRows.rows[0].id);
  const secondRunId = Number(runRows.rows[1].id);

  await seedSubscription(101, 1001, "2026-01-31");
  const concurrent = await Promise.all([
    claim("worker-a", firstRunId, [101]),
    claim("worker-b", secondRunId, [101]),
  ]);
  assert.equal(concurrent[0].rowCount! + concurrent[1].rowCount!, 1);

  const firstClaim = concurrent.find((result) => result.rowCount === 1)!
    .rows[0];
  await pool.query(
    "UPDATE recurring_billing_cycles SET lease_expires_at = NOW() - INTERVAL '1 second' WHERE id = $1",
    [firstClaim.id],
  );
  const reclaimed = await claim("worker-restart", secondRunId, [101]);
  assert.equal(reclaimed.rowCount, 1);
  await pool.query(
    "SELECT public.mark_recurring_cycle_submitting($1, $2::uuid)",
    [reclaimed.rows[0].id, reclaimed.rows[0].lease_token],
  );
  const submittingLease = await pool.query(
    "SELECT lease_expires_at FROM recurring_billing_cycles WHERE id = $1",
    [reclaimed.rows[0].id],
  );
  assert.equal(submittingLease.rows[0].lease_expires_at, null);

  await seedSubscription(102, 1002, "2026-02-15");
  await seedSubscription(103, 1003, "2026-02-15");
  const targeted = await claim("canary", firstRunId, [102]);
  assert.deepEqual(
    targeted.rows.map((row) => row.subscription_id),
    [102],
  );
  const untargetedState = await pool.query(
    "SELECT state FROM recurring_billing_cycles WHERE subscription_id = 103",
  );
  assert.equal(untargetedState.rows[0].state, "ready");

  await seedSubscription(104, 1004, "2026-03-08");
  const dateClaim = await claim("date-worker", firstRunId, [104]);
  const dateCycle = dateClaim.rows[0];
  await pool.query(
    "SELECT public.mark_recurring_cycle_submitting($1, $2::uuid)",
    [dateCycle.id, dateCycle.lease_token],
  );
  const finalized = await pool.query(
    `SELECT * FROM public.finalize_recurring_cycle_success(
       $1, $2, 'AUTH-GUID-DATE-1234', 'APPROVED', '00', 'Approved', NOW(), $3::date
     )`,
    [dateCycle.id, dateCycle.processor_reference, "2026-04-08"],
  );
  const repeated = await pool.query(
    `SELECT * FROM public.finalize_recurring_cycle_success(
       $1, $2, 'AUTH-GUID-DATE-1234', 'APPROVED', '00', 'Approved', NOW(), $3::date
     )`,
    [dateCycle.id, dateCycle.processor_reference, "2026-04-08"],
  );
  assert.equal(repeated.rows[0].payment_id, finalized.rows[0].payment_id);
  assert.equal(repeated.rows[0].already_completed, true);
  for (const timezone of ["UTC", "America/Chicago"]) {
    const timezoneClient = await pool.connect();
    try {
      await timezoneClient.query(`SET TIME ZONE '${timezone}'`);
      const advanced = await timezoneClient.query(
        `SELECT next_billing_date::text AS calendar_timestamp,
                TO_CHAR(next_billing_date, 'YYYY-MM-DD') AS calendar_date
         FROM subscriptions WHERE id = 104`,
      );
      assert.equal(advanced.rows[0].calendar_date, "2026-04-08");
      assert.equal(advanced.rows[0].calendar_timestamp, "2026-04-08 00:00:00");
    } finally {
      timezoneClient.release();
    }
  }
  const paymentCount = await pool.query(
    "SELECT COUNT(*)::int AS count FROM payments WHERE transaction_id = $1",
    [dateCycle.processor_reference],
  );
  assert.equal(paymentCount.rows[0].count, 1);

  await pool.query(
    `UPDATE recurring_billing_cycles
     SET state = 'internal_sync_pending', next_attempt_at = NOW(),
         lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL
     WHERE id = $1`,
    [dateCycle.id],
  );
  const internalRetry = await pool.query(
    "SELECT * FROM public.claim_recurring_internal_sync_cycles($1, $2, 25, 30, $3::int[])",
    ["internal-sync-worker", secondRunId, [104]],
  );
  assert.equal(internalRetry.rowCount, 1);
  assert.equal(internalRetry.rows[0].payment_id, finalized.rows[0].payment_id);
  const paymentCountAfterRetryClaim = await pool.query(
    "SELECT COUNT(*)::int AS count FROM payments WHERE transaction_id = $1",
    [dateCycle.processor_reference],
  );
  assert.equal(paymentCountAfterRetryClaim.rows[0].count, 1);

  await seedSubscription(105, 1005, "2026-03-09");
  const conflictClaim = await claim("conflict-worker", secondRunId, [105]);
  await pool.query(
    "SELECT public.mark_recurring_cycle_submitting($1, $2::uuid)",
    [conflictClaim.rows[0].id, conflictClaim.rows[0].lease_token],
  );
  await pool.query(
    `INSERT INTO payments
       (member_id, subscription_id, amount, status, transaction_id, created_at, updated_at)
     VALUES ($1, $2, 49.00, 'succeeded', $3, NOW(), NOW())`,
    [1004, 104, conflictClaim.rows[0].processor_reference],
  );
  await assert.rejects(
    pool.query(
      `SELECT * FROM public.finalize_recurring_cycle_success(
         $1, $2, 'AUTH-GUID-CONFLICT', 'APPROVED', '00', 'Approved', NOW(), $3::date
       )`,
      [
        conflictClaim.rows[0].id,
        conflictClaim.rows[0].processor_reference,
        "2026-04-09",
      ],
    ),
    /conflicts with another payment identity/,
  );

  console.log("Durable recurring billing PostgreSQL integration tests passed.");
}

try {
  await run();
} finally {
  await pool.end();
}
