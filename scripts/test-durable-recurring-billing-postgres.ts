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
const lifecycleMigration = fs.readFileSync(
  path.join(
    process.cwd(),
    "scripts/sql/2026-09-02c_subscription_billing_mode_lifecycle.sql",
  ),
  "utf8",
);
const periodTerminationMigration = fs.readFileSync(
  path.join(
    process.cwd(),
    "scripts/sql/2026-09-02d_subscription_period_termination_semantics.sql",
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
    DROP TABLE IF EXISTS recurring_billing_cycles, recurring_billing_runs, admin_notifications, payments,
      subscriptions, members CASCADE;
    CREATE TABLE members (
      id integer PRIMARY KEY,
      status text NOT NULL,
      is_active boolean NOT NULL,
      first_payment_date timestamptz,
      enrollment_date timestamptz,
      cancellation_date timestamptz,
      cancellation_reason text,
      cancellation_requested_at timestamptz,
      cancellation_effective_at timestamptz,
      cancellation_reason_code text,
      cancellation_actor_id uuid,
      cancellation_actor_type text,
      cancellation_internal_notes text,
      service_usage_status text,
      service_usage_verification_source text,
      refund_eligibility text,
      refund_eligibility_reason text,
      refund_eligibility_evaluated_at timestamptz,
      refund_status text,
      updated_at timestamptz NOT NULL DEFAULT NOW()
    );
    CREATE TABLE subscriptions (
      id integer PRIMARY KEY,
      member_id integer NOT NULL REFERENCES members(id),
      status text NOT NULL,
      pending_reason text,
      pending_details text,
      start_date timestamp without time zone,
      end_date timestamp without time zone,
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
    CREATE TABLE admin_notifications (
      id serial PRIMARY KEY,
      type text NOT NULL,
      member_id integer REFERENCES members(id),
      subscription_id integer REFERENCES subscriptions(id),
      error_message text,
      metadata jsonb,
      resolved boolean NOT NULL DEFAULT false,
      resolved_at timestamptz,
      resolved_by text,
      created_at timestamptz NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(migration);
  await pool.query(lifecycleMigration);
  await pool.query(periodTerminationMigration);

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

  await seedSubscription(100, 1000, "2026-01-15");
  const insertException = () =>
    pool.query(
      `INSERT INTO admin_notifications (
         type, member_id, subscription_id, error_message, metadata, resolved
       ) VALUES (
         'recurring_billing_exception', 1000, 100, 'missing_payment_credentials',
         '{"cycleDate":"2026-01-15"}'::jsonb, false
       ) ON CONFLICT DO NOTHING`,
    );
  await Promise.all([insertException(), insertException()]);
  const exceptionCount = await pool.query(
    `SELECT COUNT(*)::int AS count FROM admin_notifications
     WHERE subscription_id = 100
       AND metadata->>'cycleDate' = '2026-01-15'
       AND error_message = 'missing_payment_credentials'
       AND resolved = false`,
  );
  assert.equal(exceptionCount.rows[0].count, 1);

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
  const advancedPeriod = await pool.query(
    `SELECT current_period_start::date::text AS period_start,
            current_period_end::date::text AS period_end,
            next_billing_date::date::text AS next_billing_date
     FROM subscriptions WHERE id = 104`,
  );
  assert.deepEqual(advancedPeriod.rows[0], {
    period_start: "2026-03-08",
    period_end: "2026-04-08",
    next_billing_date: "2026-04-08",
  });

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
  const repeatedPeriod = await pool.query(
    `SELECT current_period_start::date::text AS period_start,
            current_period_end::date::text AS period_end,
            next_billing_date::date::text AS next_billing_date
     FROM subscriptions WHERE id = 104`,
  );
  assert.deepEqual(repeatedPeriod.rows[0], advancedPeriod.rows[0]);

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

  await seedSubscription(106, 1006, "2026-04-10");
  await pool.query(
    "UPDATE subscriptions SET end_date = '2026-05-10'::timestamp WHERE id = 106",
  );
  const staleEndDateClaim = await claim("stale-end-worker", firstRunId, [106]);
  assert.equal(
    staleEndDateClaim.rowCount,
    1,
    "historical end_date must not exclude an active non-terminating subscription",
  );

  await seedSubscription(107, 1007, "2026-05-15");
  await pool.query(
    "UPDATE subscriptions SET end_date = '2026-06-15'::timestamp WHERE id = 107",
  );
  await pool.query(
    `INSERT INTO members (id, status, is_active, first_payment_date, enrollment_date)
     VALUES (1008, 'cancelled', false, '2026-05-16T12:00:00Z', '2026-05-16T12:00:00Z')`,
  );
  await pool.query(
    `INSERT INTO subscriptions
       (id, member_id, status, pending_reason, start_date, end_date, next_billing_date)
     VALUES
       (108, 1008, 'cancelled', 'member_cancelled', '2026-05-16', '2026-06-16', '2026-06-16')`,
  );
  const legacyCandidates = await pool.query(
    `SELECT subscription_id
     FROM subscription_legacy_period_date_candidates
     WHERE subscription_id IN (107, 108)
     ORDER BY subscription_id`,
  );
  assert.deepEqual(legacyCandidates.rows.map((row) => row.subscription_id), [107]);
  const repairedLegacy = await pool.query(
    "SELECT * FROM repair_legacy_subscription_period_dates(ARRAY[107, 108])",
  );
  assert.deepEqual(repairedLegacy.rows.map((row) => row.subscription_id), [107]);
  const legacyAfterRepair = await pool.query(
    `SELECT id, end_date::date::text AS end_date,
            current_period_end::date::text AS current_period_end
     FROM subscriptions WHERE id IN (107, 108) ORDER BY id`,
  );
  assert.deepEqual(legacyAfterRepair.rows, [
    { id: 107, end_date: null, current_period_end: "2026-05-15" },
    { id: 108, end_date: "2026-06-16", current_period_end: null },
  ]);

  await seedSubscription(109, 1009, "2026-06-01");
  await pool.query(
    `SELECT public.cancel_member_subscription_atomic(
       1009, 109, false, '2026-05-20T12:00:00Z', '2026-05-31T12:00:00Z',
       'Owner requested cancellation', 'owner_request', NULL, 'owner', NULL,
       'not_used', 'owner', 'not_eligible', 'scheduled',
       '2026-05-20T12:00:00Z', 'not_requested', '{}'::jsonb
     )`,
  );
  const scheduledClaim = await claim("scheduled-cancel-worker", secondRunId, [109]);
  assert.equal(scheduledClaim.rowCount, 0);
  const scheduledBeforeFinalization = await pool.query(
    `SELECT status, billing_mode, pending_reason,
            termination_effective_at IS NOT NULL AS has_termination
     FROM subscriptions WHERE id = 109`,
  );
  assert.deepEqual(scheduledBeforeFinalization.rows[0], {
    status: "active",
    billing_mode: "disabled",
    pending_reason: "member_cancelled",
    has_termination: true,
  });
  const cancellationFinalization = await pool.query(
    "SELECT * FROM finalize_due_scheduled_cancellations('2026-06-02T12:00:00Z')",
  );
  assert.equal(cancellationFinalization.rows[0].finalized_count, 1);
  const scheduledAfterFinalization = await pool.query(
    `SELECT subscription.status AS subscription_status,
            member.status AS member_status, member.is_active
     FROM subscriptions subscription
     JOIN members member ON member.id = subscription.member_id
     WHERE subscription.id = 109`,
  );
  assert.deepEqual(scheduledAfterFinalization.rows[0], {
    subscription_status: "cancelled",
    member_status: "cancelled",
    is_active: false,
  });

  console.log("Durable recurring billing PostgreSQL integration tests passed.");
}

try {
  await run();
} finally {
  await pool.end();
}
